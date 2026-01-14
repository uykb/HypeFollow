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
    this.timer = setInterval(() => this.validateAll(), this.checkInterval);
    logger.info('Order status validator started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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
      }
      
      // Additional check: Timeout for stuck open orders (e.g., 24h)
      const timestamp = await orderMapper.getOrderTimestamp(hyperOid);
      const oneDay = 24 * 60 * 60 * 1000;
      if (timestamp && (Date.now() - timestamp > oneDay)) {
        logger.warn(`Stuck order detected (over 24h): ${mapping.symbol} ${mapping.orderId}. Cleaning up mapping.`);
        await orderMapper.deleteMapping(hyperOid);
      }

    } catch (error) {
      if (error.code === -2011) { // Unknown order
        logger.warn(`Binance order ${mapping.orderId} not found for HL OID ${hyperOid}. Cleaning up mapping.`);
        await orderMapper.deleteMapping(hyperOid);
      } else {
        logger.error(`Failed to validate order ${hyperOid}`, error);
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
