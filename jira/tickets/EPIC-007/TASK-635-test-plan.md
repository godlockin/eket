# TASK-635 E2E Test Plan - Context Monitoring Flow

**Slaver**: Slaver-004 (QA + Fullstack)  
**规划时间**: 2026-05-13  
**预计工时**: 3h  
**当前状态**: ⏸️ 阻塞中（等待 TASK-631/632/633/634）

---

## 1. 测试目标

验证完整 Context 监控流程（Hook → Estimator → Snapshot → Alert）在真实场景下的端到端行为。

**测试范围**:
- UserPromptSubmit Hook 轮次计数
- Context Estimator 粗估/精估切换
- Snapshot Generator 120K 触发
- Master Alert 150K 触发
- LRU 清理逻辑

---

## 2. 测试场景设计

### 2.1 场景 1: 10 轮触发警告（AC-1）

**前置条件**:
- `.eket/state/context-turn-count` 不存在或值为 0
- 工作区文件总大小 < 20KB

**测试步骤**:
```bash
# 1. 模拟 10 次 UserPromptSubmit
for i in {1..10}; do
  .claude/hooks/UserPromptSubmit.sh
done

# 2. 触发第 11 次（应警告）
.claude/hooks/UserPromptSubmit.sh 2>&1 | tee test-output.log
```

**预期结果**:
- `test-output.log` 包含 `⚠️ Context 接近阈值`
- `.eket/state/context-turn-count` 值为 11

**Mock 策略**: 无需 Mock（真实 Hook 逻辑）

---

### 2.2 场景 2: 120K 生成快照（AC-2）

**前置条件**:
- `logs/context-snapshots/` 目录为空
- Mock Context Estimator 返回 125K tokens

**测试步骤**:
```typescript
// tests/integration/snapshot-trigger.e2e.test.ts
it('120K 应生成快照', async () => {
  // Mock estimator
  vi.spyOn(contextEstimator, 'estimate').mockResolvedValue(125_000);
  
  // 执行监控
  await contextMonitor.check('TASK-999');
  
  // 验证快照文件
  const snapshots = fs.readdirSync('logs/context-snapshots');
  expect(snapshots.length).toBeGreaterThan(0);
  
  // 验证快照内容
  const snapshotPath = `logs/context-snapshots/${snapshots[0]}`;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  
  expect(snapshot).toMatchObject({
    taskId: 'TASK-999',
    estimatedTokens: 125_000,
    timestamp: expect.any(String)
  });
});
```

**预期结果**:
- `logs/context-snapshots/` 包含 1 个 JSON 文件
- JSON 结构符合 TASK-633 规范

**Mock 策略**: Mock `ContextEstimator.estimate()` 返回固定值

---

### 2.3 场景 3: 150K 上报 Master（AC-3）

**前置条件**:
- `.eket/inbox/` 目录存在
- Mock Context Estimator 返回 155K tokens

**测试步骤**:
```typescript
// tests/integration/alert-trigger.e2e.test.ts
it('150K 应上报 Master', async () => {
  // Mock estimator
  vi.spyOn(contextEstimator, 'estimate').mockResolvedValue(155_000);
  
  // 执行监控
  await contextMonitor.check('TASK-888');
  
  // 验证风险文件
  const alertPath = '.eket/inbox/context-risk-TASK-888.md';
  expect(fs.existsSync(alertPath)).toBe(true);
  
  // 验证内容格式
  const content = fs.readFileSync(alertPath, 'utf-8');
  expect(content).toContain('[ALERT] Context Overflow Risk');
  expect(content).toContain('155,000');
  expect(content).toContain('选项 A');
});
```

**预期结果**:
- `.eket/inbox/context-risk-TASK-888.md` 存在
- 内容包含 tokens 数值、建议措施

**Mock 策略**: Mock `ContextEstimator.estimate()` 返回 155K

---

### 2.4 场景 4: LRU 清理验证（AC-4）

**前置条件**:
- `logs/context-snapshots/` 已有 15 个快照

**测试步骤**:
```typescript
// tests/integration/lru-cleanup.e2e.test.ts
it('应保留最新 10 个快照', async () => {
  // 生成 15 个快照（时间戳递增）
  for (let i = 0; i < 15; i++) {
    const timestamp = Date.now() + i * 1000;
    fs.writeFileSync(
      `logs/context-snapshots/${timestamp}.json`,
      JSON.stringify({ timestamp })
    );
    await sleep(100);  // 确保时间戳不同
  }
  
  // 触发清理
  await snapshotGenerator.cleanup();
  
  // 验证数量
  const remaining = fs.readdirSync('logs/context-snapshots');
  expect(remaining.length).toBe(10);
  
  // 验证是最新 10 个
  const timestamps = remaining.map(f => parseInt(f.replace('.json', '')));
  timestamps.sort((a, b) => a - b);
  
  expect(timestamps[0]).toBeGreaterThan(Date.now() + 5000);
});
```

**预期结果**:
- 仅保留 10 个快照
- 保留的是最新（timestamp 最大）的 10 个

**Mock 策略**: 手动创建测试快照文件

---

## 3. Mock 策略总结

| 组件 | Mock 方式 | 原因 |
|------|----------|------|
| ContextEstimator | `vi.spyOn().mockResolvedValue()` | 控制返回值，避免真实文件计算 |
| FileSystem (部分) | `memfs` (可选) | 隔离测试环境，避免污染真实目录 |
| Hook (UserPromptSubmit) | 真实执行 | 测试完整集成流程 |
| Date.now() | `vi.useFakeTimers()` | 控制时间戳，方便 LRU 测试 |

---

## 4. 测试文件结构

```
tests/
├── integration/
│   ├── context-monitor.e2e.test.ts    # 主测试文件（包含 4 个场景）
│   ├── snapshot-trigger.e2e.test.ts   # 快照触发专项测试
│   ├── alert-trigger.e2e.test.ts      # 上报触发专项测试
│   └── lru-cleanup.e2e.test.ts        # LRU 清理专项测试
├── fixtures/
│   ├── large-codebase/                # 模拟大型代码库（用于触发 120K）
│   │   ├── file-1.md
│   │   ├── file-2.md
│   │   └── ... (100 个文件)
│   └── mock-snapshots/                # 预制快照文件（用于 LRU 测试）
└── helpers/
    ├── mock-estimator.ts              # Estimator Mock 工具
    └── cleanup.ts                     # 测试前后清理工具
```

---

## 5. CI 配置

### 5.1 GitHub Actions 矩阵

```yaml
# .github/workflows/context-monitor-e2e.yml
name: E2E - Context Monitor

on:
  pull_request:
    paths:
      - 'node/src/core/context-*.ts'
      - 'tests/integration/**'

jobs:
  e2e:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest]
        node: [20, 22]
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      
      - run: npm ci
      
      - run: npm run build
      
      - name: Run E2E Tests
        run: npm run test:e2e
        timeout-minutes: 5
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/e2e/lcov.info
```

**覆盖率要求**: > 80%

---

## 6. 性能基准

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 完整测试套件耗时 | < 30s | `npm run test:e2e` 总时间 |
| 单场景平均耗时 | < 5s | 每个 `it()` block |
| 快照生成耗时 | < 500ms | `performance.now()` 测量 |
| 上报文件写入 | < 100ms | `performance.now()` 测量 |

---

## 7. 依赖任务检查清单

在开始实现前，必须确认以下 tickets 已合并：

- [ ] **TASK-631** (Shell Hook) → 提供 `UserPromptSubmit.sh`
- [ ] **TASK-632** (Context Estimator) → 提供 `ContextEstimator` 类
- [ ] **TASK-633** (Snapshot Generator) → 提供 `SnapshotGenerator` 类
- [ ] **TASK-634** (Master Alert) → 提供 `ContextAlert` 类

**检查命令**:
```bash
# 验证依赖模块存在
test -f node/src/core/context-estimator.ts && \
test -f node/src/core/snapshot-generator.ts && \
test -f node/src/core/context-alert.ts && \
echo "✅ 依赖就绪" || echo "❌ 等待依赖"
```

---

## 8. 测试数据准备

### 8.1 生成大型代码库 Fixture

```bash
# scripts/generate-test-fixtures.sh
#!/bin/bash

mkdir -p tests/fixtures/large-codebase

# 生成 100 个 1.5KB 的 Markdown 文件（总计 ~150KB）
for i in {1..100}; do
  cat > "tests/fixtures/large-codebase/file-$i.md" <<EOF
# Test File $i

$(head -c 1500 /dev/urandom | base64)
EOF
done

echo "✅ 生成 100 个测试文件（~150KB）"
```

### 8.2 预制快照文件

```bash
# scripts/generate-mock-snapshots.sh
#!/bin/bash

mkdir -p tests/fixtures/mock-snapshots

# 生成 15 个快照（时间戳递增）
for i in {1..15}; do
  timestamp=$(($(date +%s) + i * 60))
  cat > "tests/fixtures/mock-snapshots/$timestamp.json" <<EOF
{
  "timestamp": $timestamp,
  "taskId": "TASK-TEST-$i",
  "estimatedTokens": $((100000 + i * 1000))
}
EOF
done

echo "✅ 生成 15 个 mock 快照"
```

---

## 9. 回归测试策略

**关键场景**（每次依赖模块更新后必须重跑）:
1. **Hook 计数器重置** → 验证状态文件持久化
2. **Estimator 精度退化** → 对比基准值（±5%）
3. **快照文件损坏** → 验证错误处理
4. **并发上报去重** → 模拟 2 个 Slaver 同时上报

---

## 10. 错误注入测试（Chaos Engineering）

| 故障类型 | 注入方式 | 预期行为 |
|---------|---------|---------|
| 磁盘满 | Mock `fs.writeFile` 抛出 ENOSPC | 降级到 stderr 输出 |
| `.eket/inbox/` 权限拒绝 | `chmod 000` | 降级到 logs/ |
| Estimator 超时 | Mock 延迟 10s | 超时后使用粗估 fallback |
| 快照文件格式错误 | 写入无效 JSON | 跳过该快照，继续清理 |

---

## 11. 可观测性验证

**日志输出检查**:
```typescript
it('应记录完整事件链', async () => {
  await contextMonitor.check('TASK-777');
  
  const log = fs.readFileSync('logs/context-monitor.jsonl', 'utf-8');
  const events = log.split('\n').filter(Boolean).map(JSON.parse);
  
  // 验证事件顺序
  expect(events[0].event).toBe('estimate_start');
  expect(events[1].event).toBe('snapshot_created');
  expect(events[2].event).toBe('alert_master');
});
```

---

## 12. 提交清单

PR 提交前必须验证：

- [ ] 所有 4 个场景测试通过
- [ ] 覆盖率 > 80%
- [ ] CI 双平台测试通过（Mac + Linux）
- [ ] 性能基准达标（< 30s）
- [ ] 错误注入测试通过
- [ ] 日志可观测性验证通过
- [ ] 文档更新（README 包含运行测试命令）

---

## 13. 后续优化点

1. **Property-Based Testing**: 使用 `fast-check` 生成随机 token 值
2. **Visual Regression**: 快照文件内容可视化对比
3. **Load Testing**: 模拟 1000 轮对话的极限场景
4. **Mutation Testing**: 使用 Stryker 检测测试质量

---

## 14. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 依赖模块 API 变更 | 高 | 高 | 等全部依赖 merge 后再开发，减少返工 |
| 文件系统权限问题 | 中 | 中 | CI 中提前创建目录 + 测试降级路径 |
| 时间戳冲突（LRU 测试） | 低 | 低 | 使用 `vi.useFakeTimers()` 控制时间 |
| CI 超时（fixture 生成慢） | 低 | 中 | 预制 fixture 提交到 repo |

---

## 15. 下一步计划

1. **监控依赖状态** → 每日检查 TASK-631~634 进度
2. **准备测试环境** → 生成 fixtures（大型代码库 + mock 快照）
3. **编写 Mock 工具** → `mock-estimator.ts` + `cleanup.ts`
4. **实现场景 1** → Hook 10 轮警告测试
5. **实现场景 2-4** → 快照/上报/LRU 测试
6. **CI 配置** → GitHub Actions 矩阵
7. **性能基准测试** → 验证 < 30s
8. **提交 PR** → 包含完整测试套件

---

**状态**: ⏸️ 等待依赖（TASK-631/632/633/634）  
**预计可开始时间**: 所有依赖合并后 1 天内

---

## Appendix: 测试伪代码（完整版）

```typescript
// tests/integration/context-monitor.e2e.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextMonitor } from '../../src/core/context-monitor';
import { ContextEstimator } from '../../src/core/context-estimator';
import { SnapshotGenerator } from '../../src/core/snapshot-generator';
import { ContextAlert } from '../../src/core/context-alert';
import fs from 'fs-extra';
import { execFileNoThrow } from '../../src/utils/execFileNoThrow';

describe('Context Monitoring E2E', () => {
  let monitor: ContextMonitor;
  let estimator: ContextEstimator;
  let snapshot: SnapshotGenerator;
  let alert: ContextAlert;
  
  beforeEach(async () => {
    // 清理状态
    await fs.remove('.eket/state/context-turn-count');
    await fs.remove('logs/context-snapshots');
    await fs.remove('.eket/inbox');
    await fs.ensureDir('logs/context-snapshots');
    await fs.ensureDir('.eket/inbox');
    
    // 初始化组件
    estimator = new ContextEstimator();
    snapshot = new SnapshotGenerator();
    alert = new ContextAlert();
    monitor = new ContextMonitor({ estimator, snapshot, alert });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('场景 1: 10 轮触发警告', () => {
    it('应在第 11 轮输出警告', async () => {
      // 模拟 10 次 Hook 执行
      for (let i = 0; i < 10; i++) {
        await execFileNoThrow('.claude/hooks/UserPromptSubmit.sh', []);
      }
      
      // 第 11 次应触发警告
      const result = await execFileNoThrow(
        '.claude/hooks/UserPromptSubmit.sh',
        [],
        { captureStderr: true }
      );
      
      expect(result.stderr).toContain('⚠️ Context 接近阈值');
      expect(result.stderr).toContain('11 轮对话');
    });
  });
  
  describe('场景 2: 120K 生成快照', () => {
    it('应生成快照文件', async () => {
      vi.spyOn(estimator, 'estimate').mockResolvedValue(125_000);
      
      await monitor.check('TASK-999');
      
      const files = await fs.readdir('logs/context-snapshots');
      expect(files.length).toBe(1);
      
      const content = await fs.readJson(`logs/context-snapshots/${files[0]}`);
      expect(content).toMatchObject({
        taskId: 'TASK-999',
        estimatedTokens: 125_000,
        timestamp: expect.any(Number)
      });
    });
  });
  
  describe('场景 3: 150K 上报 Master', () => {
    it('应创建风险报告文件', async () => {
      vi.spyOn(estimator, 'estimate').mockResolvedValue(155_000);
      
      await monitor.check('TASK-888');
      
      const alertPath = '.eket/inbox/context-risk-TASK-888.md';
      expect(await fs.pathExists(alertPath)).toBe(true);
      
      const content = await fs.readFile(alertPath, 'utf-8');
      expect(content).toContain('[ALERT] Context Overflow Risk');
      expect(content).toContain('155,000');
    });
    
    it('不应重复上报', async () => {
      vi.spyOn(estimator, 'estimate').mockResolvedValue(155_000);
      
      // 第一次上报
      await monitor.check('TASK-888');
      
      // 删除文件
      await fs.remove('.eket/inbox/context-risk-TASK-888.md');
      
      // 第二次检测
      await monitor.check('TASK-888');
      
      // 不应重新创建
      expect(await fs.pathExists('.eket/inbox/context-risk-TASK-888.md')).toBe(false);
    });
  });
  
  describe('场景 4: LRU 清理', () => {
    it('应保留最新 10 个快照', async () => {
      // 生成 15 个快照
      for (let i = 0; i < 15; i++) {
        const timestamp = Date.now() + i * 1000;
        await fs.writeJson(
          `logs/context-snapshots/${timestamp}.json`,
          { timestamp, taskId: `TASK-${i}` }
        );
      }
      
      // 触发清理
      await snapshot.cleanup();
      
      // 验证数量
      const remaining = await fs.readdir('logs/context-snapshots');
      expect(remaining.length).toBe(10);
      
      // 验证是最新 10 个
      const timestamps = remaining.map(f => parseInt(f.replace('.json', '')));
      expect(Math.min(...timestamps)).toBeGreaterThan(Date.now() + 5000);
    });
  });
});
```
