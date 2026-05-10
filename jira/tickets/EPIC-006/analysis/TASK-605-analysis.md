# 任务分析报告：TASK-605

**Slaver**: slaver-backend-005  
**分析时间**: 2026-05-10 12:11  
**预计工时**: 4h

## 1. 需求理解

对 Grep/Glob/ls 等工具的大输出应用智能过滤：
- 优先级排序（如 Grep 精确匹配优先）
- 分页显示（最多 50 条）
- 提示剩余数量
- 通用截断（未知 tool >5000 chars）

核心目标：**减少单次 tool result token 消耗**。

## 2. 技术方案

### 2.1 文件结构

新增 `node/src/utils/tool-output-filter.ts`：

```typescript
export interface FilterConfig {
  maxItems: number;        // 最大条目数（默认 50）
  maxChars: number;        // 通用截断长度（默认 5000）
}

export type ToolType = 'grep' | 'glob' | 'ls' | 'unknown';

export function filterToolOutput(
  toolType: ToolType,
  output: string,
  config?: Partial<FilterConfig>
): string;
```

### 2.2 集成点

在 `node/src/core/claude-runner.ts` 的 tool 执行后、返回 result 前插入过滤：

```typescript
import { filterToolOutput, detectToolType } from '../utils/tool-output-filter.js';

// 在返回前过滤
if (result.stdout) {
  result.stdout = filterToolOutput(
    detectToolType(toolName),
    result.stdout
  );
}
```

### 2.3 优先级排序策略

**Grep**:
1. 精确匹配（整行=查询）
2. 开头匹配
3. 其他匹配（按行号升序）

**Glob**:
- 按 mtime 降序（最近修改优先）
- 限制 stat 调用到前 200 条（避免大量文件卡顿）

**ls**:
- 保持原顺序（通常已按名称排序）

**Unknown**:
- 直接截断到 maxChars

### 2.4 输出格式

```
[前 50 条结果]

[... 450 more results, use --limit to see more]
```

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `core/claude-runner.ts` | 中 | 需插入 filter 调用点 |
| `utils/` | 低 | 新增文件，无破坏性 |
| 现有 tool 输出 | 中 | 所有大输出会被过滤 |

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 |
|--------|----------|--------|
| 实现 `tool-output-filter.ts` | 1.5h | P0 |
| 集成到 `claude-runner.ts` | 0.5h | P0 |
| 单元测试（`tests/utils/tool-output-filter.test.ts`） | 1.5h | P0 |
| 集成测试（实际 tool 调用） | 0.5h | P1 |

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 过度截断丢失关键信息 | 中 | 高 | 提供清晰剩余提示，允许 `--limit` 参数覆盖 |
| Glob mtime 排序耗时 | 低 | 低 | 仅排序前 200 条（避免大量 stat） |
| 未知 tool 误判 | 低 | 中 | fallback 到通用截断（安全降级） |
| claude-runner 不存在或结构变更 | 中 | 高 | 先探测文件，确认集成点 |

## 6. 下一步

- 等待 Master 批准分析报告
- 批准后执行子任务实施

---

**状态**: 待审批
