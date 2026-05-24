# EKET 框架文档导航

**版本**: 2.14.0-beta | **最后更新**: 2026-04-26

> 文档中心入口。Rust 迁移完成后的四级架构文档索引。

---

## 🚀 快速开始

- **[README](../README.md)** — 项目概览、Quick Start、四级架构图
- **[getting-started/QUICKSTART.md](getting-started/QUICKSTART.md)** — 详细安装步骤
- **[getting-started/DESIGN_PHILOSOPHY.md](getting-started/DESIGN_PHILOSOPHY.md)** — 设计理念
- **[getting-started/USAGE.md](getting-started/USAGE.md)** — 完整使用手册

---

## 🏗️ 架构设计 ([architecture/](architecture/))

| 文档 | 说明 |
|------|------|
| [FRAMEWORK.md](architecture/FRAMEWORK.md) | 框架白皮书 |
| [THREE_REPO_ARCHITECTURE.md](architecture/THREE_REPO_ARCHITECTURE.md) | 三仓库架构设计 |
| [DEGRADATION-STRATEGY.md](architecture/DEGRADATION-STRATEGY.md) | 四级降级策略 |
| [AGENTS_CONFIG.md](architecture/AGENTS_CONFIG.md) | Agent 配置指南 |
| [SKILLS_SYSTEM.md](architecture/SKILLS_SYSTEM.md) | Skills 系统设计 |
| [MULTI_INSTANCE_DESIGN.md](architecture/MULTI_INSTANCE_DESIGN.md) | 多实例设计 |
| [OPENCLAW-INTEGRATION-DESIGN.md](architecture/OPENCLAW-INTEGRATION-DESIGN.md) | OpenCLAW 集成 |
| [degradation.md](architecture/degradation.md) | 四级降级架构（Shell → Node → Rust → Redis+SQLite 容灾链路） |
| [coordination.md](architecture/coordination.md) | Master-Slaver 协调模式（任务分发、状态同步、越权防护） |

---

## 📘 使用指南 ([guides/](guides/))

| 文档 | 说明 |
|------|------|
| [SHELL-MODE.md](guides/SHELL-MODE.md) | Level 0 Shell 模式操作指南 |
| [NODEJS-MODE.md](guides/NODEJS-MODE.md) | Level 2 Node.js 模式指南 |
| [FULL-STACK-MODE.md](guides/FULL-STACK-MODE.md) | 全栈模式（Rust + Node + Redis） |

---

## 📐 架构决策记录 ([adr/](adr/))

| 文档 | 说明 |
|------|------|
| [ADR-001](adr/ADR-001-four-level-degradation.md) | 四级降级架构决策 |
| [ADR-002](adr/ADR-002-master-slaver-mode.md) | Master-Slaver 模式决策 |
| [ADR-003](adr/ADR-003-file-queue-fallback.md) | File Queue 降级决策 |

---

## 🔧 运维手册 ([ops/](ops/))

| 文档 | 说明 |
|------|------|
| [runbook.md](ops/runbook.md) | 生产运维手册 |
| [backup-restore-policy.md](ops/backup-restore-policy.md) | 备份恢复策略 |
| [backup-restore-procedures.md](ops/backup-restore-procedures.md) | 备份恢复操作步骤 |
| [branch-protection-setup.md](ops/branch-protection-setup.md) | 分支保护配置 |

---

## 📊 性能 ([performance/](performance/))

| 文档 | 说明 |
|------|------|
| [benchmark-report.md](performance/benchmark-report.md) | 基准测试报告 |
| [optimization-recommendations.md](performance/optimization-recommendations.md) | 性能优化建议 |

---

## 📚 参考资料 ([reference/](reference/))

| 文档 | 说明 |
|------|------|
| [error-codes.md](reference/error-codes.md) | 错误码参考 |
| [EKET-PROTOCOL.md](reference/EKET-PROTOCOL.md) | 协议规范入口（详见 protocol/ 目录） |

---

## 🗺️ 版本路线图 ([roadmap/](roadmap/))

- [README.md](roadmap/README.md) — 当前里程碑状态
- [RELEASE-POLICY.md](roadmap/RELEASE-POLICY.md) — 发布策略

---

## 🗃️ 历史归档 ([archive/](archive/README.md))

历史版本文档、旧规划文档、各版本完成报告均归档于此。不再主动维护。

---

## 🔗 外部入口

| 资源 | 路径 |
|------|------|
| 项目知识库 | [confluence/memory/memory-index.md](../confluence/memory/memory-index.md) |
| Ticket 模板 | [template/jira/templates/](../template/jira/templates/) |
| 框架模板 | [template/README.md](../template/README.md) |
| 协议规范 | [protocol/README.md](../protocol/README.md) |
| CLAUDE.md | [../CLAUDE.md](../CLAUDE.md) |
