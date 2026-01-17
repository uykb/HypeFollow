# HypeFollow 单容器部署指南

项目已更新为**单容器架构**，Redis 已内置于应用镜像中。您不再需要单独部署 Redis 容器，也不需要复杂的网络配置。

## 部署选项

### 选项 1: Docker Compose (推荐)

1. 将 `docker-compose.yml` 和 `.env` 文件上传到服务器。
2. 运行：
```bash
docker compose up -d
```

### 选项 2: 手动 Docker Run (CLI)

直接运行一个容器即可：

```bash
docker run -d --name hypefollow \
  --restart always \
  -p 49618:49618 \
  -v redis_data:/var/lib/redis \
  -e NODE_ENV=production \
  -e TRADING_MODE=fixed \
  -e FIXED_RATIO=0.1 \
  -e BINANCE_API_KEY=your_key \
  -e BINANCE_API_SECRET=your_secret \
  your-docker-user/hypefollow:latest
```

## 注意事项

- **数据持久化**: 默认配置挂载了 `redis_data` 卷到 `/var/lib/redis`，确保应用重启后交易状态不丢失。
- **端口**: 监控仪表盘运行在 49618 端口。
