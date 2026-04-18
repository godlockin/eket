# Convention: Error Handling

**规范等级**: MUST
**适用**: `lib/state/**`、`node/src/core/state/**`，以及所有调用这些模块的代码

---

## 总原则

1. **永不静默吞错**：每个 `catch` 块要么记录上下文，要么重抛类型化错误
2. **跨引擎前缀对齐**：Shell 与 Node 对同一错误类产生**相同前缀**，便于 `grep` 审计
3. **用退出码 / 错误类表达类别**，不用字符串猜

---

## Shell 退出码

| 码 | 含义 | 触发示例 |
|---|---|---|
| 0 | OK | 成功 |
| 1 | 业务错误 | ticket 不存在、字段缺失、状态不可转移 |
| 2 | Schema 校验失败 | 非法 priority / status / ticket id |
| 3 | 锁相关 | `flock` 超时、持锁接管失败 |
| 4 | FS 错误 | 权限拒绝、磁盘满、路径不可写 |
| 5 | 协议版本不兼容 | `protocol/VERSION` MAJOR 不匹配 |
| 10+ | 保留 | 子模块自定义（暂未启用） |

### stderr 格式

```
<module>: <message>
```

- `<module>` 与文件名或模块名对齐：`schema`、`lock`、`write_ticket`、`heartbeat`、`audit` …
- 单行；多行信息拼成一条或多条各自带前缀
- **禁止**只打 `"error"` 或 emoji 之类无前缀消息

示例（均来自现有代码）：

```
schema: invalid ticket id 'feat-1'
schema: invalid transition analysis -> done
write_ticket: field not found: Priority in jira/tickets/FEAT-042.md
LOCK_TIMEOUT: ticket:FEAT-042
```

### 脚本边界规则

- 脚本内部捕获后可 `return <code>`；脚本入口（`main`）用 `exit <code>`
- `set -eo pipefail` 必开；确需忽略错误处显式 `|| true` 并注释原因
- 向上游传递错误：`cmd || { echo "module: ..." >&2; return N; }`

---

## Node 错误类层级

```
Error
└── EketError               (base, 本协议抛出的所有错误)
    ├── SchemaError         (已存在 — node/src/core/state/schema.ts)
    ├── LockError           (锁超时 / 接管失败)
    ├── StateError          (状态转移非法、ticket 不存在、字段缺失)
    ├── FsError             (包装 NodeJS.ErrnoException，带 path / op)
    └── ProtocolVersionError (MAJOR 不匹配)
```

### 字段约定

```typescript
abstract class EketError extends Error {
  abstract readonly kind: string;        // 对应退出码的字符串标签
  readonly cause?: unknown;              // 原始错误
  readonly context?: Record<string, unknown>;
}
```

- `kind` 用作 grep key，命名与 shell `<module>` 列对齐：`schema` / `lock` / `state` / `fs` / `protocol_version`
- `message` 首段必须是与 Shell 等价的单行文本（同前缀、同关键字段值）

### Result<T> 跨命令边界

CLI 命令层（`node/src/commands/**`）与外部 I/O 层（HTTP handler、subprocess）**禁止**直接向上抛 `EketError`。应用 `Result<T, E>`：

```typescript
export type Result<T, E = EketError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

命令处理器的责任：

1. 内部可抛可捕获
2. 出口前把 `EketError` 翻译为 `Result`
3. `Result.error.message` 原样映射到 stderr（前缀保持）
4. 退出码按下表映射 `kind → code`（与 Shell 表一致）

| `kind` | exit code |
|---|---|
| `schema` | 2 |
| `lock` | 3 |
| `state` | 1 |
| `fs` | 4 |
| `protocol_version` | 5 |

---

## 永不静默吞错

**反例**：

```typescript
try {
  await writeTicket(id, 'status', 'done');
} catch {
  /* 忽略 */        // ❌
}
```

```bash
state_write_ticket "$id" status done 2>/dev/null || true   # ❌
```

**正确**：必须二选一。

1. **记录上下文后重抛（类型化）**

   ```typescript
   try {
     await writeTicket(id, 'status', 'done');
   } catch (e) {
     logger.error({ op: 'finalize', id, cause: (e as Error).message });
     throw e;
   }
   ```

2. **归约为业务结果**（仅在边界）

   ```typescript
   try {
     await writeTicket(id, 'status', 'done');
     return { ok: true, value: undefined };
   } catch (e) {
     if (e instanceof SchemaError) return { ok: false, error: e };
     throw e; // 未知错误继续上抛
   }
   ```

---

## 跨引擎对齐

**硬性**：以下错误场景两侧必须产生**相同前缀 + 相同关键字**，供 `audit.log` 与运行时日志的联合检索：

| 场景 | 必含关键字 |
|---|---|
| 非法状态转移 | `schema: invalid transition <current> -> <next>` |
| 非法 ticket id | `schema: invalid ticket id '<id>'` |
| Ticket 不存在 | `ticket not found: <id>` |
| 字段缺失 | `write_ticket: field not found: <field> in <file>` |
| 锁超时 | `LOCK_TIMEOUT: <resource>` |

双引擎实现若有偏差，以 **Shell 现有文案** 为基准（Node 侧有偏离的需发 PR 修正；见本次评审发现的 `audit.log` pipe 转义不一致）。

---

## CI 扫描

`tests/protocol-compliance/` 扫描：

1. `lib/state/**/*.sh`：无 `2>/dev/null || true` 不带注释说明
2. `node/src/core/state/**/*.ts`：无空 `catch {}`、无 `catch (_) {}`
3. 双引擎样例错误跑对照测试（`tests/dual-engine/`），stderr 前缀必须一致

违反则 CI 拒合。
