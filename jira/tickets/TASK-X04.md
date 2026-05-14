# TASK-X04: Checkpoint 分支自动创建与推送

**ID**: TASK-X04  
**Epic**: EPIC-008  
**优先级**: P0  
**预估**: 6-8h  
**依赖**: None  
**Agent Type**: backend  
**Category**: 🔧 Core Logic

---

## Goal

扩展 ProgressTracker 实现自动 git commit + push checkpoint 到独立分支，使 Slaver 进度可从 remote 恢复。

---

## Acceptance Criteria

**AC-1**: 关键节点自动 git commit  
- Given: Slaver 调用 `checkpoint('analysis_done')`
- When: 触发同步写入
- Then: 自动 `git commit` 到 `checkpoint/<task-id>` 分支

**AC-2**: Push checkpoint 分支到 remote  
- Given: Checkpoint commit 成功
- When: 触发 git push
- Then: Remote 存在 `checkpoint/<task-id>` 分支

**AC-3**: Commit message 包含结构化元数据  
- Given: Checkpoint commit
- When: 查看 commit message
- Then: 包含 JSON metadata (phase / slaver_id / timestamp / AC)

**AC-4**: Git 操作失败不阻塞任务  
- Given: Git push 失败（网络中断）
- When: Slaver 继续执行
- Then: 记录警告日志，任务不中断

---

## Implementation Sketch

### 1. 扩展 ProgressTracker

```typescript
// node/src/core/progress-tracker.ts

export class ProgressTracker {
  private gitEnabled: boolean;
  private checkpointBranch: string;
  
  constructor(options: ProgressTrackerOptions) {
    // ... 现有初始化
    this.gitEnabled = options.gitEnabled ?? true;
    this.checkpointBranch = `checkpoint/${this.taskId}`;
  }
  
  async checkpoint(phase: string, metadata?: CheckpointMetadata): Promise<void> {
    // 1. 现有逻辑：写 progress.md
    await this.flushToFile();
    
    // 2. 新增：Git commit + push (非阻塞)
    if (this.gitEnabled && this.syncPhases.has(phase)) {
      await this.gitCommitCheckpoint(phase, metadata).catch(err => {
        console.warn(`[ProgressTracker] Git commit failed: ${err.message}`);
      });
    }
  }
  
  private async gitCommitCheckpoint(phase: string, metadata?: object): Promise<void> {
    // 1. 确保在 checkpoint 分支
    await this.ensureCheckpointBranch();
    
    // 2. Stage progress.md
    await execFile('git', ['add', this.progressFilePath]);
    
    // 3. Commit with structured message
    const message = this.buildCommitMessage(phase, metadata);
    await execFile('git', ['commit', '-m', message]);
    
    // 4. Push (non-blocking)
    this.gitPushCheckpoint().catch(err => {
      console.warn(`[ProgressTracker] Git push failed: ${err.message}`);
    });
  }
  
  private async ensureCheckpointBranch(): Promise<void> {
    // 检查分支是否存在，不存在则创建
    const { stdout } = await execFile('git', ['branch', '--list', this.checkpointBranch]);
    if (!stdout.trim()) {
      await execFile('git', ['checkout', '-b', this.checkpointBranch]);
    } else {
      await execFile('git', ['checkout', this.checkpointBranch]);
    }
  }
  
  private buildCommitMessage(phase: string, metadata?: object): string {
    const meta = {
      phase,
      slaver_id: this.slaverId,
      timestamp: Date.now(),
      ...metadata
    };
    return `checkpoint: ${phase}\n\n${JSON.stringify(meta, null, 2)}`;
  }
  
  private async gitPushCheckpoint(): Promise<void> {
    await execFile('git', [
      'push',
      '-u',
      'origin',
      this.checkpointBranch,
      '--force-with-lease'
    ]);
  }
}
```

### 2. 集成测试

```typescript
// node/tests/integration/checkpoint-git-sync.test.ts

describe('TASK-X04: Checkpoint Git Sync', () => {
  it('AC-1: auto commit on critical checkpoint', async () => {
    const tracker = new ProgressTracker({ taskId: 'TASK-999', slaverId: 'test' });
    await tracker.checkpoint('analysis_done');
    
    const { stdout } = await execFile('git', ['log', '--oneline', '-1']);
    expect(stdout).toContain('checkpoint: analysis_done');
  });
  
  it('AC-3: structured commit message', async () => {
    const tracker = new ProgressTracker({ taskId: 'TASK-999', slaverId: 'test' });
    await tracker.checkpoint('ac_complete', { ac_id: '1' });
    
    const { stdout } = await execFile('git', ['log', '--format=%B', '-1']);
    const metadata = JSON.parse(stdout.split('\n\n')[1]);
    expect(metadata).toMatchObject({
      phase: 'ac_complete',
      slaver_id: 'test',
      ac_id: '1'
    });
  });
  
  it('AC-4: git push failure does not throw', async () => {
    // Mock git push to fail
    jest.spyOn(childProcess, 'execFile').mockRejectedValueOnce(new Error('Network error'));
    
    const tracker = new ProgressTracker({ taskId: 'TASK-999', slaverId: 'test' });
    await expect(tracker.checkpoint('analysis_done')).resolves.not.toThrow();
  });
});
```

---

## Observability

**Logs**: 
- Git commit 成功: `[ProgressTracker] Git commit: checkpoint/TASK-XXX @ abc1234`
- Git push 失败: `[ProgressTracker] Git push failed: Network error`

**Metrics**:
- Git 操作耗时（target: < 500ms）
- Push 失败率（alert if > 10%）

---

## Rollback Plan

环境变量禁用 Git 集成:
```bash
ENABLE_GIT_CHECKPOINT=false eket task:claim TASK-XXX
```

---

## Test Strategy

**Unit**: ProgressTracker git 方法单独测试  
**Integration**: 完整流程（claim → checkpoint → verify branch）  
**Edge Case**: 
- Git 未初始化
- Remote 不存在
- Merge 冲突

---

**Blocked By**: None  
**Blocks**: TASK-X05, TASK-X06  
**Created**: 2026-05-14
---
status: review
assignee: slaver-010
branch: feature/TASK-X04-git-checkpoint
pr_created: 2026-05-14T19:45:00+08:00
ac_completed: 4/4
test_coverage: 8/8 (4 auto + 4 manual)
---
