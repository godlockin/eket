# 归档文档说明

本目录包含 EKET 框架的归档文档。这些文档已过时，仅供历史参考。

---

## 归档文件列表

| 文件 | 原版本 | 归档原因 | 替代文档 |
|------|--------|---------|---------|
| `MASTER_SLAYER_ROLES.md` | v0.4.0 | 术语已弃用 (Master/Slaver → Coordinator/Executor) | `docs/02-architecture/AGENTS_CONFIG.md` |
| `framework-risk-review.md` | v0.4.0 | v0.4 历史风险评审 | `docs/05-reference/v0.5.1-framework-risk-review.md` |
| `目标设定.md` | v1.0.0 | 原始需求文档，已实现 | - |
| `目标设定_v1.md` | v1.0.0 | 原始需求文档 v1，已实现 | - |
| `CHANGELOG_v0.2.md` | v0.2.0 | v0.2 变更日志，可合并到主 CHANGELOG | - |
| `WORKFLOW_DIAGRAM.md` | v0.2.0 | v0.2 流程图，部分过时 | `docs/03-implementation/STATE_MACHINE.md` |

---

## 版本历史

### v0.4.0 (已弃用)

- 使用 Master/Slaver 架构
- 中心协调模式
- 任务被动分配

### v0.5.0+ (当前)

- 使用 Coordinator/Executor 架构
- 去中心化 Agent 网络
- 任务主动领取

---

## 术语迁移指南

### Master → Coordinator

| 原术语 | 新术语 |
|--------|--------|
| Master 实例 | Coordinator Agent |
| Master 模式 | 任务设定模式 |
| Master 职责 | 需求分析、任务拆解、Review |

### Slaver → Executor

| 原术语 | 新术语 |
|--------|--------|
| Slaver 实例 | Executor Agent |
| Slaver 模式 | 任务承接模式 |
| Slaver 职责 | 任务执行、开发、测试 |

---

## 使用建议

- **新用户可以跳过此目录**，直接阅读最新文档
- **历史研究**可参考此目录
- **迁移项目**请参考术语迁移指南

---

**归档日期**: 2026-03-23
**维护者**: EKET Framework Team
