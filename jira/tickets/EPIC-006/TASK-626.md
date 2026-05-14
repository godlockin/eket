# TASK-626: Pre-Task 自动检查脚本

**优先级**: P0  
**状态**: `done`  
**预估工时**: 2h  
**实际工时**: 1h  
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

---

## 实施记录

**完成时间**: 2026-05-11 21:15  
**分支**: `feature/TASK-626`  
**提交**: `feat(TASK-626): Pre-Task 自动检查脚本`

**产出**:
1. `scripts/master-pre-task-check.sh` - Shell 检查脚本（114行）
   - 4 大检查模块（ticket/依赖/重复/归属）
   - 颜色输出 + 结构化日志
   - Exit code: 0/1/2

2. `node/src/commands/task-create.ts` - TypeScript 集成
   - `runPreTaskCheck()` 函数
   - `spawnSync` 调用（避免 execFileNoThrow bug）
   - 在 ticket 生成后自动执行

3. `node/tests/master-pre-task-check.test.ts` - 单元测试
   - 11 个测试用例全通过
   - 覆盖率：基础检查/依赖/重复/归属/集成

**技术亮点**:
- 使用 `spawnSync` 替代 `execFileNoThrow`（精确捕获 exit 2）
- 临时文件安全处理（trap cleanup）
- Regex 提取文件路径（支持反引号语法）
- 测试环境完整隔离（.test-tmp-pre-check/）

**测试结果**:
```
✓ 11 passed (master-pre-task-check.test.ts)
✓ 1562 passed (全项目测试)
```

**下一步**: 等待 Master PR review
