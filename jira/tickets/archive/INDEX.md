# JIRA Tickets 归档索引

**最后更新**: 2026-05-07  
**维护人**: Master

---

## EPIC 级别归档

| EPIC | 关闭时间 | 原因 | Tickets | 详细 |
|------|----------|------|---------|------|
| **EPIC-003** | 2026-05-01 | ✅ 正常完成 | 12 个 (9 done, 1 superseded, 2 blocked) | [查看详情](EPIC-003-closed-2026-05-01/closure-review.md) |
| **EPIC-005-v1** | - | 🔄 架构变更 | - | [查看详情](EPIC-005-v1/) |

### EPIC-003 完成概览

**交付成果**:
- Skill anatomy 标准化（7/3 节格式 + 自动化校验）
- CI 强制执行（anatomy-check.yml）
- Expert panel playbook（需求分析方法论）
- 治理脚本（PR size check / branch drift monitor / requirement validation）

**关键指标**:
- 8 个 PR 全部合并
- main↔miao 分支内容一致（0 diff）
- 60 位专家文件统一格式

**特殊状态 tickets**:
- TASK-230/232: `todo` 状态，依赖 blocked（回灌 task 未执行）
- TASK-236b: `blocked` 状态，等待 TASK-230/232 完成
- TASK-231: `superseded`，被 TASK-231a/231b 替代

---

## TASK 级别归档

### EPIC-005 完成任务

| TASK | 标题 | 完成时间 | PR | 详细 |
|------|------|----------|-----|------|
| TASK-426 | SHA256 校验 + setup.sh 安全加固 | 2026-05-07 | - | [查看详情](EPIC-005-completed/TASK-426.md) |
| TASK-427 | complete.ts 编译修复 | 2026-05-07 | - | [查看详情](EPIC-005-completed/TASK-427.md) |

### 架构决策废弃

| TASK | 原因 | 决策时间 | 详细 |
|------|------|----------|------|
| **TASK-501** | Node pkg 方案不支持 ESM | 2026-05-07 15:22 | [查看详情](EPIC-005-superseded/TASK-501.md) |

**决策背景**:
- 原计划：Rust + Node 双预编译（pkg 打包）
- 废弃原因：pkg 工具不支持 ESM，EKET 已全面 ESM 化无法降级
- 替代方案：Rust-only 预编译 + 本地 npm install Node 依赖
- 相关提交：`279137dc0` — refactor(ci): simplify to Rust-only prebuilt

### 散落已完成任务

**数量**: 28 tickets  
**状态**: done  
**归档目录**: [standalone-done/](standalone-done/)

**典型 tickets**:
- TASK-261, TASK-245, TASK-271, TASK-251, TASK-275, TASK-250
- TASK-274, TASK-244, TASK-270, TASK-259, TASK-249, TASK-279
- TASK-268, TASK-278, TASK-248, TASK-253, TASK-277, TASK-243
- ... (共 28 个)

---

## 已删除项目

### EPIC-001/feature (废弃示例)

**删除时间**: 2026-05-07  
**原因**: 疑似废弃示例项目，无 requirement-analysis.md，tickets 创建于 2026-04-09 后无活动

**删除内容**:
- FEAT-001: 图谱构建与社区检测
- FEAT-002: God Nodes 识别
- FEAT-003: 惊喜连接发现
- FEAT-004: 知识地图可视化
- FEAT-005: 社区摘要生成
- FEAT-006: 图谱更新自动化

---

## 归档规则

### EPIC 归档触发条件

1. **正常完成**: 所有 tickets done + 有 closure-review.md → `archive/EPIC-{ID}-closed-{date}/`
2. **废弃**: 无活动 >30 天 + 无 requirement-analysis.md → `archive/EPIC-{ID}-abandoned/`
3. **架构变更**: 方案替代 → `archive/EPIC-{ID}-v{N}/`

### TASK 归档规则

1. **EPIC 完成的 task**: 归档到 `archive/EPIC-{ID}-completed/`
2. **架构决策废弃**: 归档到 `archive/EPIC-{ID}-superseded/`
3. **散落 done task**: 归档到 `archive/standalone-done/`

### 特殊状态处理

| 状态 | 处理规则 |
|------|----------|
| `blocked` | 如 EPIC 已 CLOSED，评估 block 原因：<br>- 已解决 → 改 `done` + 随 EPIC 归档<br>- 持续 → 移出 EPIC，作为独立 task |
| `superseded` | 归档到对应 EPIC 的 superseded 目录 + 保留决策记录 |
| `todo` in CLOSED EPIC | 评估是否为未完成遗留：<br>- 遗留 → 移出 EPIC，提优先级<br>- 不重要 → 随 EPIC 归档 |

---

## 维护清单

### 月度检查（每月 1 日）

- [ ] 扫描 `jira/tickets/` 根目录 done tickets → 归档到 `standalone-done/`
- [ ] 检查已 CLOSED EPIC 是否有遗漏归档
- [ ] 更新 INDEX.md 统计数据

### 季度检查（每季度末）

- [ ] 审查 `archive/standalone-done/` tickets 是否有模式（可合并为 EPIC）
- [ ] 检查 superseded tickets 的架构决策是否需要更新到文档
- [ ] 清理超过 1 年的 archive 目录到 cold storage

---

## 统计数据

### 归档总览（截至 2026-05-07）

| 类别 | 数量 |
|------|------|
| 已归档 EPIC | 2 (EPIC-003, EPIC-005-v1) |
| 已归档 TASK (EPIC 完成) | 2 (TASK-426/427) |
| 已归档 TASK (架构废弃) | 1 (TASK-501) |
| 已归档 TASK (散落 done) | 28 |
| 已删除项目 | 1 (EPIC-001/feature, 6 tickets) |
| **总计归档 tickets** | **43** |

### 活跃项目（未归档）

| EPIC | 状态 | Tickets |
|------|------|---------|
| EPIC-004 | in_progress | 15 (1 done, 14 todo) |
| EPIC-005 | in_progress | 9 (1 ready, 6 todo, 2 在子目录) |

---

**建立时间**: 2026-05-07  
**维护状态**: ✅ 活跃  
**下次更新**: 2026-06-01
