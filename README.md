# HypeFollow - Hyperliquid to Binance Copy Trader

HypeFollow 是一个自动化的跟单系统，能够将 **Hyperliquid** (DEX) 上的“聪明钱”地址交易活动实时同步到您的 **Binance Futures** (CEX) 账户。

## 🚀 核心功能

*   **双通道监控**:
    *   **限价单同步**: 实时跟踪 `orderUpdates`，同步创建和取消限价单。
    *   **市价成交同步**: 实时跟踪 `userFills`，同步跟进主动吃单操作。
*   **可视化监控面板**:
    *   基于 **MUI (Material UI)** 的现代化仪表盘。
    *   实时展示账户余额（HL & Binance）、当前持仓、订单映射状态。
    *   实时系统日志流，方便排查问题。
*   **精密仓位计算**:
    *   **等比模式 (Equal)**: 根据双方账户净值比例自动计算下单数量。
    *   **定比模式 (Fixed)**: 按固定比例跟随目标地址的下单数量。
*   **风险控制**:
    *   **币种白名单**: 仅交易配置的资产（如 BTC, ETH, SOL）。
    *   **紧急停止**: 一键切断所有同步操作。
*   **容器化支持**: 支持 Docker 部署，并集成 GitHub Actions 自动构建镜像至 GHCR。

## 📊 监控面板

系统默认在 **49618** 端口启动可视化面板。
*   **访问地址**: `http://localhost:49618`
*   **功能**: 实时查看同步状态、持仓 PnL、订单映射及系统日志。

## 🛠 技术栈

*   **Runtime**: Node.js (v20+)
*   **Frontend**: React, MUI, Recharts
*   **Backend**: Express, WebSocket
*   **Database**: Redis (用于 OID 映射持久化)
*   **APIs**: Hyperliquid WS/Info API, Binance Futures API

## 🐳 快速部署

### 使用 Docker (推荐)

项目镜像托管在 GitHub Container Registry。

```bash
docker run -d \
  --name hypefollow \
  -p 49618:49618 \
  -e BINANCE_API_KEY=your_key \
  -e BINANCE_API_SECRET=your_secret \
  -e REDIS_HOST=your_redis_host \
  ghcr.io/uykb/hypefollow:main
```

### 使用 Docker Compose

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
```

## ⚙️ 本地配置

1.  **安装依赖**:
    ```bash
    npm install
    ```

2.  **配置环境变量**:
    复制 `.env.example` 为 `.env` 并填写 API 密钥及 Redis 配置。

3.  **修改交易策略**:
    编辑 `config/default.js` 设置跟随地址和交易模式。

4.  **启动程序**:
    ```bash
    npm start         # 生产模式
    npm run dev       # 开发模式
    npm run monitor   # 仅启动监控服务
    ```

## 📂 项目结构

```
HypeFollow/
├── src/
│   ├── binance/         # 币安 API 封装
│   ├── hyperliquid/     # HL 协议解析与 WS 客户端
│   ├── core/            # 跟单核心逻辑、风险控制、仓位计算
│   ├── monitoring/      # 监控后端 API 与数据收集
│   └── utils/           # 日志与 Redis 抽象
├── dashboard/           # 监控面板前端源码
│   └── dist/            # 编译后的静态资源
├── config/              # 策略与系统配置
├── Dockerfile           # 镜像构建文件
└── .github/workflows/   # CI/CD 自动化流程
```

## ⚠️ 免责声明

**交易有风险，跟单需谨慎。** 本工具仅供技术参考，开发者不对任何资金损失负责。建议先在 Testnet 进行充分测试。
