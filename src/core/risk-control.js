const config = require('config');
const logger = require('../utils/logger');

class RiskControl {
  constructor() {
    this.supportedCoins = new Set(config.get('riskControl.supportedCoins'));
    this.emergencyStop = config.get('app.emergencyStop');
  }

  /**
   * Check if the system is in emergency stop mode
   */
  isEmergencyStopActive() {
    return this.emergencyStop;
  }

  /**
   * Set emergency stop status
   * @param {boolean} status 
   */
  setEmergencyStop(status) {
    this.emergencyStop = status;
    logger.warn(`Emergency stop set to: ${status}`);
  }

  /**
   * Check if a coin is supported
   * @param {string} coin 
   */
  isCoinSupported(coin) {
    return this.supportedCoins.has(coin);
  }

  /**
   * Validate if an order should be processed
   * @param {object} orderDetails 
   */
  validateOrder(orderDetails) {
    if (this.isEmergencyStopActive()) {
      throw new Error('Emergency stop is active');
    }

    if (!this.isCoinSupported(orderDetails.coin)) {
      throw new Error(`Coin ${orderDetails.coin} is not in whitelist`);
    }

    // Add more risk checks here (e.g. max size)
    
    return true;
  }
}

module.exports = new RiskControl();
