## 容器化部署专家审查报告

**审查对象**: EKET Framework v2.0.0 (node/ 目录)
**审查日期**: 2026-04-01
**审查人**: 容器化部署专家 Agent

---

### Docker 就绪性

#### Dockerfile 分析

**现状**: ❌ **未发现 Dockerfile**

项目当前没有 Dockerfile，需要从头创建。基于代码分析，建议采用以下结构：

```dockerfile
# 多阶段构建 - 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package 文件（利用 Docker 层缓存）
COPY node/package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY node/src ./src
COPY node/tsconfig.json ./

# 构建 TypeScript
RUN npm run build

# 生产阶段
FROM node:18-alpine

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S eket && adduser -S eket -u 1001

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 设置环境变量
ENV NODE_ENV=production

# 切换到非 root 用户
USER eket

# 暴露端口
EXPOSE 8080 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node dist/index.js redis:check || exit 1

# 启动命令
CMD ["node", "dist/index.js"]
```

#### 镜像优化建议

**层大小优化**:
| 优化项 | 建议 | 预期收益 |
|--------|------|----------|
| 基础镜像 | 使用 `node:18-alpine` 替代 `node:18` | ~500MB → ~150MB |
| 多阶段构建 | 分离构建和运行时依赖 | 减少 60% 镜像大小 |
| .dockerignore | 排除 node_modules, dist, .git | 减少构建上下文 90% |
| npm ci | 替代 npm install | 更快、更可靠的依赖安装 |

**层缓存策略**:
```dockerfile
# 1. 最频繁变化的放最后
COPY node/src ./src          # 代码经常变化 → 放最后

# 2. 中等变化的放中间
COPY node/tsconfig.json ./   # 配置偶尔变化

# 3. 最不频繁变化的放最前
COPY node/package*.json ./   # 依赖较少变化 → 最先缓存
RUN npm ci --only=production # 生产依赖缓存命中率高
```

**.dockerignore 建议**:
```
node_modules
dist
.git
.gitignore
*.md
!README.md
.eket/state
.eket/logs
.eket/memory
**/*.log
**/.DS_Store
```

---

### K8s 就绪性

#### 资源配置建议

基于代码分析（HTTP Hook Server, WebSocket, Agent Pool），建议配置：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eket-master
  labels:
    app: eket
    role: master
spec:
  replicas: 1  # Master 单实例（有状态）
  selector:
    matchLabels:
      app: eket
      role: master
  template:
    metadata:
      labels:
        app: eket
        role: master
    spec:
      containers:
      - name: eket
        image: eket/eket-cli:latest
        ports:
        - containerPort: 8080
          name: http-hooks
        - containerPort: 3000
          name: web-dashboard
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        env:
        - name: NODE_ENV
          value: "production"
        - name: EKET_REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-host
        - name: EKET_REDIS_PORT
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-port
        - name: EKET_HOOK_SECRET
          valueFrom:
            secretKeyRef:
              name: eket-secrets
              key: hook-secret
        - name: EKET_OPENCLAW_API_KEY
          valueFrom:
            secretKeyRef:
              name: eket-secrets
              key: openclaw-api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        lifecycle:
          preStop:
            exec:
              command: ["sh", "-c", "sleep 10"]
      terminationGracePeriodSeconds: 30
```

**Slaver 部署配置**（无状态，可水平扩展）:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eket-slaver
  labels:
    app: eket
    role: slaver
spec:
  replicas: 3  # 可水平扩展
  selector:
    matchLabels:
      app: eket
      role: slaver
  template:
    spec:
      containers:
      - name: eket
        image: eket/eket-cli:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "200m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        args: ["start-instance", "--auto-mode"]
        # ... 其他配置同上
```

#### 健康检查评估

**现状**: ✅ **已有 `/health` 端点**

`http-hook-server.ts` (L257-261):
```typescript
// Health check
if (pathname && pathname === '/health' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
  return;
}
```

**改进建议** - 增强健康检查深度:

```typescript
// 建议增强的健康检查
async function healthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const health = {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '0.7.3',
    checks: {
      redis: 'unknown' as 'healthy' | 'unhealthy' | 'degraded',
      sqlite: 'unknown' as 'healthy' | 'unhealthy' | 'degraded',
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
      },
      uptime: process.uptime(),
    }
  };

  // 检查 Redis
  try {
    const redisResult = await redisClient.ping();
    health.checks.redis = redisResult.success ? 'healthy' : 'degraded';
  } catch {
    health.checks.redis = 'unhealthy';
  }

  // 检查 SQLite
  try {
    const sqliteResult = sqliteClient.connect();
    health.checks.sqlite = sqliteResult.success ? 'healthy' : 'degraded';
  } catch {
    health.checks.sqlite = 'unhealthy';
  }

  // 确定整体状态
  const statusCode =
    health.checks.redis === 'unhealthy' || health.checks.sqlite === 'unhealthy'
      ? 503
      : 200;

  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health));
}
```

**建议的 ConfigMap**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: eket-config
data:
  redis-host: "redis-cluster.eket.svc.cluster.local"
  redis-port: "6379"
  sqlite-path: "/data/eket.db"
  log-level: "info"
  node-env: "production"
```

**建议的 Secret**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: eket-secrets
type: Opaque
stringData:
  hook-secret: "your-32-char-random-secret-here"
  openclaw-api-key: "your-openclaw-api-key"
  redis-password: "your-redis-password"
```

#### 优雅关闭评估

**现状**: ✅ **已实现基础信号处理**

`src/index.ts` (L391-399, L525-531, L792-799):
```typescript
process.on('SIGINT', async () => {
  await manager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await manager.stop();
  process.exit(0);
});
```

`src/utils/process-cleanup.ts` (L55-64):
```typescript
process.on('SIGINT', () => exitHandler('SIGINT'));
process.on('SIGTERM', () => exitHandler('SIGTERM'));
process.on('uncaughtException', () => {
  console.error('未捕获的异常');
  runCleanup().then(() => process.exit(1));
});
```

**问题识别**:

| 问题 | 位置 | 严重性 |
|------|------|--------|
| OpenCLAW Gateway 未调用 `gateway.stop()` | `src/index.ts:792-799` | P1 |
| WebSocket 连接未显式关闭 | `src/core/sessions-websocket.ts` | P2 |
| 无优雅关闭超时保护 | 所有信号处理器 | P2 |
| 无正在处理请求的等待逻辑 | HTTP Hook Server | P1 |

**改进建议**:

```typescript
// 增强的优雅关闭处理器
let isShuttingDown = false;
let activeConnections = 0;

function setupGracefulShutdown(server: http.Server, cleanup: () => Promise<void>): void {
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      console.log('已收到退出信号，正在关闭...');
      return;
    }

    isShuttingDown = true;
    console.log(`收到信号：${signal}，开始优雅关闭...`);

    // 1. 停止接收新连接
    server.close(async () => {
      console.log('HTTP 服务器已关闭，不再接收新连接');
    });

    // 2. 等待活跃连接完成（最多 25 秒）
    const shutdownTimeout = setTimeout(() => {
      console.error('优雅关闭超时，强制退出');
      process.exit(1);
    }, 25000); // K8s terminationGracePeriodSeconds - 5s

    // 3. 等待活跃连接完成
    const waitForConnections = setInterval(() => {
      if (activeConnections === 0) {
        clearInterval(waitForConnections);
        clearTimeout(shutdownTimeout);
      }
    }, 500);

    // 4. 执行清理
    try {
      await cleanup();
      console.log('清理完成');
    } catch (error) {
      console.error('清理失败:', error);
    }

    // 5. 退出进程
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// HTTP Hook Server 使用示例
const server = http.createServer(...);
setupGracefulShutdown(server, async () => {
  await httpHookServer.stop();
  await redisClient.disconnect();
  await agentPoolManager.stop();
});
```

---

### 发现的问题

#### P0 - 阻塞部署问题

1. **❌ 无 Dockerfile**
   - 影响：无法直接容器化部署
   - 修复：创建多阶段 Dockerfile（见建议部分）

2. **❌ 无 ConfigMap/Secret 配置模式**
   - 影响：配置硬编码或依赖本地 `.env` 文件
   - 修复：所有配置应从 `process.env` 读取（已部分实现）

3. **❌ 无健康检查深度检测**
   - 影响：K8s 无法感知 Redis/SQLite 连接状态
   - 修复：增强 `/health` 端点（见上方代码）

#### P1 - 高影响问题

1. **⚠️ 优雅关闭不完整**
   - OpenCLAW Gateway 未调用 `gateway.stop()`
   - WebSocket 连接未显式关闭
   - 无优雅关闭超时保护

2. **⚠️ 日志输出混合**
   - 现状：`console.log`, `console.error`, `console.warn` 混用
   - 建议：统一使用结构化日志（JSON 格式）便于日志收集

3. **⚠️ 无资源限制配置**
   - 现状：无内存/CPU 限制代码
   - 建议：添加内存监控和自我保护

```typescript
// 内存监控建议
function setupMemoryMonitoring(): void {
  setInterval(() => {
    const used = process.memoryUsage();
    const usedPercent = (used.heapUsed / used.heapTotal) * 100;

    if (usedPercent > 90) {
      console.warn(`内存使用率过高：${usedPercent.toFixed(2)}%`);
      // 触发 GC 或拒绝新请求
    }
  }, 60000);
}
```

#### P2 - 改进建议

1. **📝 镜像层优化**
   - 建议使用 Alpine 基础镜像
   - 建议移除 `removeComments: true` 以保留调试信息

2. **📝 启动脚本优化**
   - `eket-start.sh` 过于复杂（600+ 行）
   - 建议：拆分为多个脚本，或使用 Node.js 实现

3. **📝 日志结构化**
   - 当前：`console.log('[HTTP Hook Server] Listening on ...')`
   - 建议：`JSON.stringify({ level: 'info', component: 'http-hook', event: 'listening', ... })`

4. **📝 添加指标端点**
   - 建议：添加 `/metrics` 端点（Prometheus 格式）
   - 指标：请求延迟、错误率、内存使用、活跃连接数

---

### 建议的 Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ========================================
# 阶段 1: 依赖安装
# ========================================
FROM node:18.20-alpine AS deps
RUN apk add --no-cache libc6-compat git

WORKDIR /app

COPY node/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# ========================================
# 阶段 2: 构建
# ========================================
FROM node:18.20-alpine AS builder
RUN apk add --no-cache git

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY node/package*.json ./
COPY node/src ./src
COPY node/tsconfig.json ./

RUN npm ci && \
    npm run build && \
    npm prune --production

# ========================================
# 阶段 3: 生产镜像
# ========================================
FROM node:18.20-alpine AS runner

# 创建非 root 用户
RUN addgroup --system --gid 1001 eket && \
    adduser --system --uid 1001 eket

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    EKET_REDIS_HOST="" \
    EKET_REDIS_PORT="6379" \
    EKET_HOOK_SECRET=""

# 复制文件
COPY --from=builder /app/dist ./dist
COPY --from=builder --chown=eket:eket /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 创建数据目录
RUN mkdir -p /app/data && chown -R eket:eket /app/data
VOLUME ["/app/data"]

# 切换到非 root 用户
USER eket

# 暴露端口
EXPOSE 8080 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node dist/index.js redis:check > /dev/null 2>&1 || exit 1

# 启动命令
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
```

---

### 建议的 K8s 配置

#### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: eket-config
  namespace: eket
data:
  # Redis 配置
  redis-host: "redis-cluster.eket.svc.cluster.local"
  redis-port: "6379"

  # SQLite 配置
  sqlite-path: "/data/eket.db"

  # 日志配置
  log-level: "info"

  # 环境配置
  node-env: "production"

  # OpenCLAW 配置
  openclaw-mode: "autonomous"
  openclaw-gateway-port: "8080"

  # 性能配置
  max-concurrent-tasks: "5"
  heartbeat-interval: "30000"
```

#### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: eket-secrets
  namespace: eket
type: Opaque
stringData:
  # Hook 服务器密钥（32+ 字符）
  hook-secret: "CHANGE_ME_$(openssl rand -hex 16)"

  # OpenCLAW API Key
  openclaw-api-key: "CHANGE_ME_$(openssl rand -hex 16)"

  # Redis 密码（如需要）
  redis-password: ""

  # 数据库密码（如需要）
  db-password: ""
```

#### Master Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eket-master
  namespace: eket
  labels:
    app: eket
    role: master
spec:
  replicas: 1
  strategy:
    type: Recreate  # Master 使用 Recreate 策略
  selector:
    matchLabels:
      app: eket
      role: master
  template:
    metadata:
      labels:
        app: eket
        role: master
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: eket
      securityContext:
        fsGroup: 1001
      containers:
      - name: eket
        image: eket/eket-cli:v0.7.3
        imagePullPolicy: IfNotPresent
        args: ["web:dashboard", "--port", "3000"]
        ports:
        - containerPort: 8080
          name: http-hooks
          protocol: TCP
        - containerPort: 3000
          name: web-dashboard
          protocol: TCP
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: node-env
        - name: EKET_REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-host
        - name: EKET_REDIS_PORT
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-port
        - name: EKET_SQLITE_PATH
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: sqlite-path
        - name: EKET_HOOK_SECRET
          valueFrom:
            secretKeyRef:
              name: eket-secrets
              key: hook-secret
        - name: EKET_OPENCLAW_API_KEY
          valueFrom:
            secretKeyRef:
              name: eket-secrets
              key: openclaw-api-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: http-hooks
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: http-hooks
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        volumeMounts:
        - name: data
          mountPath: /data
        - name: tmp
          mountPath: /tmp
        lifecycle:
          preStop:
            exec:
              command: ["sh", "-c", "sleep 10"]
      terminationGracePeriodSeconds: 30
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: eket-master-data
      - name: tmp
        emptyDir: {}
```

#### Slaver Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eket-slaver
  namespace: eket
  labels:
    app: eket
    role: slaver
spec:
  replicas: 3
  selector:
    matchLabels:
      app: eket
      role: slaver
  template:
    metadata:
      labels:
        app: eket
        role: slaver
    spec:
      containers:
      - name: eket
        image: eket/eket-cli:v0.7.3
        args: ["start-instance", "--auto-mode"]
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: node-env
        - name: EKET_REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-host
        - name: EKET_REDIS_PORT
          valueFrom:
            configMapKeyRef:
              name: eket-config
              key: redis-port
        resources:
          requests:
            memory: "512Mi"
            cpu: "200m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        # ... 其他配置参考 Master
```

#### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: eket-master
  namespace: eket
spec:
  selector:
    app: eket
    role: master
  ports:
  - name: http-hooks
    port: 8080
    targetPort: 8080
    protocol: TCP
  - name: web-dashboard
    port: 3000
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: eket-slaver
  namespace: eket
spec:
  selector:
    app: eket
    role: slaver
  clusterIP: None  # Headless Service
  ports:
  - port: 8080
    targetPort: 8080
```

#### PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: eket-master-data
  namespace: eket
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
```

#### Ingress (可选)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eket-dashboard
  namespace: eket
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - dashboard.eket.example.com
    secretName: eket-dashboard-tls
  rules:
  - host: dashboard.eket.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: eket-master
            port:
              name: web-dashboard
      - path: /hooks
        pathType: Prefix
        backend:
          service:
            name: eket-master
            port:
              name: http-hooks
```

---

### 总结

| 检查项 | 状态 | 备注 |
|--------|------|------|
| Dockerfile | ❌ 缺失 | 需创建多阶段 Dockerfile |
| 健康检查端点 | ✅ 基础实现 | 需增强深度检测 |
| 优雅关闭 | ⚠️ 部分实现 | 需完善超时保护和资源清理 |
| 环境变量配置 | ✅ 已实现 | 所有配置从 env 读取 |
| 无状态设计 | ⚠️ 混合 | Master 有状态，Slaver 无状态 |
| 日志输出 | ⚠️ 需改进 | 建议结构化日志 |
| 信号处理 | ✅ 已实现 | SIGTERM/SIGINT 处理 |
| ConfigMap/Secret | ❌ 缺失 | 需创建 K8s 配置 |

**生产部署前必须完成**:
1. [ ] 创建 Dockerfile 并测试构建
2. [ ] 增强健康检查端点
3. [ ] 完善优雅关闭逻辑
4. [ ] 创建 ConfigMap/Secret
5. [ ] 配置 PersistentVolume
6. [ ] 设置资源限制
7. [ ] 配置监控和告警
