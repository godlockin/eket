# 专家组评审：EPIC-007 Context Monitoring Architecture

**召唤时间**: 2026-05-14  
**主题**: Context 监控系统架构设计  
**参与专家**: 架构师 / DevOps / 后端 / QA  

---

## 背景

EPIC-006 构建基础防御，但仍发生 202K/168K 溢出。需要**主动监控 + 自动 compact** 机制。

## 目标

专家组需决策：
1. **Token 估算策略**（文件大小 vs tiktoken vs 混合）
2. **监控触发点**（Hook vs Wrapper vs Agent 内置）
3. **快照策略**（全量 vs 增量 vs 压缩）
4. **实现路径**（Shell MVP vs Node.js 直接上 vs 三级渐进）

---

## 发言规则

1. 每位专家**先独立给出分析**，禁止先看他人意见
2. 发言结构：**观察 → 担忧 → 建议**
3. 分歧必须留在文档里
4. Master 汇总 + 给出最终决策，并写明采纳/驳回理由

---

## 架构师 发言

### 观察
- 现有 eket 架构是**渐进式三级**（Shell → Node → Rust）
- Token 估算需求有**两种精度要求**：
  - 粗略估算（≥50K 警告）：误差 ±20% 可接受
  - 精准估算（≥150K 快照）：误差需 ≤10%

### 担忧
- **tiktoken 依赖重**：`@dqbd/tiktoken` npm 包 ~5MB，增加 Slaver 启动时间
- **Hook 单点故障**：如果 UserPromptSubmit hook 失败，整个监控失效
- **跨实现一致性**：Shell 估算 vs Node 估算 可能产生不同阈值判断

### 建议

**分层架构**（推荐）：

```
Layer 1 (Shell): 轻量级触发器
├── 累计轮次计数（.eket/state/turn-count）
├── 文件大小粗估（wc -c）
└── 超过粗略阈值 → 调用 Layer 2

Layer 2 (Node.js): 精准估算器
├── tiktoken 精准计算
├── JSONL 日志写入
├── 快照生成
└── 返回 true/false → Layer 1 显示警告

Layer 3 (降级): Shell fallback
└── Node 失败时使用 wc -c * 0.3
```

**关键设计点**：
- Hook 仅做计数 + 粗判断（<50ms）
- 精准计算异步后台（不阻塞用户）
- 快照限制最近 10 个（LRU 清理）

---

## DevOps 发言

### 观察
- `.claude/hooks/UserPromptSubmit.sh` 在**每次用户提交消息时**触发
- 当前 hook 平均执行时间 ~30ms（无额外逻辑）
- CI 环境需支持 Mac + Linux

### 担忧
- **Hook 超时风险**：如果 Node.js 启动 + tiktoken 加载 > 1s，会拖慢用户体验
- **环境依赖**：Node.js 版本不一致（v18 vs v20）可能导致 tiktoken 失败
- **文件权限**：快照目录需提前创建，否则首次写入失败

### 建议

**Hook 集成方案**：

```bash
# .claude/hooks/UserPromptSubmit.sh
COUNT_FILE=".eket/state/context-turn-count"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo $count > "$COUNT_FILE"

# 粗判断（不依赖 Node）
total_size=$(find . -name "*.md" -o -name "*.ts" | xargs wc -c 2>/dev/null | tail -1 | awk '{print $1}')
approx_tokens=$((total_size * 3 / 10))  # 文件大小 × 0.3

if [ $count -ge 10 ] || [ $approx_tokens -ge 50000 ]; then
  echo "⚠️  Context 接近阈值 ($count 轮, ~${approx_tokens}K tokens)" >&2
  
  # 异步调用 Node.js（不阻塞）
  nohup node node/dist/context-monitor.js --check &>/dev/null &
fi
```

**CI 测试**：
- 双平台矩阵（Mac + Ubuntu）
- 模拟 10/20/30 轮场景
- 验证快照生成 + 清理

---

## 后端工程师 发言

### 观察
- `@dqbd/tiktoken` 提供 GPT-4 tokenizer
- Claude 使用类似 tokenizer（但非完全一致）
- 现有 Node.js 代码已有 `node/dist/index.js` CLI 入口

### 担忧
- **tiktoken 误差**：GPT-4 tokenizer ≠ Claude tokenizer，可能系统性偏差 ±5%
- **大文件性能**：tokenize 10MB 文件需 ~200ms，Hook 可能超时
- **快照膨胀**：完整 session 快照包含所有历史对话，可能 > 50MB

### 建议

**Token 估算策略**（混合模式）：

```typescript
// node/src/core/context-estimator.ts
export class ContextEstimator {
  // 粗估：文件大小 × 0.3
  async roughEstimate(): Promise<number> {
    const files = await glob('**/*.{md,ts,js}');
    const totalSize = files.reduce((sum, f) => sum + statSync(f).size, 0);
    return Math.floor(totalSize * 0.3);
  }
  
  // 精估：tiktoken（仅关键文件）
  async preciseEstimate(): Promise<number> {
    const criticalFiles = [
      'jira/tickets/**/*.md',
      'confluence/memory/**/*.md',
      '.eket/ACTIVE_CONTEXT'
    ];
    const enc = encoding_for_model('gpt-4');
    let total = 0;
    for (const pattern of criticalFiles) {
      const files = await glob(pattern);
      for (const file of files.slice(0, 20)) {  // 最多 20 文件
        const content = await readFile(file, 'utf-8');
        total += enc.encode(content).length;
      }
    }
    enc.free();
    return total;
  }
  
  // 智能选择
  async estimate(): Promise<number> {
    const rough = await this.roughEstimate();
    if (rough < 40000) return rough;  // 远离阈值，粗估即可
    return this.preciseEstimate();    // 接近阈值，精确计算
  }
}
```

**快照策略**（增量 + 压缩）：

```typescript
// 仅保存关键数据
interface ContextSnapshot {
  timestamp: number;
  taskId: string;
  turnCount: number;
  estimatedTokens: number;
  criticalFiles: string[];  // 仅路径
  lastMessages: string[];   // 最后 5 条（摘要）
}
```

---

## QA 发言

### 观察
- 需要覆盖 3 种场景：
  1. 正常场景（< 50K）
  2. 警告场景（50K-150K）
  3. 紧急场景（> 150K）
- 估算误差直接影响用户体验（误报 vs 漏报）

### 担忧
- **误报代价**：频繁提示 compact 会打断用户思路
- **漏报代价**：未及时警告导致崩溃，丢失 30min 工作
- **边界 case**：恰好在 168K 边界徘徊，可能反复触发

### 建议

**测试策略**：

```typescript
// tests/context-monitor.test.ts
describe('ContextMonitor', () => {
  it('粗估误差 ≤ 30%', async () => {
    const actual = await getActualTokens();  // Mock API
    const estimated = await estimator.roughEstimate();
    expect(Math.abs(actual - estimated) / actual).toBeLessThan(0.3);
  });
  
  it('精估误差 ≤ 10%', async () => {
    const actual = await getActualTokens();
    const estimated = await estimator.preciseEstimate();
    expect(Math.abs(actual - estimated) / actual).toBeLessThan(0.1);
  });
  
  it('10 轮触发警告', async () => {
    for (let i = 0; i < 10; i++) {
      await monitor.trackTurn(5000);
    }
    expect(monitor.shouldWarn()).toBe(true);
  });
  
  it('150K 触发快照', async () => {
    await monitor.trackTurn(150000);
    expect(fs.existsSync('logs/context-snapshots')).toBe(true);
  });
});
```

**阈值配置**（保守）：

| 事件 | 阈值 | 理由 |
|------|------|------|
| 警告 | 50K tokens OR 10 轮 | 提前留足缓冲 |
| 快照 | 120K tokens | 距离 168K 还有 28% 余量 |
| 紧急 | 150K tokens | 最后防线，强制上报 Master |

---

## Master 决策

### 采纳建议

**✅ 采纳架构师方案**：分层架构（Shell → Node → Fallback）
- **理由**：符合 eket 现有渐进式架构，降低风险

**✅ 采纳 DevOps 方案**：Hook 仅做轻量判断 + 异步调用 Node
- **理由**：避免阻塞用户，< 50ms 可接受

**✅ 采纳后端混合估算**：粗估 + 精估智能切换
- **理由**：平衡性能与精度

**✅ 采纳 QA 保守阈值**：120K 快照 / 150K 紧急
- **理由**：误报代价 < 漏报代价

### 驳回建议

**❌ 驳回完整快照方案**
- **理由**：50MB 快照不现实，改为增量快照（关键文件路径 + 最后 5 条消息）

---

## 最终架构

```
UserPromptSubmit Hook (Shell)
  ├─ 计数器 +1 → .eket/state/context-turn-count
  ├─ 文件大小粗估（wc -c × 0.3）
  ├─ if 10轮 OR 50K → 打印警告
  └─ if 80K → 异步调用 Node.js
  
Node.js Monitor (后台)
  ├─ 智能估算（粗 vs 精）
  ├─ if 120K → 保存增量快照
  ├─ if 150K → 上报 Master (.eket/inbox/context-risk-*.md)
  └─ 写 JSONL 日志
  
降级模式 (Shell Fallback)
  └─ Node 失败 → wc -c × 0.3
```

---

**评审完成时间**: 2026-05-14  
**Next Step**: 拆分 Tickets
