const config = require('config');
const logger = require('../utils/logger');

class RiskControl {
  constructor() {
    this.supportedCoins = new Set(config.get('riskControl.supportedCoins'));
    this.maxPositionSizes = config.get('riskControl.maxPositionSize');
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

    return true;
  }

  /**
   * Check if adding quantity would exceed max position size
   * @param {string} coin 
   * @param {number} currentPositionSize (Signed)
   * @param {number} newQuantity (Positive)
   * @returns {boolean} True if safe, False if exceeded
   */
  checkPositionLimit(coin, currentPositionSize, newQuantity) {
    const maxLimit = this.maxPositionSizes[coin];
    
    // If no limit defined, assume unlimited or safe
    if (maxLimit === undefined) return true;

    const currentAbs = Math.abs(currentPositionSize);
    const projectedSize = currentAbs + newQuantity;

    if (projectedSize > maxLimit) {
      logger.warn(`Risk Control: Position limit exceeded for ${coin}. Current: ${currentAbs}, New: ${newQuantity}, Limit: ${maxLimit}`);
      return false;
    }

    return true;
  }
}

module.exports = new RiskControl();
