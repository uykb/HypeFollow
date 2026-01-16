const config = require('config');
const logger = require('./utils/logger');
const redis = require('./utils/redis');
const hyperWs = require('./hyperliquid/ws-client');
const binanceClient = require('./binance/api-client');
const orderMapper = require('./core/order-mapper');
const orderValidator = require('./core/order-validator');
const riskControl = require('./core/risk-control');
const positionCalculator = require('./core/position-calculator');
const apiValidator = require('./utils/api-validator');
const { startServer } = require('./monitoring/api-server');
const dataCollector = require('./monitoring/data-collector');

async function main() {
  logger.info('Starting HypeFollow System...');

  // 1. API Security Validation
  try {
    apiValidator.validateAPIConfig();
    apiValidator.checkIPWhitelist();
    await apiValidator.validateAPIPermissions(binanceClient);
    logger.info('🚀 API security validation passed');
  } catch (error) {
    logger.error('❌ API security validation failed - CANNOT START', { error: error.message });
    process.exit(1);
  }

  // Start Monitoring Server
  if (config.get('monitoring.enabled')) {
    startServer();
  }

  // 1. Connect Hyperliquid WS
  hyperWs.connect();

  // 2. Start Order Validator
  orderValidator.start();

  // 3. Handle Order Events (Limit Orders: Open & Cancel)
  hyperWs.on('order', async (orderData) => {
    dataCollector.stats.totalOrders++;
    logger.info(`Received Order Event: ${orderData.status} ${orderData.oid}`);

    try {
      // Risk Control Check (Basic)
      riskControl.validateOrder(orderData);

      if (orderData.status === 'open') {
        // --- Handle New Limit Order ---
        
        // Determine action type (open vs close)
        const currentPos = await binanceClient.getPosition(orderData.coin);
        const isLong = currentPos > 0;
        const isShort = currentPos < 0;
        const isBuy = orderData.side === 'B';
        
        let actionType = 'open';
        // If Long and Sell -> Close
        if (isLong && !isBuy) actionType = 'close';
        // If Short and Buy -> Close
        if (isShort && isBuy) actionType = 'close';

        // Calculate Copy Quantity
        const quantity = await positionCalculator.calculateQuantity(
          orderData.coin,
          parseFloat(orderData.sz),
          orderData.userAddress,
          actionType
        );

        if (!quantity) {
          logger.info(`Skipping order ${orderData.oid}: calculated quantity is null/zero`);
          return;
        }

        // Check Max Position Limit (Only for Open/Add)
        if (actionType === 'open') {
          if (!riskControl.checkPositionLimit(orderData.coin, currentPos, quantity)) {
            logger.info(`Skipping order ${orderData.oid}: exceeds max position size`);
            return;
          }
        }

        const binanceOrder = await binanceClient.createLimitOrder(
          orderData.coin,
          orderData.side,
          orderData.limitPx,
          quantity
        );

        if (binanceOrder && binanceOrder.orderId) {
          await orderMapper.saveMapping(
            orderData.oid, 
            binanceOrder.orderId, 
            binanceClient.getBinanceSymbol(orderData.coin)
          );
        }

      } else if (orderData.status === 'canceled') {
        // --- Handle Cancel Order ---
        const mappedOrder = await orderMapper.getBinanceOrder(orderData.oid);
        
        if (mappedOrder) {
          await binanceClient.cancelOrder(mappedOrder.symbol, mappedOrder.orderId);
          // Clean up mapping
          await orderMapper.deleteMapping(orderData.oid);
        } else {
          logger.warn(`Skipping cancellation: No mapping found for Hyperliquid OID ${orderData.oid}`);
        }

      } else if (orderData.status === 'filled') {
        // --- Handle Filled Order (Cleanup Mapping) ---
        // When a limit order is filled, we don't need to do anything on Binance side 
        // (as Binance order should also be filled), but we must clean up the Redis mapping.
        await orderMapper.deleteMapping(orderData.oid);
      }

    } catch (error) {
      logger.error('Failed to process order event', error);
    }
  });

  // 3. Handle Fill Events (Market Trades)
  hyperWs.on('fill', async (fillData) => {
    dataCollector.stats.totalFills++;
    logger.info(`Received Fill Event: ${fillData.coin} ${fillData.side} ${fillData.sz}`);

    try {
      riskControl.validateOrder(fillData);

      // Determine action type (open vs close)
      const currentPos = await binanceClient.getPosition(fillData.coin);
      const isLong = currentPos > 0;
      const isShort = currentPos < 0;
      const isBuy = fillData.side === 'B';
      
      let actionType = 'open';
      // If Long and Sell -> Close
      if (isLong && !isBuy) actionType = 'close';
      // If Short and Buy -> Close
      if (isShort && isBuy) actionType = 'close';

      // Calculate Copy Quantity
      const quantity = await positionCalculator.calculateQuantity(
        fillData.coin,
        parseFloat(fillData.sz),
        fillData.userAddress,
        actionType
      );

      if (!quantity) {
        logger.info(`Skipping fill: calculated quantity is null/zero`);
        return;
      }

      // Check Max Position Limit (Only for Open/Add)
      if (actionType === 'open') {
        if (!riskControl.checkPositionLimit(fillData.coin, currentPos, quantity)) {
          logger.info(`Skipping fill: exceeds max position size`);
          return;
        }
      }

      // Execute Market Order on Binance
      await binanceClient.createMarketOrder(
        fillData.coin,
        fillData.side,
        quantity
      );

    } catch (error) {
      logger.error('Failed to process fill event', error);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    orderValidator.stop();
    hyperWs.close();
    redis.disconnect();
    process.exit(0);
  });
}

main().catch(error => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
