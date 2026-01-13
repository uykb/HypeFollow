const config = require('config');
const redis = require('../utils/redis');
const logger = require('../utils/logger');
const accountManager = require('../core/account-manager');
const binanceClient = require('../binance/api-client');
const EventEmitter = require('events');

class DataCollector extends EventEmitter {
  constructor() {
    super();
    this.stats = {
      startTime: Date.now(),
      totalOrders: 0,
      totalFills: 0,
      errors: 0
    };
    this.recentLogs = [];
    this.maxLogs = 100;
    this.followedUsers = config.get('hyperliquid.followedUsers');
    this.refreshInterval = config.get('monitoring.refreshInterval') || 5000;
    this.timer = null;
    
    this.cache = {
      accounts: {
        hyperliquid: {},
        binance: { equity: 0, positions: [] }
      },
      orderMappings: []
    };
  }

  start() {
    this.timer = setInterval(() => this.collectData(), this.refreshInterval);
    this.collectData(); // Initial collection
    logger.info('Monitoring Data Collector started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  addLog(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };
    this.recentLogs.unshift(logEntry);
    if (this.recentLogs.length > this.maxLogs) {
      this.recentLogs.pop();
    }
    this.emit('log', logEntry);
  }

  async collectData() {
    try {
      // 1. Collect Account Data
      await this.collectAccountData();
      
      // 2. Collect Order Mappings from Redis
      await this.collectOrderMappings();

      this.emit('update', this.getSnapshot());
    } catch (error) {
      logger.error('Data collection failed', error);
      this.stats.errors++;
    }
  }

  async collectAccountData() {
    // Hyperliquid Equity
    for (const address of this.followedUsers) {
      try {
        const equity = await accountManager.getHyperliquidTotalEquity(address);
        this.cache.accounts.hyperliquid[address] = equity;
      } catch (e) {
        logger.warn(`Failed to fetch HL equity for ${address} in collector`);
      }
    }

    // Binance Equity & Positions
    try {
      const equity = await accountManager.getBinanceTotalEquity();
      const positionsRaw = await binanceClient.futuresPositionRisk();
      
      this.cache.accounts.binance = {
        equity,
        positions: positionsRaw.filter(p => parseFloat(p.positionAmt) !== 0).map(p => ({
          symbol: p.symbol,
          amount: p.positionAmt,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
          unrealizedProfit: p.unrealizedProfit,
          leverage: p.leverage
        }))
      };
    } catch (e) {
      logger.warn('Failed to fetch Binance data in collector', e);
    }
  }

  async collectOrderMappings() {
    try {
      const keys = await redis.keys('map:h2b:*');
      const mappings = [];
      for (const key of keys) {
        const val = await redis.get(key);
        if (val) {
          const parsed = JSON.parse(val);
          mappings.push({
            hyperOid: key.replace('map:h2b:', ''),
            binanceOrderId: parsed.orderId,
            symbol: parsed.symbol
          });
        }
      }
      this.cache.orderMappings = mappings;
    } catch (e) {
      logger.error('Failed to collect order mappings', e);
    }
  }

  getSnapshot() {
    return {
      stats: {
        ...this.stats,
        uptime: Math.floor((Date.now() - this.stats.startTime) / 1000)
      },
      accounts: this.cache.accounts,
      mappings: this.cache.orderMappings,
      config: {
        mode: config.get('trading.mode'),
        followedUsers: this.followedUsers,
        emergencyStop: config.get('app.emergencyStop')
      }
    };
  }
}

module.exports = new DataCollector();
