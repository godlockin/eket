# EKET Release Policy

## 版本号规范

遵循 Semantic Versioning (semver.org)：`MAJOR.MINOR.PATCH[-stage]`

## 发布阶段

| 阶段 | 标识 | 含义 |
|------|------|------|
| Alpha | `-alpha` | 内部使用，API 随时可能破坏性变更 |
| Beta | `-beta` | 外部可试用，主要 API 趋于稳定 |
| Stable | 无后缀 | 生产可用，向后兼容保证 |

## 毕业条件

### Alpha → Beta 条件（✅ 已全部满足，v2.14.0-beta 起生效）

- ✅ 测试全绿（1199/1199）
- ✅ docs/ 结构清洁（conference-style 重组，TASK-090~093）
- ✅ confluence/memory/ 知识沉淀激活（TASK-095）
- ✅ 核心功能稳定（Master-Slaver、三级降级、断路器 TASK-076~083）

### Beta → Stable 条件

- [ ] sdk/ 类型与 node/src/types/ 共享（TASK-097 待评估）
- [ ] CHANGELOG 至少覆盖 3 个 minor 版本（✅ 已满足：2.12~2.14）
- [ ] 外部用户实际使用反馈收集（至少 1 个非内部用例）
- [ ] API 破坏性变更冻结期 ≥ 2 周无 breaking change

## CHANGELOG 维护规范

- 每个 PR 合并时在 `[Unreleased]` 节添加条目
- 发版时将 `[Unreleased]` 内容移至新版本节，附日期
- 条目分类：`Added / Changed / Deprecated / Removed / Fixed / Security`
- 关联 ticket 号（如 TASK-094）便于追溯
