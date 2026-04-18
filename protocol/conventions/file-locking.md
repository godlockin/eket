# Convention: File Locking

**规范等级**: MUST
**适用**: 所有对共享状态目录的写入操作

---

## 规则

**禁止**无锁并发写入同一状态文件。**必须**使用 `flock` (Shell) 或 `proper-lockfile` (Node)。

### Shell

```bash
state_with_lock() {
  local resource="$1"      # e.g. "ticket:FEAT-001"
  local lockfile="${EKET_ROOT}/.eket/locks/${resource//:/_}.lock"
  shift

  mkdir -p "$(dirname "$lockfile")"

  (
    # fd 200 绑定锁文件
    exec 200>"$lockfile"
    # 最多等 5 秒，失败返回 1
    flock -w 5 200 || {
      echo "LOCK_TIMEOUT: $resource" >&2
      return 1
    }
    # 锁内执行
    "$@"
  )
  # 子 shell 退出自动释放锁
}
```

### Node

```typescript
import lockfile from 'proper-lockfile';

export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = `${process.env.EKET_ROOT}/.eket/locks/${resource.replace(/:/g, '_')}.lock`;
  const release = await lockfile.lock(lockPath, {
    stale: 10_000,
    retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 }
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
```

---

## 锁粒度

| 资源类型 | 锁 key |
|---------|--------|
| 单个 ticket | `ticket:<ticket-id>` |
| Ticket 索引 | `ticket-index` |
| Master 选举 | `master-election` |
| Node 注册表 | `node-registry` |
| 消息队列 | `message-queue:<queue-name>` |
| Agent inbox | `mailbox:<agent-id>` |

**避免**全局大锁；按资源细粒度。

---

## 锁超时策略

- **默认等待**: 5 秒
- **超时后**: 返回错误，**不强制抢锁**
- **Stale 锁检测**: 10 秒无更新视为死锁，允许接管
- **禁止**: 无限等待 / 忽略锁失败继续写

---

## 跨引擎兼容

Shell 用 `flock(2)`，Node 用 `proper-lockfile`。两者在**同一 lockfile**上是否兼容？

**答**：不完全兼容。`flock(2)` 是内核咨询锁，`proper-lockfile` 是基于 `mkdir` 原子性的应用锁。

**约定**：双方**使用同一 lockfile 路径**，但**不共用锁机制**。改为：
1. 获取锁的进程先写 `<lockfile>.pid`（内含 PID + engine + timestamp）
2. 尝试锁的进程先看 `.pid` 文件，判断持锁者是否还活着
3. Stale 则接管

详细实现见 `lib/state/lock.sh` 和 `node/src/core/state/lock.ts`（Task 0.3 / 0.4）。

---

## 例外

**允许**无锁的场景：
1. 追加写入日志（每次 `open(O_APPEND)` 内核保证单次 write 原子）
2. Node-only 内部缓存（非共享目录）
3. 只读操作
