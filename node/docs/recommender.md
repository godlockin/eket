# 智能任务推荐系统 (Phase 5.2)

## 概述

基于技能匹配、历史表现和负载均衡的智能任务推荐引擎。

## 核心组件

### 1. Recommender (`src/core/recommender.ts`)

推荐引擎核心，负责计算任务与 Instance 的匹配度。

**主要功能**:
- 技能匹配计算
- 历史表现查询
- 负载平衡评估
- 优先级加成

**推荐算法**:
```typescript
score = skillMatch * 0.4 + historicalPerformance * 0.3 + workloadBalance * 0.3 + priorityBonus
```

### 2. HistoryTracker (`src/core/history-tracker.ts`)

历史表现追踪模块，记录和分析 Instance 的任务完成情况。

**数据结构**:
```typescript
interface TaskHistory {
  instanceId: string;
  taskId: string;
  role: string;
  quality: number;      // 1-5 评分
  duration: number;     // 耗时（秒）
  exceededEstimate: boolean;
  completedAt: number;
}
```

### 3. Recommend Command (`src/commands/recommend.ts`)

CLI 命令入口，提供命令行交互。

## 使用方法

### CLI 命令

```bash
# 为指定 Instance 推荐任务
node dist/index.js recommend -i <instance-id>

# 为指定任务推荐 Instance
node dist/index.js recommend -t <task-id>

# 为所有可用 Instance 推荐任务
node dist/index.js recommend -a

# 显示推荐详情
node dist/index.js recommend -d

# 组合使用
node dist/index.js recommend -i inst_001 -l 5 -d
```

### 编程接口

```typescript
import { createRecommender } from '../core/recommender.js';

// 创建推荐引擎
const recommender = createRecommender({
  skillMatchWeight: 0.4,
  performanceWeight: 0.3,
  workloadWeight: 0.3,
});

// 初始化
await recommender.initialize();

// 为 Instance 推荐任务
const result = await recommender.recommendForInstance(instanceId, tasks, limit);

// 为任务推荐 Instance
const instances = await registry.getActiveInstances();
const taskResult = await recommender.recommendForTask(taskId, instances.data, limit);

// 记录任务完成（用于后续推荐）
await recommender.recordTaskCompletion(
  instanceId,
  taskId,
  quality,     // 1-5
  duration,    // 秒
  role,
  exceededEstimate
);

// 关闭
await recommender.shutdown();
```

## 配置选项

```typescript
interface RecommenderConfig {
  skillMatchWeight: number;      // 技能匹配权重 (default: 0.4)
  performanceWeight: number;     // 历史表现权重 (default: 0.3)
  workloadWeight: number;        // 负载平衡权重 (default: 0.3)
  minRecommendations: number;    // 最少推荐数 (default: 3)
  maxRecommendations: number;    // 最多推荐数 (default: 10)
  minHistoryCount: number;       // 计算表现所需的最小历史数 (default: 3)
  defaultPerformanceScore: number; // 无历史数据时的默认表现分 (default: 0.5)
}
```

## 推荐评分详解

### 技能匹配度 (skillMatch)
- 计算任务标签与 Instance 技能的重合度
- 匹配度 = 匹配技能数 / 任务要求技能数
- 范围：0-1

### 历史表现 (historicalPerformance)
- 基于 Instance 过去完成的任务质量
- 考虑因素：质量评分、按时完成率、效率
- 范围：0-1

### 负载平衡 (workloadBalance)
- 当前任务数越少，分数越高
- 避免某些 Instance 过载
- 范围：0-1

### 优先级加成 (priorityBonus)
```typescript
urgent: +0.3
high:   +0.2
normal:  0.0
low:    -0.1
```

## 输出示例

```
=== 智能任务推荐 ===

加载任务列表...
已加载 15 个任务
获取 Instance 列表...
已获取 5 个活跃 Instance

为 Instance "inst_001" 推荐任务...

找到 5 条推荐:
==================================================

[1]
推荐 FEAT-001 → inst_001
  综合分数：85.0
  分解:
    - 技能匹配：90%
    - 历史表现：80%
    - 负载平衡：85%
    - 优先级加成：20%
  原因:
    - 技能匹配度高 (90%)
    - 历史表现：4.2/5 (12 任务)
    - 当前负载较低

[2]
推荐 FEAT-005 → inst_001
  综合分数：78.5
  ...

✓ 推荐完成
```

## 数据存储

历史记录存储于 SQLite 数据库：
- 路径：`~/.eket/data/sqlite/eket.db`
- 表名：`task_history`

## 最佳实践

1. **新 Instance**: 无历史记录时使用默认分数，鼓励尝试
2. **专业技能**: 为特定角色配置专门技能标签
3. **负载均衡**: 定期检查 Instance 负载分布
4. **质量反馈**: 任务完成后及时记录质量评分

## 故障排查

### 推荐结果为空
- 检查技能匹配阈值（默认 30%）
- 确认 Instance 状态为 idle
- 验证任务标签与 Instance 技能

### 历史表现不准确
- 确认任务完成记录已保存
- 检查 SQLite 数据库连接
- 验证质量评分范围（1-5）

## 扩展

### 添加新的评分因子
```typescript
// 在 recommender.ts 中添加
private calculateCustomFactor(instance: Instance, task: Ticket): number {
  // 自定义逻辑
  return score;
}

// 更新综合分数计算
const score =
  skillMatch * this.config.skillMatchWeight +
  historicalPerformance * this.config.performanceWeight +
  workloadBalance * this.config.workloadWeight +
  priorityBonus +
  this.calculateCustomFactor(instance, task);
```

### 自定义推荐策略
```typescript
const recommender = createRecommender({
  skillMatchWeight: 0.6,  // 更看重技能匹配
  performanceWeight: 0.2, // 降低历史表现权重
  workloadWeight: 0.2,    // 降低负载权重
});
```

## 版本

- **Phase**: 5.2
- **Algorithm**: weighted-score-v1
- **Created**: 2026-03-26
