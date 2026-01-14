const config = require('config');
const logger = require('./logger');

class APIValidator {
  constructor() {
    this.requiredPermissions = ['futures'];
  }

  /**
   * 验证 API 密钥配置是否存在且格式基本正确
   */
  validateAPIConfig() {
    const apiKey = config.get('binance.apiKey');
    const apiSecret = config.get('binance.apiSecret');

    if (!apiKey || !apiSecret) {
      throw new Error('Binance API key or secret not configured');
    }

    if (apiKey.length < 32 || apiSecret.length < 32) {
      throw new Error('API key or secret format invalid (too short)');
    }

    const isTestnet = config.get('binance.useTestnet');
    if (!isTestnet && process.env.NODE_ENV === 'production') {
      logger.warn('⚠️  PRODUCTION MODE DETECTED - Real funds will be used!');
    }

    logger.info('✅ API configuration format validated');
    return true;
  }

  /**
   * 验证 API 权限（通过调用 futuresAccountInfo）
   * @param {object} binanceClient 
   */
  async validateAPIPermissions(binanceClient) {
    try {
      logger.info('Verifying API read permissions...');
      await binanceClient.futuresAccountInfo();
      logger.info('✅ API read permission verified');
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      if (errorMsg.includes('API-key format invalid')) {
        throw new Error('API Key format invalid');
      } else if (errorMsg.includes('Signature for this request is not valid')) {
        throw new Error('API Secret is invalid');
      } else if (errorMsg.includes('Invalid API-key, IP, or permissions')) {
        throw new Error('API Key has no permissions or IP is not whitelisted');
      }
      throw new Error(`API permission check failed: ${errorMsg}`);
    }

    const isTestnet = config.get('binance.useTestnet');
    if (!isTestnet) {
      logger.warn('🛑 MAINNET DETECTED: Ensure API key has ONLY "Futures" trading permission. "Withdrawal" MUST be disabled.');
    }
  }

  /**
   * 检查 IP 白名单配置提醒
   */
  checkIPWhitelist() {
    const allowedIPs = process.env.BINANCE_ALLOWED_IPS;
    if (!allowedIPs) {
      logger.warn('📝 Security Tip: No BINANCE_ALLOWED_IPS configured. Recommend setting up IP whitelist in Binance API management.');
    } else {
      logger.info(`✅ IP whitelist hint configured: ${allowedIPs}`);
    }
  }
}

module.exports = new APIValidator();
