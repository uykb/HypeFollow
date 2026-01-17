const logger = require('../utils/logger');
const binanceClient = require('../binance/api-client');
const orderMapper = require('./order-mapper');
const positionTracker = require('./position-tracker');
const consistencyEngine = require('./consistency-engine');
const riskControl = require('./risk-control');
const positionCalculator = require('./position-calculator');

class OrderExecutor {
  
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
      // We execute if:
      // 1. The direction matches the Order Side (we don't reverse trade an Order usually, unless we are "Reducing" a position we don't have? No.)
      //    Wait. If I have Pending Delta -0.2 (Overbought). SM Buys 0.1 (+0.1). Total = -0.1.
      //    This means we are STILL Overbought by 0.1 even after SM buys.
      //    Should we SELL 0.1? No. The instruction is "Wait for next add...".
      //    We just DON'T Buy.
      //    So if Total sign != Order sign, we Skip. (Or Total is 0).
      
      // 2. But what if Pending is +0.2 (Underbought). SM Sells 0.1 (-0.1). Total = +0.1.
      //    SM is Selling. We need to Buy 0.1?
      //    We should probably net it out.
      //    "SmartMoney Sells 0.1". If we are "Underbought" (Pending Buy), it means we missed a previous Buy.
      //    SM Sell 0.1 cancels out 0.1 of that missed Buy.
      //    Total +0.1. We should Buy 0.1?
      //    If SM is Selling, and we Buy, we are taking opposite side?
      //    Ideally: We just reduce our "Missed Buy" count. We don't execute anything.
      //    The logic "Total Signed" tells us the Net Change needed.
      //    If Net Change is +0.1, we need to add 0.1 Long.
      //    But triggering a Buy when SM is Selling might be confusing or risky (Price might be dropping).
      //    However, strictly mathematically to match Position, we *should* Buy 0.1 (because we are net +0.1 behind).
      //    BUT, user said "only when position catches up...".
      //    Let's stick to: We only execute if Total Direction matches Order Direction.
      //    i.e. We only "Piggyback" on the SM's action. We don't act contrary to it.
      
      const isDirectionMatch = (side === 'B' && signedTotalSize > 0) || (side === 'A' && signedTotalSize < 0);
      
      // Also apply a small epsilon for float comparison
      const absTotalSize = Math.abs(signedTotalSize);
      if (absTotalSize < 0.0000001 || !isDirectionMatch) {
        logger.info(`Skipping order ${oid}: Adjusted Total Size ${signedTotalSize} (Order: ${signedMasterOrderSize}) - Direction Mismatch or Zero`);
        await consistencyEngine.markOrderProcessed(oid, { status: 'skipped_net_calculation' });
        
        // Even if skipped, we "Consumed" the Order Size from the pending delta?
        // No. Pending Delta was "Target - Actual".
        // SM Action changes Target.
        // If we Skip, Actual doesn't change.
        // So Delta changes naturally?
        // Wait. Delta is stored in Redis. `getTotalExecutionSize` reads it.
        // It DOES NOT update it.
        // We only update Delta if we *deviate* from the plan.
        // Here, the plan is "Execute Total". If we don't Execute Total, we have a Deviation.
        // Deviation = Expected (Total) - Actual (0).
        // New Pending Delta = Old Pending + (Order - Executed).
        // Wait, simpler:
        // PositionTracker tracks `Target - Actual`.
        // SM Order: Target changes by +Order.
        // We Execute: Actual changes by +Exec.
        // New Delta = (OldTarget + Order) - (OldActual + Exec)
        //           = (OldTarget - OldActual) + Order - Exec
        //           = OldDelta + Order - Exec.
        
        // So, if we Skip (Exec=0), we must Add `Order` to Delta.
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      // 3. Calculate Follower Quantity
      // Use Absolute Total Size for calculation
      const quantity = await positionCalculator.calculateQuantity(
        coin,
        absTotalSize,
        userAddress,
        'open' // Assuming 'open' logic for simplicity as before
      );

      if (!quantity || quantity <= 0) {
        // We skipping execution, but we still need to update Delta (Target moved)
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      // 4. Check Risk
      const currentPos = await binanceClient.getPosition(coin);
      if (!riskControl.checkPositionLimit(coin, currentPos, quantity)) {
        // Blocked by Risk. Target moved, we didn't. Add to Delta.
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      // 5. Execute Order
      const binanceOrder = await binanceClient.createLimitOrder(
        coin, side, limitPx, quantity
      );

      // 6. Post-Process
      if (binanceOrder && binanceOrder.orderId) {
        const symbol = binanceClient.getBinanceSymbol(coin);
        await orderMapper.saveMapping(oid, binanceOrder.orderId, symbol);
      
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
        // We need to reflect that we executed `signedTotalSize`.
        // Formula: New Delta = Old Delta + Order - Executed.
        // Here, Executed IS TotalSize (which is OldDelta + Order).
        // So New Delta = Old Delta + Order - (OldDelta + Order) = 0.
        // EXCEPT if we didn't execute *exactly* TotalSize due to rounding/minSize in `calculateQuantity`.
        // `positionCalculator` might adjust `quantity`.
        // But `quantity` is Follower's size. `TotalSize` is Master's units.
        // We should track Master's Units in Delta.
        // So we assume we fully executed the Master's intent.
        // So we Consume the full TotalSize.
        // `consumePendingDelta` reduces delta by amount.
        // If we executed `signedTotalSize`, and originally `signedMasterOrderSize` was the new input.
        // The `pendingDelta` stored in Redis was `OldDelta`.
        // We want `NewDelta` = `OldDelta` + `Order` - `Order` (since we filled it) - `OldDelta` (since we filled it).
        // Basically, we wiped out the delta and the order.
        // So we set Delta to 0?
        // Or rather: `consumePendingDelta` logic:
        // Input: `amountConsumed`.
        // We consumed `signedTotalSize` worth of Master's intent.
        // Wait, `signedTotalSize` = `Order` + `OldDelta`.
        // If we execute this, we have addressed both the new Order and the Old Delta.
        // So the remaining Delta should be 0.
        // But `positionTracker` update logic needs to be careful.
        // Let's look at `consumePendingDelta`.
        // It subtracts amount.
        // If we pass `signedTotalSize - signedMasterOrderSize` (which is `OldDelta`),
        // Then we are saying we consumed the Delta. The `signedMasterOrderSize` is naturally consumed by the action itself (Target moves, Actual moves).
        
        // Wait, `PendingDelta` = `Target - Actual`.
        // SM Order: Target += Order.
        // We Exec: Actual += Exec.
        // We want Redis to hold the NEW (Target - Actual).
        // Currently Redis holds Old (Target - Actual).
        // If we do NOTHING to Redis: It holds Old Delta.
        // But physically Target changed. So implicitly Redis is "Wrong" unless we update it.
        // We should explicitly update Redis to be:
        // Redis = OldRedis + Order - Exec.
        
        // So, we should call `addPendingDelta(coin, signedMasterOrderSize - signedExecutedMasterUnits)`.
        // If we executed `signedTotalSize` (which equals Order + OldRedis), then:
        // Update = Order - (Order + OldRedis) = -OldRedis.
        // OldRedis + (-OldRedis) = 0.
        // So yes, we just want to zero out the delta (or reduce it).
        
        // Let's implement `consumePendingDelta` as `addPendingDelta(coin, -signedAmountConsumed)`.
        // Where `signedAmountConsumed` is the amount of *Delta* we cleared.
        // We cleared `signedTotalSize - signedMasterOrderSize`.
        
        const deltaCleared = signedTotalSize - signedMasterOrderSize;
        // In `PositionTracker`, `consumePendingDelta` does `incrbyfloat(key, -amount)`.
        // So if we pass `deltaCleared`, it subtracts it.
        // OldDelta - (Total - Order) = OldDelta - (OldDelta + Order - Order) = 0.
        // Correct.
        
        await positionTracker.consumePendingDelta(coin, deltaCleared);
      }

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

      const quantity = await positionCalculator.calculateQuantity(
        coin,
        absTotalSize,
        userAddress,
        'open'
      );

      if (!quantity || quantity <= 0) {
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      const currentPos = await binanceClient.getPosition(coin);
      if (!riskControl.checkPositionLimit(coin, currentPos, quantity)) {
        await positionTracker.addPendingDelta(coin, signedMasterOrderSize);
        return;
      }

      const binanceOrder = await binanceClient.createMarketOrder(coin, side, quantity);

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

    } catch (error) {
      logger.error(`Failed to execute market order for ${coin}`, error);
    }
  }
}

module.exports = new OrderExecutor();
