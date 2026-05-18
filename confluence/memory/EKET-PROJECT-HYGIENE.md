# EKET 项目卫生规范

## docs/ vs confluence/memory/ 边界规则

### 目的
明确产品文档（docs/）与内部知识库（confluence/memory/）的职责边界，避免重复和混淆。

### 边界定义

#### docs/ — 产品文档（面向外部）
**受众**：外部用户、新贡献者、技术决策者  
**性质**：静态、稳定、版本化  
**更新频率**：低（版本发布时）

**包含内容**：
- architecture/ — 系统架构设计（三级降级、Master-Slaver、三仓库分离）
- adr/ — Architecture Decision Records（架构决策记录）
- api/ — API 文档、接口规范
- guides/ — 外部操作指南（用户视角：安装、快速上手、模式切换）
- reference/ — 参考文档（错误码、协议规范、CLI 命令）
- ops/ — 运维手册（runbook、备份恢复、分支保护）
- performance/ — 性能基准测试与优化建议
- roadmap/ — 路线图与版本规划
- archive/ — 历史文档归档（只进不出）

#### confluence/memory/ — 内部知识库（面向团队）
**受众**：EKET 开发团队（Master/Slaver）  
**性质**：动态、增量、实战沉淀  
**更新频率**：高（每次 EPIC/ticket 完成后）

**包含内容**：
- patterns/ — 可复用设计模式（实现细节、代码级模式）
- lessons/ — 经验教训（失败案例、防御策略、最佳实践）
- research/ — 研究笔记（技术调研、外部项目借鉴）
- retrospectives/ — 复盘记录（EPIC/ticket/PR 复盘）
- guides/ — 内部操作指南（团队协作：Agent 提示模板、Worktree 集成、代码维护）
- archive/ — 清理记录归档（文档审计、ticket 清理）

### 判定规则

| 问题 | docs/ | confluence/memory/ |
|------|-------|-------------------|
| 内容会频繁变化？ | ❌ | ✅ |
| 外部用户需要阅读？ | ✅ | ❌ |
| 属于产品功能说明？ | ✅ | ❌ |
| 记录失败经验教训？ | ❌ | ✅ |
| 包含实战代码细节？ | ❌ | ✅ |
| 需要版本化发布？ | ✅ | ❌ |

### 迁移原则

**从 confluence/memory/ → docs/**（符合以下条件）：
- 内容已稳定（3 个月无修改）
- 属于架构设计或产品功能说明
- 外部用户需要了解

**从 docs/ → confluence/memory/**（符合以下条件）：
- 内容频繁变化（每周更新）
- 仅团队内部使用
- 包含实战细节或临时研究

### 特殊说明

**guides/ 重叠处理**：
- docs/guides/：用户视角操作（installation, quickstart, mode-switching）
- confluence/memory/guides/：团队内部协作（agent-prompt-template, worktree-agent, codebase-maintenance）

**archive/ 处理**：
- docs/archive/：历史产品文档（旧版架构、废弃 API）
- confluence/memory/archive/：内部清理记录（审计报告、ticket 清理）

### 执行检查

新增文档时自问：
1. 这是给外部用户看的吗？ → Yes = docs/, No = confluence/
2. 这会频繁变化吗？ → Yes = confluence/, No = docs/
3. 这属于产品文档还是实战经验？ → 产品 = docs/, 经验 = confluence/
