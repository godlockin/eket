# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY node/package*.json ./
COPY node/npm-run-alpine.patch* ./ || true

# Install dependencies
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source code
COPY node/ ./

# Build TypeScript
RUN npm run build || true

# Stage 2: Runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY node/package*.json ./

# Install production dependencies only
RUN npm install --production 2>/dev/null || npm install

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy scripts
COPY scripts/ ./scripts/

# Copy docs
COPY docs/ ./docs/

# Create non-root user
RUN addgroup -g 1001 eket && \
    adduser -D -u 1001 eket -G eket

USER eket

# Default command
CMD ["node", "dist/index.js", "instance:start", "--auto"]
