# EKET 开发命令参考

## Rust 构建 & 测试（推荐）

```bash
cd rust

# 构建（debug）
cargo build

# 构建（release，安装到 ~/.local/bin）
cargo build --release
cp target/release/eket ~/.local/bin/eket

# 运行全量测试
cargo test --workspace

# 运行单个 crate 测试
cargo test -p eket-core
cargo test -p eket-engine
cargo test -p eket-cli
cargo test -p eket-server

# 单测 + 输出
cargo test --workspace -- --nocapture

# 端到端 smoke test
bash tests/e2e_smoke.sh

# 性能基准（task:claim <50ms）
bash tests/bench_claim.sh
```

## Rust CLI 命令（eket binary）

```bash
# 系统诊断
eket system:doctor

# 任务管理
eket task:create "ticket title" --priority P1 --type feature
eket task:claim [TASK-NNN]
eket task:complete TASK-NNN
eket task:resume TASK-NNN
eket task:progress

# Master 命令
eket master:heartbeat      # 扫描 ready tickets → 分发
eket master:poll           # 处理 TaskResult / Heartbeat

# Slaver 命令
eket slaver:register --role backend --skills rust
eket slaver:poll           # 长轮询 mailbox（Ctrl+C 退出）

# 知识库
eket knowledge:index --dir jira/tickets/
eket knowledge:search "rust tokio"
eket recommend TASK-NNN

# 团队状态
eket team:status

# 代码审查 & PR
eket gate:review TASK-NNN
eket submit:pr

# 任务移交
eket handoff TASK-NNN --to slaver_2

# 启动 HTTP API 服务（:9877）
eket server
eket server --port 9877 --db-path ~/.eket/data/sqlite/eket.db
```

## Node.js 构建 & 测试（Web 层）

```bash
cd node
npm run build                                    # TypeScript → dist/
npm run dev -- <command>                         # ts-node 开发模式
npm start                                        # node dist/index.js
npm test                                         # 全量测试
npm run lint && npm run format                   # 检查 + 格式化
npm run clean                                    # 清理 dist/
```

## 脚本工具

```bash
./scripts/install-skill.sh --update             # 更新 ~/.claude/skills/eket/
./scripts/validate-all.sh                        # 全量验证
./scripts/update-version.sh <new_version>        # 版本号更新
./scripts/docker-redis.sh start                  # 启动 Redis 容器
./scripts/init-project.sh <name> /path/to/proj   # 初始化新项目
```

## 版本管理

```bash
# 查看当前版本
cat template/.eket/version.yml

# 升级版本
./scripts/update-version.sh 2.10.0
git tag -a v2.10.0 -m "release: v2.10.0"
git push origin v2.10.0
```

## 常用诊断

```bash
# Rust 诊断
eket system:doctor
eket team:status
curl http://localhost:9877/health

# Node.js 诊断（已精简）
node dist/index.js system:doctor                 # 整合诊断（含 Rust 状态）
node dist/index.js redis:check
node dist/index.js sqlite:check
./lib/adapters/hybrid-adapter.sh doctor          # Shell 降级诊断

# API 直查
curl http://localhost:9877/api/v1/tasks
curl http://localhost:9877/api/v1/agents
curl http://localhost:9877/api/v1/dag
```

## 开发环境启动

```bash
# 完整启动（Rust server + Node web）
eket server &
cd node && npm run build && node dist/index.js server:start

# 仅 Rust server（API 开发）
eket server --port 9877

# Web 仪表盘（需 Rust server 已启动）
node dist/index.js web:dashboard --port 3000

# OpenCLAW API 网关（需 OPENCLAW_API_KEY ≥16 字符）
node dist/index.js gateway:start --port 8080
```
