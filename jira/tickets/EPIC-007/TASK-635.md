# TASK-635: Integration Tests - E2E Context Monitoring

**Epic**: EPIC-007  
**Priority**: P1  
**Status**: 📋 Backlog  
**Estimate**: 3h  
**Agent Type**: qa  
**Category**: 🧪 Testing  

---

## Goal

编写端到端集成测试，覆盖完整 context 监控流程（Hook → Node → Snapshot → Alert）。

---

## Acceptance Criteria

**AC-1**: 10 轮触发警告  
- Given: 模拟 10 次 UserPromptSubmit
- When: Hook 执行
- Then: stderr 输出包含 "⚠️ Context 接近阈值"

**AC-2**: 120K 生成快照  
- Given: Mock 文件系统返回 120K tokens
- When: Context monitor 运行
- Then: `logs/context-snapshots/` 目录包含新快照

**AC-3**: 150K 上报 Master  
- Given: Mock 估算返回 155K
- When: Alert 逻辑触发
- Then: `.eket/inbox/context-risk-TASK-XXX.md` 存在

**AC-4**: LRU 清理验证  
- Given: 生成 15 个快照
- When: 清理逻辑执行
- Then: 仅保留最新 10 个

---

## Implementation Sketch

```typescript
// tests/integration/context-monitor.e2e.test.ts
import { execFileNoThrow } from '../../src/utils/execFileNoThrow';
import { existsSync, readdirSync, writeFileSync } from 'fs';

describe('Context Monitoring E2E', () => {
  beforeEach(() => {
    // 清理状态
    execFileNoThrow('rm', ['-f', '.eket/state/context-turn-count']);
    execFileNoThrow('rm', ['-rf', 'logs/context-snapshots/*']);
  });
  
  it('10 轮触发警告', async () => {
    for (let i = 0; i < 10; i++) {
      await execFileNoThrow('.claude/hooks/UserPromptSubmit.sh', []);
    }
    const result = await execFileNoThrow('.claude/hooks/UserPromptSubmit.sh', []);
    expect(result.stderr).toContain('⚠️ Context 接近阈值');
  });
  
  it('120K 生成快照', async () => {
    // Mock 大量文件
    for (let i = 0; i < 100; i++) {
      writeFileSync(`test-file-${i}.md`, 'x'.repeat(1500));
    }
    
    await execFileNoThrow('node', ['dist/context-monitor.js', '--check']);
    
    const snapshots = readdirSync('logs/context-snapshots');
    expect(snapshots.length).toBeGreaterThan(0);
  });
  
  it('150K 上报 Master', async () => {
    // Mock 超大量文件
    for (let i = 0; i < 200; i++) {
      writeFileSync(`test-file-${i}.md`, 'x'.repeat(1500));
    }
    
    await execFileNoThrow('node', ['dist/context-monitor.js', '--check']);
    
    const alerts = readdirSync('.eket/inbox').filter(f => 
      f.startsWith('context-risk-')
    );
    expect(alerts.length).toBeGreaterThan(0);
  });
});
```

---

## Observability

**Logs**: 测试执行日志写入 `logs/test-context-monitor.log`  
**Metrics**: 测试覆盖率（target: > 80%）  

---

## Rollback Plan

删除测试文件，不影响主逻辑。

---

## Test Strategy

**E2E**: 模拟真实 Slaver 场景（10/20/30 轮）  
**CI**: GitHub Actions 双平台矩阵  
**Performance**: 完整测试套件 < 30s  

---

**Blocked By**: TASK-631, TASK-632, TASK-633, TASK-634  
**Blocks**: None  
**Created**: 2026-05-14
