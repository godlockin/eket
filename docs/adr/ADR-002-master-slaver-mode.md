# ADR-002: 为什么选择 Master/Slaver 模式

**状态**: 已采纳
**日期**: 2026-03-26
**决策者**: EKET Framework Team

---

## 背景

EKET 框架需要协调多个 Agent 实例（人类或 AI）协作完成复杂任务。我们需要一个清晰的协作模式来避免冲突和重复工作。

### 问题陈述

1. **任务分配**: 如何决定谁做什么？
2. **冲突避免**: 多个实例不能同时做同一任务
3. **决策权威**: 谁来做最终决定？
4. **状态同步**: 如何保证信息一致性？

---

## 决策

我们选择 Master/Slaver 架构模式：

```
┌─────────────────────────────────────────────────────────┐
│                      Master Instance                     │
│  - 需求分析           - 任务拆解       - 创建 Tickets    │
│  - 代码 Review        - 决策仲裁       - 状态协调        │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ↓               ↓               ↓
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Slaver 1 │   │ Slaver 2 │   │ Slaver N │
    │ frontend │   │ backend  │   │   ...    │
    └──────────┘   └──────────┘   └──────────┘
```

### 角色职责

#### Master 职责

| 职责 | 说明 |
|------|------|
| 需求分析 | 理解用户需求，拆解为可执行任务 |
| 任务创建 | 在 Jira 中创建 Tickets |
| 代码 Review | 审查 Slaver 提交的 PR |
| 决策仲裁 | 解决 Slaver 之间的冲突 |
| 状态协调 | 维护系统整体状态一致性 |

#### Slaver 职责

| 职责 | 说明 |
|------|------|
| 任务承接 | 主动领取与自己角色匹配的任务 |
| 自主执行 | 规划并执行任务 |
| 状态上报 | 定期心跳和进度更新 |
| 提交 PR | 完成后提交代码审查 |

---

## 理由

### 为什么选择 Master/Slaver 而非其他模式？

**方案对比**:

| 模式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Master/Slaver** | **决策集中、避免冲突** | **Master 单点故障** | **AI 协作框架** |
| 纯去中心化 | 无单点故障 | 决策分散、可能冲突 | P2P 网络 |
| 完全民主 | 决策公平 | 效率低 | 小型团队 |
| 层级管理 | 结构清晰 | 灵活性差 | 大型组织 |

### 为什么 Master 单点不是问题？

1. **Master 选举机制**: 防止多 Master 冲突
   - Redis SETNX 分布式锁
   - SQLite 事务锁
   - 文件系统原子操作

2. **租约机制**: Master 可能随时下线
   - 30 秒租约，15 秒续期
   - 超时自动失效

3. **重新选举**: Master 失效后自动选举

---

## Master 选举机制

### 选举流程

```
1. 尝试获取锁 (SETNX / INSERT / mkdir)
     │
     ├── 成功 → 声明等待期 (2 秒) → 无冲突 → 成为 Master
     │                            │
     │                            └── 有冲突 → 成为 Slaver
     │
     └── 失败 → 降级下一级 (SQLite → File)
```

### 配置示例

```typescript
const election = createMasterElection({
  redis: { host: 'localhost', port: 6379 },
  projectRoot: '/path/to/project',
  electionTimeout: 5000,      // 选举超时
  declarationPeriod: 2000,    // 声明等待期
  leaseTime: 30000            // 租约时间
});

const result = await election.elect();
if (result.data?.isMaster) {
  console.log('I am the Master!');
} else {
  console.log('I am a Slaver. Master ID:', result.data?.masterId);
}
```

---

## 影响

### 积极影响

1. **清晰的角色划分**: 每个实例知道自己的职责
2. **避免冲突**: 只有一个 Master，决策唯一
3. **高效协作**: Slaver 专注执行，Master 专注协调
4. **可追溯性**: 所有决策都有明确来源

### 消极影响

1. **Master 单点**: Master 失效影响系统功能
2. **选举开销**: 需要额外的选举机制
3. **角色切换**: 实例需要支持角色切换

### 缓解措施

- 自动选举机制保证 Master 快速恢复
- 租约机制防止僵尸 Master
- 声明等待期防止多 Master 冲突

---

## 使用示例

### 启动实例（自动检测角色）

```bash
# 启动实例，自动判断是 Master 还是 Slaver
/eket-start

# 启用自动模式（Slaver 自动领取任务）
/eket-start -a
```

### 查看当前角色

```bash
/eket-status
```

### 切换角色

```bash
# 切换到 Master 模式（如果当前没有 Master）
/eket-mode master

# 切换到 Slaver 模式
/eket-mode execution
```

---

## 相关文档

- [Master 选举实现](../../node/src/core/master-election.ts)
- [Instance 启动流程](../../node/src/commands/start-instance.ts)
- [架构框架](../02-architecture/FRAMEWORK.md)

---

## 备注

"Master/Slaver" 术语在技术社区存在争议，但在此上下文中：
- 仅表示角色分工，无其他含义
- 角色是动态的，实例可以切换
- 所有实例平等，职责不同

未来考虑使用替代术语如 "Coordinator/Worker"。
