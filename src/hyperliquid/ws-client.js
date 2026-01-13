const WebSocket = require('ws');
const config = require('config');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const parsers = require('./parsers');

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
    });

    this.ws.on('message', (data) => {
      try {
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
