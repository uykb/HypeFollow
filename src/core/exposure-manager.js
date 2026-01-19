const config = require('config');
const logger = require('../utils/logger');
const redis = require('../utils/redis');
const binanceClient = require('../binance/api-client');
const hyperApiClient = require('../hyperliquid/api-client');

class ExposureManager {
  constructor() {
    // Mode configs
    this.tradingMode = config.get('trading.mode');
    this.fixedRatio = config.get('trading.fixedRatio');
    this.equalRatio = config.get('trading.equalRatio');
    
    // Profit target percent (e.g. 0.001 for 0.1%)
    this.profitTarget = 0.001;
  }

  /**
   * Check and rebalance exposure for a specific coin
   * @param {string} coin 
   * @param {string} masterAddress 
   */
  async checkAndRebalance(coin, masterAddress) {
    logger.info(`[ExposureManager] Checking exposure for ${coin}...`);
    
    try {
      // 1. Get Master Position
      // We fetch from API to be 100% sure of the "Truth"
      const masterPositions = await hyperApiClient.getUserPositions(masterAddress);
      const masterPosObj = masterPositions.find(p => p.coin === coin);
      const masterSize = masterPosObj ? parseFloat(masterPosObj.szi) : 0;

      // 2. Get Follower Position (Binance)
      const followerPos = await binanceClient.getPositionDetails(coin);
      if (!followerPos) {
        logger.warn(`[ExposureManager] Could not fetch follower position for ${coin}`);
        return;
      }
      const followerSize = followerPos.amount;

      // 3. Calculate Target Size
      let targetSize = 0;
      if (this.tradingMode === 'fixed') {
        targetSize = masterSize * this.fixedRatio;
      } else if (this.tradingMode === 'equal') {
        // For equal mode, we need equity ratio.
        // This is expensive to fetch every time.
        // Assuming 'fixed' is the primary concern for this "Min Size" issue.
        // But let's support Equal if possible or skip.
        // Given user context "fixed mode issue", let's prioritize fixed.
        // If equal mode, we might need to skip or fetch equities.
        // Let's warn and skip for now to avoid complexity/latency unless requested.
        logger.debug('[ExposureManager] Equal mode rebalancing not fully implemented yet. Skipping.');
        return;
      }

      // 4. Calculate Excess (Over-exposure)
      // We are looking for situations where Abs(Follower) > Abs(Target)
      // AND directions match (e.g. Both Long or Both Short)
      // If directions differ, it's a different problem (sync drift).
      
      const absMaster = Math.abs(masterSize);
      const absFollower = Math.abs(followerSize);
      const absTarget = Math.abs(targetSize);
      
      // Calculate Excess Magnitude
      // Excess = Current - Target
      const excess = absFollower - absTarget;

      logger.info(`[ExposureManager] ${coin}: Master=${masterSize}, Target=${targetSize}, Follower=${followerSize}, Excess=${excess}`);

      // Threshold: Excess must be positive and significant (e.g. > min size / 2)
      // Or simply > 0. Since we deal with min sizes like 0.002, 
      // an excess of 0.001 is significant.
      if (excess <= 0.00001) {
        logger.info(`[ExposureManager] No significant excess exposure for ${coin}.`);
        return;
      }

      // 5. Determine TP Direction
      // If Follower is Long (>0), we need to SELL to reduce.
      // If Follower is Short (<0), we need to BUY to reduce.
      const tpSide = followerSize > 0 ? 'A' : 'B';
      
      // 6. Determine TP Price
      // Entry Price +/- 0.1%
      const entryPrice = followerPos.entryPrice;
      if (!entryPrice || entryPrice <= 0) {
        logger.warn('[ExposureManager] Invalid entry price, cannot calculate TP.');
        return;
      }

      const priceMultiplier = tpSide === 'A' ? (1 + this.profitTarget) : (1 - this.profitTarget);
      const tpPrice = entryPrice * priceMultiplier;

      // 7. Manage TP Order
      // First, cancel any existing TP order for this coin managed by us.
      // We track TP order ID in Redis.
      const redisKey = `exposure:tp:${coin}`;
      const oldTpOrderId = await redis.get(redisKey);
      
      if (oldTpOrderId) {
        logger.info(`[ExposureManager] Cancelling old TP order ${oldTpOrderId}`);
        try {
          await binanceClient.cancelOrder(binanceClient.getBinanceSymbol(coin), oldTpOrderId);
        } catch (e) {
          logger.warn(`[ExposureManager] Failed to cancel old TP order (might be filled): ${e.message}`);
        }
        await redis.del(redisKey);
      }

      // 8. Place New TP Order
      // Quantity = Excess
      // Round excess to precision (Binance doesn't like 0.00100000004)
      const roundedExcess = this.roundQuantity(excess, coin);
      
      if (roundedExcess <= 0) {
        logger.info('[ExposureManager] Excess rounds to 0. Skipping TP.');
        return;
      }

      logger.info(`[ExposureManager] Placing Reduce-Only TP: ${coin} ${tpSide} ${roundedExcess} @ ${tpPrice}`);
      
      try {
        const order = await binanceClient.createReduceOnlyOrder(coin, tpSide, tpPrice, roundedExcess);
        if (order && order.orderId) {
          await redis.set(redisKey, order.orderId);
          logger.info(`[ExposureManager] TP Order placed: ${order.orderId}`);
        }
      } catch (e) {
        logger.error(`[ExposureManager] Failed to place TP order: ${e.message}`);
      }

    } catch (error) {
      logger.error(`[ExposureManager] Error in checkAndRebalance for ${coin}`, error);
    }
  }

  // Helper from position-calculator logic (simplified)
  roundQuantity(quantity, coin) {
    const decimals = {
      BTC: 3,
      ETH: 3,
      SOL: 1,
      DEFAULT: 3
    };
    const precision = decimals[coin] || decimals.DEFAULT;
    const factor = Math.pow(10, precision);
    return Math.round(quantity * factor) / factor;
  }
}

module.exports = new ExposureManager();
