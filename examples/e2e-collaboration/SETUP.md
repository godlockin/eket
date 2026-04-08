# EKET E2E 示例环境设置

本文档详细说明如何设置和运行 EKET 端到端协作示例。

## 前置条件

### 必需软件

1. **Node.js** (v18 或更高)
   ```bash
   node --version  # 应该 >= 18.0.0
   npm --version
   ```

2. **Python** (3.8 或更高)
   ```bash
   python3 --version  # 应该 >= 3.8
   pip3 --version
   ```

3. **Docker** (用于 Redis)
   ```bash
   docker --version
   docker ps  # 确认 Docker 运行中
   ```

4. **Git**
   ```bash
   git --version
   ```

### 可选软件

- **Redis CLI** (用于调试)
  ```bash
  redis-cli --version
  ```

## 安装步骤

### 1. 克隆项目

```bash
cd /path/to/your/workspace
git clone https://github.com/your-org/eket.git
cd eket
```

### 2. 安装 EKET Server 依赖

```bash
cd node
npm install
npm run build
```

验证构建：
```bash
node dist/index.js --version
```

### 3. 设置环境变量

创建 `.env` 文件：

```bash
cd examples/e2e-collaboration
cat > .env <<EOF
# EKET Server 配置
EKET_SERVER_PORT=8080
EKET_SERVER_HOST=localhost
OPENCLAW_API_KEY=demo-secret-key-1234567890

# Redis 配置
EKET_REDIS_HOST=localhost
EKET_REDIS_PORT=6379

# 日志配置
EKET_LOG_LEVEL=info
EKET_LOG_DIR=./logs

# WebSocket 配置
EKET_WEBSOCKET_ENABLED=true
EOF
```

### 4. 启动 Redis

使用 Docker 运行 Redis：

```bash
./scripts/start-redis.sh
```

或手动启动：

```bash
docker run -d \
  --name eket-redis \
  -p 6379:6379 \
  redis:7-alpine
```

验证 Redis 运行：

```bash
docker ps | grep eket-redis
redis-cli ping  # 应该返回 PONG
```

### 5. 安装 Master Agent 依赖

```bash
cd master
npm install
```

依赖项：
- `eket-sdk` (JavaScript SDK，从本地链接)
- `typescript`
- `ts-node`
- `dotenv`

### 6. 安装 Slaver Agent 依赖

```bash
cd ../slaver
pip3 install -r requirements.txt
```

依赖项：
- `eket-sdk` (Python SDK，从本地安装)
- `requests`
- `python-dotenv`

## 链接本地 SDK

由于我们使用本地开发的 SDK，需要链接它们：

### JavaScript SDK

```bash
# 在 sdk/javascript 目录
cd ../../sdk/javascript
npm install
npm run build
npm link

# 在 master 目录
cd ../../examples/e2e-collaboration/master
npm link eket-sdk
```

### Python SDK

```bash
# 在 sdk/python 目录
cd ../../sdk/python
pip install -e .

# 验证安装
python -c "import eket_sdk; print(eket_sdk.__version__)"
```

## 配置文件

### Master Agent 配置

`master/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Slaver Agent 配置

`slaver/config.py`:
```python
import os
from dotenv import load_dotenv

load_dotenv()

# EKET Server URL
SERVER_URL = os.getenv('EKET_SERVER_URL', 'http://localhost:8080')

# Agent 配置
AGENT_TYPE = 'custom'
AGENT_ROLE = 'slaver'
AGENT_SPECIALTY = 'backend'
AGENT_CAPABILITIES = ['python', 'fastapi', 'postgresql']

# 心跳间隔（秒）
HEARTBEAT_INTERVAL = 30

# 模拟工作延迟（秒）
WORK_DELAY = 3

# 日志级别
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
```

## 验证安装

### 1. 检查 Redis

```bash
redis-cli ping
# 应该输出: PONG
```

### 2. 检查 EKET Server

```bash
cd ../../node
node dist/index.js system:check
```

应该显示系统状态正常。

### 3. 测试 JavaScript SDK

```bash
cd ../examples/e2e-collaboration/master
cat > test-sdk.ts <<EOF
import { EketClient } from 'eket-sdk';

const client = new EketClient({
  serverUrl: 'http://localhost:8080',
});

console.log('SDK loaded successfully!');
EOF

npx ts-node test-sdk.ts
rm test-sdk.ts
```

### 4. 测试 Python SDK

```bash
cd ../slaver
python3 -c "
from eket_sdk import EketClient
print('Python SDK loaded successfully!')
"
```

## 运行测试

### 启动 EKET Server (测试模式)

```bash
cd ../scripts
./start-server.sh
```

等待服务器启动（约 2-3 秒）。

### 检查服务器健康

```bash
curl http://localhost:8080/health
```

应该返回：
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "uptime": 123,
  "redis": "connected"
}
```

### 运行简单测试

```bash
# 注册一个测试 Agent
curl -X POST http://localhost:8080/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "test",
    "agent_version": "1.0.0",
    "role": "slaver",
    "specialty": "backend"
  }'
```

应该返回包含 `instance_id` 和 `token` 的 JSON。

## 常见问题

### Redis 连接失败

**症状**: `Error: Redis connection failed`

**解决方案**:
```bash
# 检查 Redis 容器
docker ps | grep redis

# 重启 Redis
docker restart eket-redis

# 或重新创建
docker rm -f eket-redis
./scripts/start-redis.sh
```

### 端口已占用

**症状**: `Error: Port 8080 already in use`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :8080

# 停止该进程
kill -9 <PID>

# 或使用其他端口
export EKET_SERVER_PORT=8081
```

### SDK 未找到

**症状**: `Error: Cannot find module 'eket-sdk'`

**解决方案**:
```bash
# JavaScript
cd sdk/javascript
npm link
cd ../../examples/e2e-collaboration/master
npm link eket-sdk

# Python
cd sdk/python
pip install -e .
```

### TypeScript 编译错误

**症状**: `error TS2307: Cannot find module ...`

**解决方案**:
```bash
cd master
npm install
npx tsc --version  # 确认 TypeScript 已安装
```

### 权限错误 (Python)

**症状**: `Permission denied` 或 `pip install` 失败

**解决方案**:
```bash
# 使用虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

## 清理环境

### 停止所有服务

```bash
./scripts/cleanup.sh
```

或手动清理：

```bash
# 停止 EKET Server
pkill -f "node dist/index.js"

# 停止 Redis
docker stop eket-redis
docker rm eket-redis

# 清理日志
rm -rf logs/
```

### 重置环境

```bash
# 清理 Node.js
cd master
rm -rf node_modules package-lock.json
npm install

# 清理 Python
cd ../slaver
rm -rf venv __pycache__
pip3 install -r requirements.txt
```

## 下一步

环境设置完成后，请查看：
- `README.md` - 运行演示
- `demo-scenario.md` - 详细场景说明
- `../../docs/protocol/EKET_PROTOCOL_V1.md` - 协议文档

## 获取帮助

- GitHub Issues: https://github.com/eket-framework/eket/issues
- 文档: `../../docs/`
- 示例: `../../sdk/*/examples/`
