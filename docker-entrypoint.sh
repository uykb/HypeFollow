#!/bin/bash
set -e

# 1. 启动 Redis Server (后台运行)
echo "Starting Redis server..."
redis-server --daemonize yes

# 2. 等待 Redis 启动完成
echo "Waiting for Redis to be ready..."
timeout=30
while ! redis-cli ping > /dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -le 0 ]; then
        echo "Redis failed to start."
        exit 1
    fi
    sleep 1
done
echo "Redis is ready."

# 3. 启动主应用程序
echo "Starting application..."
exec "$@"
