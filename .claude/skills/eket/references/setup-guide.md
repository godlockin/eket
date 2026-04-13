# EKET 安装指南

## 四层安装说明

### Level 1: Shell 基础环境（必选）

**前置条件**：bash ≥4, curl, git

**安装内容**：设置 `lib/adapters/hybrid-adapter.sh` 可执行权限

```bash
chmod +x lib/adapters/hybrid-adapter.sh
```

**验证命令**：

```bash
./lib/adapters/hybrid-adapter.sh doctor
```

---

### Level 2: Node.js 环境（推荐）

**前置条件**：Node.js ≥18

**安装内容**：

```bash
cd node
npm ci
cp ../.env.example ../.env   # 初始化 .env
npm run build
```

**验证命令**：

```bash
node dist/index.js system:doctor
```

---

### Level 3: Docker + Redis

**前置条件**：Docker 已安装并运行

**安装内容**：启动 Redis 容器

```bash
./scripts/docker-redis.sh start
```

**验证命令**：

```bash
./scripts/docker-redis.sh status
```

---

### Level 4: SQLite

**安装内容**：创建数据目录，验证 better-sqlite3 编译

```bash
mkdir -p ~/.eket/data/sqlite/
cd node && npm rebuild better-sqlite3
```

**验证命令**：

```bash
node dist/index.js sqlite:check
```

---

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key（必须 ≥16 字符） | 无 |
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` |
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis（连接管理器） | 无 |
| `EKET_LOG_LEVEL` | 日志级别（debug/info/warn/error） | `info` |
| `EKET_LOG_DIR` | 日志目录 | `./logs` |
| `EKET_MEMORY_WARNING_THRESHOLD` | 内存告警阈值 | `0.75` |

---

## 常见问题

- **Node.js 版本 < 18**：
  ```bash
  nvm install 22 && nvm use 22
  ```

- **Redis 连接失败**：
  ```bash
  ./scripts/docker-redis.sh start
  ```

- **better-sqlite3 编译错误**：
  ```bash
  npm rebuild better-sqlite3
  ```

- **.env 缺少变量**：
  ```bash
  cp .env.example .env
  ```

- **macOS Bash 版本过低（默认 bash 3.x）**：
  ```bash
  brew install bash
  ```
