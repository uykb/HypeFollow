# HypeFollow - Hyperliquid to Binance Copy Trader

HypeFollow 是一个自动化的跟单系统，能够将 **Hyperliquid** (DEX) 上的"聪明钱"地址交易活动实时同步到您的 **Binance Futures** (CEX) 账户。

## 🚀 核心功能

### 双通道监控
- **限价单同步**: 实时跟踪 `orderUpdates`，同步创建和取消限价单
- **市价成交同步**: 实时跟踪 `userFills`，同步跟进主动吃单操作

### 可视化监控面板
- 基于 **MUI (Material UI)** 的现代化仪表盘
- 实时展示账户余额（HL & Binance）、当前持仓、订单映射状态
- 实时系统日志流，方便排查问题

### 精密仓位计算
- **等比模式 (Equal)**: 根据双方账户净值比例自动计算下单数量
- **定比模式 (Fixed)**: 按固定比例跟随目标地址的下单数量

### 风险控制
- **币种白名单**: 仅交易配置的资产（如 BTC, ETH, SOL）
- **仓位限制**: 最大持仓限制，防止过度杠杆
- **紧急停止**: 一键切断所有同步操作

### 容器化支持
- 支持 Docker 部署
- 集成 GitHub Actions 自动构建镜像至 GHCR

---

## 📊 监控面板

系统默认在 **49618** 端口启动可视化面板。

- **访问地址**: `http://localhost:49618`
- **功能**: 实时查看同步状态、持仓 PnL、订单映射及系统日志

---

## 🛠 技术栈

- **Runtime**: Node.js (v20+)
- **Frontend**: React, MUI, Recharts
- **Backend**: Express, WebSocket
- **Database**: Redis (用于 OID 映射持久化)
- **APIs**: Hyperliquid WS/Info API, Binance Futures API

---

## 🎯 快速开始

### 前置条件

- Node.js v20+ 或 Docker
- Redis 服务 (本地或远程)
- Binance Futures API Key (需开启交易权限)
- Hyperliquid 账户地址 (要跟随的"聪明钱"地址)

### 方式一：Docker 部署 (推荐)

```bash
# 1. 启动容器
docker run -d \
  --name hypefollow \
  -p 49618:49618 \
  -e BINANCE_API_KEY=your_binance_api_key \
  -e BINANCE_API_SECRET=your_binance_api_secret \
  -e REDIS_HOST=your_redis_host \
  -e TRADING_MODE=equal \
  -e EQUAL_RATIO=1.0 \
  ghcr.io/uykb/hypefollow:main
```

### 方式二：Docker Compose

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/uykb/hypefollow:main
    container_name: hypefollow
    ports:
      - "49618:49618"
    environment:
      - BINANCE_API_KEY=${BINANCE_API_KEY}
      - BINANCE_API_SECRET=${BINANCE_API_SECRET}
      - REDIS_HOST=redis
      - TRADING_MODE=equal
      - EQUAL_RATIO=1.0
      - BINANCE_TESTNET=false
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:alpine
    container_name: hypefollow-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

启动服务:

```bash
docker-compose up -d
```

### 方式三：本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写 API 密钥和 Redis 配置

# 3. 修改 config/default.js
# 设置 followedUsers 为要跟随的 Hyperliquid 地址 UID

# 4. 启动程序
npm start          # 生产模式
npm run dev        # 开发模式 (支持热重载)
npm run monitor    # 仅启动监控服务
```

---

## ⚙️ 详细配置

### 环境变量 (.env)

创建 `.env` 文件并配置以下参数：

#### 必需配置

```bash
# ========== Binance API 配置 ==========
BINANCE_API_KEY=your_binance_api_key          # 币安 API Key (必需)
BINANCE_API_SECRET=your_binance_api_secret    # 币安 API Secret (必需)
BINANCE_TESTNET=false                          # true=测试网, false=生产网

# ========== Redis 配置 ==========
REDIS_HOST=localhost                          # Redis 主机地址 (必需)
REDIS_PORT=6379                               # Redis 端口
REDIS_PASSWORD=                               # Redis 密码 (如无密码留空)
```

#### 交易模式配置

```bash
# ========== 交易模式 ==========
# 可选值: equal (等比模式), fixed (定比模式)
TRADING_MODE=equal

# 等比模式参数 (TRADING_MODE=equal 时有效)
# 计算公式: 跟随数量 = HL数量 × (我的净值 / HL净值) × EQUAL_RATIO
# 示例: EQUAL_RATIO=2.0 表示放大 2 倍跟随
EQUAL_RATIO=1.0

# 定比模式参数 (TRADING_MODE=fixed 时有效)
# 计算公式: 跟随数量 = HL数量 × FIXED_RATIO
# 示例: FIXED_RATIO=0.1 表示跟随 10% 的仓位
FIXED_RATIO=0.1

# 账户信息缓存时间 (秒)
ACCOUNT_CACHE_TTL=60
```

#### 可选配置

```bash
# ========== Hyperliquid 配置 ==========
HYPERLIQUID_WS_URL=wss://api.hyperliquid.xyz/ws    # HL WebSocket 地址

# ========== 应用配置 ==========
LOG_LEVEL=info                                      # 日志级别: debug, info, warn, error
MONITORING_PORT=49618                               # 监控面板端口
```

### 配置文件 (config/default.js)

编辑 `config/default.js` 进行核心策略配置：

#### 1. 跟随地址配置 (必需)

```javascript
hyperliquid: {
  // 要跟随的"聪明钱"地址 UID 列表
  // 替换为实际的 Hyperliquid 账户地址
  followedUsers: [
    '0x1234567890abcdef...',  // 地址 1
    '0xfedcba0987654321...'   // 地址 2
  ]
}
```

**如何获取 UID:**
- 访问 Hyperliquid 官网查看地址详情
- 或通过 API 获取用户信息

#### 2. 风险控制配置

```javascript
riskControl: {
  // 允许交易的币种白名单
  // 系统会自动过滤不在此列表中的交易
  supportedCoins: ['BTC', 'ETH', 'SOL'],

  // 最大仓位限制 (单位: 币种数量)
  // 超过限制的订单将被跳过
  maxPositionSize: {
    BTC: 1.0,   // BTC 最大 1 枚
    ETH: 10.0,  // ETH 最大 10 枚
    SOL: 100.0  // SOL 最大 100 枚
  }
}
```

#### 3. 紧急停止

```javascript
app: {
  name: 'HypeFollow',
  version: '1.0.0',
  env: process.env.NODE_ENV || 'development',
  emergencyStop: false  // 设为 true 将停止所有跟单交易
}
```

#### 4. 最小下单限制

```javascript
trading: {
  minOrderSize: {
    BTC: 0.001,  // BTC 最小 0.001 枚
    ETH: 0.01,   // ETH 最小 0.01 枚
    SOL: 0.1     // SOL 最小 0.1 枚
  }
}
```

#### 5. Redis 配置

```javascript
redis: {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
}
```

---

## 📖 交易模式详解

### 等比模式 (Equal Mode)

根据双方账户净值比例计算跟随仓位。

**计算公式:**
```
跟随数量 = HL下单数量 × (我的账户净值 / HL账户净值) × EQUAL_RATIO
```

**示例:**
- 你的账户净值: $10,000
- HL 账户净值: $100,000
- HL 下单: 1 BTC
- EQUAL_RATIO: 1.0
- 跟随数量: 1 × (10000/100000) × 1.0 = 0.1 BTC

**适用场景:**
- 账户规模相近时
- 希望保持与信号源相同的风险敞口

### 定比模式 (Fixed Mode)

按固定比例跟随信号源的下单数量。

**计算公式:**
```
跟随数量 = HL下单数量 × FIXED_RATIO
```

**示例:**
- HL 下单: 1 BTC
- FIXED_RATIO: 0.1
- 跟随数量: 1 × 0.1 = 0.1 BTC

**适用场景:**
- 小账户跟随大账户
- 想要降低风险敞口

---

## 🔒 安全配置

### Binance API 权限要求

创建 Binance API Key 时，需要开启以下权限：
- **Futures**: 交易权限
- 建议**仅开启交易权限**，关闭提币权限
- 建议绑定 IP 白名单 (如使用固定服务器)

### IP 白名单配置

在 Binance 后台设置允许访问的 IP 地址：
- 本地开发: `127.0.0.1`
- 服务器部署: 服务器公网 IP

---

## 📊 监控面板功能

### 仪表盘概览

访问 `http://localhost:49618` 可查看：

1. **账户概览**
   - Hyperliquid 账户余额
   - Binance Futures 账户余额
   - 总资产统计

2. **当前持仓**
   - 各币种持仓数量
   - 未实现盈亏 (PnL)
   - 持仓价值

3. **订单映射**
   - HL 订单 ↔ Binance 订单 映射状态
   - 订单 ID 对照

4. **系统日志**
   - 实时日志流
   - 订单同步状态
   - 错误告警

---

## 🐛 故障排查

### 常见问题

#### 1. 无法连接 Binance API

**症状:** 日志显示 "Binance API connection failed"

**排查步骤:**
- 检查 API Key 和 Secret 是否正确
- 确认 API 权限是否开启
- 检查 IP 白名单设置
- 确认是测试网还是生产网配置

#### 2. 无法连接 Redis

**症状:** 日志显示 "Redis connection refused"

**排查步骤:**
- 确认 Redis 服务已启动
- 检查 Redis 主机地址和端口
- 检查密码是否正确

#### 3. 订单未同步

**症状:** HL 有新订单但 Binance 无响应

**排查步骤:**
- 检查 followedUsers 是否正确配置
- 查看日志中的错误信息
- 确认订单币种在 supportedCoins 白名单中
- 检查仓位是否超过 maxPositionSize 限制
- 确认 emergencyStop 未启用

#### 4. 监控面板无法访问

**症状:** 浏览器无法打开 http://localhost:49618

**排查步骤:**
- 确认 monitoring.enabled 设置为 true
- 检查端口是否被占用
- 查看应用是否正常启动

### 日志级别调整

如需更详细的调试信息，可修改 `.env`:

```bash
LOG_LEVEL=debug
```

重启服务后，将输出更详细的调试日志。

---

## 📂 项目结构

```
HypeFollow/
├── src/
│   ├── binance/
│   │   └── api-client.js      # Binance API 封装
│   ├── hyperliquid/
│   │   ├── ws-client.js       # HL WebSocket 客户端
│   │   └── parsers.js         # HL 协议解析
│   ├── core/
│   │   ├── order-mapper.js    # 订单映射管理
│   │   ├── order-validator.js # 订单验证
│   │   ├── position-calculator.js # 仓位计算
│   │   ├── risk-control.js    # 风险控制
│   │   └── account-manager.js # 账户管理
│   ├── monitoring/
│   │   ├── api-server.js      # 监控 API 服务
│   │   └── data-collector.js  # 数据收集
│   ├── utils/
│   │   ├── logger.js          # 日志工具
│   │   ├── redis.js           # Redis 封装
│   │   └── api-validator.js   # API 验证
│   └── index.js               # 入口文件
├── dashboard/                  # 监控面板前端
│   └── dist/                   # 编译后的静态资源
├── config/
│   └── default.js             # 核心配置
├── Dockerfile                 # Docker 构建文件
├── docker-compose.yml         # Docker Compose 配置
├── package.json               # 项目依赖
├── .env.example               # 环境变量示例
└── README.md                  # 项目文档
```

---

## 🔄 更新日志

### v1.0.0 (2024-01-16)
- 初始版本发布
- 支持限价单同步
- 支持市价成交同步
- 双模式仓位计算
- 可视化监控面板
- Docker 部署支持

---

## 📝 使用建议

1. **测试网验证**: 生产部署前，先在 Testnet 充分测试
2. **小仓位开始**: 初期建议使用较小的跟随比例
3. **监控告警**: 定期检查监控面板和日志
4. **风险意识**: 跟单有风险，设置合理的仓位限制
5. **备份配置**: 备份好 .env 和 config/default.js

---

## ⚠️ 免责声明

**交易有风险，跟单需谨慎。**

- 本工具仅供技术参考和学习交流使用
- 开发者不对任何资金损失负责
- 用户应自行承担交易决策的责任
- 建议先在 Testnet 进行充分测试
- 请确保了解所跟随地址的交易风格和风险特征

---

## 📮 反馈与支持

如有问题或建议，请通过 GitHub Issues 反馈:
- GitHub: https://github.com/uykb/hypefollow/issues

---

**Happy Trading! 🚀**
