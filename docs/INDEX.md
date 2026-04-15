# EKET 框架文档导航

**版本**: 2.2.0 | **最后更新**: 2026-04-07

> 📚 **欢迎来到 EKET 框架文档中心！** 这里是您了解、学习和使用 EKET 的起点。

---

## 🚀 快速开始

新手？从这里开始：

1. **5 分钟了解 EKET** → [README](../README.md)
2. **快速上手指南** → [QUICKSTART](01-getting-started/QUICKSTART.md)
3. **设计理念** → [DESIGN_PHILOSOPHY](01-getting-started/DESIGN_PHILOSOPHY.md)
4. **完整使用指南** → [USAGE](01-getting-started/USAGE.md)

开发者？直接看这里：

- **开发环境搭建** → [developer/getting-started.md](developer/getting-started.md)
- **Node.js CLI 开发** → [../CLAUDE.md](../CLAUDE.md)
- **代码架构概览** → [02-architecture/FRAMEWORK.md](02-architecture/FRAMEWORK.md)

---

## 📖 文档分类

### 🎓 入门指南 ([01-getting-started/](01-getting-started/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [QUICKSTART.md](01-getting-started/QUICKSTART.md) | 5 分钟快速开始 | 所有人 |
| [DESIGN_PHILOSOPHY.md](01-getting-started/DESIGN_PHILOSOPHY.md) | 设计理念与核心概念 | 架构师、PM |
| [USAGE.md](01-getting-started/USAGE.md) | 完整使用手册 | 开发者 |

### 🏗️ 架构设计 ([02-architecture/](02-architecture/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [FRAMEWORK.md](02-architecture/FRAMEWORK.md) | 框架白皮书 | 架构师 |
| [THREE_REPO_ARCHITECTURE.md](02-architecture/THREE_REPO_ARCHITECTURE.md) | 三仓库架构设计 | 架构师 |
| [AGENTS_CONFIG.md](02-architecture/AGENTS_CONFIG.md) | Agent 配置指南 | 开发者 |
| [SKILLS_SYSTEM.md](02-architecture/SKILLS_SYSTEM.md) | Skills 系统设计 | 开发者 |

### ⚙️ 实现细节 ([03-implementation/](03-implementation/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [README.md](03-implementation/README.md) | 实现概览 | 开发者 |
| [STATE_MACHINE.md](03-implementation/STATE_MACHINE.md) | Ticket 状态机设计 | 开发者 |
| [dependency-clarification.md](03-implementation/dependency-clarification.md) | 依赖关系说明 | 开发者 |

### 🧪 测试与验证 ([04-testing/](04-testing/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [README.md](04-testing/README.md) | 测试框架概览 | QA、开发者 |
| [测试报告](test-reports/) | 所有测试报告 | QA、PM |

### 📚 参考资料 ([05-reference/](05-reference/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [README.md](05-reference/README.md) | 参考资料索引 | 所有人 |
| [error-codes.md](reference/error-codes.md) | 错误码参考 | 开发者 |

### 📋 标准操作流程 ([06-sop/](06-sop/))

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [README.md](06-sop/README.md) | SOP 概览 | 所有人 |
| [HUMAN-INVOLVEMENT-MODEL.md](06-sop/HUMAN-INVOLVEMENT-MODEL.md) | 人类介入模型 | PM、架构师 |
| [WORKFLOW-REDESIGN.md](06-sop/WORKFLOW-REDESIGN.md) | 工作流重设计 | PM、架构师 |
| [IMPLEMENTATION-CHECKLIST.md](06-sop/IMPLEMENTATION-CHECKLIST.md) | 实施检查清单 | 开发者 |
| [Phase 1: 项目启动](06-sop/phase-1-initiation/) | 启动阶段 SOP | PM、架构师 |
| [Phase 2: 开发阶段](06-sop/phase-2-development/) | 开发阶段 SOP | 开发者 |
| [Phase 3: 审核合并](06-sop/phase-3-review-merge/) | 审核合并 SOP | Master |
| [任务类型](06-sop/task-types/) | 不同任务类型处理流程 | 所有人 |

---

## 🔧 专题文档

### 🌐 EKET 协议 ([protocol/](protocol/))

**适用于**: AI 工具集成、协议实现者

| 文档 | 说明 |
|------|------|
| [EKET_PROTOCOL_V1.md](protocol/EKET_PROTOCOL_V1.md) | 协议完整规范 (13 章) |
| [openapi.yaml](protocol/openapi.yaml) | OpenAPI 3.0 规范 |
| [QUICKSTART.md](protocol/QUICKSTART.md) | 5 分钟协议快速入门 |
| [README.md](protocol/README.md) | 协议文档索引 |
| [schemas/](protocol/schemas/) | JSON Schema 定义 |

### 🔐 身份与角色

**适用于**: Agent 开发者、系统管理员

| 文档 | 说明 |
|------|------|
| [IDENTITY.md](IDENTITY.md) | Master/Slaver 身份卡片系统 |
| [MASTER-WORKFLOW.md](../template/docs/MASTER-WORKFLOW.md) | Master 工作流程 |
| [SLAVER-AUTO-EXEC-GUIDE.md](../template/docs/SLAVER-AUTO-EXEC-GUIDE.md) | Slaver 自动执行指南 |
| [MASTER-PR-REVIEW-FLOW.md](../template/docs/MASTER-PR-REVIEW-FLOW.md) | PR 审核流程 |

### 🔌 集成与扩展

**适用于**: 集成开发者

| 文档 | 说明 |
|------|------|
| [OPENCLAW-INTEGRATION-DESIGN.md](OPENCLAW-INTEGRATION-DESIGN.md) | OpenCLAW 集成设计 |
| [OPENCLAW-DATAFLOW-DESIGN.md](OPENCLAW-DATAFLOW-DESIGN.md) | 数据流设计 |
| [MULTI_INSTANCE_DESIGN.md](MULTI_INSTANCE_DESIGN.md) | 多实例设计 |
| [QUICKSTART.md](01-getting-started/QUICKSTART.md) | 初始化与快速开始 |

### 🎨 API 文档 ([api/](api/))

**适用于**: API 使用者、集成开发者

| 文档 | 说明 |
|------|------|
| [README.md](api/README.md) | API 文档概览 |

### 🚀 性能与优化 ([performance/](performance/))

**适用于**: 性能工程师、DevOps

| 文档 | 说明 |
|------|------|
| [benchmark-report.md](performance/benchmark-report.md) | 性能基准测试报告 |
| [optimization-recommendations.md](performance/optimization-recommendations.md) | 优化建议 |

### 🔧 故障排查 ([troubleshooting/](troubleshooting/))

**适用于**: 所有用户

| 文档 | 说明 |
|------|------|
| [common-issues.md](troubleshooting/common-issues.md) | 常见问题解决 |

### 🛡️ 安全 & 备份

**适用于**: 安全工程师、系统管理员

| 文档 | 说明 |
|------|------|
| [backup-restore-policy.md](backup-restore-policy.md) | 备份恢复策略 |
| [backup-restore-procedures.md](backup-restore-procedures.md) | 备份恢复操作流程 |
| [http-server-security-enhancements.md](http-server-security-enhancements.md) | HTTP Server 安全增强 |

### 🎯 架构决策记录 ([adr/](adr/))

**适用于**: 架构师、技术决策者

| 文档 | 说明 |
|------|------|
| [ADR-001-four-level-degradation.md](adr/ADR-001-four-level-degradation.md) | 四级降级设计 |
| [ADR-002-master-slaver-mode.md](adr/ADR-002-master-slaver-mode.md) | Master-Slaver 模式 |
| [ADR-003-file-queue-fallback.md](adr/ADR-003-file-queue-fallback.md) | 文件队列降级 |

---

## 📊 报告与状态

### 📈 项目状态

| 文档 | 说明 | 更新频率 |
|------|------|---------|
| [STATUS_REPORT.md](STATUS_REPORT.md) | 项目整体状态报告 | 每周 |

### 📝 测试报告 ([test-reports/](test-reports/))

| 文档 | 说明 | 日期 |
|------|------|------|
| [INDEX.md](test-reports/INDEX.md) | 测试报告索引 | - |
| [2026-04-07-http-server-test-report.md](test-reports/2026-04-07-http-server-test-report.md) | HTTP Server 测试 | 2026-04-07 |

### 📋 各类报告 ([reports/](reports/))

| 文档 | 说明 | 日期 |
|------|------|------|
| [README.md](reports/README.md) | 报告索引 | - |
| [parallel-execution-completion-report.md](reports/parallel-execution-completion-report.md) | 并行执行完成报告 | 2026-04-07 |
| [agent-2-completion-report.md](reports/agent-2-completion-report.md) | Agent 2 完成报告 | 2026-04-07 |
| [agent3-http-security-completion-report.md](reports/agent3-http-security-completion-report.md) | Agent 3 安全完成报告 | 2026-04-07 |

### 🔍 审查报告 ([audit/](audit/))

| 文档 | 说明 | 日期 |
|------|------|------|
| [README.md](audit/README.md) | 审查报告索引 | - |
| [ROUND2-DOCUMENTATION-AUDIT.md](audit/ROUND2-DOCUMENTATION-AUDIT.md) | Round 2 文档审查 | 2026-04-07 |
| [documentation-issues.md](audit/documentation-issues.md) | 文档问题清单 | 2026-04-07 |
| [merge-plan.md](audit/merge-plan.md) | 文档归并计划 | 2026-04-07 |

---

## 📅 计划与路线图 ([plans/](plans/))

### 进行中的计划 ([plans/active/](plans/active/))

| 文档 | 说明 | 状态 |
|------|------|------|
| [PARALLEL_EXECUTION_BOARD.md](plans/PARALLEL_EXECUTION_BOARD.md) | Round 2 并行执行看板 | 🔄 进行中 |

### 已完成的计划 ([plans/completed/](plans/completed/))

| 文档 | 说明 | 完成日期 |
|------|------|---------|
| [2026-04-07-phase-b-http-server.md](plans/2026-04-07-phase-b-http-server.md) | Phase B 实施计划 | 2026-04-07 |
| [2026-04-07-phase-b-completed.md](plans/2026-04-07-phase-b-completed.md) | Phase B 完成总结 | 2026-04-07 |

### 归档计划 ([plans/archive/](plans/archive/))

历史版本的计划文档，仅供参考。

---

## 📦 历史归档 ([archive/](archive/))

### v0.x 版本文档 ([archive/v0.x/](archive/v0.x/))

| 文档 | 说明 |
|------|------|
| [CHANGELOG_v0.2.md](archive/v0.x/CHANGELOG_v0.2.md) | v0.2 变更日志 |
| [COMPLETE_FRAMEWORK_v0.2.md](archive/v0.x/COMPLETE_FRAMEWORK_v0.2.md) | v0.2 完整框架 |
| 更多... | 见目录 |

### 历史审查报告 ([archive/audit-history/](archive/audit-history/))

过往的文档审查报告，已被最新报告替代。

### 历史状态报告 ([archive/status-history/](archive/status-history/))

过往的项目状态报告，已被最新报告替代。

---

## 🔍 如何查找文档

### 按角色查找

| 角色 | 推荐阅读顺序 |
|------|-------------|
| **项目经理** | README → DESIGN_PHILOSOPHY → FRAMEWORK → STATUS_REPORT |
| **架构师** | FRAMEWORK → THREE_REPO_ARCHITECTURE → ADR → MULTI_INSTANCE_DESIGN |
| **前端开发** | QUICKSTART → AGENTS_CONFIG → SKILLS_SYSTEM → developer/getting-started |
| **后端开发** | QUICKSTART → USAGE → protocol/EKET_PROTOCOL_V1 → api/README |
| **QA 工程师** | USAGE → 04-testing/README → test-reports/ → troubleshooting/common-issues |
| **DevOps** | QUICKSTART → performance/ → ops/runbook → backup-restore-procedures |
| **安全工程师** | FRAMEWORK → http-server-security-enhancements → backup-restore-policy |

### 按场景查找

| 场景 | 推荐文档 |
|------|---------|
| **首次使用 EKET** | QUICKSTART → USAGE → IDENTITY |
| **集成 AI 工具** | protocol/QUICKSTART → protocol/EKET_PROTOCOL_V1 → OPENCLAW-INTEGRATION-DESIGN |
| **开发 Skills** | SKILLS_SYSTEM → developer/getting-started → CLAUDE.md |
| **配置 Master/Slaver** | IDENTITY → [template/docs/MASTER-WORKFLOW](../template/docs/MASTER-WORKFLOW.md) → [template/docs/SLAVER-AUTO-EXEC-GUIDE](../template/docs/SLAVER-AUTO-EXEC-GUIDE.md) |
| **提交 PR** | [template/docs/SLAVER-AUTO-EXEC-GUIDE](../template/docs/SLAVER-AUTO-EXEC-GUIDE.md) → [template/docs/MASTER-PR-REVIEW-FLOW](../template/docs/MASTER-PR-REVIEW-FLOW.md) |
| **性能调优** | performance/benchmark-report → performance/optimization-recommendations |
| **故障排查** | troubleshooting/common-issues → test-reports/ |

---

## 📊 文档统计

| 分类 | 文档数量 | 状态 |
|------|---------|------|
| 入门指南 | 3 | ✅ 完整 |
| 架构设计 | 4 | ✅ 完整 |
| 实现细节 | 4+ | ✅ 完整 |
| 测试验证 | 1+ | ✅ 完整 |
| 参考资料 | 2+ | ✅ 完整 |
| 标准流程 | 10+ | ✅ 完整 |
| 协议规范 | 5 | ✅ 完整 |
| API 文档 | 1+ | 🔄 持续更新 |
| 性能文档 | 2 | ✅ 完整 |
| 故障排查 | 1 | 🔄 持续更新 |
| 报告类 | 10+ | 🔄 持续更新 |
| 归档文档 | 20+ | 📦 已归档 |
| **总计** | **70+** | - |

---

## 🤝 贡献文档

想要改进文档？查看：

- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南
- [docs/CONTRIBUTING.md](CONTRIBUTING.md) - 文档特定的贡献指南（待创建）

---

## 🔗 相关资源

- **项目主页**: [README.md](../README.md)
- **开发指南**: [CLAUDE.md](../CLAUDE.md)
- **示例项目**: [examples/](../examples/)
- **SDK**: [sdk/](../sdk/)
- **测试**: [tests/](../tests/)

---

## 📞 获取帮助

- **常见问题**: [troubleshooting/common-issues.md](troubleshooting/common-issues.md)
- **GitHub Issues**: [提交问题](https://github.com/your-org/eket/issues)
- **文档反馈**: [audit/documentation-issues.md](audit/documentation-issues.md)

---

**文档索引版本**: 2.2.0
**最后更新**: 2026-04-07
**维护者**: EKET Framework Team

💡 **提示**: 建议将本页加入书签，方便快速访问文档！
