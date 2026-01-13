const redis = require('../utils/redis');
const logger = require('../utils/logger');

// Key prefixes
const HYPER_TO_BINANCE = 'map:h2b:';
const BINANCE_TO_HYPER = 'map:b2h:';
const EXPIRY = 60 * 60 * 24 * 7; // 7 days retention

class OrderMapper {
  /**
   * Map a Hyperliquid OID to a Binance OrderId
   * @param {string} hyperOid 
   * @param {string} binanceOrderId 
   * @param {string} symbol 
   */
  async saveMapping(hyperOid, binanceOrderId, symbol) {
    try {
      const pipeline = redis.pipeline();
      
      // Store bi-directional mapping
      pipeline.set(`${HYPER_TO_BINANCE}${hyperOid}`, JSON.stringify({ orderId: binanceOrderId, symbol }), 'EX', EXPIRY);
      pipeline.set(`${BINANCE_TO_HYPER}${binanceOrderId}`, JSON.stringify({ oid: hyperOid, symbol }), 'EX', EXPIRY);
      
      await pipeline.exec();
      logger.debug(`Mapped Hyperliquid OID ${hyperOid} to Binance OrderID ${binanceOrderId}`);
    } catch (error) {
      logger.error('Failed to save order mapping', error);
    }
  }

  /**
   * Get Binance OrderId from Hyperliquid OID
   * @param {string} hyperOid 
   * @returns {Promise<{orderId: string, symbol: string}|null>}
   */
  async getBinanceOrder(hyperOid) {
    try {
      const data = await redis.get(`${HYPER_TO_BINANCE}${hyperOid}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get Binance order', error);
      return null;
    }
  }

  /**
   * Delete mapping for a Hyperliquid OID
   * @param {string} hyperOid 
   */
  async deleteMapping(hyperOid) {
    try {
      const mappedOrder = await this.getBinanceOrder(hyperOid);
      
      const pipeline = redis.pipeline();
      pipeline.del(`${HYPER_TO_BINANCE}${hyperOid}`);
      
      if (mappedOrder && mappedOrder.orderId) {
        pipeline.del(`${BINANCE_TO_HYPER}${mappedOrder.orderId}`);
      }
      
      await pipeline.exec();
      logger.debug(`Deleted mapping for Hyperliquid OID ${hyperOid}`);
    } catch (error) {
      logger.error('Failed to delete order mapping', error);
    }
  }
}

module.exports = new OrderMapper();
