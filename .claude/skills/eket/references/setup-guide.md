# EKET 安装指南

## 四层安装说明

### Level 0: Shell 基础环境（必选）

**前置条件**：bash ≥4, curl, git

```bash
chmod +x lib/adapters/hybrid-adapter.sh
./lib/adapters/hybrid-adapter.sh doctor   # 验证
```

---

### Level 1: Rust 高性能核心（推荐）

**前置条件**：Rust ≥1.75（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）

```bash
cd rust
cargo build --release
cp target/release/eket ~/.local/bin/eket   # 或 cargo install --path crates/eket-cli
```

**确保 PATH 包含 `~/.local/bin`**：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc   # zsh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc  # bash
source ~/.zshrc
```

**验证**：

```bash
eket --version         # eket 0.1.0
eket system:doctor     # SQLite + Redis 连通性诊断
```

---

### Level 2: Node.js 环境（Web Dashboard / LLM proxy）

**前置条件**：Node.js ≥18

```bash
cd node
npm ci
cp ../.env.example ../.env   # 初始化 .env
npm run build
```

**验证**：

```bash
node dist/index.js system:doctor
```

---

### Level 3: Docker + Redis（可选，高并发）

```bash
./scripts/docker-redis.sh start
./scripts/docker-redis.sh status   # 验证
```

---

### Level 4: SQLite（Node.js 层）

```bash
mkdir -p ~/.eket/data/sqlite/
cd node && npm rebuild better-sqlite3
node dist/index.js sqlite:check    # 验证
```

---

## 更新 EKET Skill

```bash
# 安装/更新 ~/.claude/skills/eket/
./scripts/install-skill.sh --update
```

---

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` |
| `EKET_TICKETS_DIR` | Ticket 目录 | `./jira/tickets` |
| `EKET_MAILBOX_DIR` | Mailbox 目录 | `~/.eket/mailbox` |
| `EKET_SERVER_PORT` | Rust HTTP server 端口 | `9877` |
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key（≥16 字符） | 无 |
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis | 无 |
| `EKET_LOG_LEVEL` | 日志级别（debug/info/warn/error） | `warn` |

---

## 常见问题

- **`eket` not found**：确认 `~/.local/bin` 在 PATH 中，或重新 `source ~/.zshrc`
- **Node.js 版本 < 18**：`nvm install 22 && nvm use 22`
- **Redis 连接失败**：`./scripts/docker-redis.sh start`
- **better-sqlite3 编译错误**：`npm rebuild better-sqlite3`
- **macOS Bash 版本过低（默认 3.x）**：`brew install bash`
- **Rust 编译慢**：首次编译约 30-60s，后续增量编译 <5s
