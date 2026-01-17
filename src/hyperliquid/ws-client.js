const WebSocket = require('ws');
const config = require('config');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const parsers = require('./parsers');
const axios = require('axios');

class HyperliquidWS extends EventEmitter {
  constructor() {
    super();
    this.wsUrl = config.get('hyperliquid.wsUrl');
    this.followedUsers = config.get('hyperliquid.followedUsers'); // Array of UIDs
    this.ws = null;
    this.pingInterval = null;
    
    // Reconnection settings
    this.reconnectAttempts = 0;
    this.baseReconnectDelay = 1000; // 1 second
    this.maxReconnectDelay = 30000; // 30 seconds
    this.isExplicitClose = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      logger.info('Connected to Hyperliquid WebSocket');
      this.reconnectAttempts = 0; // Reset attempts on successful connection
      this.isExplicitClose = false;
      this.subscribe();
      this.startHeartbeat();
      
      // Perform Initial Sync of Open Orders
      this.syncInitialOrders();
    });


    this.ws.on('message', (data) => {
      try {
        // Log raw message for debugging (truncate if too long, e.g. large snapshots)
        const dataStr = data.toString();
        if (dataStr.length > 1000) {
           logger.info(`[RAW WS] ${dataStr.substring(0, 1000)}... (truncated)`);
        } else {
           logger.info(`[RAW WS] ${dataStr}`);
        }

        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        logger.error('Error parsing WebSocket message', error);
      }
    });

    this.ws.on('close', () => {
      this.stopHeartbeat();
      if (this.isExplicitClose) {
         logger.info('Hyperliquid WebSocket closed explicitly.');
         return;
      }

      logger.warn('Hyperliquid WebSocket disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      logger.error('Hyperliquid WebSocket error', error);
      // 'close' event usually follows 'error', so we handle reconnect there
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Exponential backoff: base * 2^attempts
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    logger.info(`Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts + 1})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  close() {
    this.isExplicitClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }

  subscribe() {
    if (this.followedUsers.length === 0) {
      logger.warn('No users to follow configured');
      return;
    }

    this.followedUsers.forEach(user => {
      // 1. Subscribe to Order Updates (Limit Orders)
      const orderMsg = {
        method: "subscribe",
        subscription: {
          type: "orderUpdates",
          user: user
        }
      };
      this.ws.send(JSON.stringify(orderMsg));
      logger.info(`Subscribed to orderUpdates for user: ${user}`);

      // 2. Subscribe to User Fills (Market Trades)
      const fillMsg = {
        method: "subscribe",
        subscription: {
          type: "userFills",
          user: user
        }
      };
      this.ws.send(JSON.stringify(fillMsg));
      logger.info(`Subscribed to userFills for user: ${user}`);
    });
  }

  async syncInitialOrders() {
    if (this.followedUsers.length === 0) return;

    logger.info('Starting initial sync of open orders...');

    for (const user of this.followedUsers) {
      try {
        const response = await axios.post('https://api.hyperliquid.xyz/info', {
          type: "openOrders",
          user: user
        });

        const openOrders = response.data;
        if (Array.isArray(openOrders) && openOrders.length > 0) {
          logger.info(`Found ${openOrders.length} existing open orders for ${user}. Syncing...`);
          
          for (const order of openOrders) {
            // Standardize to match WS event format
            const standardizedOrder = {
              type: 'order',
              status: 'open',
              coin: order.coin,
              side: order.side,
              limitPx: order.limitPx,
              sz: order.sz,
              oid: order.oid,
              timestamp: order.timestamp,
              userAddress: user
            };
            
            // Emit as if it came from WS
            this.emit('order', standardizedOrder);
            
            // Small delay to prevent overwhelming the executor/rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          logger.info(`No existing open orders found for ${user}.`);
        }
      } catch (error) {
        logger.error(`Failed to fetch initial orders for ${user}`, error);
      }
    }
  }

  handleMessage(message) {
    const { channel, data } = message;

    if (channel === 'orderUpdates') {
      const order = parsers.parseOrderUpdate(data);
      if (order) {
        this.emit('order', order);
      }
    } else if (channel === 'userFills') {
      const fills = parsers.parseUserFills(data);
      if (fills && fills.length > 0) {
        fills.forEach(fill => {
          this.emit('fill', fill);
        });
      }
    }
  }

  startHeartbeat() {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: "ping" }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

module.exports = new HyperliquidWS();
