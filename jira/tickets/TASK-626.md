# TASK-626: Pre-Task 自动检查脚本

**优先级**: P0  
**状态**: `ready`  
**预估工时**: 2h  
**父级**: EPIC-006  
**角色**: backend_dev

---

## 1. 任务描述

创建 Master 分配任务前的自动检查脚本，避免重复任务和依赖缺失。

**背景**: 
- TASK-611 重复（README.md 已存在）
- TASK-613 依赖缺失（templates/ 已删除）

---

## 2. 验收标准

- [ ] 创建 `scripts/master-pre-task-check.sh <ticket-id>`
- [ ] 检查项：
  1. Ticket 文件存在性
  2. 依赖文件/目录存在性（从 AC 提取路径）
  3. 重复任务检测（相同标题的 ticket）
  4. 文件归属预检（新建文件路径合规）
- [ ] 输出格式：
  ```
  ✅ Pre-task check passed
  或
  ❌ 重复任务：README.md 已存在
  ⚠️  可能重复：TASK-999 标题相似
  ```
- [ ] Exit code: 0=通过, 1=致命错误, 2=警告（可继续）
- [ ] 集成到 `node/src/commands/task-create.ts`
- [ ] 单元测试：`node/tests/master-pre-task-check.test.ts`

---

## 3. 实现

见 `confluence/memory/solutions/master-failure-defense-system.md` Layer 1

关键逻辑：
```typescript
// node/src/commands/task-create.ts
async function createTask(title: string) {
  // 运行 pre-check
  const checkResult = await runPreTaskCheck(ticketId);
  
  if (checkResult.fatal) {
    console.error("❌ Pre-task check failed:", checkResult.reason);
    process.exit(1);
  }
  
  if (checkResult.warnings.length > 0) {
    console.warn("⚠️  Warnings:", checkResult.warnings);
    // 记录到审计日志
  }
  
  // 继续创建任务...
}
```

---

## 4. 依赖

**阻塞项**: 无  
**被阻塞**: TASK-629（审计日志，需要此脚本产出）

---

**创建时间**: 2026-05-11  
**创建者**: Master  
**触发**: 重复任务分配失误
