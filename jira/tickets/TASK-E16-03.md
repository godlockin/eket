# TASK-E16-03: Token 预算仪表盘

**EPIC**: EPIC-016  
**状态**: ready  
**优先级**: P1  
**预估**: 2d  
**负责人**: 待分配  
**依赖**: 无

---

## 背景

借鉴 ECC 的 TokenMeter + BudgetState 机制，实时显示 token 用量并用色阶指示状态。

## 目标

在 EKET Dashboard/TUI 添加 token 预算可视化。

## 范围

### 1. BudgetState 定义

| 状态 | 阈值 | 颜色 | 行为 |
|------|------|------|------|
| `Normal` | < 50% | 绿色 | 正常 |
| `Alert50` | 50-75% | 黄色 | 提示 |
| `Alert75` | 75-90% | 橙色 | 警告 |
| `Alert90` | 90-100% | 红色 | 建议 compact |
| `OverBudget` | > 100% | 深红 | 强制 compact |

### 2. UI 组件

```
┌─ Token Budget ──────────────────┐
│ ████████████░░░░░░░░ 62% Alert50│
│ 124,000 / 200,000 tokens        │
│ Est. cost: $1.24                │
└─────────────────────────────────┘
```

### 3. 数据源

```typescript
// node/src/core/token-meter.ts
interface TokenUsage {
  current: number;
  limit: number;
  estimatedCost: number;
  state: BudgetState;
}

function getTokenUsage(): TokenUsage {
  // 从 Claude Code API 或本地追踪获取
}
```

### 4. 自动行为

| 状态 | 自动行为 |
|------|----------|
| `Alert75` | 输出提示"建议运行 /compact" |
| `Alert90` | 输出警告 + 显眼提示 |
| `OverBudget` | 自动触发 compact 建议 |

## 验收标准

- [ ] Dashboard 显示 token 用量进度条
- [ ] 5 级色阶正确渲染
- [ ] 千分位格式化（`124,000`）
- [ ] 估算成本显示（可选）
- [ ] Alert75+ 时输出提示

## 技术要点

- 参考 ECC `ecc2/src/tui/widgets.rs` TokenMeter
- Node.js: 可用 `cli-progress` 或 `ink` 渲染
- Rust TUI: 使用 `ratatui::widgets::Gauge`

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Ticket | Master |
