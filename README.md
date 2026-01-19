# HypeFollow 🚀

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Status](https://img.shields.io/badge/status-active-success.svg?style=for-the-badge)

**HypeFollow** is an advanced, automated copy-trading system that synchronizes "Smart Money" movements from **Hyperliquid** (DEX) directly to your **Binance Futures** (CEX) account in real-time.

Designed for high-performance and reliability, HypeFollow bridges the gap between on-chain transparency and CEX liquidity.

---

## ✨ Key Features

### 🔄 Dual-Channel Synchronization
*   **Limit Order Sync**: Real-time tracking of `orderUpdates`. Creates, modifies, and cancels limit orders instantly to match the master.
*   **Market Execution Sync**: Listens to `userFills` to capture aggressive market entries/exits.

### ⚖️ Smart Position Management
*   **Equal Mode**: Automatically calculates position size based on the equity ratio between the Master (HL) and Follower (Binance).
    *   *Formula*: `Size = MasterSize * (MyEquity / MasterEquity) * Ratio`
*   **Fixed Mode**: Follows using a fixed multiplier.
    *   *Formula*: `Size = MasterSize * FixedRatio`

### 🛡️ Advanced Risk Control
*   **Exposure Rebalancing (New)**: Automatically detects when your exposure exceeds the target ratio (due to minimum order size constraints) and places **Reduce-Only Take Profit** orders to lock in profits and realign risk.
*   **Asset Whitelist**: Only trades configured assets (e.g., BTC, ETH, SOL).
*   **Safety Limits**: Configurable Maximum Position Size and Emergency Stop switches.
*   **One-Way Mode Enforcement**: Strictly adheres to Binance One-Way Mode for consistency.

### 📊 Modern Monitoring Dashboard
*   **Live Dashboard**: Built with **React** and **MUI**, running on port `49618`.
*   **Real-time Metrics**: View Hyperliquid & Binance balances, PnL, and total equity.
*   **Order Mapping**: Visual status of synced orders.
*   **System Logs**: Live streaming logs for debugging and monitoring.

### 🐳 Deployment
*   **Single-Container Architecture**: Redis is embedded within the application image. No complex orchestration required.
*   **Docker Ready**: Simple `docker-compose` or `docker run` deployment.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | Node.js v20+ | Core logic execution |
| **Frontend** | React, MUI | Monitoring Dashboard |
| **Data Store** | Redis (Embedded) | State persistence & Order mapping |
| **Exchange** | Hyperliquid WS | Source feed (WebSocket) |
| **Exchange** | Binance Futures API | Execution target (REST/WS) |

---

## 🚀 Quick Start

### Prerequisites
*   **Binance Futures Account**: API Key & Secret (Enable Futures Trading, Disable Withdrawals).
*   **Hyperliquid Address**: The wallet address of the trader you want to follow.
*   **Docker**: Installed on your server/machine.

### Option 1: Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  hypefollow:
    image: ghcr.io/uykb/hypefollow:main
    container_name: hypefollow
    ports:
      - "49618:49618"
    environment:
      - BINANCE_API_KEY=your_key_here
      - BINANCE_API_SECRET=your_secret_here
      - TRADING_MODE=fixed
      - FIXED_RATIO=0.1
      - NODE_ENV=production
    restart: unless-stopped
    volumes:
      - redis_data:/var/lib/redis

volumes:
  redis_data:
```

Run the container:
```bash
docker-compose up -d
```

### Option 2: Manual Docker Run

```bash
docker run -d --name hypefollow \
  --restart always \
  -p 49618:49618 \
  -v redis_data:/var/lib/redis \
  -e BINANCE_API_KEY=your_key \
  -e BINANCE_API_SECRET=your_secret \
  -e TRADING_MODE=fixed \
  -e FIXED_RATIO=0.1 \
  ghcr.io/uykb/hypefollow:main
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `BINANCE_API_KEY` | Your Binance API Key | **Required** |
| `BINANCE_API_SECRET` | Your Binance API Secret | **Required** |
| `TRADING_MODE` | `equal` or `fixed` | `equal` |
| `EQUAL_RATIO` | Multiplier for Equal mode | `1.0` |
| `FIXED_RATIO` | Multiplier for Fixed mode | `0.1` |
| `BINANCE_TESTNET` | Use Binance Testnet | `false` |
| `MONITORING_PORT` | Dashboard Access Port | `49618` |

### Advanced Strategy (`config/default.js`)

Modify the configuration file to set up followed users and risk limits.

```javascript
module.exports = {
  hyperliquid: {
    // List of Smart Money addresses to follow
    followedUsers: [
      '0x1234567890abcdef...',
    ]
  },
  
  riskControl: {
    // Only trade these coins
    supportedCoins: ['BTC', 'ETH', 'SOL'],
    
    // Max position size (in coins)
    maxPositionSize: {
      BTC: 1.0,
      ETH: 10.0,
      SOL: 100.0
    }
  },
  
  trading: {
    // Minimum Order Sizes (Critical for Binance compliance)
    minOrderSize: {
      BTC: 0.002,
      ETH: 0.007,
      SOL: 0.04
    }
  }
};
```

---

## 📉 Exposure Manager

HypeFollow v1.1 introduces an **Exposure Manager** to handle minimum order size discrepancies.

**The Problem**:
If the Master executes small orders (e.g., 0.001 BTC) but Binance requires a minimum of 0.002 BTC, HypeFollow forces the minimum size (0.002 BTC). Over time, this causes your position to grow faster than the Master's relative position.

**The Solution**:
The Exposure Manager runs after every trade:
1.  Checks your actual position vs. the theoretical target position.
2.  If `Actual > Target` significantly, it calculates a **Take Profit** price (Entry ± 0.1%).
3.  Places a **Reduce-Only Limit Order** for the excess amount.
4.  This locks in profit on the "oversized" portion and realigns your exposure automatically.

---

## 🖥️ Dashboard

Access the dashboard at `http://localhost:49618`.

*   **Overview**: Check Sync Status and Account Balances.
*   **Logs**: Watch the `[Sync]` and `[ExposureManager]` logs to see the bot in action.
*   **Positions**: Monitor current active positions and their PnL.

---

## ⚠️ Disclaimer

**Trading cryptocurrencies involves significant risk.**

*   **HypeFollow** is experimental software provided "as is".
*   The developers are not responsible for any financial losses incurred.
*   Always test on **Binance Testnet** first.
*   Ensure you understand the risks of Copy Trading (e.g., latency, slippage, liquidation).

---

<p align="center">
  <sub>Built with ❤️ for the DeFi Community</sub>
</p>
