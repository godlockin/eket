# TASK-111: 分析瘫痪检测 Hook 计数器

## 元数据
- **状态**: done
- **PR**: https://github.com/godlockin/eket/pull/120
- **类型**: feature
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-107（pipeline 框架已完成）

## 背景

SLAVER-RULES 规定「连续读取 5+ 文件无写操作 = 分析瘫痪，立刻写代码或报 BLOCKED」。
当前此规则靠模型自觉遵守，无任何代码强制。需在 hooks pipeline 中加入计数器，当触发瘫痪条件时发出警告，将文字规则升级为 harness 约束。

## 验收标准

- [ ] 新增 `node/src/core/analysis-paralysis-detector.ts`，导出 `ParalysisDetector` class
- [ ] `ParalysisDetector` 维护 per-session 计数：连续 Read 次数、连续无 Write 的 Read 次数
- [ ] 阈值：连续 5 次 tool_use 均为读操作（Read/Glob/Grep/LS）且无任何写操作，触发警告
- [ ] 警告写入 `.eket/inbox/paralysis-warning.md`，格式：时间戳 + 连续读次数 + 最近 5 次读取的文件列表
- [ ] 在 `hooks/pipelines/pre-tool-use.ts` 的 pipeline 中添加 `ParalysisCheckNode`
- [ ] 写操作（Write/Edit/Bash）重置计数器
- [ ] ≥5 单元测试覆盖：正常写重置、连续5读触发、第6读不重复触发（节流）
- [ ] `npm test` 无新增失败

## 实现要点

```typescript
// node/src/core/analysis-paralysis-detector.ts
export class ParalysisDetector {
  private consecutiveReads = 0;
  private recentFiles: string[] = [];
  
  record(toolName: string, filePath?: string): ParalysisWarning | null
  reset(): void
}

// 读操作工具名：Read, Glob, Grep, LS, NotebookRead
// 写操作工具名：Write, Edit, NotebookEdit, Bash（含写语义）
```

Pipeline 节点位置：`pre-tool-use.ts` → `ParalysisCheckNode`（deps: []，parallel: true，failBehavior: 'warn'）

## 技术说明

- 计数器为内存单例，session 级别（随进程重置）
- 节流：触发警告后再读 3 次才再次触发（避免刷屏）
- 不阻断执行（failBehavior: warn），只写警告文件
