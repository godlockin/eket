# Convention: Audit Log Format

**规范等级**: MUST
**适用**: `shared/audit.log`，由 `lib/state/audit.sh` 与 `node/src/core/state/audit.ts` 写入

---

## 行格式

```
<timestamp> | <actor> | <engine> | <op> | <target> | <details>
```

六列、管道 `|` 分隔、**两侧各一个空格**（即 ` | `）。

| 列 | 含义 | 取值 |
|---|---|---|
| `timestamp` | ISO8601 UTC，**无毫秒** | `2026-04-17T14:22:07Z` |
| `actor` | 执行写操作的 node_id | 见 `conventions/node-id.md` |
| `engine` | 写入引擎 | `shell` \| `node` |
| `op` | 操作类型 | 见下表 |
| `target` | 操作对象标识 | `FEAT-042` / `ticket:FEAT-042` / `msg_20260417_001` … |
| `details` | 自由文本 | `key=value`，多对以空格分隔，`\|` 转义 |

### 严格规则

- 单行，**以 `\n` 结束**；不允许跨行 details
- UTF-8 无 BOM
- 每列原文**不得**包含字面 `|`；如有，必须转义为 `\|`
- 每列两侧空格**不**参与字段内容（读者先按 ` | ` 切分）
- 时间戳精度到秒，不加毫秒（两侧均已实现 `.replace(/\.\d+Z$/, 'Z')`）

---

## op 标准词汇

下列 `op` 为 MINOR 版本认可的词表。新增 op 需 bump MINOR 并同步两侧实现。

| `op` | 含义 | 典型 target |
|---|---|---|
| `write_ticket` | 修改 ticket 元数据字段 | `<TICKET-ID>` |
| `transition` | ticket 状态转移 | `<TICKET-ID>` |
| `heartbeat` | 心跳写入 | `<instance-id>` |
| `enqueue_message` | 消息入队 | `<queue>:<msg-id>` |
| `dequeue_message` | 消息出队 | `<queue>:<msg-id>` |
| `register_node` | 节点注册 | `<node-id>` |
| `submit_pr` | PR 请求文件落地 | `<TICKET-ID>` |
| `lock_acquire` | 锁成功获取 | `<resource>` |
| `lock_release` | 锁主动释放 | `<resource>` |
| `lock_stale_takeover` | stale 锁被接管 | `<resource>` |

---

## 写入规则

- 使用 `O_APPEND`（Shell `>>`，Node `appendFile`）；**禁止**先读后整文覆写
- 不加文件锁（append 单次 write 内核原子）
- **Phase 0 不做滚动（rotation）**；归档策略在 `docs/ops/log-rotation.md`（未来）
- 目录 `shared/` 必须存在；写入器负责 `mkdir -p`
- 写入失败**不得**阻塞调用方的业务写入；失败需 stderr 记录但不抛（审计是旁路）

---

## 管道转义

`details` 列是自由文本，可能携带 `|`。两侧实现**必须**在落地前把 `|` 替换为 `\|`：

```
# 原始 details:  field=note msg=ready|go
# 实际写入:     field=note msg=ready\|go
```

> ⚠ **实现状态（2026-04-17）**：`node/src/core/state/audit.ts` 已实现转义；`lib/state/audit.sh` **未实现**，属于待修 bug，不影响格式约定本身。修复见 TASK-0xx。

读取器（包括 `grep`、`awk -F ' | '`）看到 `\|` 视作字面 `|`。

---

## 3 行示例

```
2026-04-17T14:22:07Z | alicemac-node-master-a1b2c3 | node | transition | FEAT-042 | status=in_progress from=ready
2026-04-17T14:22:08Z | serverbox-shell-slaver-frontend-7d8e9f | shell | write_ticket | FEAT-042 | assignee=serverbox-shell-slaver-frontend-7d8e9f
2026-04-17T14:25:13Z | ci-runner-shell-bot-cron-5e6f7g | shell | submit_pr | FEAT-042 | note=blocked\|retry msg=needs_review
```

切列：

```bash
awk -F ' \\| ' '{print $3, $4, $5}' shared/audit.log
# node transition FEAT-042
# shell write_ticket FEAT-042
# shell submit_pr FEAT-042
```

---

## 查询模式

```bash
# 本 node 最近 20 条
grep -F "| ${EKET_NODE_ID} |" shared/audit.log | tail -n 20

# 某 ticket 的完整变更流水
grep -F "| FEAT-042 |" shared/audit.log

# 跨引擎比对（应两侧操作交错出现）
awk -F ' \\| ' '$4=="transition"' shared/audit.log
```

---

## CI 扫描

`tests/protocol-compliance/`：

1. `shared/audit.log` 每行匹配 `^[0-9T:Z-]+ \| [^|]+ \| (shell|node) \| [a-z_]+ \| [^|]+ \| .*$`
2. `op` 列在标准词表内
3. 双引擎端到端跑同一序列，审计日志去除 `timestamp` 与 `engine` 列后**必须逐行相等**

违反则 CI 拒合。
