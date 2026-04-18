# Round 21 实战经验 — 规则保持性与多 Agent 协作

**创建时间**: 2026-04-15
**来源**: EKET Round 21（TASK-031~034）+ Round 22 规划（TASK-035~041）
**适用范围**: 多 Agent 协作框架的规则遗忘防治

---

## 1. 核心发现：Agent 规则遗忘是系统性问题

### 现象

长时间运行的 Agent session（超过 ~100 轮对话）会逐渐忘记 CLAUDE.md 中的约束规则，导致：
- 越权操作（Slaver 修改验收标准、Master 写代码）
- 格式规范退化（PR 描述不附命令输出）
- 心跳检查停止（不再主动上报进度）

### 根本原因

Claude Code 的上下文窗口有限，随着对话增长，早期加载的 CLAUDE.md 内容的"相对权重"下降。规则文件越长，被"稀释"越快。

### 三层防御纵深

| 层级 | 方案 | 原理 | 效果预期 |
|------|------|------|---------|
| Layer 1 | CLAUDE.md 拆分瘦身 | 减少初始 token 消耗，降低稀释速度 | 延缓遗忘 |
| Layer 2 | 进度上报内嵌 mini-rules | 周期性在上下文中重新注入规则 | 运行时锚定 |
| Layer 3b | Hook 脚本（机器执行） | 不依赖 Agent 记忆，系统级强制 | 兜底保障 |

**关键洞察**：Layer 3b 是唯一 100% 可靠的方案，因为它不依赖 Agent 是否记得规则。但三层互补，任何单层都不够。

---

## 2. CLAUDE.md 拆分的执行经验

### 踩坑：`@引用` 是惰性加载

Claude Code 中 `@template/docs/MASTER-RULES.md` 的链接**不会自动展开**，Agent 需要主动读取才能获得内容。

**正确做法**：在 CLAUDE.md 中写**强制读取指令**，而非仅"按需加载"：
```
> 🔴 处理任何 ticket 前，必须先读 template/docs/MASTER-RULES.md（Master）或 SLAVER-RULES.md（Slaver）。
```

而非：
```
> 详细规则见 template/docs/MASTER-RULES.md
```

### 最佳实践：拆分前先备份

```bash
cp CLAUDE.md CLAUDE.md.bak  # 供 token 对比和回滚
```

注意：`.md` 文件默认被 `.gitignore` 中的 `*.bak` 规则忽略，无需手动 gitignore。

### 断链验证命令

```bash
# 验证 CLAUDE.md 中的所有文件引用路径存在
grep -oE 'template/docs/[A-Z-]+\.md' CLAUDE.md | while read f; do
  test -f "$f" && echo "OK: $f" || echo "BROKEN: $f"
done
```

---

## 3. Hook 脚本注入 workflow-engine.ts 的经验

### ESM + ts-jest 环境下的 mock 陷阱

**问题**：`jest.spyOn(module, 'functionName')` 对 ESM named export 无效，因为 ES Module binding 是只读的。

```
TypeError: Cannot assign to read only property 'runPrePrReviewHook' of object '[object Module]'
```

**解决方案 A（推荐）**：不要 spyOn 被测函数本身，改为验证其**副作用**（console.log、文件写入、状态变更）。

```typescript
// ✅ 通过 console.log spy 间接验证 hook 被调用
const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
await transitionStatus(id, 'ready', 'pr_review');
expect(spy.mock.calls.some(args => String(args[0]).includes('runPrePrReviewHook'))).toBe(true);
```

**解决方案 B**：将 hook 函数抽取为类方法或注入依赖，通过 DI 进行 mock（更复杂但更纯粹）。

### execSync vs execFileAsync

`execSync` 阻塞 Node.js 事件循环，生产代码应使用：
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
```

`execSync` 只在测试 stub 或一次性脚本中可接受。

### Dry-run 模式是必须的

hook 上线初期 **必须** 先开 dry-run，收集误拦截数据，再切换到真实阻断：
```bash
EKET_HOOK_DRYRUN=true  # 只记日志，不阻断
```
缺少 dry-run → hook bug 导致所有 PR 被误拦截 → 需要紧急回滚。

---

## 4. 多 Agent 并行实施的经验

### Slaver 被 Bash 权限阻断的处理

子 Agent（Slaver）在 worktree 模式下，Bash 工具可能被权限拒绝（`Permission denied`）。

**标准处理流程**：
1. Slaver 完成所有**文件编辑**（Read/Write/Edit 不受限制）
2. Slaver 报告"已完成文件变更，需要 Bash 执行以下命令"
3. Master（当前对话）接管 git 操作：add/commit/push

**教训**：不要让 Slaver 因 Bash 被拒就放弃，文件编辑本身是最重要的产出。

### 并行 Slaver 的文件冲突规避

本轮两个并行 Slaver 的冲突点：
- Slaver-A：`CLAUDE.md` + `template/docs/MASTER-RULES.md` + `SLAVER-RULES.md`（纯新增/编辑）
- Slaver-B：`node/src/core/workflow-engine.ts` + `node/src/types/index.ts`（代码修改）

唯一潜在冲突点：`types/index.ts`。解决方式：两人在不同 feature branch，合并时 conflict 仅 ≤ 5 行。

**原则**：并行 Slaver 的文件集合不得有交集，除非有明确的合并策略。

---

## 5. 复盘 Hard Rule 本身的价值

**问题**：为什么要强制复盘？

- Slaver 是被唤醒的无记忆节点，每次启动上下文是空的
- 如果经验只存在于对话上下文中，会话结束即消失
- 只有写入文件系统（`confluence/memory/`）才能成为组织记忆

**类比**：一个工程师每次解决问题后都写技术博客，团队的整体能力就在积累；每次解决完就忘，能力停留在个人。

**带来复利的关键路径**：
```
单次踩坑 → 写入 ticket 复盘 → 提炼通用经验 → 写入 confluence/memory/ → 下一个 Slaver 启动时读取
```

---

---

## 6. dynamic import() 永不同步抛出

**来源**: sprint-001 / TASK-049~053
**适用**: Node.js ESM/CJS 混合项目中检测可选依赖

### 问题

```typescript
// ❌ 错误假设：import() 失败会 throw
try {
  await import('optional-module');
  moduleAvailable = true;
} catch {
  moduleAvailable = false; // 实际上 import() 返回 Promise，rejected promise 需 await 才能 catch
}

// 更危险的版本（非 await）：
try {
  import('optional-module'); // Promise 被丢弃，catch 永远不执行
  moduleAvailable = true;
} catch {
  // 永远不会到这里
}
```

### 正确方案

```typescript
// ✓ 同步检测：使用 createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function isModuleAvailable(moduleName: string): boolean {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

// ✓ 异步检测（需 await）：
async function tryImport(moduleName: string) {
  try {
    return await import(moduleName);
  } catch {
    return null;
  }
}
```

**规则**：需要同步判断模块是否存在 → 必须用 `createRequire`。`import()` 只适合异步加载且必须 `await`。

---

## 7. Redis keyPrefix 双重叠加模式

**来源**: sprint-001 / backend Redis 集成
**适用**: 所有使用 ioredis `keyPrefix` 配置的项目

### 问题

```typescript
// ioredis 配置
const redis = new Redis({ keyPrefix: 'eket:' });

// ❌ 常量中已包含前缀
const MASTER_LOCK_KEY = 'eket:master:lock';
await redis.set(MASTER_LOCK_KEY, '1');
// 实际写入的 key: "eket:eket:master:lock" ← 双重叠加！
```

### 正确方案

```typescript
// ✓ 常量只含语义部分，不含 keyPrefix 值
const MASTER_LOCK_KEY = 'master:lock';
await redis.set(MASTER_LOCK_KEY, '1');
// 实际写入的 key: "eket:master:lock" ✓

// 或者不使用 keyPrefix，在常量中明确包含
const redis = new Redis(); // 无 keyPrefix
const MASTER_LOCK_KEY = 'eket:master:lock'; // key 自带命名空间
```

**规则**：使用 `keyPrefix` 时，所有 key 常量必须**不含** keyPrefix 值。代码 review checklist 中加入此检查项。

---

**参见**：
- [MULTI-AGENT-COLLAB-LESSONS.md](MULTI-AGENT-COLLAB-LESSONS.md) — 多智能体协作经验
- [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md) — EKET 特有卫生规则
- [DOC-DEBT-CLEANUP.md](DOC-DEBT-CLEANUP.md) — 文档债清理方法论
