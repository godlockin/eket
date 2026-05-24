# 任务分析报告：TASK-632

**Slaver**: slaver-002  
**分析时间**: 2026-05-13  
**预计工时**: 4h  

---

## 1. 需求理解

**核心目标**:  
实现 Node.js context 估算器，替代 TASK-631 Shell 脚本的粗估逻辑，提供粗估/精估智能切换 + tiktoken 精确计算。

**验收标准**:
- AC-1: 粗估算误差 ≤ 30%（已知 10K → 返回 7K-13K）
- AC-2: 精估算误差 ≤ 10%（已知 100K → 返回 90K-110K）
- AC-3: 智能切换（粗估 < 40K 时跳过 tiktoken）
- AC-4: CLI 接口（`node dist/context-monitor.js --check` → JSON 输出）

**与 TASK-631 关系**:
- TASK-631: Shell Hook 粗估（wc -c × 0.3），≥80K 时触发本任务
- TASK-632: Node.js 精估器，被 Hook 调用（AC-4）

---

## 2. 技术方案

### 2.1 ContextEstimator 类设计

**职责**:
- `roughEstimate()`: 文件大小粗估（继承 TASK-631 逻辑）
- `preciseEstimate()`: tiktoken 精确计算（扫描前 20 个文件）
- `estimate()`: 智能切换（粗估 < 40K 直接返回，否则精估）

**实现路径**: `node/src/core/context-estimator.ts`

```typescript
import { encoding_for_model } from '@dqbd/tiktoken';
import { glob } from 'glob';
import { readFileSync, statSync } from 'fs';

export class ContextEstimator {
  /**
   * AC-1: 粗估算法（误差 ≤ 30%）
   * 逻辑: 扫描 md/ts/js 文件大小 × 0.3
   */
  async roughEstimate(): Promise<number> {
    const files = await glob('**/*.{md,ts,js}', { 
      ignore: 'node_modules/**',
      nodir: true 
    });
    
    const totalSize = files.reduce((sum, f) => {
      try {
        return sum + statSync(f).size;
      } catch {
        return sum; // 容错：忽略无法读取的文件
      }
    }, 0);
    
    return Math.floor(totalSize * 0.3); // 0.3 tokens/char
  }
  
  /**
   * AC-2: 精估算法（误差 ≤ 10%）
   * 逻辑: tiktoken 计算前 20 个关键文件
   */
  async preciseEstimate(): Promise<number> {
    const patterns = [
      'jira/tickets/**/*.md',           // Jira tickets
      'confluence/memory/**/*.md',      // Knowledge base
      '.eket/ACTIVE_CONTEXT'            // Active context file
    ];
    
    const enc = encoding_for_model('gpt-4');
    let total = 0;
    
    for (const pattern of patterns) {
      const files = (await glob(pattern)).slice(0, 20); // Limit per pattern
      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          total += enc.encode(content).length;
        } catch {
          // 容错：跳过无法读取/解码的文件
        }
      }
    }
    
    enc.free(); // 释放 tiktoken encoder
    return total;
  }
  
  /**
   * AC-3: 智能切换
   * 逻辑: 粗估 < 40K → 直接返回（省时）
   *       粗估 ≥ 40K → 精估（更准）
   */
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

### 2.2 CLI 接口设计

**路径**: `node/src/context-monitor.ts`（或复用现有入口）  
**命令**: `node dist/context-monitor.js --check`

```typescript
#!/usr/bin/env node
import { ContextEstimator } from './core/context-estimator.js';
import { writeFileSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--check')) {
    const estimator = new ContextEstimator();
    const result = await estimator.estimate();
    
    // AC-4: JSON 输出到 stdout
    console.log(JSON.stringify(result));
    
    // Observability: 写入日志
    const logEntry = {
      timestamp: Date.now(),
      ...result,
      threshold: result.tokens >= 80000 ? 'critical' : 
                 result.tokens >= 50000 ? 'warn' : 'ok'
    };
    
    writeFileSync(
      'logs/context-monitor.jsonl', 
      JSON.stringify(logEntry) + '\n',
      { flag: 'a' }
    );
  }
}

main().catch(console.error);
```

### 2.3 tiktoken 集成计划

**依赖**: `@dqbd/tiktoken` (支持 Node.js)

**安装**:
```bash
cd node
npm install @dqbd/tiktoken
```

**编码器选择**:
- 使用 `gpt-4` encoder（与 Claude API tokenizer 近似）
- 误差: ±5%（GPT-4 vs Claude tokenizer）

**性能考虑**:
- 限制文件数量（每个 pattern 前 20 个）
- 异步扫描（避免阻塞）
- 释放 encoder（`enc.free()`）

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `node/src/core/` | 高 | 新增 `context-estimator.ts` |
| `node/package.json` | 中 | 新增 `@dqbd/tiktoken` 依赖 |
| `.claude/hooks/UserPromptSubmit.sh` | 中 | 集成点（调用 Node CLI）|
| `logs/` | 低 | 新增 `context-monitor.jsonl` |

**向后兼容性**: ✅ 新增模块，不影响现有逻辑

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 说明 |
|--------|----------|--------|------|
| 4.1 安装 tiktoken 依赖 | 15min | P0 | `npm install @dqbd/tiktoken` |
| 4.2 实现 `roughEstimate()` | 45min | P0 | 文件扫描 + 大小计算 |
| 4.3 实现 `preciseEstimate()` | 1h | P0 | tiktoken 集成 + 容错 |
| 4.4 实现 `estimate()` 智能切换 | 30min | P0 | 阈值判断逻辑 |
| 4.5 实现 CLI 接口 | 30min | P0 | `--check` 参数解析 + JSON 输出 |
| 4.6 编写单元测试 | 1h | P0 | Mock 文件系统 + Jest |
| 4.7 集成测试（对比实际值） | 30min | P1 | 10 次样本对比 |
| 4.8 性能测试 | 15min | P1 | 10MB 文件 < 500ms |

**总计**: ~4h 45min（含缓冲）

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| tiktoken 编码器与 Claude 不匹配 | 中 | 中 | AC-2 允许 ±10% 误差（已覆盖） |
| 文件扫描耗时超限（大项目） | 高 | 中 | 限制文件数（前 20 个/pattern）+ 异步 |
| tiktoken encoder 内存泄漏 | 低 | 高 | 显式调用 `enc.free()` |
| CLI 输出被 Hook 截断 | 低 | 中 | 使用 JSON.stringify（单行输出）|
| glob 依赖版本冲突 | 低 | 低 | 已在 package.json（v10.3.x）|

---

## 6. 测试策略

### 6.1 单元测试

**框架**: Jest  
**路径**: `node/src/core/__tests__/context-estimator.test.ts`

```typescript
import { ContextEstimator } from '../context-estimator';
import { vol } from 'memfs';

jest.mock('fs', () => require('memfs').fs);
jest.mock('fs/promises', () => require('memfs').fs.promises);

describe('ContextEstimator', () => {
  beforeEach(() => {
    vol.reset();
    vol.fromJSON({
      'test.md': '# Test\n'.repeat(100),  // ~700 bytes
      'code.ts': 'const x = 1;\n'.repeat(50) // ~650 bytes
    });
  });
  
  test('AC-1: roughEstimate 误差 ≤ 30%', async () => {
    const est = new ContextEstimator();
    const result = await est.roughEstimate();
    // 1350 bytes × 0.3 = 405 tokens
    expect(result).toBeGreaterThan(280); // 405 * 0.7
    expect(result).toBeLessThan(530);    // 405 * 1.3
  });
  
  test('AC-3: 智能切换（< 40K）', async () => {
    const est = new ContextEstimator();
    const result = await est.estimate();
    expect(result.method).toBe('rough');
  });
});
```

### 6.2 集成测试

**目标**: 对比实际 API 返回 token 数（10 次样本）

**方法**:
1. 准备测试文件（已知 token 数，通过 Claude API 计算）
2. 调用 `preciseEstimate()`
3. 计算误差 = `|estimated - actual| / actual`
4. 验证 90% 样本误差 < 10%

### 6.3 性能测试

**目标**: 估算 10MB 文件耗时 < 500ms

**方法**:
```typescript
test('Performance: 10MB file < 500ms', async () => {
  const largeContent = 'x'.repeat(10 * 1024 * 1024);
  vol.fromJSON({ 'large.md': largeContent });
  
  const start = performance.now();
  await new ContextEstimator().preciseEstimate();
  const elapsed = performance.now() - start;
  
  expect(elapsed).toBeLessThan(500);
});
```

---

## 7. 技术债务与后续优化

**已知限制**:
- 精估仅扫描前 20 个文件（可能遗漏）
- GPT-4 tokenizer ≠ Claude tokenizer（±5% 差异）
- 每次全量扫描（无缓存机制）

**优化方向**（TASK-636 Rust 版本）:
- 增量扫描（仅统计 git diff 文件）
- 完整扫描（移除 20 文件限制）
- 缓存机制（基于文件 mtime）
- 原生 tokenizer（tiktoken-rs）

---

## 8. 依赖关系

**上游依赖**: TASK-631（提供 Shell Hook 调用接口）  
**下游依赖**: TASK-633（Context 降级策略，消费本任务输出）  
**阻塞**: None（可独立开发）

**集成点**:
- TASK-631 `.claude/hooks/UserPromptSubmit.sh` L63-66:
  ```bash
  if [ "$approx_tokens" -ge 80000 ]; then
    if [ -f "node/dist/context-monitor.js" ]; then
      nohup node node/dist/context-monitor.js --check &>/dev/null &
    fi
  fi
  ```

---

## 9. Observability

**日志格式**: JSONL（`logs/context-monitor.jsonl`）

```jsonl
{"timestamp":1715644800000,"tokens":85000,"method":"precise","threshold":"critical"}
{"timestamp":1715648400000,"tokens":42000,"method":"rough","threshold":"ok"}
```

**字段说明**:
- `timestamp`: Unix 时间戳（毫秒）
- `tokens`: 估算结果
- `method`: `rough` | `precise`
- `threshold`: `ok` | `warn` | `critical`

**Metrics**:
- 估算耗时（通过 `performance.now()`）
- 方法分布（rough vs precise 占比）

---

## 10. Rollback Plan

**失败场景**: tiktoken 编码器崩溃/超时

**回退方案**:
1. 删除 `@dqbd/tiktoken` 依赖
2. `preciseEstimate()` 降级为 `roughEstimate() × 1.2`（保守估计）
3. 更新 TASK-631 Hook 阈值（80K → 60K）

**回退命令**:
```bash
cd node
npm uninstall @dqbd/tiktoken
git revert <commit-hash>
```

---

## 11. 验收自检清单

- [ ] AC-1: 粗估误差 ≤ 30%（单元测试通过）
- [ ] AC-2: 精估误差 ≤ 10%（集成测试通过）
- [ ] AC-3: 智能切换（< 40K 跳过 tiktoken）
- [ ] AC-4: CLI 输出正确 JSON 格式
- [ ] 测试: Jest 覆盖率 ≥ 80%
- [ ] 性能: 10MB 文件 < 500ms
- [ ] 代码: ESLint 无错误
- [ ] 文档: 更新 `node/README.md`（使用说明）

---

## 12. 等待 Master 审批

**当前状态**: analysis_review  
**提交时间**: 2026-05-13  
**下一步**: 等待 Master 批准后创建 `feature/TASK-632` 分支实现
