# Convention: Atomic Write

**规范等级**: MUST
**适用**: 所有 `[shared-core]` 模块对共享 FS 状态的写入

---

## 规则

**禁止**直接覆写状态文件。**必须**使用 tmp + rename 原子写入。

### Shell

```bash
atomic_write() {
  local target="$1"
  local content="$2"
  local tmp="${target}.tmp.$$"

  # 写临时文件到同一挂载点（保证 rename 原子）
  printf '%s' "$content" > "$tmp"

  # POSIX rename 在同一文件系统下原子
  mv "$tmp" "$target"
}
```

### Node

```typescript
import { writeFile, rename } from 'fs/promises';
import { join, dirname, basename } from 'path';

export async function atomicWrite(target: string, content: string) {
  const tmp = join(dirname(target), `.${basename(target)}.tmp.${process.pid}`);
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, target);
}
```

或用 `proper-lockfile` + `write-file-atomic` 成熟库。

---

## 为什么

未原子写入时可能的故障：
1. 进程崩溃 → 半写文件 → 读方解析错误
2. 并发写 → 后写覆盖前写，丢数据
3. 读方读到半写内容 → 行为不一致

原子写入保证：**读方永远看到完整的旧版本或完整的新版本，绝不看到中间状态**。

---

## 例外

**允许**非原子写入的场景（需显式标注 `// allow: non-atomic`）：
1. 日志追加（`appendFile`，按行追加天然原子）
2. 初始化脚手架（`init-wizard.ts` 首次创建空文件）
3. 不涉及协同的 Node 内部缓存（不在共享 FS 目录）

---

## CI 扫描

在 `tests/protocol-compliance.test.sh` 中：

```bash
# 扫描 [shared-core] 模块是否有直接覆写
# 允许模式: atomic_write / state_write_* / writeFileAtomic
# 禁止模式: 直接 cat >  / echo >  / fs.writeFile  (在共享目录下)
```

违反则 CI 拒合。
