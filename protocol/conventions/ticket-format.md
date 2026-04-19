# Convention: Ticket Format

**规范等级**: MUST
**适用**: `jira/tickets/**/*.md`

---

## 文件结构

每个 ticket 是一个 Markdown 文件，由**两部分**组成：

```
┌─────────────────────────────┐
│  元数据块（机器可读）        │  ← 本文档约束
├─────────────────────────────┤
│  章节正文（人类可读）        │  ← 章节名约束，内部自由
└─────────────────────────────┘
```

元数据块位于文件顶部，止于第一个 `---` 分隔线（或第一个 `## ` 二级标题）。
双引擎（Shell / Node）只解析元数据块；正文不做 schema 校验。

---

## 元数据块

### 行格式

```
**<Field Title>**: <value>
```

- 前缀 `**`、后缀 `**:`，字段名两侧双星号，冒号后单空格
- 每字段独占一行，不允许多字段挤在同一行
- `<value>` 可为空（保留 key）或为 `null` / `~`

### 字段顺序（stable order）

双引擎 diff 要求顺序稳定。新建 ticket 时**必须**按下表顺序；写入器仅替换值，**不重排**。

| # | Markdown 字段 | snake_case（shell / API） | Schema 字段 | 必填 |
|---|---|---|---|---|
| 1 | `ID` | `id` | `id` | ✓ |
| 2 | `Title` | `title` | `title` | ✓ |
| 3 | `Status` | `status` | `status` | ✓ |
| 4 | `Priority` | `priority` | `priority` | ✓ |
| 5 | `Importance` | `importance` | `importance` | ✓ |
| 6 | `Epic` | `epic` | `epic` | |
| 7 | `Assignee` | `assignee` | `assignee` | |
| 8 | `Branch` | `branch` | `branch` | |
| 9 | `Created At` | `created_at` | `created_at` | ✓ |
| 10 | `Updated At` | `updated_at` | `updated_at` | ✓ |
| 11 | `Estimated Hours` | `estimated_hours` | `estimated_hours` | |
| 12 | `Actual Hours` | `actual_hours` | `actual_hours` | |
| 13 | `Dependencies` | `dependencies` | `dependencies` | |
| 14 | `Tags` | `tags` | `tags` | |

`schemas/ticket.meta.schema.yml` 是字段集合的单一事实源（SSoT）。

### 可写字段白名单（post-creation）

`writeTicket` / `state_write_ticket` 可更新的字段**仅限**下表。两端实现（`lib/state/writer.sh` 与 `node/src/core/state/writer.ts`）必须字节等价地执行此白名单。

| 字段 | snake_case | 可写 | 说明 |
|------|-----------|------|------|
| id | `id` | ✗ | 不可变（创建即定） |
| created_at | `created_at` | ✗ | 不可变 |
| title | `title` | ✓ | |
| status | `status` | ✓ | 受状态机约束，须经 `transitionTicket` |
| priority | `priority` | ✓ | |
| importance | `importance` | ✓ | |
| epic | `epic` | ✓ | |
| assignee | `assignee` | ✓ | |
| branch | `branch` | ✓ | |
| updated_at | `updated_at` | ✓ | 每次写后自动更新（写入器负责） |
| estimated_hours | `estimated_hours` | ✓ | |
| actual_hours | `actual_hours` | ✓ | |
| tags | `tags` | ✓ | 数组序列化格式 `[a, b, c]` |
| dependencies | `dependencies` | ⚠ | 结构化字段，须经专用 API `writeDependencies`（待建） |

白名单外字段：**两端写入器都必须拒绝**，返回错误 `write_ticket: field not writable: <name>`。


### 命名映射

- **Shell / Node API 参数**用 snake_case：`state_write_ticket FEAT-001 estimated_hours 8`
- **Markdown 行标题**用 Title Case（每单词首字母大写，以空格分隔）
- 映射由写入器内部完成（`lib/state/writer.sh` 的 awk 与 `node/src/core/state/writer.ts` 的 `_replaceTicketField` 必须等价）

**禁止**在 Markdown 中使用 snake_case 字段名（如 `**estimated_hours**`），也**禁止**混入本地化别名（如 `**预估工时**`）。历史 ticket 使用中文字段的，迁移计划见 `docs/plans/ticket-migration.md`（待建）。

### 依赖字段（Dependencies）

`Dependencies` 之后可跟一个缩进的 YAML 块（非严格 YAML，形式固定）：

```markdown
**Dependencies**:
  blocks: [FEAT-003]
  blocked_by: [FEAT-001, TASK-012]
  related: []
  external: []
```

---

## 章节正文

### 必选章节

`## Requirements` 与 `## Acceptance Criteria` 为所有 ticket 类型共有。

### 可选章节（按出现顺序）

```
## Requirements
## Acceptance Criteria
## Analysis Report            ← Slaver 认领后产出，编码前必写
## Technical Design           ← 架构变更时补充
## Execution Log              ← Slaver 执行过程记录
## Test Results
## PR Submission
## Review Notes
## Retrospective              ← 完成后复盘
```

章节级别固定为 `## `（H2），子章节用 `### `。
写入器**只感知章节标题**来定位追加点；章节内部可自由书写。

---

## 完整示例

```markdown
**ID**: FEAT-042
**Title**: Slaver 断线自动重连
**Status**: in_progress
**Priority**: P1
**Importance**: high
**Epic**: EPIC-007
**Assignee**: alicemac-node-slaver-backend-a1b2c3
**Branch**: feature/FEAT-042-slaver-reconnect
**Created At**: 2026-04-10T09:00:00Z
**Updated At**: 2026-04-17T14:22:00Z
**Estimated Hours**: 6
**Actual Hours**: 2.5
**Dependencies**:
  blocks: []
  blocked_by: [FEAT-040]
  related: [TASK-031]
  external: []
**Tags**: [reliability, slaver]

---

## Requirements

当 Slaver 心跳连续 3 次失败时，应自动重连 Master 并恢复 in-flight ticket 的认领。

## Acceptance Criteria

- [ ] Slaver 进程 kill -STOP 10s 后恢复，心跳自动补齐
- [ ] 认领的 ticket 不被他人抢占
- [ ] audit.log 中出现 `lock_stale_takeover` → `lock_acquire` 配对记录

## Analysis Report

（Slaver 填写）

## Execution Log

- 2026-04-17T14:00:00Z | claimed by alicemac-node-slaver-backend-a1b2c3
- 2026-04-17T14:22:00Z | branch created
```

---

## CI 扫描

`tests/protocol-compliance/` 扫描：

1. 每个 ticket 包含全部**必填字段**
2. 字段顺序符合上表（允许可选字段缺席，不允许相对顺序错乱）
3. Markdown 字段名不得出现 snake_case 形式
4. `Status` 值在 `protocol/state-machines/ticket-status.yml` 定义的状态集合内

违反则 CI 拒合。
