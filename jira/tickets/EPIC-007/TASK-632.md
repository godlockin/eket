# TASK-632: Node.js Context Estimator - 智能精准估算

**Epic**: EPIC-007  
**Priority**: P0  
**Status**: 📋 Backlog  
**Estimate**: 4h  
**Agent Type**: backend  
**Category**: 🔧 Core Logic  

---

## Goal

实现 Node.js context 估算器，支持粗估/精估智能切换 + tiktoken 集成。

---

## Acceptance Criteria

**AC-1**: 粗估算误差 ≤ 30%  
- Given: 已知实际 tokens = 10K
- When: 调用 `roughEstimate()`
- Then: 返回 7K-13K 范围

**AC-2**: 精估算误差 ≤ 10%  
- Given: 已知实际 tokens = 100K
- When: 调用 `preciseEstimate()`
- Then: 返回 90K-110K 范围

**AC-3**: 智能切换  
- Given: 粗估 < 40K
- When: 调用 `estimate()`
- Then: 直接返回粗估结果（不调用 tiktoken）

**AC-4**: CLI 接口  
- Given: 执行 `node dist/context-monitor.js --check`
- When: 估算完成
- Then: 输出 JSON `{"tokens": 85000, "method": "precise"}`

---

## Implementation Sketch

```typescript
// node/src/core/context-estimator.ts
import { encoding_for_model } from '@dqbd/tiktoken';
import { glob } from 'glob';
import { readFileSync, statSync } from 'fs';

export class ContextEstimator {
  async roughEstimate(): Promise<number> {
    const files = await glob('**/*.{md,ts,js}', { ignore: 'node_modules/**' });
    const totalSize = files.reduce((sum, f) => {
      try {
        return sum + statSync(f).size;
      } catch {
        return sum;
      }
    }, 0);
    return Math.floor(totalSize * 0.3);
  }
  
  async preciseEstimate(): Promise<number> {
    const patterns = [
      'jira/tickets/**/*.md',
      'confluence/memory/**/*.md',
      '.eket/ACTIVE_CONTEXT'
    ];
    const enc = encoding_for_model('gpt-4');
    let total = 0;
    
    for (const pattern of patterns) {
      const files = (await glob(pattern)).slice(0, 20);
      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          total += enc.encode(content).length;
        } catch {}
      }
    }
    enc.free();
    return total;
  }
  
  async estimate(): Promise<{ tokens: number; method: string }> {
    const rough = await this.roughEstimate();
    if (rough < 40000) {
      return { tokens: rough, method: 'rough' };
    }
    const precise = await this.preciseEstimate();
    return { tokens: precise, method: 'precise' };
  }
}
```

---

## Observability

**Logs**: 写入 `logs/context-monitor.jsonl`  
```jsonl
{"timestamp":1715644800,"tokens":85000,"method":"precise","threshold":"warn"}
```

**Metrics**: 估算耗时（performance.now）  

---

## Rollback Plan

删除 tiktoken 依赖，回退为纯 wc -c 估算。

---

## Test Strategy

**Unit**: Mock 文件系统，测试粗估/精估逻辑  
**Integration**: 对比实际 API 返回 token 数（10 次样本）  
**Performance**: 估算 10MB 文件耗时 < 500ms  

---

**Blocked By**: TASK-631  
**Blocks**: TASK-633  
**Created**: 2026-05-14
