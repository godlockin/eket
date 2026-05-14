# TASK-X02: Slaver 集成 Checkpoint 调用

**ID**: TASK-X02  
**Epic**: EPIC-008  
**优先级**: P0  
**Agent Type**: `backend_dev`  
**预估工时**: 8 小时  
**状态**: `ready`

---

## 任务描述

在现有 Slaver 执行流程中集成 ProgressTracker，在关键节点调用 `checkpoint()`，实现进度自动记录。

**改动范围**: `node/src/core/slaver.js`（约 50 行新增）

---

## 验收标准

**AC-1: Slaver 初始化 ProgressTracker**
- **Given**: Slaver 领取 TASK-TEST-001
- **When**: 执行 `slaver.executeTask('TASK-TEST-001')`
- **Then**: 自动创建 `ProgressTracker` 实例，并在退出时调用 `tracker.close()`

**AC-2: 分析阶段 checkpoint**
- **Given**: Slaver 完成需求分析
- **When**: 写入 `analysis-report.md` 后
- **Then**: 调用 `checkpoint('analysis_done', { artifact: 'analysis-report.md' })`，`progress.md` 显示 ✅

**AC-3: AC 级别 checkpoint**
- **Given**: Slaver 实现完成 AC-1（验收标准 1）
- **When**: 对应测试通过后
- **Then**: 调**AC-4: PR 提交前 checkpoint**
- **Given**: Slaver 所有 AC 完成，准备提交 PR
- **When**: 调用 `submitPR()` 前
- **Then**: 调用 `checkpoint('ready_for_pr')`（同步写，防崩溃丢失）

**AC-5: 错误处理不阻塞主流程**
- **Given**: Checkpoint 写入失败（模拟磁盘满）
- **When**: Slaver 继续执行
- **Then**: 打印 warning 日志，但任务继续（不抛异常中断）

---

## 技术要求

### 改动位置
```javascript
// node/src/core/slaver.js
class Slaver {
  async executeTask(taskId) {
    const tracker = new ProgressTracker(taskId, this.slaverId);  // 新增

    try {
      await tracker.checkpoint('task_claimed');  // 新增
      
      // 原有逻辑
      const analysis = await this.analyze(taskId);
      await tracker.checkpoint('analysis_done', {  // 新增
        artifact: `jira/tickets/${taskId}/analysis-report.md`
      });

      const design = await this.design(analysis);
      await tracker.checkpoint('design_done');  // 新增

      for (const ac of analysis.acceptanceCriteria) {
        const result = await this.implementAC(ac);
        await tracker.checkpoint(`ac_${ac.id}_done`, {  // 新增
          files: result.modifiedFiles,
          tests: result.testsPassed ? '✅' : '❌'
        });
      }

      await tracker.checkpoint('ready_for_pr');  // 新增
      await this.submitPR(taskId);

    } finally {
      await tracker.close();  // 清理 interval
    }
  }
}
```

### Checkpoint 节点清单

| 阶段 | Phase 名称 | 同步写 | Metadata |
|------|-----------|--------|----------|
| 领取任务 | `task_claimed` | ❌ | 无 |
| 分析完成 | `analysis_done` | ✅ | `{ artifact: 'path' }` |
| 设计完成 | `design_done` | ✅ | `{ artifact: 'design-decisions.md' }` |
| AC-N 完成 | `ac_N_done` | ❌ | `{ files: [...], tests: '✅/❌' }` |
| 测试通过 | `tests_passed` | ✅ | 无 |
| 准备 PR | `ready_for_pr` | ✅ | 无 |

---

## 实现指导

### 错误处理模式
```javascript
async checkpoint(phase, metadata) {
  try {
    await this.tracker.checkpoint(phase, metadata);
  } catch (error) {
    // 不阻塞主流程
    console.warn(`[Slaver] Checkpoint failed (non-critical): ${error.message}`);
    // 记录到专门日志供 Master 监控
    await appendLog('.eket/logs/checkpoint-failures.log', {
      timestamp: new Date().toISOString(),
      taskId: this.taskId,
      phase,
      error: error.message
    });
  }
}
```

### 测试时禁用 checkpoint
```javascript
// 环境变量控制
const ENABLE_CHECKPOINT = process.env.ENABLE_PROGRESS_TRACKING !== 'false';

if (ENABLE_CHECKPOINT) {
  this.tracker = new ProgressTracker(taskId, slaverId);
} else {
  this.tracker = new NoOpTracker();  // 空实现，所有方法都是空函数
}
```

---

## 测试策略

### 集成测试（必须）
```javascript
// node/tests/integration/slaver-checkpoint.test.js
describe('Slaver Checkpoint Integration', () => {
  it('should write checkpoints during task execution', async () => {
    const slaver = new Slaver('slaver-test-001');
    await slaver.executeTask('TASK-TEST-001');
    
    const progressPath = 'jira/tickets/TASK-TEST-001/progress.md';
    const content = await fs.readFile(progressPath, 'utf-8');
    
    expect(content).toContain('- [x] Analysis');
    expect(content).toContain('- [x] Design');
    expect(content).toContain('- [x] AC-1');
  });

  it('should not crash when checkpoint fails', async () => {
    // 模拟磁盘满
    jest.spyOn(fs, 'writeFile').mockRejectedValue(new Error('ENOSPC'));
    
    const slaver = new Slaver('slaver-test-002');
    await expect(slaver.executeTask('TASK-TEST-002')).resolves.not.toThrow();
  });
});
```

### 手动验证
1. 运行 Slaver 执行一个真实任务
2. 每 10s 用 `tail -f jira/tickets/<id>/progress.md` 监控
3. 验证每个阶段完成后进度文件立即更新

---

## 可观测性

**日志**:
```javascript
console.log(`[Slaver] Checkpoint: ${phase} (task: ${taskId})`);
console.warn(`[Slaver] Checkpoint failed but continuing: ${error.message}`);
```

**失败日志位置**:
`.eket/logs/checkpoint-failures.log`（JSON Lines 格式）

---

## 回滚方案

若 checkpoint 调用导致 Slaver 性能下降 > 10%：
```javascript
// 快速禁用
export ENABLE_PROGRESS_TRACKING=false
npm start
```

永久回滚：
```bash
git revert <commit-hash>  # 回退 TASK-X02 改动
```

---

## 依赖关系

**Blocked by**: TASK-X01（ProgressTracker 实现）  
**Blocks**: TASK-X03（verify 命令需要 progress.md 存在）

---

## 参考资料

- [专家评审文档](../../jira/epics/EPIC-008/expert-review-architecture.md) §后端工程师 - 装饰器模式
- [SLAVER-RULES.md](../../template/docs/SLAVER-RULES.md) §5 进度报告机制

---

**创建时间**: 2026-05-14 15:45  
**更新时间**: 2026-05-14 15:45  
**状态历史**:
- 2026-05-14 15:45 — 创建，状态 `ready`（依赖 TASK-X01）
