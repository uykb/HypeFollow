const axios = require('axios');
const logger = require('../utils/logger');

class HyperliquidAPIClient {
  constructor() {
    this.baseUrl = 'https://api.hyperliquid.xyz/info';
  }

  /**
   * Get Clearinghouse State (Account Info)
   * @param {string} address User address
   * @returns {Promise<object>} Account state including margin summary
   */
  async getClearinghouseState(address) {
    try {
      const response = await axios.post(this.baseUrl, {
        type: 'clearinghouseState',
        user: address
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get Hyperliquid clearinghouse state', error);
      throw error;
    }
  }
}

module.exports = new HyperliquidAPIClient();
