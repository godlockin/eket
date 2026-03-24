# 文档归档说明

**归档日期**: 2026-03-24
**归档版本**: v0.6.2

---

## 归档原则

### 归档标准

符合以下任一条件的文档建议归档：

1. **版本过时**: 描述已弃用版本的功能
2. **术语弃用**: 使用已废弃的术语 (如 Master/Slaver)
3. **需求实现**: 原始需求文档，功能已实现
4. **历史研究**: 仅供历史参考，无指导意义

### 保留标准

符合以下条件的文档保留在当前目录：

1. **当前版本**: 描述 v0.6.x 版本的功能
2. **持续维护**: 仍在更新和使用的文档
3. **通用指南**: 不依赖特定版本的最佳实践
4. **索引文档**: 提供文档导航的 README 文件

---

## 归档状态

### docs/archive/ (已归档)

| 文件 | 归档原因 | 替代文档 |
|------|----------|----------|
| `MASTER_SLAYER_ROLES.md` | 术语已弃用 (Master/Slaver → Coordinator/Executor) | `docs/02-architecture/AGENTS_CONFIG.md` |
| `framework-risk-review.md` | v0.4 历史风险评审 | `docs/05-reference/v0.5.1-framework-risk-review.md` |
| `目标设定.md` | 原始需求文档，已实现 | - |
| `目标设定_v1.md` | 需求文档 v1，已实现 | - |
| `CHANGELOG_v0.2.md` | v0.2 变更日志 | 主 CHANGELOG 或历史参考 |
| `WORKFLOW_DIAGRAM.md` | v0.2 流程图，部分过时 | `docs/03-implementation/STATE_MACHINE.md` |

### docs/05-reference/ (保留)

以下文档虽然是历史版本，但有参考价值，保留在 reference 目录：

| 文件 | 保留原因 |
|------|----------|
| `v0.5-framework-risk-review.md` | v0.5 风险评审，展示评审方法 |
| `v0.5.1-framework-risk-review.md` | v0.5.1 风险评审，展示迭代改进 |
| `v0.5-implementation-review.md` | v0.5 实施评审，记录实现过程 |
| `REPAIR_PLAN_v0.6.1.md` | v0.6.1 修复计划，记录问题修复 |
| `expert-review.md` | 专家评审方法，供参考 |
| `red-line-security.md` | 安全红线，持续有效 |

### docs/02-architecture/ (保留)

| 文件 | 状态 |
|------|------|
| `FRAMEWORK.md` | 框架白皮书，版本号已更新到 0.6.2 |
| `AGENTS_CONFIG.md` | Agent 配置，版本号已更新到 0.6.2 |
| `SKILLS_SYSTEM.md` | Skills 体系，版本号已更新到 0.6.2 |
| `THREE_REPO_ARCHITECTURE.md` | 三仓库架构，版本号已更新到 0.6.2 |

### docs/01-getting-started/ (保留)

| 文件 | 状态 |
|------|------|
| `COMPLETE_FRAMEWORK_v0.2.md` | 版本号已更新到 0.6.2 |
| `DESIGN_PHILOSOPHY.md` | 版本号已更新到 0.6.2 |
| `QUICKSTART.md` | 已移至根目录，版本号 0.6.2 |
| `USAGE.md` | 使用指南，保留 |

---

## 文档清理建议

### 建议保留 (当前版本)

| 文件 | 原因 |
|------|------|
| `CLAUDE.md` | 项目主文档，v0.6.2 |
| `README.md` | 项目说明，v0.6.2 |
| `QUICKSTART.md` | 快速开始，v0.6.2 |
| `template/SYSTEM-SETTINGS.md` | 模板文档，v0.6.2 |

### 建议保留 (历史记录)

| 文件 | 原因 |
|------|------|
| `docs/v0.6-docker-heartbeat.md` | v0.6.0 特性记录 |
| `docs/IMPLEMENTATION-v0.6.2.md` | v0.6.2 实施总结 |
| `docs/PROJECT_REVIEW_REPORT.md` | 项目审查报告 |
| `docs/LARGE_FILES_REVIEW.md` | 大文件审查报告 |

### 可选清理 (过时信息)

| 文件 | 建议 |
|------|------|
| `docs/05-reference/CHANGELOG_v0.2.md` | 可合并到主 CHANGELOG 或归档 |

---

## 文档版本分布

| 版本 | 文件数 | 位置 |
|------|--------|------|
| v0.1.0 | 0 | - |
| v0.2.0 | 0 | 已更新到 0.6.2 |
| v0.5.0 | 0 | 已更新到 0.6.2 |
| v0.5.1 | 0 | 已更新到 0.6.2 |
| v0.6.0 | 1 | docs/v0.6-docker-heartbeat.md (版本特性记录) |
| v0.6.1 | 1 | docs/05-reference/REPAIR_PLAN_v0.6.1.md |
| v0.6.2 | 全部 | 当前版本 |

---

## 归档流程

### 执行归档

```bash
# 移动文件到 archive
mv docs/05-reference/v0.5-framework-risk-review.md docs/archive/
mv docs/05-reference/v0.5.1-framework-risk-review.md docs/archive/
mv docs/05-reference/v0.5-implementation-review.md docs/archive/

# 更新 archive/README.md
# 添加新归档文件信息
```

### 更新引用

检查并更新以下位置的引用：
- `docs/README.md`
- 其他文档中的交叉引用

---

## 当前状态

**归档目录**: `docs/archive/`
- 4 个文件
- 状态：已正确标记为归档

**参考目录**: `docs/05-reference/`
- 11 个文件
- 状态：保留，有历史参考价值

**建议**: 当前文档组织合理，无需进一步归档操作。

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-24
