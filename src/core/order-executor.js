const logger = require('../utils/logger');
const config = require('config');
const binanceClient = require('../binance/api-client');
const orderMapper = require('./order-mapper');
const positionTracker = require('./position-tracker');
const consistencyEngine = require('./consistency-engine');
const riskControl = require('./risk-control');
const positionCalculator = require('./position-calculator');
const dataCollector = require('../monitoring/data-collector'); // Import DataCollector
const exposureManager = require('./exposure-manager');

class OrderExecutor {
  
  /**
   * Calculate enforced minimum quantity if pending delta exists
   * @param {string} coin 
   * @param {number|null} calculatedQuantity 
   * @param {string} actionType 'open' or 'close'
   */
  async getEnforcedQuantity(coin, calculatedQuantity, actionType) {
    // Only check if calculated quantity is too small (skipped)
    if (calculatedQuantity && calculatedQuantity > 0) return null;

    const pendingDelta = await positionTracker.getPendingDelta(coin);
    
    if (Math.abs(pendingDelta) > 0) {
      const configSize = config.get('trading.minOrderSize')[coin];
      let minSize = 0;
      
      if (typeof configSize === 'object') {
        minSize = configSize[actionType] || 0;
      } else {
        minSize = configSize || 0;
      }

      logger.info(`Enforcing min size ${minSize} for ${coin} due to pending delta ${pendingDelta}`);
      return minSize;
    }
    
    return null;
  }

  /**
   * Execute Limit Order
   * @param {object} orderData 
   */
  async executeLimitOrder(orderData) {
    const { coin, side, limitPx, oid, sz, userAddress } = orderData;
    
    try {
      // 1. Consistency Check
      if (!await consistencyEngine.shouldProcessHyperOrder(oid)) {
        return;
      }

      // 2. Calculate Total Master Size (Signed)
      // Side B -> +Size, Side A -> -Size
      const masterOrderSize = parseFloat(sz);
      const signedMasterOrderSize = side === 'B' ? masterOrderSize : -masterOrderSize;
      
      // Get Total Signed Execution Size (Master Order + Pending Delta)
      const signedTotalSize = await positionTracker.getTotalExecutionSize(coin, signedMasterOrderSize);
      const absTotalSize = Math.abs(signedTotalSize);

      // 3. Get Current Position & Calculate Follower Quantity
      const currentPos = await binanceClient.getPosition(coin);
      
      // Determine Action Type
      const isClosing = (currentPos > 0 && side === 'A') || (currentPos < 0 && side === 'B');
      const actionType = isClosing ? 'close' : 'open';

      let quantity = await positionCalculator.calculateQuantity(
        coin,
        Math.abs(signedMasterOrderSize), // Changed from absTotalSize to just Master Order Size for Limit Orders
        userAddress,
        actionType
      );

      // 3.5 Cap Quantity for Reduce-Only orders to avoid Binance -2022 error
      if (isClosing && quantity > 0) {
        const binanceSide = side === 'B' ? 'BUY' : 'SELL';
        const openQty = await binanceClient.getOpenOrderQuantity(coin, binanceSide);
        const absPos = Math.abs(currentPos);
        const availableToClose = Math.max(0, absPos - openQty);
        
        if (quantity > availableToClose) {
          if (availableToClose < (config.get('trading.minOrderSize')[coin] || 0)) {
             logger.warn(`[OrderExecutor] Skipping Reduce-Only order for ${coin} as position is already fully covered by open orders. (Available: ${availableToClose}, Needed: ${quantity})`);
             return;
          }
          logger.info(`[OrderExecutor] Capping Reduce-Only order for ${coin} from ${quantity} to ${availableToClose} to fit remaining position.`);
          quantity = availableToClose;
        }
      }

      // Check if we skipped due to min size
      if (!quantity || quantity <= 0) {
        
        // Try Enforced Execution (Scheme: Force Min Size if Lagging)
        const enforcedQuantity = await this.getEnforcedQuantity(coin, quantity, actionType);
        
        if (enforcedQuantity && enforcedQuantity > 0) {
          // Cap enforced quantity too if closing
          let finalEnforcedQty = enforcedQuantity;
          if (isClosing) {
            const binanceSide = side === 'B' ? 'BUY' : 'SELL';
            const openQty = await binanceClient.getOpenOrderQuantity(coin, binanceSide);
            const absPos = Math.abs(currentPos);
            const availableToClose = Math.max(0, absPos - openQty);
            if (finalEnforcedQty > availableToClose) {
              finalEnforcedQty = availableToClose;
            }
          }

          if (finalEnforcedQty <= 0) {
            logger.warn(`[OrderExecutor] Cannot enforce min size for ${coin} (closing) as position is exhausted.`);
          } else if (riskControl.checkPositionLimit(coin, currentPos, finalEnforcedQty)) {
            logger.info(`Force executing min size ${finalEnforcedQty} for ${coin} to clear delta`);
            
            const binanceOrder = await binanceClient.createLimitOrder(
              coin, side, limitPx, finalEnforcedQty, isClosing
            );
            
            if (binanceOrder && binanceOrder.orderId) {
               const symbol = binanceClient.getBinanceSymbol(coin);
               await orderMapper.saveMapping(oid, binanceOrder.orderId, symbol);
               
               // Record Trade Stats
               dataCollector.recordTrade({
                 symbol,
                 side,
                 size: enforcedQuantity,
                 price: limitPx,
                 latency: Date.now() - (orderData.timestamp || Date.now()),
                 type: 'limit-enforced'
               });

               await consistencyEngine.markOrderProcessed(oid, {
                type: 'limit-enforced',
                coin, side,
                masterSize: masterOrderSize,
                totalMasterSize: absTotalSize,
                followerSize: enforcedQuantity,
                price: limitPx,
                binanceOrderId: binanceOrder.orderId
              });

              // Update Delta: We consumed the Pending Delta (Total Size - Order Size)
              const deltaCleared = signedTotalSize - signedMasterOrderSize;
              await positionTracker.consumePendingDelta(coin, deltaCleared);

              // Exposure Check & Rebalance
              exposureManager.checkAndRebalance(coin, userAddress).catch(err => {
                  logger.error(`Failed to run exposure rebalance for ${coin} (Enforced)`, err);
              });

              return;
            }
          }
        }

        // Skipped and not enforced. Accumulate delta for next execution
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      // 4. Check Risk
      if (!riskControl.checkPositionLimit(coin, currentPos, quantity)) {
        // Blocked by Risk. Target moved, we didn't. Add to Delta.
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      // 5. Execute Order
      const binanceOrder = await binanceClient.createLimitOrder(
        coin, side, limitPx, quantity, isClosing
      );

      // 6. Post-Process
      if (binanceOrder && binanceOrder.orderId) {
        const symbol = binanceClient.getBinanceSymbol(coin);
        await orderMapper.saveMapping(oid, binanceOrder.orderId, symbol);
      
        // Record Trade Stats
        dataCollector.recordTrade({
          symbol,
          side,
          size: quantity,
          price: limitPx,
          latency: Date.now() - (orderData.timestamp || Date.now()),
          type: 'limit'
        });

        await consistencyEngine.markOrderProcessed(oid, {
          type: 'limit',
          coin, side,
          masterSize: masterOrderSize,
          totalMasterSize: absTotalSize,
          followerSize: quantity,
          price: limitPx,
          binanceOrderId: binanceOrder.orderId
        });

        // 7. Update Delta
        const deltaCleared = signedTotalSize - signedMasterOrderSize;
        await positionTracker.consumePendingDelta(coin, deltaCleared);

        // 8. Exposure Check & Rebalance (New Risk Control)
        exposureManager.checkAndRebalance(coin, userAddress).catch(err => {
            logger.error(`Failed to run exposure rebalance for ${coin}`, err);
        });
      }

    } catch (error) {
      logger.error(`Failed to execute limit order ${oid}`, error);
    } finally {
      // Always release the lock so it can be retried or processed by other events if needed
      await consistencyEngine.releaseOrderLock(oid);
    }
  }

  /**
   * Execute Market Order (from Fills)
   * @param {object} fillData 
   */
  async executeMarketOrder(fillData) {
    const { coin, side, sz, userAddress, px, timestamp } = fillData;
    const fillId = `fill:${coin}:${timestamp}:${sz}`;

    try {
      if (await consistencyEngine.isOrderProcessed(fillId)) {
        return;
      }

      const masterOrderSize = parseFloat(sz);
      const signedMasterOrderSize = side === 'B' ? masterOrderSize : -masterOrderSize;
      const signedTotalSize = await positionTracker.getTotalExecutionSize(coin, signedMasterOrderSize);

      const isDirectionMatch = (side === 'B' && signedTotalSize > 0) || (side === 'A' && signedTotalSize < 0);
      const absTotalSize = Math.abs(signedTotalSize);

      if (absTotalSize < 0.0000001 || !isDirectionMatch) {
        // Skip execution, update delta
        await consistencyEngine.markOrderProcessed(fillId, { status: 'skipped_net_calc' });
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      const currentPos = await binanceClient.getPosition(coin);
      
      const isClosing = (currentPos > 0 && side === 'A') || (currentPos < 0 && side === 'B');
      const actionType = isClosing ? 'close' : 'open';

      let quantity = await positionCalculator.calculateQuantity(
        coin,
        absTotalSize,
        userAddress,
        actionType
      );

      // Cap Market Order if closing
      if (isClosing && quantity > 0) {
        const absPos = Math.abs(currentPos);
        if (quantity > absPos) {
          logger.info(`[OrderExecutor] Capping Market Close for ${coin} from ${quantity} to ${absPos}`);
          quantity = absPos;
        }
      }

      if (!quantity || quantity <= 0) {
        
        // Try Enforced Execution (Scheme: Force Min Size if Lagging)
        const enforcedQuantity = await this.getEnforcedQuantity(coin, quantity, actionType);
        
        if (enforcedQuantity && enforcedQuantity > 0) {
          if (riskControl.checkPositionLimit(coin, currentPos, enforcedQuantity)) {
            logger.info(`Force executing min size ${enforcedQuantity} for ${coin} to clear delta (Market)`);
            
            const binanceOrder = await binanceClient.createMarketOrder(coin, side, enforcedQuantity, isClosing);
            
            if (binanceOrder && binanceOrder.orderId) {
              const symbol = binanceClient.getBinanceSymbol(coin);
              await orderMapper.saveMapping(fillId, binanceOrder.orderId, symbol);
            }
            
            // Record Trade Stats (Market)
            dataCollector.recordTrade({
                 symbol: binanceClient.getBinanceSymbol(coin),
                 side,
                 size: enforcedQuantity,
                 price: px, 
                 latency: Date.now() - (timestamp || Date.now()),
                 slippage: 0, 
                 type: 'market-enforced'
            });

             await consistencyEngine.markOrderProcessed(fillId, {
              type: 'market-enforced',
              coin, side,
              masterSize: masterOrderSize,
              totalMasterSize: absTotalSize,
              followerSize: enforcedQuantity,
              price: px, 
              binanceOrderId: binanceOrder.orderId
            });

            const deltaCleared = signedTotalSize - signedMasterOrderSize;
            await positionTracker.consumePendingDelta(coin, deltaCleared);

            // Exposure Check & Rebalance
            exposureManager.checkAndRebalance(coin, userAddress).catch(err => {
                logger.error(`Failed to run exposure rebalance for ${coin} (Market)`, err);
            });
            return;
          }
        }

        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      if (!riskControl.checkPositionLimit(coin, currentPos, quantity)) {
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      const binanceOrder = await binanceClient.createMarketOrder(coin, side, quantity, isClosing);

      if (binanceOrder && binanceOrder.orderId) {
        const symbol = binanceClient.getBinanceSymbol(coin);
        await orderMapper.saveMapping(fillId, binanceOrder.orderId, symbol);
      }

      // Record Trade Stats
      dataCollector.recordTrade({
          symbol: binanceClient.getBinanceSymbol(coin),
          side,
          size: quantity,
          price: px,
          latency: Date.now() - (timestamp || Date.now()),
          type: 'market'
      });

      await consistencyEngine.markOrderProcessed(fillId, {
        type: 'market',
        coin, side,
        masterSize: masterOrderSize,
        totalMasterSize: absTotalSize,
        followerSize: quantity,
        price: px, 
        binanceOrderId: binanceOrder.orderId
      });

      const deltaCleared = signedTotalSize - signedMasterOrderSize;
      await positionTracker.consumePendingDelta(coin, deltaCleared);

      // Exposure Check & Rebalance (New Risk Control)
      exposureManager.checkAndRebalance(coin, userAddress).catch(err => {
          logger.error(`Failed to run exposure rebalance for ${coin}`, err);
      });

    } catch (error) {
      logger.error(`Failed to execute market order for ${coin}`, error);
    }
  }
}

module.exports = new OrderExecutor();
