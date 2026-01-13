# Use Node.js LTS as the base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY config/ ./config/
# Copy the dashboard dist (it contains the single index.html we created)
COPY dashboard/dist/ ./dashboard/dist/

# Set environment variables defaults
ENV NODE_ENV=production
ENV MONITORING_PORT=49618

# Expose the monitoring port
EXPOSE 49618

# Start the application
CMD ["node", "src/index.js"]
