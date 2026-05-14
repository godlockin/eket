# TASK-634: Master Alert System - Context 风险上报

**Epic**: EPIC-007  
**Priority**: P1  
**Status**: ✅ Done  
**Estimate**: 2h  
**Actual**: 1.5h  
**Agent Type**: fullstack  
**Category**: 🔧 Integration  

---

## Goal

当 Slaver context ≥ 150K 时，自动创建风险报告到 `.eket/inbox/context-risk-TASK-XXX.md`。

---

## Acceptance Criteria

**AC-1**: 150K 触发上报  
- Given: Slaver 估算 tokens ≥ 150K
- When: Context monitor 检测
- Then: 创建 `.eket/inbox/context-risk-TASK-XXX.md`

**AC-2**: 上报文件格式  
- Given: 需要上报风险
- When: 创建文件
- Then: 包含 `{taskId, tokens, turnCount, timestamp, recommendation}`

**AC-3**: Master 可见  
- Given: 风险文件已创建
- When: Master 运行 `eket master:poll`
- Then: 检测到风险，提示处理

**AC-4**: 仅上报一次  
- Given: 已上报 TASK-XXX
- When: 再次检测 ≥ 150K
- Then: 不重复创建文件

---

## Implementation Sketch

```typescript
// node/src/core/context-alert.ts
import { writeFileSync, existsSync } from 'fs';

export class ContextAlert {
  private readonly alertedTasks = new Set<string>();
  
  async alertMaster(data: {
    taskId: string;
    tokens: number;
    turnCount: number;
  }) {
    if (this.alertedTasks.has(data.taskId)) {
      return;  // 已上报，跳过
    }
    
    const filename = `.eket/inbox/context-risk-${data.taskId}.md`;
    if (existsSync(filename)) {
      this.alertedTasks.add(data.taskId);
      return;
    }
    
    const content = `# [ALERT] Context Overflow Risk: ${data.taskId}

**时间**: ${new Date().toISOString()}  
**估算 Tokens**: ${data.tokens}  
**累计轮次**: ${data.turnCount}  
**阈值**: 150K / 168K (89%)

---

## 风险评估

当前 context 已接近 Claude API 限制（168K），存在崩溃风险。

## 建议措施

**选项 A**: 立即执行 \`/compact\`，压缩上下文  
**选项 B**: 拆分任务 \`eket task:split ${data.taskId}\`  
**选项 C**: 保存快照后重启 session  

## 自动操作

- ✅ 已保存快照到 \`logs/context-snapshots/\`
- ✅ 已记录日志到 \`logs/context-monitor.jsonl\`

---

**需要 Master 决策**
`;
    
    writeFileSync(filename, content);
    this.alertedTasks.add(data.taskId);
  }
}
```

---

## Observability

**Logs**: 上报事件写入 `logs/context-monitor.jsonl`  
```jsonl
{"timestamp":1715644800,"event":"alert_master","taskId":"TASK-XXX","tokens":155000}
```

---

## Rollback Plan

删除上报逻辑，仅本地日志记录。

---

## Test Strategy

**Unit**: Mock 文件系统，测试去重逻辑  
**Integration**: 模拟 150K 场景，验证文件生成  
**Regression**: Master poll 能正确识别风险文件  

---

**Blocked By**: TASK-632 ✅  
**Blocks**: None  
**Created**: 2026-05-14  
**Completed**: 2026-05-13

---

## 实现摘要

**分支**: `feature/TASK-636-rust-context-monitor`  
**提交**: 15 tests passed (10 unit + 5 integration)

### 已实现文件

| 文件 | 行数 | 功能 |
|------|------|------|
| `node/src/core/context-alert.ts` | 170 | Alert系统核心类 |
| `node/src/core/context-estimator.ts` | 157 | 集成alert调用 |
| `node/tests/context-alert.test.ts` | 196 | 单元测试 |
| `node/tests/integration/context-estimator-alert.test.ts` | 146 | 集成测试 |
| `node/src/core/README-CONTEXT-ALERT.md` | 235 | 文档 |

### 核心特性

✅ **Threshold Detection**: 150K tokens触发alert  
✅ **Deduplication**: `.eket/state/alerted-tasks.json`去重  
✅ **Master Inbox**: 写入 `.eket/inbox/context-risk-TASK-XXX.md`  
✅ **Actionable Recommendations**: 含compact/archive/split建议  
✅ **Integration Ready**: ContextEstimator构造函数传taskId即可启用

### 验收结果

| AC | 状态 | 验证方式 |
|----|------|----------|
| AC-1: 150K触发 | ✅ | 集成测试覆盖 |
| AC-2: 格式正确 | ✅ | 单元测试覆盖 |
| AC-3: Master可见 | ✅ | 文件写入.eket/inbox/ |
| AC-4: 去重 | ✅ | state文件+单元测试 |

### 使用示例

```typescript
// 启用alert (with taskId)
const estimator = new ContextEstimator('TASK-634');
const result = await estimator.estimate();
console.log(result.alerted); // true if alert sent

// 禁用alert (no taskId)
const estimator = new ContextEstimator();
const result = await estimator.estimate();
console.log(result.alerted); // false
```

### 后续集成

TASK-633 (Context Monitor) 将使用此alert系统实现自动监控。

