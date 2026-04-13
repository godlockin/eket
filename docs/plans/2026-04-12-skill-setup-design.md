# EKET Skill + Setup Script 设计文档

**日期**: 2026-04-12
**版本**: v1.0
**状态**: 已确认，待实现

---

## 目标

1. 将 eket 打包为 Claude Code skill（`.claude/skills/eket/`），供团队 gstack team mode 共享
2. 新增 `scripts/setup.sh` 分层安装脚本，覆盖从 Shell 到 Docker+Redis 的完整环境

---

## 文件结构

```
.claude/
└── skills/
    └── eket/
        ├── SKILL.md                    # 主入口（Quick Start + 完整命令 + 链接）
        └── references/
            ├── dev-commands.md         # 内部开发命令
            ├── setup-guide.md          # 安装详细说明
            └── architecture.md        # 三级架构 + 核心模块

scripts/
└── setup.sh                           # 分层安装脚本（新增）
```

---

## SKILL.md 结构

```markdown
# EKET Framework
## Quick Start          # 5步启动（安装→Master→任务→诊断→仪表盘）
## Commands             # 完整命令参考（分节：实例/任务/Redis/SQLite/监控/队列/Pool）
## Development          # → references/dev-commands.md
## Architecture         # → references/architecture.md
## Setup Guide          # → references/setup-guide.md
```

**目标用户**：外部项目 Master Agent（Quick Start）+ eket 内部开发者（Development）

---

## setup.sh 四层安装

| 层级 | 内容 | 触发条件 |
|------|------|----------|
| Level 1 | bash/curl/git 检查，hybrid-adapter.sh 权限 | 始终运行 |
| Level 2 | Node.js ≥18 检查，npm ci，.env 初始化，npm build | 可选（默认询问）|
| Level 3 | Docker 检查，Redis 容器启动 | 可选 |
| Level 4 | ~/.eket/data/sqlite/ 目录，better-sqlite3 编译检查 | 可选 |

**用法**：
```bash
./scripts/setup.sh                    # 交互式（逐层询问）
./scripts/setup.sh --level=1          # 只装 Level 1
./scripts/setup.sh --level=2          # 装到 Level 2（含 Level 1）
./scripts/setup.sh --all              # 全部安装
```

**验证**：
- Level 1 完成 → `lib/adapters/hybrid-adapter.sh doctor`
- Level 2+ 完成 → `node dist/index.js system:doctor`

---

## references 文件内容

### dev-commands.md
- `npm run build / test / lint / format / clean`
- `npm test -- --testPathPattern=xxx`
- `scripts/update-version.sh` / `scripts/validate-all.sh`
- PyPI / npm 发布流程

### setup-guide.md
- 四层详细说明 + 环境变量完整表
- 常见问题：Node 版本不符、Redis 连接失败、better-sqlite3 编译错误

### architecture.md
- 三级降级架构图（Level 1 Shell → Level 2 Node+文件队列 → Level 3 Redis+SQLite）
- 核心模块表（`core/` 各文件职责）
- Master-Slaver 协作流程

---

## 不包含

- playwright-cli（不纳入 setup.sh）
- prompts.chat 发布（本地 team mode 优先，后续按需）

---

## 实现顺序

1. `scripts/setup.sh`
2. `.claude/skills/eket/SKILL.md`
3. `.claude/skills/eket/references/dev-commands.md`
4. `.claude/skills/eket/references/setup-guide.md`
5. `.claude/skills/eket/references/architecture.md`
