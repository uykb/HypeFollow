const config = require('config');
const logger = require('./utils/logger');
const redis = require('./utils/redis');
const hyperWs = require('./hyperliquid/ws-client');
const binanceClient = require('./binance/api-client');
const orderMapper = require('./core/order-mapper');
const orderValidator = require('./core/order-validator');
const apiValidator = require('./utils/api-validator');
const { startServer } = require('./monitoring/api-server');
const dataCollector = require('./monitoring/data-collector');

// New Core Modules
const positionTracker = require('./core/position-tracker');
const consistencyEngine = require('./core/consistency-engine');
const orderExecutor = require('./core/order-executor');

async function main() {
  logger.info('Starting HypeFollow System (Enhanced)...');

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

  // 2. Initialize Position Tracker
  // We initialize based on the first followed user (MVP limitation: single user tracking mostly)
  const followedUsers = config.get('hyperliquid.followedUsers');
  if (followedUsers && followedUsers.length > 0) {
    await positionTracker.init(followedUsers[0]);
  }

  // 3. Start Order Validator (Cleanups)
  orderValidator.start();

  // 4. Connect Hyperliquid WS
  hyperWs.connect();

  // 5. Handle Hyperliquid Order Events (Limit Orders)
  hyperWs.on('order', async (orderData) => {
    dataCollector.stats.totalOrders++;
    
    try {
      if (orderData.status === 'open') {
        // Handle New Limit Order
        await orderExecutor.executeLimitOrder(orderData);
      
      } else if (orderData.status === 'canceled') {
        // Handle Cancel
        const mappedOrder = await orderMapper.getBinanceOrder(orderData.oid);
        if (mappedOrder) {
          await binanceClient.cancelOrder(mappedOrder.symbol, mappedOrder.orderId);
          await orderMapper.deleteMapping(orderData.oid);
        }

      } else if (orderData.status === 'filled') {
        // Handle Fill (Cleanup)
        // Check if this resolves any orphan state (e.g. Binance filled first)
        await consistencyEngine.handleHyperliquidFill(orderData.oid);
        
        // Only delete mapping if Binance order is also finished.
        // Otherwise keep mapping to prevent duplicates (consistencyEngine checks mapping)
        const mapping = await orderMapper.getBinanceOrder(orderData.oid);
        if (mapping) {
          try {
             // We check Binance status briefly
             // Note: This adds latency to event loop, but necessary for safety
             // Optimization: We could just rely on OrderValidator to clean up later?
             // But if we want to place next order fast, we might want to clean up.
             // Actually, if Binance is NOT filled, we WANT to block next order (prevent duplicate).
             // So leaving mapping is Correct.
             
             // If Binance IS filled, we want to delete.
             // OrderValidator runs every 60s. Might be too slow.
             // So checking here is good.
             const bOrder = await binanceClient.client.futuresOrder({
               symbol: mapping.symbol,
               orderId: mapping.orderId
             });
             
             if (['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(bOrder.status)) {
               await orderMapper.deleteMapping(orderData.oid);
             }
          } catch (err) {
            // If check fails, leave mapping to be safe
            logger.warn(`Failed to check Binance status for cleanup ${orderData.oid}`, err);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to process order event', error);
    }
  });

  // 6. Handle Hyperliquid Fill Events (Market Trades)
  hyperWs.on('fill', async (fillData) => {
    dataCollector.stats.totalFills++;
    
    try {
      if (fillData.isSnapshot) return;

      // Only follow Taker trades (active moves)
      if (fillData.crossed) {
        await orderExecutor.executeMarketOrder(fillData);
      }
    } catch (error) {
      logger.error('Failed to process fill event', error);
    }
  });

  // 7. Subscribe to Binance User Data Stream (For Orphan Fill Detection)
  try {
    binanceClient.subscribeUserStream(async (data) => {
      // data event type: 'ORDER_TRADE_UPDATE' usually implies execution
      // We look for Execution Report with status FILLED or PARTIALLY_FILLED
      // binance-api-node unifies this, but let's check the raw event or unified struct.
      // Usually: data.eventType === 'ORDER_TRADE_UPDATE' or 'executionReport'
      
      if (data.eventType === 'ORDER_TRADE_UPDATE' || data.e === 'ORDER_TRADE_UPDATE') {
        const order = data.order || data.o;
        if (!order) return;

        const status = order.orderStatus || order.X;
        const executionType = order.executionType || order.x;

        if (status === 'FILLED' || status === 'PARTIALLY_FILLED') {
           // We have a fill on Binance.
           // Check if it corresponds to a mapped Hype order.
           const binanceOrderId = order.orderId || order.i;
           const hyperOid = await orderMapper.getHyperliquidOrder(binanceOrderId);
           
           if (hyperOid) {
             // It is a mapped order.
             // Record it as Orphan (initially) - assuming Hype hasn't filled yet.
             
             await consistencyEngine.recordOrphanFill(hyperOid, {
               coin: order.symbol.replace('USDT', ''), // Remove USDT suffix
               side: (order.side || order.S) === 'BUY' ? 'B' : 'A',
               sz: order.lastTradeQuantity || order.l,
               price: order.lastTradePrice || order.L,
               binanceOrderId: binanceOrderId
             });
           }
        }
      }
    });
    logger.info('Subscribed to Binance User Data Stream');
  } catch (error) {
    logger.warn('Failed to subscribe to Binance User Data Stream - Orphan detection disabled', error);
  }

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

