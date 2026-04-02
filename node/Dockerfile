# ==============================================================================
# EKET Framework CLI - Docker Multi-Stage Build
# Version: 2.0.0
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies (needed for native modules like better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Install runtime dependencies (sqlite for better-sqlite3)
RUN apk add --no-cache \
    sqlite-libs

# Create non-root user for security
RUN addgroup --system --gid 1001 eket && \
    adduser --system --uid 1001 --ingroup eket eket

# Create necessary directories
RUN mkdir -p /app/data/queue /app/data/sqlite /app/logs && \
    chown -R eket:eket /app

# Copy built artifacts from builder stage
COPY --from=builder --chown=eket:eket /app/package.json ./
COPY --from=builder --chown=eket:eket /app/node_modules ./node_modules
COPY --from=builder --chown=eket:eket /app/dist ./dist

# Switch to non-root user
USER eket

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV EKET_DATA_DIR=/app/data
ENV EKET_SQLITE_PATH=/app/data/sqlite/eket.db
ENV EKET_FILE_QUEUE_DIR=/app/data/queue
ENV EKET_LOG_DIR=/app/logs

# Expose default ports
# 8899: HTTP Hook Server
# 3000: Web Dashboard
# 8080: OpenCLAW Gateway
EXPOSE 8899 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/health-check.js || exit 1

# Start the application
CMD ["node", "dist/index.js"]

# ==============================================================================
# Build Instructions:
# ==============================================================================
# Build the image:
#   docker build -t eket-cli:2.0.0 -f Dockerfile .
#
# Run HTTP Hook Server:
#   docker run -d \
#     --name eket-hooks \
#     -p 8899:8899 \
#     -e EKET_HOOK_SECRET=your-secret-key \
#     -v eket-data:/app/data \
#     eket-cli:2.0.0 \
#     node dist/index.js hooks:start --port 8899 --host 0.0.0.0
#
# Run Web Dashboard:
#   docker run -d \
#     --name eket-dashboard \
#     -p 3000:3000 \
#     -v eket-data:/app/data \
#     eket-cli:2.0.0 \
#     node dist/index.js web:dashboard --port 3000 --host 0.0.0.0
#
# Run OpenCLAW Gateway:
#   docker run -d \
#     --name eket-gateway \
#     -p 8080:8080 \
#     -e OPENCLAW_API_KEY=your-api-key \
#     -v /path/to/project:/project:ro \
#     eket-cli:2.0.0 \
#     node dist/index.js gateway:start --port 8080 --host 0.0.0.0 -P /project
#
# ==============================================================================
