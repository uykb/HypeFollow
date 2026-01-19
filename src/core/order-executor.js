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
    
    // Only enforce if we are "Lagging" (Delta > 0 for Buy, Delta < 0 for Sell?)
    // Actually, `pendingDelta` is signed. Positive = Need to Buy. Negative = Need to Sell.
    // We should only enforce if the direction matches the pending delta.
    // But caller context handles direction match check usually.
    // Here we just check if there is ANY significant delta to clear.
    
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

      // Check if we should execute
      // For Limit Orders, we trust the Master's Intent (Open Order) more than the Net Position Delta.
      // Net Delta is crucial for Inventory Management (Market Fills), but preventing Limit Orders
      // based on delta causes "Missing Orders" on the UI and failure to catch moves.
      // So we use signedMasterOrderSize directly for direction check, but we still track execution against TotalSize for delta updates.
      
      // Strict Direction Check (Disabled for Limit Orders to allow Drift-Preserving Copying)
      // const isDirectionMatch = (side === 'B' && signedTotalSize > 0) || (side === 'A' && signedTotalSize < 0);
      
      // New Logic: Always execute Limit Orders if size > 0.
      // But we still track the "Net Effect" on the Delta.
      
      // Also apply a small epsilon for float comparison
      const absTotalSize = Math.abs(signedTotalSize);
      // if (absTotalSize < 0.0000001 || !isDirectionMatch) {
      //   logger.info(`Skipping order ${oid}: Adjusted Total Size ${signedTotalSize} (Order: ${signedMasterOrderSize}) - Direction Mismatch or Zero`);
      //   await consistencyEngine.markOrderProcessed(oid, { status: 'skipped_net_calculation' });
      //   await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
      //   return;
      // }

      // 3. Get Current Position & Calculate Follower Quantity
      const currentPos = await binanceClient.getPosition(coin);
      
      // Determine Action Type
      const isClosing = (currentPos > 0 && side === 'A') || (currentPos < 0 && side === 'B');
      const actionType = isClosing ? 'close' : 'open';

      // Use Master Order Size for Quantity Calculation (Ignore Delta for Order Size to purely Copy)
      // But wait, if we ignore delta, we might never catch up?
      // Actually, PositionCalculator applies ratio to `originalQuantity`.
      // If we use `absTotalSize`, we are trying to clear delta.
      // If we use `Math.abs(signedMasterOrderSize)`, we are just copying the new order.
      // Given the user wants "Copy Limit Orders", let's use Master Size.
      // We will handle Delta "catch up" via Enforced Quantity or separate logic, OR accept drift.
      // But wait, if we use Master Size, `signedTotalSize` (Delta) remains partially untouched?
      // No, later we consume delta based on what we executed.
      
      const quantity = await positionCalculator.calculateQuantity(
        coin,
        Math.abs(signedMasterOrderSize), // Changed from absTotalSize to just Master Order Size for Limit Orders
        userAddress,
        actionType
      );

      // Check if we skipped due to min size
      if (!quantity || quantity <= 0) {
        
        // Try Enforced Execution (Scheme: Force Min Size if Lagging)
        const enforcedQuantity = await this.getEnforcedQuantity(coin, quantity, actionType);
        
        if (enforcedQuantity && enforcedQuantity > 0) {
          // Check Risk for Enforced Quantity
          if (riskControl.checkPositionLimit(coin, currentPos, enforcedQuantity)) {
            logger.info(`Force executing min size ${enforcedQuantity} for ${coin} to clear delta`);
            
            const binanceOrder = await binanceClient.createLimitOrder(
              coin, side, limitPx, enforcedQuantity
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
          logger.error(`Failed to run exposure rebalance for ${coin} (Market)`, err);
      });

    } catch (error) {
      logger.error(`Failed to execute limit order ${oid}`, error);
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

      const quantity = await positionCalculator.calculateQuantity(
        coin,
        absTotalSize,
        userAddress,
        actionType
      );

      if (!quantity || quantity <= 0) {
        
        // Try Enforced Execution (Scheme: Force Min Size if Lagging)
        const enforcedQuantity = await this.getEnforcedQuantity(coin, quantity, actionType);
        
        if (enforcedQuantity && enforcedQuantity > 0) {
          if (riskControl.checkPositionLimit(coin, currentPos, enforcedQuantity)) {
            logger.info(`Force executing min size ${enforcedQuantity} for ${coin} to clear delta (Market)`);
            
            const binanceOrder = await binanceClient.createMarketOrder(coin, side, enforcedQuantity);
            
            if (binanceOrder && binanceOrder.orderId) {
              const symbol = binanceClient.getBinanceSymbol(coin);
              await orderMapper.saveMapping(fillId, binanceOrder.orderId, symbol);
            }
            
            // Record Trade Stats (Market)
            // For fills, latency is diff between fill time and now
            dataCollector.recordTrade({
                 symbol: binanceClient.getBinanceSymbol(coin),
                 side,
                 size: enforcedQuantity,
                 price: px, 
                 latency: Date.now() - (timestamp || Date.now()),
                 slippage: 0, // Hard to calc exact without execution price, assume close for now or use fill price
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

      const binanceOrder = await binanceClient.createMarketOrder(coin, side, quantity);

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

        // 7. Update Delta
        // ... (existing comments) ...
        const deltaCleared = signedTotalSize - signedMasterOrderSize;
        await positionTracker.consumePendingDelta(coin, deltaCleared);

        // 8. Exposure Check & Rebalance (New Risk Control)
        // Trigger post-execution check to handle min-size induced exposure drift
        // We run this in background (no await) to not block the main flow, 
        // or await if we want strict sequentiality. Background is safer for latency.
        exposureManager.checkAndRebalance(coin, userAddress).catch(err => {
            logger.error(`Failed to run exposure rebalance for ${coin}`, err);
        });
      }

    } catch (error) {
      logger.error(`Failed to execute market order for ${coin}`, error);
    }
  }
}

module.exports = new OrderExecutor();
