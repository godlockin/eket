# EKET 框架文档索引

**版本**: 0.7.2
**最后更新**: 2026-03-25

---

## 📚 v0.7 文档（推荐）

### 核心文档

| 文档 | 内容 | 适合人群 |
|------|------|---------|
| **[RELEASE-v0.7.md](RELEASE-v0.7.md)** | v0.7 发布说明 | 所有用户 |
| **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** | v0.7 实施总结 | 技术负责人 |
| **[IMPLEMENTATION-v0.7-phase2.md](IMPLEMENTATION-v0.7-phase2.md)** | Phase 2 实施细节 | 开发者 |
| **[IMPLEMENTATION-v0.7-phase3.md](IMPLEMENTATION-v0.7-phase3.md)** | Phase 3 实施细节 | 开发者 |
| **[v0.7-upgrade-guide.md](v0.7-upgrade-guide.md)** | v0.7 升级指南 | 升级用户 |

### 快速开始

1. **[README.md](../README.md)** - 项目首页
2. **[RELEASE-v0.7.md](RELEASE-v0.7.md)** - 完整功能说明
3. **[02-architecture/FRAMEWORK.md](02-architecture/FRAMEWORK.md)** - 架构白皮书

---

## 📁 文档目录结构

```
docs/
├── 01-getting-started/     # 入门文档
├── 02-architecture/        # 架构设计
├── 03-implementation/      # 实现细节 (v0.7)
├── 04-testing/             # 测试验证
├── 05-reference/           # 参考资料
├── 06-sop/                 # 标准操作流程
├── archive/                # 归档文档 (v0.6 及之前)
└── README.md               # 本文件
```

---

## 📂 各目录内容

### 01-getting-started/ 入门文档

| 文档 | 内容 |
|------|------|
| [QUICKSTART.md](01-getting-started/QUICKSTART.md) | 快速开始 |
| [USAGE.md](01-getting-started/USAGE.md) | 使用指南 |
| [DESIGN_PHILOSOPHY.md](01-getting-started/DESIGN_PHILOSOPHY.md) | 设计理念 |

### 02-architecture/ 架构设计

| 文档 | 内容 |
|------|------|
| [FRAMEWORK.md](02-architecture/FRAMEWORK.md) | 框架白皮书 |
| [AGENTS_CONFIG.md](02-architecture/AGENTS_CONFIG.md) | Agent 配置 |
| [SKILLS_SYSTEM.md](02-architecture/SKILLS_SYSTEM.md) | Skills 体系 |
| [THREE_REPO_ARCHITECTURE.md](02-architecture/THREE_REPO_ARCHITECTURE.md) | 三仓库架构 |

### 03-implementation/ 实现细节

| 文档 | 内容 |
|------|------|
| [BRANCH_STRATEGY.md](03-implementation/BRANCH_STRATEGY.md) | 分支策略 |
| [STATE_MACHINE.md](03-implementation/STATE_MACHINE.md) | 状态机设计 |
| [dependency-clarification.md](03-implementation/dependency-clarification.md) | 依赖说明 |

### 04-testing/ 测试验证

| 文档 | 内容 |
|------|------|
| [TEST_FRAMEWORK.md](04-testing/TEST_FRAMEWORK.md) | 测试框架 |

### 05-reference/ 参考资料

| 文档 | 内容 |
|------|------|
| [red-line-security.md](05-reference/red-line-security.md) | 安全红线 |
| [CODE_REVIEW_CHECKLIST.md](05-reference/CODE_REVIEW_CHECKLIST.md) | 代码 Review 清单 |

### 06-sop/ 标准操作流程

| 目录 | 内容 |
|------|------|
| [phase-1-initiation/](06-sop/phase-1-initiation/README.md) | Phase 1: 初始化 |
| [phase-2-development/](06-sop/phase-2-development/README.md) | Phase 2: 开发 |
| [phase-3-review-merge/](06-sop/phase-3-review-merge/README.md) | Phase 3: Review & Merge |
| [task-types/](06-sop/task-types/) | 任务类型 |

---

## 🗄️ 归档文档

旧版本文档已移至 `archive/` 目录：

| 版本 | 归档位置 |
|------|---------|
| v0.6.x | [archive/v0.6/](archive/v0.6/) |
| v0.5.x | [archive/v0.5/](archive/v0.5/) |
| v0.2.x | [archive/v0.2/](archive/v0.2/) |

---

## 📖 推荐阅读顺序

### 新用户（v0.7）

```
README.md (项目首页)
    ↓
RELEASE-v0.7.md (了解功能)
    ↓
v0.7-upgrade-guide.md (如需升级)
    ↓
IMPLEMENTATION_SUMMARY.md (深入了解)
```

### 开发者

```
IMPLEMENTATION-v0.7-phase2.md
    ↓
IMPLEMENTATION-v0.7-phase3.md
    ↓
02-architecture/FRAMEWORK.md
```

### 架构师/技术负责人

```
02-architecture/THREE_REPO_ARCHITECTURE.md
    ↓
02-architecture/AGENTS_CONFIG.md
    ↓
06-sop/README.md (SOP 流程)
```

---

## 📋 CLI 命令参考

### Node.js CLI (v0.7 新增)

```bash
# 系统检查
node node/dist/index.js check
node node/dist/index.js doctor

# Redis
node node/dist/index.js redis:check
node node/dist/index.js redis:list-slavers

# SQLite
node node/dist/index.js sqlite:check
node node/dist/index.js sqlite:list-retros
node node/dist/index.js sqlite:search "<keyword>"
node node/dist/index.js sqlite:report

# 任务管理
node node/dist/index.js init                  # 初始化向导
node node/dist/index.js claim [id]            # 领取任务
node node/dist/index.js submit-pr             # 提交 PR
node node/dist/index.js heartbeat:start <id>  # 启动心跳
node node/dist/index.js heartbeat:status      # 查看状态
```

### Claude Code 命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导 |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式 |
| `/eket-status` | 查看状态 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-help` | 帮助 |

---

## 版本历史

| 版本 | 日期 | 重点 |
|------|------|------|
| **0.7.2** | 2026-03-25 | 代码质量提升 |
| **0.7.1** | 2026-03-25 | Phase 3 完整实现 |
| **0.7.0** | 2026-03-24 | Node.js 混合架构 |
| 0.6.2 | 2026-03-24 | PR 审查增强 |
| 0.6.1 | 2026-03-24 | 专家 Agent 定制 |
| 0.6.0 | 2026-03-24 | Docker 集成 |
| 0.5.x | 2026-03-23 | Master-Slaver 架构 |

---

**维护者**: EKET Framework Team
