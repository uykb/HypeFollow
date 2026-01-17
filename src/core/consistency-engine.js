const redis = require('../utils/redis');
const logger = require('../utils/logger');
const config = require('config');
const orderMapper = require('./order-mapper');
const binanceClient = require('../binance/api-client');
const positionTracker = require('./position-tracker');
const positionCalculator = require('./position-calculator');

class ConsistencyEngine {
  constructor() {
    // MVP assumes single user tracking for address-dependent logic
    const followedUsers = config.get('hyperliquid.followedUsers');
    this.primaryTargetAddress = followedUsers && followedUsers.length > 0 ? followedUsers[0] : null;
  }
  /**
   * Check if Hyperliquid order has already been processed
   * @param {string} oid 
   */
  async isOrderProcessed(oid) {
    const processed = await redis.hget(`orderHistory:${oid}`, 'processed');
    return processed === 'true';
  }

  /**
   * Mark Hyperliquid order as processed
   * @param {string} oid 
   * @param {object} details 
   */
  async markOrderProcessed(oid, details) {
    try {
      const pipeline = redis.pipeline();
      pipeline.hset(`orderHistory:${oid}`, {
        ...details,
        processed: 'true',
        processedAt: Date.now()
      });
      pipeline.expire(`orderHistory:${oid}`, 604800); // 7 days
      await pipeline.exec();
    } catch (error) {
      logger.error(`Failed to mark order ${oid} as processed`, error);
    }
  }

  /**
   * Check if we should process this Hyperliquid order
   * Checks for duplicates and existing active Binance orders
   * @param {string} oid 
   */
  async shouldProcessHyperOrder(oid) {
    if (await this.isOrderProcessed(oid)) {
      logger.debug(`Order ${oid} already processed, skipping`);
      return false;
    }

    const mapping = await orderMapper.getBinanceOrder(oid);
    if (mapping) {
      try {
        const status = await binanceClient.getOrderStatus(mapping.symbol, mapping.orderId);
        if (['NEW', 'PARTIALLY_FILLED'].includes(status)) {
          logger.info(`Active Binance order exists for ${oid} (${mapping.orderId}), skipping`);
          return false;
        }
        return false;
      } catch (error) {
        logger.warn(`Mapping exists for ${oid} but Binance check failed, skipping safety`, error);
        return false;
      }
    }

    return true;
  }

  /**
   * Record an Orphan Fill (Binance filled, Hyperliquid didn't)
   * This updates the Pending Delta to reflect that we are "Ahead" of the target.
   * 
   * @param {string} hyperOid 
   * @param {object} fillDetails { coin, side: 'B'/'A', size: string/number, ... }
   */
  async recordOrphanFill(hyperOid, fillDetails) {
    const key = `orphanFill:${hyperOid}`;
    
    // Check if already recorded to avoid double-counting
    const exists = await redis.exists(key);
    if (exists) return;

    await redis.hset(key, {
      coin: fillDetails.coin,
      side: fillDetails.side,
      size: fillDetails.size,
      price: fillDetails.price,
      binanceOrderId: fillDetails.binanceOrderId,
      occurredAt: Date.now()
    });

    // Calculate Master Equivalent Size
    const followerSize = parseFloat(fillDetails.size);
    const masterSize = await positionCalculator.getReversedMasterSize(
      followerSize, 
      this.primaryTargetAddress
    );
    
    // Save master equivalent size in orphan record for later reference (e.g. if resolved later)
    await redis.hset(key, 'masterSize', masterSize);

    // Calculate Signed Size based on Master Size
    const signedChange = fillDetails.side === 'B' ? -masterSize : masterSize;

    await positionTracker.addPendingDelta(fillDetails.coin, signedChange);
    
    logger.warn(`Orphan fill recorded: Hype OID ${hyperOid}, Delta adjusted by ${signedChange} (Master Units)`);
  }

  /**
   * Handle Hyperliquid Fill Event
   * Checks if this fill resolves a previous orphan state
   * @param {string} oid 
   */
  async handleHyperliquidFill(oid) {
    const orphanKey = `orphanFill:${oid}`;
    const orphan = await redis.hgetall(orphanKey);
    
    if (orphan && orphan.coin) {
      // HL finally filled. 
      // We previously adjusted delta by (-SignedMasterSize).
      // Now we need to Reverse this adjustment because the Target has now moved.
      // (Target increase = +MasterSize. Actual unchanged now. Net Delta increase = +MasterSize).
      
      // Use the stored masterSize if available, otherwise reverse calc again (might have ratio drift but ok)
      let masterSize = orphan.masterSize ? parseFloat(orphan.masterSize) : 0;
      
      if (!masterSize) {
         masterSize = await positionCalculator.getReversedMasterSize(
           parseFloat(orphan.size),
           this.primaryTargetAddress
         );
      }

      const signedChange = orphan.side === 'B' ? masterSize : -masterSize;

      await positionTracker.addPendingDelta(orphan.coin, signedChange);
      
      await redis.del(orphanKey);
      logger.info(`Orphan fill resolved (Hype Caught Up): Hype OID ${oid}, Delta adjusted by ${signedChange}`);
    }
  }
}

module.exports = new ConsistencyEngine();
