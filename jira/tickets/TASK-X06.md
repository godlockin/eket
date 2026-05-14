# TASK-X06: Slaver Resume 恢复机制

**ID**: TASK-X06  
**Epic**: EPIC-008  
**优先级**: P0  
**预估**: 6h  
**依赖**: TASK-X04, TASK-X05 (需 checkpoint 分支 + 读取逻辑)  
**Agent Type**: backend  
**状态**: ready

---

## Goal

新 Slaver 接手任务时，通过 `eket task:claim <task-id> --resume` 从 checkpoint 分支恢复进度，自动跳过已完成 AC，< 5min 上手继续工作。

---

## Context

**M1 现状**: `task:claim` 仅分配 task，无 resume 逻辑  
**X04/X05 输出**: Checkpoint 分支已存在，包含 progress.md + commit history  
**M2 目标**: 新 Slaver resume 任务 → 显示已完成 AC → 继续未完成部分

**使用场景**:
1. Slaver-A 超时，Slaver-B 接手（resume 避免重做分析）
2. Master 手动重派任务（读 checkpoint 继续）
3. Slaver 自愿 claim 未完成任务（快速恢复上下文）

---

## Acceptance Criteria

### AC-1: `--resume` flag checkout checkpoint 分支
**Given**: TASK-640 有 checkpoint 分支 `origin/checkpoint/TASK-640`  
**When**: Slaver 运行 `eket task:claim TASK-640 --resume`  
**Then**:
- Checkout `checkpoint/TASK-640` 分支（从 remote fetch）
- 显示消息：`Resuming from checkpoint (last update: 2h ago)`
- 若 checkpoint 不存在，提示 `⚠️ No checkpoint found, starting fresh`

**验证**:
```bash
# Setup: 创建 checkpoint 分支
git checkout -b checkpoint/TASK-640
echo "test" > jira/tickets/TASK-640/progress.md
git add . && git commit -m "Checkpoint: TASK-640 - analysis_done"
git push origin checkpoint/TASK-640

# Test
eket task:claim TASK-640 --resume

# 验证当前分支
git branch --show-current
# 输出: "checkpoint/TASK-640"
```

---

### AC-2: 读取并显示已完成 AC 列表
**Given**: Checkpoint 的 progress.md 包含：
```markdown
## Completed
- [x] Analysis (2h) — commit: abc123
- [x] Implement AC-1 — files: src/auth.rs, test: ✅
```
**When**: Slaver 运行 `eket task:claim TASK-640 --resume`  
**Then**:
- 解析 progress.md
- 显示已完成 AC：
  ```
  ✅ Completed:
     - Analysis (2h ago)
     - AC-1 (files: src/auth.rs)

  ⏳ Remaining:
     - AC-2: Implement input validation
     - AC-3: Add error handling
  ```

**验证**:
```bash
eket task:claim TASK-640 --resume | grep "✅ Completed"
# 输出包含 AC-1
```

---

### AC-3: 交互询问继续 or 重新分析
**Given**: Slaver resume 后看到已完成 AC  
**When**: 显示恢复上下文后  
**Then**:
- 询问用户：
  ```
  Resume strategy:
  [1] Continue from last checkpoint (recommended)
  [2] Re-analyze task (if checkpoint outdated)
  [3] Abort

  Your choice:
  ```
- 选 1：跳过已完成 AC，直接执行剩余
- 选 2：重新运行分析阶段（覆盖 checkpoint）
- 选 3：退出，不 claim

**验证**:
```bash
# Mock input "1"
echo "1" | eket task:claim TASK-640 --resume

# 验证跳过 analysis 阶段
# (Integration test: 验证 ProgressTracker 初始化时 completedPhases 包含 'analysis')
```

---

### AC-4: ProgressTracker 初始化跳过已完成阶段
**Given**: Resume 后 Slaver 选择 "Continue from checkpoint"  
**When**: ProgressTracker 初始化  
**Then**:
- 读取 progress.md 的 `completedPhases`
- 初始化 ProgressTracker 时预填：
  ```typescript
  const tracker = new ProgressTracker({
    taskId: 'TASK-640',
    slaverId: 'slaver-new',
    resumeFrom: {
      completedPhases: ['analysis', 'ac_1'],
      currentPhase: 'ac_2',
      checkpoints: [/* ... */],
    },
  });
  ```
- 后续调用 `checkpoint('analysis_done', {})` → 自动跳过（已完成）

**验证**:
```typescript
// Unit test
const tracker = new ProgressTracker({
  taskId: 'TASK-TEST',
  slaverId: 'test-slaver',
  resumeFrom: {
    completedPhases: new Set(['analysis']),
    currentPhase: 'implementation',
    checkpoints: [],
  },
});

await tracker.checkpoint('analysis_done', {}); // Should no-op
expect(tracker.getSnapshot().checkpoints).toHaveLength(0); // Not re-recorded
```

---

## Implementation Sketch

### 1. 扩展 task:claim 命令

```typescript
// node/src/commands/task-claim.ts

export function registerTaskClaim(program: Command): void {
  program
    .command('task:claim <task-id>')
    .description('Claim a task (optionally resume from checkpoint)')
    .option('--resume', 'Resume from existing checkpoint')
    .action(async (taskId: string, options: { resume?: boolean }) => {
      if (options.resume) {
        await resumeTask(taskId);
      } else {
        await claimTaskFresh(taskId);
      }
    });
}

async function resumeTask(taskId: string): Promise<void> {
  console.log(chalk.cyan(`\n🔄 Resuming task: ${taskId}...\n`));

  // 1. Check checkpoint branch existence
  const checkpointBranch = `checkpoint/${taskId}`;
  const checkpointExists = await checkCheckpointBranch(checkpointBranch);

  if (!checkpointExists) {
    console.log(chalk.yellow('⚠️  No checkpoint found, starting fresh.\n'));
    await claimTaskFresh(taskId);
    return;
  }

  // 2. Fetch and checkout checkpoint branch
  await execFileAsync('git', ['fetch', 'origin', checkpointBranch], {
    cwd: process.cwd(),
  });
  await execFileAsync('git', ['checkout', checkpointBranch], {
    cwd: process.cwd(),
  });

  console.log(chalk.green(`✅ Checked out ${checkpointBranch}`));

  // 3. Read progress.md
  const progressPath = path.join(process.cwd(), `jira/tickets/${taskId}/progress.md`);
  const progressContent = await fs.readFile(progressPath, 'utf-8');
  const parseResult = parseProgressMarkdown(progressContent, taskId);

  if (!parseResult.success || !parseResult.data) {
    console.log(chalk.red('❌ Failed to parse progress.md, aborting.\n'));
    return;
  }

  const snapshot = parseResult.data;

  // 4. Display completed ACs
  console.log(chalk.bold('\n✅ Completed:\n'));
  const completedCheckpoints = snapshot.checkpoints.filter(
    (cp) => cp.phase !== 'note' && !cp.phase.endsWith('_start')
  );

  for (const cp of completedCheckpoints) {
    const timeAgo = formatTimeAgo(new Date(cp.timestamp));
    console.log(`   - ${cp.phase.replace(/_done$/, '')} (${timeAgo})`);
    if (cp.metadata.files) {
      console.log(chalk.gray(`     Files: ${cp.metadata.files.join(', ')}`));
    }
  }

  // 5. Display remaining ACs
  console.log(chalk.bold('\n⏳ Remaining:\n'));
  const ticketMeta = await readTicketMetadata(taskId);
  const remainingACs = ticketMeta.acceptanceCriteria.filter((ac) => {
    const acPhase = `ac_${ac.id.toLowerCase()}_done`;
    return !snapshot.completedPhases.has(acPhase);
  });

  for (const ac of remainingACs) {
    console.log(`   - ${ac.id}: ${ac.description}`);
  }

  // 6. Ask resume strategy
  const choice = await promptResumeStrategy();

  if (choice === 'abort') {
    console.log(chalk.yellow('\n⚠️  Resume aborted.\n'));
    return;
  }

  if (choice === 're-analyze') {
    console.log(chalk.cyan('\n🔍 Re-analyzing task...\n'));
    // Clear checkpoint, start fresh (but keep branch)
    await claimTaskFresh(taskId);
    return;
  }

  // choice === 'continue'
  console.log(chalk.green('\n▶️  Continuing from checkpoint...\n'));

  // 7. Initialize ProgressTracker with resume data
  await initializeProgressTracker(taskId, generateSlaverId(), {
    resumeFrom: {
      completedPhases: snapshot.completedPhases,
      currentPhase: snapshot.currentPhase,
      checkpoints: snapshot.checkpoints,
    },
  });

  console.log(chalk.green(`✅ Task ${taskId} resumed successfully!\n`));
}

async function checkCheckpointBranch(branch: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['ls-remote', '--heads', 'origin', branch], {
      cwd: process.cwd(),
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

async function promptResumeStrategy(): Promise<'continue' | 're-analyze' | 'abort'> {
  console.log(chalk.bold('\nResume strategy:\n'));
  console.log('  [1] Continue from last checkpoint (recommended)');
  console.log('  [2] Re-analyze task (if checkpoint outdated)');
  console.log('  [3] Abort\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Your choice: ', resolve);
  });

  rl.close();

  if (answer === '1') return 'continue';
  if (answer === '2') return 're-analyze';
  return 'abort';
}
```

---

### 2. 扩展 ProgressTracker 支持 resume

```typescript
// node/src/core/progress-tracker.ts

export interface ProgressTrackerOptions {
  taskId: string;
  slaverId: string;
  flushIntervalMs?: number;
  outputDir?: string;
  progressFileName?: string;
  syncPhases?: string[];
  enableGitSync?: boolean;
  resumeFrom?: {
    completedPhases: Set<TaskPhase | string>;
    currentPhase: TaskPhase | string;
    checkpoints: Checkpoint[];
  }; // 新增
}

export class ProgressTracker {
  // ... 现有字段

  constructor(options: ProgressTrackerOptions) {
    // ... 现有逻辑

    // 新增：Resume 逻辑
    if (options.resumeFrom) {
      this.completedPhases = options.resumeFrom.completedPhases;
      this.currentPhase = options.resumeFrom.currentPhase;
      this.checkpoints = options.resumeFrom.checkpoints;
      console.log(
        `[ProgressTracker] Resumed from checkpoint (${this.completedPhases.size} phases completed)`
      );
    }
  }

  async checkpoint(phase: string, metadata: CheckpointMetadata): Promise<void> {
    // 新增：跳过已完成阶段
    if (this.completedPhases.has(phase)) {
      console.log(`[ProgressTracker] Skipping already completed phase: ${phase}`);
      return;
    }

    // ... 现有逻辑（记录 checkpoint）
  }
}
```

---

### 3. 扩展 initializeProgressTracker

```typescript
// node/src/core/slaver-progress-integration.ts

export async function initializeProgressTracker(
  taskId: string,
  slaverId: string,
  options?: {
    resumeFrom?: {
      completedPhases: Set<TaskPhase | string>;
      currentPhase: TaskPhase | string;
      checkpoints: Checkpoint[];
    };
  }
): Promise<void> {
  // ... 现有逻辑

  globalTracker = new ProgressTracker({
    taskId,
    slaverId,
    flushIntervalMs: 30000,
    outputDir: `jira/tickets/${taskId}`,
    progressFileName: 'progress.md',
    resumeFrom: options?.resumeFrom, // 新增
  });

  // ... 现有逻辑
}
```

---

## Test Strategy

### 单元测试

```typescript
// node/tests/task-claim-resume.test.ts

describe('task:claim --resume', () => {
  it('should checkout checkpoint branch (AC-1)', async () => {
    // Setup: Create checkpoint branch
    await execFileAsync('git', ['checkout', '-b', 'checkpoint/TASK-TEST-001']);
    await execFileAsync('git', ['push', 'origin', 'checkpoint/TASK-TEST-001']);

    await resumeTask('TASK-TEST-001');

    // Verify current branch
    const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
    expect(stdout.trim()).toBe('checkpoint/TASK-TEST-001');
  });

  it('should display completed ACs (AC-2)', async () => {
    // Setup: Create progress.md with completed ACs
    const progressPath = 'jira/tickets/TASK-TEST-001/progress.md';
    await fs.writeFile(
      progressPath,
      `
## Completed
- [x] analysis_done (2h ago)
- [x] ac_1_done (1h ago)
    `,
      'utf-8'
    );

    // Capture stdout
    const output = await captureOutput(() => resumeTask('TASK-TEST-001'));

    expect(output).toContain('✅ Completed');
    expect(output).toContain('analysis');
    expect(output).toContain('ac_1');
  });

  it('should skip completed phases in ProgressTracker (AC-4)', async () => {
    const tracker = new ProgressTracker({
      taskId: 'TASK-TEST-001',
      slaverId: 'test-slaver',
      resumeFrom: {
        completedPhases: new Set(['analysis_done']),
        currentPhase: 'implementation',
        checkpoints: [],
      },
    });

    // Try to checkpoint already completed phase
    await tracker.checkpoint('analysis_done', {});

    // Verify no new checkpoint added
    expect(tracker.getSnapshot().checkpoints).toHaveLength(0);
  });

  it('should fallback to fresh claim if no checkpoint (AC-1)', async () => {
    const spy = jest.spyOn(console, 'log');

    await resumeTask('TASK-NONEXISTENT');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('⚠️  No checkpoint found'));
  });
});
```

---

### 集成测试

```bash
#!/bin/bash
# E2E: Resume workflow

# 1. Slaver-A claims task and completes AC-1
eket task:claim TASK-INT-001
# (simulate work: complete AC-1)
# (checkpoint pushed to origin/checkpoint/TASK-INT-001)

# 2. Slaver-B resumes
echo "1" | eket task:claim TASK-INT-001 --resume

# 3. Verify current branch
git branch --show-current | grep "checkpoint/TASK-INT-001"

# 4. Verify ProgressTracker skips AC-1
# (check logs: "Skipping already completed phase: ac_1_done")

echo "✅ AC-1/AC-4 verified"
```

---

### 边界 Case 测试

| Case | Setup | Expected |
|------|-------|----------|
| **No checkpoint** | Checkpoint 分支不存在 | 显示 "No checkpoint"，fallback 到 fresh claim |
| **Corrupt progress.md** | progress.md 解析失败 | 显示错误，abort resume |
| **User aborts** | 用户选择 [3] Abort | 退出，不 claim |
| **Re-analyze** | 用户选择 [2] Re-analyze | 清空 checkpoint，重新分析 |

---

## Definition of Done

- [ ] AC-1~4 所有测试通过
- [ ] `eket task:claim --resume` 实现
- [ ] ProgressTracker 支持 `resumeFrom` 初始化
- [ ] 交互提示实现（continue/re-analyze/abort）
- [ ] 运行 E2E 测试验证 resume 流程
- [ ] Code review 通过

---

## Notes

**UX 优化**:
- 显示 checkpoint 时间（如 "2h ago"）提升可读性
- 彩色输出区分已完成 vs 剩余 AC

**技术债**:
- 当前未处理 re-analyze 后的 checkpoint 覆盖策略（延后 M3）
- 未实现非交互模式（`--resume --auto-continue`，CI 场景）

**后续任务**:
- TASK-X07: GC 清理过期 checkpoint 分支
