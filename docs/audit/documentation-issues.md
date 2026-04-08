# EKET 文档问题清单

**创建日期**: 2026-04-07
**审查范围**: 全项目文档
**问题总数**: TBD (持续更新中)

---

## 🎯 问题分类标准

| 等级 | 描述 | 响应时间 |
|------|------|---------|
| **P0** | 严重错误，阻碍用户使用 | 立即修复 |
| **P1** | 重要问题，影响用户体验 | 本周修复 |
| **P2** | 中等问题，文档不一致 | 本月修复 |
| **P3** | 轻微问题，优化建议 | 计划修复 |

---

## 🚨 P0 问题（必须立即修复）

### P0-1: 版本号严重不一致

**文件**:
- `README.md`: v2.0.0 (最后更新 2026-04-06)
- `CLAUDE.md`: v2.0.0
- `docs/IDENTITY.md`: v0.9.3 (最后更新 2026-03-27)
- `docs/STATUS_REPORT.md`: v2.1.0
- `node/package.json`: v2.0.0

**问题描述**:
项目版本号混乱，不同文档显示不同版本，用户无法确定当前实际版本。

**期望状态**:
所有文档统一显示 **v2.2.0** (Round 2 完成后)

**修复动作**:
1. 确定统一版本号规则
2. 批量更新所有文档中的版本引用
3. 建立版本号管理机制（单一来源）

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P0-2: 审查报告重复和混乱

**文件**:
- `docs/DOCUMENTATION_AUDIT_REPORT.md` (744 行)
- `docs/DOCUMENTATION_AUDIT_REPORT_V2.md` (637 行)
- `docs/audit/ROUND2-DOCUMENTATION-AUDIT.md` (本轮审查)

**问题描述**:
存在 3 个审查报告，内容部分重复但结论不一致，造成维护混乱。

**影响**:
- 开发者困惑应该参考哪个报告
- 浪费审查时间
- 问题跟踪困难

**修复动作**:
1. 保留最新审查报告（本报告）
2. 归档旧报告到 `docs/archive/audit-history/`
3. 在旧报告顶部添加"已过时"标记

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P0-3: 根目录文档散乱

**文件**:
- `TEST_FAILURE_ANALYSIS.md` (根目录)
- `TEST_FIX_FINAL_REPORT.md` (根目录)
- `fix-jest-imports.md` (根目录)
- `CONTRIBUTING.md` (根目录，新创建)

**问题描述**:
根目录包含多个应该在子目录中的文档，项目结构混乱。

**期望状态**:
根目录只保留核心文档（README, CLAUDE, CHANGELOG, CONTRIBUTING, LICENSE）

**修复动作**:
1. 移动测试报告到 `docs/test-reports/`
2. 归档临时文档到 `docs/archive/` 或删除
3. 更新根目录 `.gitignore` 避免临时文件提交

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P0-4: 缺少统一的文档入口

**文件**:
- `docs/README.md` (内容过于简单)
- 缺少 `docs/INDEX.md`

**问题描述**:
用户无法快速找到需要的文档，缺少全局导航。

**影响**:
- 新用户学习曲线陡峭
- 文档利用率低
- 重复造轮子

**修复动作**:
1. 创建 `docs/INDEX.md` 作为统一入口
2. 扩展 `docs/README.md`，添加完整导航
3. 在各子目录添加面包屑导航

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P0-5: 测试报告散落在多处

**文件**:
- `TEST_FAILURE_ANALYSIS.md` (根目录)
- `TEST_FIX_FINAL_REPORT.md` (根目录)
- `docs/test-reports/2026-04-07-http-server-test-report.md`
- `docs/test-reports/TASK-004-EXECUTION-SUMMARY.md`

**问题描述**:
测试报告分散在根目录和 `docs/test-reports/`，没有统一管理。

**修复动作**:
1. 统一移动到 `docs/test-reports/`
2. 创建 `docs/test-reports/INDEX.md` 索引
3. 建立测试报告命名规范

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

## 🔶 P1 问题（应尽快修复）

### P1-1: docs/README.md 内容过于简单

**文件**: `docs/README.md`

**当前内容**:
```markdown
# EKET 框架文档索引

本目录包含 EKET 框架的核心文档。

## 文档列表
### 用户指南
| 文档 | 说明 |
|------|------|
| [身份卡片系统](IDENTITY.md) | Master/Slaver 身份确认和职责说明 |
...
```

**问题**:
- 缺少文档结构总览
- 没有各目录用途说明
- 缺少更新日期
- 没有文档版本信息

**修复动作**:
参考上一轮审查报告的建议，扩展为完整索引。

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-2: 旧计划文档未明确标记状态

**文件**:
- `docs/plans/2026-03-26-file-structure-and-excellence-gap.md`
- `docs/plans/2026-03-31-multi-agent-patterns-design.md`
- `docs/plans/2026-04-06-optimization-loop-design.md`
- `docs/plans/v0.9.1-improvement-plan.md`
- `docs/plans/containerization-deployment-audit-report.md`

**问题**:
`docs/plans/` 目录混合了新旧计划，没有明确的状态标记，用户难以区分。

**修复动作**:
1. 在每个计划文档顶部添加状态标记
2. 重组为 `docs/plans/active/` 和 `docs/plans/completed/`
3. 归档 2026-03 月之前的计划

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-3: 状态报告重复

**文件**:
- `docs/STATUS_REPORT.md` (441 行, v2.1.0)
- `docs/EKET_COMPLETION_REPORT.md`
- `docs/PROJECT_REVIEW_REPORT.md`

**问题**:
存在多个状态报告，内容部分重复，没有明确的主报告。

**修复动作**:
1. 确定 `STATUS_REPORT.md` 为主状态报告
2. 归档其他报告到 `docs/archive/status-history/`
3. 定期更新主报告

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-4: 架构文档使用混乱的任务编号

**文件**:
- `docs/architecture/TASK-003-sqlite-manager-design.md`
- `docs/architecture/TASK-003-migration-plan.md`
- `docs/architecture/TASK-003-executive-summary.md`
- `docs/test-reports/TASK-004-EXECUTION-SUMMARY.md`

**问题**:
使用 `TASK-00X` 编号体系，但与 Jira tickets 不一致，造成混淆。

**修复动作**:
1. 确认任务编号体系（TASK vs FEAT/BUG/CHORE）
2. 统一重命名或添加说明
3. 在文档中添加交叉引用

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-5: IDENTITY.md 版本严重过时

**文件**: `docs/IDENTITY.md`

**当前版本**: v0.9.3 (最后更新 2026-03-27)
**期望版本**: v2.0.0+ (与项目主版本一致)

**问题**:
作为核心文档之一，版本号严重滞后，可能包含过时信息。

**修复动作**:
1. 全面审查文档内容
2. 更新版本号到 v2.2.0
3. 同步最新的身份系统设计

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-6: 缺少 CHANGELOG.md

**问题**:
项目缺少统一的变更日志，用户无法了解版本变化。

**当前状态**:
- 有 `docs/archive/v0.x/CHANGELOG_v0.2.md` (v0.2.0 归档)
- 缺少 v2.x 的 CHANGELOG

**修复动作**:
1. 创建根目录 `CHANGELOG.md`
2. 基于 git log 和状态报告整理 v2.x 变更
3. 建立 CHANGELOG 更新流程

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P1-7: README.md 版本历史表不完整

**文件**: `README.md`

**当前版本历史**:
```markdown
| 版本 | 日期 | 变更 |
|------|------|------|
| **2.0.0** | 2026-04-02 | 全面 code review 修复 (132 个 P0/P1 问题)、安全加固、WebSocket、Agent Pool、HTTP Hooks |
| **0.7.2** | 2026-03-25 | 代码质量提升：类型安全、错误处理、DRY 优化 |
| **0.7.1** | 2026-03-25 | Phase 3 完整实现：PR 提交、三仓库克隆、文件队列 |
| **0.7.0** | 2026-03-24 | Node.js 混合架构实现 |
| 0.6.2 | 2026-03-24 | PR 审查机制增强、Roadmap 对齐检查 |
| 0.6.1 | 2026-03-24 | SYSTEM-SETTINGS.md 模板升级：专家 Agent 可定制 |
| 0.6.0 | 2026-03-24 | Docker 集成和 Slaver 心跳监控 |
| 0.5.x | 2026-03-23 | Merge 流程升级、路径标准化 |
```

**问题**:
- 缺少 v2.1.0 (Phase A/B/C/D 完成)
- 缺少即将发布的 v2.2.0
- 格式不一致（部分加粗，部分不加粗）

**修复动作**:
1. 添加 v2.1.0 条目
2. 添加 v2.2.0 条目（Round 2 完成）
3. 统一格式（最新版本加粗）

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

## 🟡 P2 问题（建议修复）

### P2-1: Markdown 格式不一致

**文件**: 多个文档

**问题**:
- 部分文档使用 ATX 标题 (`#`)，部分使用 Setext 标题
- 代码块语言标记不统一（bash vs shell vs sh）
- 表格格式混乱（部分有对齐，部分没有）
- 列表缩进不一致

**修复动作**:
```bash
# 使用 markdownlint 自动修复
cd docs
npx markdownlint-cli **/*.md --fix
```

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-2: 内部链接断裂（可能）

**问题**:
部分文档的内部链接可能指向已移动或重命名的文件。

**修复动作**:
```bash
# 使用 markdown-link-check 验证
npx markdown-link-check docs/**/*.md
```

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-3: 缺少文档元数据

**文件**: 大部分文档

**问题**:
大部分文档缺少以下元数据：
- 创建日期
- 最后更新日期
- 作者/维护者
- 文档版本

**修复动作**:
在文档顶部添加元数据块：
```markdown
# 文档标题

**版本**: 2.2.0
**创建日期**: YYYY-MM-DD
**最后更新**: YYYY-MM-DD
**维护者**: EKET Framework Team
```

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-4: 缺少文档贡献指南

**文件**: 缺少 `docs/CONTRIBUTING.md`

**问题**:
虽然根目录有 `CONTRIBUTING.md`，但文档目录缺少文档特定的贡献指南。

**修复动作**:
创建 `docs/CONTRIBUTING.md`，包含：
- 文档编写规范
- Markdown 风格指南
- 文档审查流程
- 文档目录结构规范

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-5: 代码示例可能过时

**文件**: 多个文档中的代码示例

**问题**:
部分文档中的命令和代码示例可能与最新版本不一致。

**修复动作**:
1. 识别包含代码示例的文档
2. 逐一验证示例的有效性
3. 更新过时的示例

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-6: 术语使用不统一

**问题**:
不同文档使用不同术语指代同一概念：
- "Slaver" vs "Worker" vs "执行实例"
- "三仓库" vs "三合一架构" vs "Three-Repo Architecture"
- "满血版" vs "完整版" vs "Full Mode"
- "残血版" vs "降级版" vs "Fallback Mode"

**修复动作**:
1. 创建 `docs/GLOSSARY.md` (术语表)
2. 统一术语使用
3. 在首次出现时添加术语说明

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

### P2-7: 日期格式不统一

**问题**:
不同文档使用不同的日期格式：
- `2026-04-07`
- `2026/04/07`
- `2026年4月7日`
- `Apr 7, 2026`

**修复动作**:
统一使用 ISO 8601 格式：`YYYY-MM-DD`

**责任人**: Slaver E
**状态**: ⏳ 待修复

---

## 🔵 P3 问题（优化建议）

### P3-1: 缺少文档搜索功能

**建议**:
添加文档搜索工具或集成 Algolia DocSearch

**责任人**: TBD
**状态**: 💡 建议

---

### P3-2: 缺少在线文档站点

**建议**:
使用 VitePress / Docusaurus / MkDocs 构建在线文档站点

**责任人**: TBD
**状态**: 💡 建议

---

### P3-3: 缺少 PDF 版本文档

**建议**:
生成 PDF 版本供离线阅读和打印

**责任人**: TBD
**状态**: 💡 建议

---

### P3-4: 缺少交互式示例

**建议**:
添加交互式代码示例（CodeSandbox / StackBlitz 集成）

**责任人**: TBD
**状态**: 💡 建议

---

### P3-5: 缺少视频教程

**建议**:
制作核心功能视频教程

**责任人**: TBD
**状态**: 💡 建议

---

### P3-6: 缺少文档自动化检查

**建议**:
建立 CI/CD 流程，自动检查：
- Markdown 格式
- 链接有效性
- 代码示例可运行性
- 版本号一致性

**责任人**: TBD
**状态**: 💡 建议

---

## 📊 问题统计

| 等级 | 数量 | 已修复 | 进行中 | 待修复 |
|------|------|--------|--------|--------|
| P0 | 5 | 0 | 0 | 5 |
| P1 | 7 | 0 | 0 | 7 |
| P2 | 7 | 0 | 0 | 7 |
| P3 | 6 | 0 | 0 | 6 |
| **总计** | **25** | **0** | **0** | **25** |

---

## 🗓️ 修复时间线

### Week 1 (本周)
- ✅ 修复所有 P0 问题
- 🔄 开始 P1 问题修复

### Week 2 (下周)
- ✅ 完成 P1 问题修复
- 🔄 开始 P2 问题修复

### Week 3-4 (本月内)
- ✅ 完成 P2 问题修复
- 💡 评估 P3 建议可行性

---

**问题清单创建时间**: 2026-04-07
**下次更新**: 每日更新修复进度
**维护者**: Slaver E (Technical Writer)
