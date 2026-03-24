# EKET 框架文档索引

**版本**: 0.6.2
**最后更新**: 2026-03-24

---

## 🚀 推荐阅读顺序

### 新用户快速路径

1. **[QUICKSTART.md](../QUICKSTART.md)** - 5 分钟快速开始
2. **[COMPLETE_FRAMEWORK_v0.2.md](01-getting-started/COMPLETE_FRAMEWORK_v0.2.md)** - 完整功能说明
3. **[FRAMEWORK.md](02-architecture/FRAMEWORK.md)** - 框架白皮书

### v0.6.2 新增内容

- **[IMPLEMENTATION-v0.6.2.md](IMPLEMENTATION-v0.6.2.md)** - PR 审查机制增强实施总结
- **[PROJECT_REVIEW_REPORT.md](PROJECT_REVIEW_REPORT.md)** - 项目文件审查报告

---

## 文档目录结构

```
docs/
├── 01-getting-started/     # 入门文档
├── 02-architecture/        # 架构设计
├── 03-implementation/      # 实现细节
├── 04-testing/             # 测试验证
├── 05-reference/           # 参考资料
├── archive/                # 归档文档
└── README.md               # 本文件
```

---

## 📁 01-getting-started/ 入门文档

新手入门路线：**QUICKSTART.md** → **COMPLETE_FRAMEWORK_v0.2.md** → **FRAMEWORK.md**

| 文档 | 内容 | 适合人群 |
|------|------|---------|
| [QUICKSTART.md](01-getting-started/QUICKSTART.md) | 5 分钟快速开始 | 所有用户 |
| [COMPLETE_FRAMEWORK_v0.2.md](01-getting-started/COMPLETE_FRAMEWORK_v0.2.md) | v0.2 完整功能说明 | 所有用户 |
| [USAGE.md](01-getting-started/USAGE.md) | 使用指南 | 新用户 |
| [FRAMEWORK.md](02-architecture/FRAMEWORK.md) | 框架白皮书 | 架构师/技术负责人 |

---

## 📁 02-architecture/ 架构设计

| 文档 | 内容 | 核心概念 |
|------|------|---------|
| [THREE_REPO_ARCHITECTURE.md](02-architecture/THREE_REPO_ARCHITECTURE.md) | 三 Git 仓库架构 | confluence/jira/code_repo |
| [AGENTS_CONFIG.md](02-architecture/AGENTS_CONFIG.md) | 智能体配置 | 协调者/执行者 |
| [SKILLS_SYSTEM.md](02-architecture/SKILLS_SYSTEM.md) | Skills 体系 | 6 大类技能 |

---

## 📁 03-implementation/ 实现细节

| 文档 | 内容 | 适合场景 |
|------|------|---------|
| [INSTANCE_INITIALIZATION.md](03-implementation/INSTANCE_INITIALIZATION.md) | 实例初始化流程 | 理解启动逻辑 |
| [AGENT_BEHAVIOR.md](03-implementation/AGENT_BEHAVIOR.md) | Agent 行为流程 | 理解 Agent 工作 |
| [BRANCH_STRATEGY.md](03-implementation/BRANCH_STRATEGY.md) | 分支策略 | Git 流程 |
| [STATE_MACHINE.md](03-implementation/STATE_MACHINE.md) | Jira 状态机 | 任务状态流转 |
| [IMPLEMENTATION_STATUS.md](03-implementation/IMPLEMENTATION_STATUS.md) | 实现状态 | 了解进度 |

---

## 📁 04-testing/ 测试验证

| 文档 | 内容 |
|------|------|
| [TEST_FRAMEWORK.md](04-testing/TEST_FRAMEWORK.md) | 测试框架说明 |
| [VALIDATION_REPORT.md](04-testing/VALIDATION_REPORT.md) | 合理性有效性验证报告 |

---

## 📁 05-reference/ 参考资料

| 文档 | 内容 |
|------|------|
| [CHANGELOG_v0.2.md](05-reference/CHANGELOG_v0.2.md) | v0.2 变更总结 |
| [CODE_REVIEW_CHECKLIST.md](05-reference/CODE_REVIEW_CHECKLIST.md) | 代码 Review 清单 |
| [WORKFLOW_DIAGRAM.md](05-reference/WORKFLOW_DIAGRAM.md) | 可视化流程图 |
| [CLEANUP_REPORT.md](05-reference/CLEANUP_REPORT.md) | 清理报告 |
| [expert-review.md](05-reference/expert-review.md) | 专家组审查报告 |

---

## 使用场景与阅读路径

### 场景 1: 新项目从零开始

**阅读**: [QUICKSTART.md](01-getting-started/QUICKSTART.md) → [THREE_REPO_ARCHITECTURE.md](02-architecture/THREE_REPO_ARCHITECTURE.md)

```bash
./scripts/init-project.sh my-project /path/to/project
./scripts/init-three-repos.sh my-project my-org github
```

### 场景 2: 理解初始化流程

**阅读**: [INSTANCE_INITIALIZATION.md](03-implementation/INSTANCE_INITIALIZATION.md)

```bash
/eket-start        # 启动实例
/eket-start -a     # 自动模式
```

### 场景 3: 查看测试验证

**阅读**: [TEST_FRAMEWORK.md](04-testing/TEST_FRAMEWORK.md) → [VALIDATION_REPORT.md](04-testing/VALIDATION_REPORT.md)

```bash
./tests/run-unit-tests.sh    # 运行单元测试
```

---

## 核心架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        EKET v0.2 架构                        │
├─────────────────────────────────────────────────────────────┤
│  用户界面层                                                  │
│  /eket-init  /eket-mode  /eket-status  /eket-claim          │
├─────────────────────────────────────────────────────────────┤
│  智能体层                                                    │
│  协调智能体 (常驻)  │  执行智能体 (按需)                      │
├─────────────────────────────────────────────────────────────┤
│  数据持久化层 (三 Git 仓库)                                    │
│  Confluence  │  Code Repo  │  Jira                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 命令参考

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导 |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式 |
| `/eket-mode setup/exe` | 切换模式 |
| `/eket-status` | 查看状态 |
| `/eket-claim [id]` | 领取任务 |
| `/eket-review [id]` | 请求 Review |

---

## 版本历史

| 版本 | 日期 | 重点 |
|------|------|------|
| 0.1.0 | 2026-03-18 | 初始版本 |
| 0.1.0 | 2026-03-19 | 专家组审查 |
| 0.2.0 | 2026-03-20 | 架构重构 |
| 0.5.0 | 2026-03-23 | Master/Slaver 架构 |
| 0.5.1 | 2026-03-23 | 修复和优化 |
| 0.6.0 | 2026-03-24 | Docker 集成和心跳监控 |
| 0.6.1 | 2026-03-24 | SYSTEM-SETTINGS 模板升级 |
| 0.6.2 | 2026-03-24 | PR 审查机制增强 |

---

**维护者**: EKET Framework Team
