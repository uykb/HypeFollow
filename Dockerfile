FROM node:20-slim

# Install Redis
RUN apt-get update && \
    apt-get install -y redis-server && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY config/ ./config/
COPY dashboard/dist/ ./dashboard/dist/

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment variables
ENV NODE_ENV=production
ENV MONITORING_PORT=49618
# Force Redis to use localhost since it's now in the same container
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379
ENV BINANCE_TESTNET=false

EXPOSE 49618

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
