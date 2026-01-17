const Binance = require('binance-api-node').default;
const config = require('config');
const logger = require('../utils/logger');

class BinanceClient {
  constructor() {
    const binanceConfig = config.get('binance');
    this.client = Binance({
      apiKey: binanceConfig.apiKey,
      apiSecret: binanceConfig.apiSecret,
      httpBase: binanceConfig.useTestnet ? 'https://testnet.binancefuture.com' : undefined,
    });
    this.isTestnet = binanceConfig.useTestnet;
  }

  /**
   * Convert Hyperliquid coin symbol to Binance Futures symbol
   * @param {string} coin e.g., "BTC"
   * @returns {string} e.g., "BTCUSDT"
   */
  getBinanceSymbol(coin) {
    // MVP assumption: All pairs are USDT perpetuals
    return `${coin}USDT`;
  }

  /**
   * Create a limit order
   * @param {string} coin 
   * @param {string} side 'B' or 'A'
   * @param {number|string} price 
   * @param {number|string} quantity 
   */
  async createLimitOrder(coin, side, price, quantity) {
    const symbol = this.getBinanceSymbol(coin);
    const binanceSide = side === 'B' ? 'BUY' : 'SELL';
    
    logger.info(`Placing LIMIT order on Binance: ${symbol} ${binanceSide} ${quantity} @ ${price}`);

    try {
      const order = await this.client.futuresOrder({
        symbol: symbol,
        side: binanceSide,
        type: 'LIMIT',
        timeInForce: 'GTC', // Good Till Cancelled
        quantity: quantity.toString(),
        price: price.toString(),
      });
      
      logger.info(`Binance LIMIT Order Placed: ${order.orderId}`);
      return order;
    } catch (error) {
      logger.error('Binance Limit Order Failed', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        params: { symbol, side: binanceSide, price, quantity }
      });
      throw error;
    }
  }

  /**
   * Create a market order
   * @param {string} coin 
   * @param {string} side 'B' or 'A'
   * @param {number|string} quantity 
   */
  async createMarketOrder(coin, side, quantity) {
    const symbol = this.getBinanceSymbol(coin);
    const binanceSide = side === 'B' ? 'BUY' : 'SELL';

    logger.info(`Placing MARKET order on Binance: ${symbol} ${binanceSide} ${quantity}`);

    try {
      const order = await this.client.futuresOrder({
        symbol: symbol,
        side: binanceSide,
        type: 'MARKET',
        quantity: quantity.toString(),
      });

      logger.info(`Binance MARKET Order Placed: ${order.orderId}`);
      return order;
    } catch (error) {
      logger.error('Binance Market Order Failed', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        params: { symbol, side: binanceSide, quantity }
      });
      throw error;
    }
  }

  /**
   * Cancel an order
   * @param {string} symbol 
   * @param {string|number} orderId 
   */
  async cancelOrder(symbol, orderId) {
    logger.info(`Cancelling order on Binance: ${symbol} ID: ${orderId}`);
    try {
      const result = await this.client.futuresCancelOrder({
        symbol: symbol,
        orderId: orderId.toString()
      });
      logger.info(`Binance Order Cancelled: ${orderId}`);
      return result;
    } catch (error) {
      // If error is "Unknown Order" (code -2011), it might already be filled or cancelled.
      // We log it but don't necessarily crash the app.
      logger.warn('Binance Cancel Order Failed', { error: error.message, symbol, orderId });
      throw error;
    }
  }

  /**
   * Subscribe to User Data Stream (Fills, Order Updates)
   * @param {function} callback 
   * @returns {function} Unsubscribe function
   */
  subscribeUserStream(callback) {
    try {
      // client.ws.user returns a clean callback
      return this.client.ws.futuresUser(callback); 
      // Note: For Futures it is usually futuresUser, or user with specific config. 
      // binance-api-node distinguishes user() for spot and futuresUser() for futures?
      // Checking standard library usage: usually client.ws.futuresUser(callback) for futures.
    } catch (error) {
      logger.error('Failed to subscribe to Binance User Stream', error);
      throw error;
    }
  }

  /**
   * Get Order Status
   * @param {string} symbol 
   * @param {string} orderId 
   * @returns {Promise<string>} Order status
   */
  async getOrderStatus(symbol, orderId) {
    try {
      const order = await this.client.futuresOrder({
        symbol: symbol,
        orderId: orderId.toString()
      });
      return order.status;
    } catch (error) {
      // If order not found (e.g. -2013), throw or return null
      throw error;
    }
  }

  /**
   * Get Futures Account Info (V2)
   * @returns {Promise<object>} Account information including balances
   */
  async futuresAccountInfo() {
    try {
      // Use V2 endpoint typically
      return await this.client.futuresAccountInfo();
    } catch (error) {
      logger.error('Binance Account Info Failed', error);
      throw error;
    }
  }

  /**
   * Get Futures Position Risk (V2)
   * @returns {Promise<Array>} Position risk information
   */
  async futuresPositionRisk() {
    try {
      return await this.client.futuresPositionRisk();
    } catch (error) {
      logger.error('Binance Position Risk Failed', error);
      throw error;
    }
  }

  /**
   * Get current signed position amount for a coin
   * @param {string} coin 
   * @returns {Promise<number>} Signed position amount (Positive=Long, Negative=Short)
   */
  async getPosition(coin) {
    try {
      const symbol = this.getBinanceSymbol(coin);
      const positions = await this.futuresPositionRisk();
      const position = positions.find(p => p.symbol === symbol);
      return position ? parseFloat(position.positionAmt) : 0;
    } catch (error) {
      logger.error(`Failed to get position for ${coin}`, error);
      return 0; // Default to 0 (no position) on error to be safe
    }
  }
}

module.exports = new BinanceClient();
