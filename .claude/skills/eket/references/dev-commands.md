# EKET 开发命令参考

## Build & Test

```bash
cd node
npm run build                                    # TypeScript → dist/
npm run dev -- <command>                         # ts-node 开发模式，无需构建
npm start                                        # node dist/index.js
npm test                                         # 全量测试（1095 tests）
npm test -- --testPathPattern=<pattern>          # 单文件，支持正则
npm run bench                                    # 性能基准测试
npm run bench:comprehensive                      # 综合基准测试
npm run lint                                     # ESLint 检查 src/**/*.ts
npm run lint:fix                                 # 自动修复
npm run format                                   # Prettier 格式化 src/**/*.ts
npm run format:check                             # 格式化检查（不写入）
npm run clean                                    # 清理 dist/
```

## 脚本工具

```bash
./scripts/validate-all.sh                        # 全量验证
./scripts/update-version.sh <new_version>        # 版本号更新（同步所有文件）
./scripts/docker-redis.sh start                  # 启动 Redis 容器
./scripts/docker-redis.sh stop                   # 停止 Redis 容器
./scripts/docker-sqlite.sh                       # SQLite Docker 管理
./scripts/check-docker.sh                        # Docker 环境检查
./scripts/heartbeat-monitor.sh                   # 心跳监控
./scripts/init-project.sh <name> /path/to/proj   # 初始化新项目
./scripts/init-three-repos.sh <name> <org> <platform>  # 初始化三仓库
./scripts/enable-advanced.sh                     # 启用 Node.js 高级功能
./scripts/validate-config.sh                     # 配置验证
./scripts/analyze-existing.sh                    # 分析现有项目结构
```

## 版本管理

```bash
# 查看当前版本
cat template/.eket/version.yml

# 升级版本（同步更新 node/package.json、template、CLAUDE.md 等所有引用）
./scripts/update-version.sh 2.10.0

# 打 Git tag
git tag -a v2.10.0 -m "release: v2.10.0"
git push origin v2.10.0
```

## 发布

```bash
# PyPI（详见 sdk/python/RELEASING.md）
cd sdk/python
python3 -m build
twine upload dist/*

# npm（详见 sdk/javascript/RELEASING.md）
cd sdk/javascript
npm pack
npm publish
```

## 开发环境启动

```bash
# ts-node 开发模式（无需构建，直接运行 src/）
cd node && npm run dev -- <command>

# 生产模式（需先 build）
cd node && npm run build && npm start

# Web 仪表盘
cd node && npm run dashboard
# 或
node dist/index.js web:dashboard --port 3000

# HTTP Hook 服务器
node dist/index.js hooks:start --port 8899

# OpenCLAW API 网关（需 OPENCLAW_API_KEY ≥16 字符）
node dist/index.js gateway:start --port 8080
```

## 常用诊断

```bash
node dist/index.js system:doctor                 # 系统诊断
node dist/index.js system:check                  # 环境检查
node dist/index.js redis:check                   # Redis 连通性
node dist/index.js sqlite:check                  # SQLite 状态
node dist/index.js pool:status                   # Agent Pool 状态
node dist/index.js heartbeat:status              # 心跳状态
node dist/index.js gate:review --scan-all        # 扫描所有待审查 ticket
node dist/index.js gate:review <ticket-id>       # 审查指定 ticket
node dist/index.js gate:review <ticket-id> --dry-run  # 预演审查
./lib/adapters/hybrid-adapter.sh doctor          # Shell 降级诊断
```
