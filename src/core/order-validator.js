const binanceClient = require('../binance/api-client');
const orderMapper = require('./order-mapper');
const redis = require('../utils/redis');
const logger = require('../utils/logger');

class OrderValidator {
  constructor() {
    this.checkInterval = 60000; // 1 minute
    this.timer = null;
    this.isChecking = false;
  }

  start() {
    if (this.timer) return;
    this.cleanupStaleMappings().catch(err => logger.error('Startup cleanup failed', err));
    this.timer = setInterval(() => this.validateAll(), this.checkInterval);
    logger.info('Order status validator started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async cleanupStaleMappings() {
    logger.info('Running startup cleanup for stale order mappings...');
    try {
      const keys = await redis.keys('map:h2b:*');
      let cleaned = 0;
      
      for (const key of keys) {
        const hyperOid = key.replace('map:h2b:', '');
        const mapping = await orderMapper.getBinanceOrder(hyperOid);
        if (!mapping) continue;

        try {
          await binanceClient.client.futuresOrder({
            symbol: mapping.symbol,
            orderId: mapping.orderId.toString()
          });
        } catch (error) {
          // -2011: Unknown order
          if (error.code === -2011) {
            await orderMapper.deleteMapping(hyperOid);
            cleaned++;
          }
        }
      }
      if (cleaned > 0) {
        logger.info(`Startup cleanup removed ${cleaned} stale mappings`);
      }
    } catch (error) {
      logger.error('Error during startup cleanup', error);
    }
  }

  async validateAll() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const keys = await redis.keys('map:h2b:*');
      if (keys.length === 0) {
        this.isChecking = false;
        return;
      }

      logger.debug(`Validating ${keys.length} active order mappings...`);

      for (const key of keys) {
        const hyperOid = key.replace('map:h2b:', '');
        await this.validateOrder(hyperOid);
      }
    } catch (error) {
      logger.error('Error in order validation loop', error);
    } finally {
      this.isChecking = false;
    }
  }

  async validateOrder(hyperOid) {
    const mapping = await orderMapper.getBinanceOrder(hyperOid);
    if (!mapping) return;

    try {
      // Query Binance for real-time status
      const binanceOrder = await binanceClient.client.futuresOrder({
        symbol: mapping.symbol,
        orderId: mapping.orderId.toString()
      });

      const finalStatuses = ['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'];
      
      if (finalStatuses.includes(binanceOrder.status)) {
        logger.info(`Cleaning up finished order: ${mapping.symbol} ${mapping.orderId} (Status: ${binanceOrder.status})`);
        await orderMapper.deleteMapping(hyperOid);
      } else {
        await redis.del(`validate:fail:${hyperOid}`);
      }
      
      // Additional check: Timeout for stuck open orders (e.g., 24h)
      const timestamp = await orderMapper.getOrderTimestamp(hyperOid);
      const oneDay = 24 * 60 * 60 * 1000;
      if (timestamp && (Date.now() - timestamp > oneDay)) {
        logger.warn(`Stuck order detected (over 24h): ${mapping.symbol} ${mapping.orderId}. Cleaning up mapping.`);
        await orderMapper.deleteMapping(hyperOid);
      }

    } catch (error) {
      const failKey = `validate:fail:${hyperOid}`;
      const fails = await redis.incr(failKey);
      await redis.expire(failKey, 3600);

      if (error.code === -2011) { // Unknown order
        logger.warn(`Binance order ${mapping.orderId} not found for HL OID ${hyperOid}. Cleaning up mapping.`);
        await orderMapper.deleteMapping(hyperOid);
        await redis.del(failKey);
      } else {
        // Only log network/other errors, do not force delete mapping to avoid losing valid orders
        logger.error(`Failed to validate order ${hyperOid} (Attempt ${fails})`, error);
      }
    }
  }

  async getReport() {
    const keys = await redis.keys('map:h2b:*');
    const details = [];
    for (const key of keys) {
      const hyperOid = key.replace('map:h2b:', '');
      const mapping = await orderMapper.getBinanceOrder(hyperOid);
      if (mapping) {
        details.push({ hyperOid, ...mapping });
      }
    }
    return {
      activeCount: keys.length,
      orders: details
    };
  }
}

module.exports = new OrderValidator();
