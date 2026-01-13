# HypeFollow - Hyperliquid to Binance Copy Trader

HypeFollow is an automated copy-trading system that mirrors trading activities from "Smart Money" addresses on **Hyperliquid** (DEX) to your **Binance Futures** (CEX) account.

## 🚀 Key Features

*   **Dual-Channel Monitoring**:
    *   **Limit Orders**: Automatically mirrors limit order creation (`orderUpdates`) and cancellations.
    *   **Market Fills**: Automatically mirrors active market taker trades (`userFills`).
*   **Order Synchronization**:
    *   **Open**: Creates corresponding LIMIT orders on Binance.
    *   **Cancel**: Cancels corresponding orders on Binance when removed on Hyperliquid.
    *   **Trade**: Executes MARKET orders on Binance when Smart Money aggressively enters/exits.
*   **Risk Control**:
    *   **Coin Whitelist**: Only allows trading for configured assets (e.g., BTC, ETH, SOL).
    *   **Emergency Stop**: Global switch to pause all trading activities instantly.
*   **Mapping System**: Maintains a bi-directional mapping between Hyperliquid OIDs and Binance Order IDs using Redis.

## 🛠 Tech Stack

*   **Runtime**: Node.js
*   **Database**: Redis (for high-performance order mapping)
*   **APIs**:
    *   Hyperliquid WebSocket API
    *   Binance Futures API (`binance-api-node`)

## 📋 Prerequisites

1.  **Node.js** (v16 or higher)
2.  **Redis** (Running locally or remotely)
3.  **Binance Futures Account** (API Key & Secret)
4.  **Hyperliquid Account Address** (The "Smart Money" address you want to follow)

## ⚙️ Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/HypeFollow.git
    cd HypeFollow
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**
    Copy the example env file and edit it:
    ```bash
    cp .env.example .env
    ```
    Edit `.env`:
    ```env
    BINANCE_API_KEY=your_binance_api_key
    BINANCE_API_SECRET=your_binance_api_secret
    BINANCE_TESTNET=true  # Set to false for real trading
    REDIS_HOST=localhost
    REDIS_PORT=6379
    ```

4.  **Configure Application Settings**
    Edit `config/default.js` to set up the users you want to follow:
    ```javascript
    module.exports = {
      // ...
      hyperliquid: {
        // ...
        followedUsers: [
          '0x1234567890abcdef1234567890abcdef12345678' // Replace with target UID
        ]
      },
      // ...
    };
    ```

## 🐳 Docker Deployment

The project is automatically built and published to **GitHub Container Registry (GHCR)**.

### Run with Docker

```bash
docker run -d \
  --name hypefollow \
  -p 49618:49618 \
  -e BINANCE_API_KEY=your_key \
  -e BINANCE_API_SECRET=your_secret \
  -e REDIS_HOST=your_redis_host \
  ghcr.io/uykb/hypefollow:main
```

### Run with Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  app:
    image: ghcr.io/uykb/hypefollow:main
    ports:
      - "49618:49618"
    environment:
      - BINANCE_API_KEY=${BINANCE_API_KEY}
      - BINANCE_API_SECRET=${BINANCE_API_SECRET}
      - REDIS_HOST=redis
    depends_on:
      - redis

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

---

## 🏃‍♂️ Usage

**Development Mode** (with auto-restart):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

## 📂 Project Structure

```
HypeFollow/
├── config/
│   └── default.js       # Core configuration (Users, Risk params, Redis config)
├── src/
│   ├── binance/
│   │   └── api-client.js # Binance API Wrapper
│   ├── core/
│   │   ├── order-mapper.js # Redis-based Order ID Mapper
│   │   └── risk-control.js # Risk validation logic
│   ├── hyperliquid/
│   │   ├── ws-client.js  # WebSocket Client
│   │   └── parsers.js    # Message Parsers
│   ├── utils/
│   │   ├── logger.js     # JSON Logger
│   │   └── redis.js      # Redis Connection
│   └── index.js          # Main Application Entry Point
└── .env                  # Secrets (gitignored)
```

## ⚠️ Disclaimer

**USE AT YOUR OWN RISK.** Cryptocurrency trading involves significant risk. This software is provided "AS IS", without warranty of any kind. The developers are not responsible for any financial losses incurred through the use of this bot. Always test on Testnet first.
