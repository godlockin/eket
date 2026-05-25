# Rust vs Node.js：性能与开发效率的平衡

> 平台：微信公众号 / 掘金
> 定位：L3 决策说明
> 阅读时间：6分钟

---

## 🤔 核心问题

为什么 EKET 同时用两种语言？

```
Rust  → 核心逻辑、CLI、性能敏感路径
Node.js → Hook Server、Dashboard、降级兼容
```

不嫌麻烦吗？

---

## 📊 性能差距

### 任务领取基准测试

```
操作: task:claim TASK-042

Rust:    4.2ms  ████
Node.js: 47ms   ████████████████████████████████████████████████

提升: 11x
```

### SQLite 批量写入

```
操作: 写入 1000 条记录

Rust:    23ms   ████████████████████████
Node.js: 312ms  ████████████████████████████████████...（很长）

提升: 13x
```

### 全文搜索

```
操作: knowledge:search "认证"

Rust:    12ms   ████████████
Node.js: 89ms   ████████████████████████████████████████████████████████████████████████████████████████████

提升: 7x
```

**Rust 快 7-13 倍，不是一点点。**

---

## 💰 开发成本差距

### 同一功能实现时间

| 功能 | Rust | Node.js | 倍数 |
|------|------|---------|------|
| HTTP Server | 4h | 1h | 4x |
| JSON 解析 | 2h | 0.5h | 4x |
| 文件操作 | 1h | 0.3h | 3x |
| CLI 参数 | 3h | 1h | 3x |

**Node.js 开发快 3-4 倍。**

### 调试时间

```
Rust Bug:
  编译错误 → 读错误信息 → 修改 → 编译 → 测试
  平均: 30分钟/bug

Node.js Bug:
  运行报错 → console.log → 修改 → 运行
  平均: 10分钟/bug
```

---

## ⚖️ 权衡决策

### 核心原则

```
性能关键 → Rust
迭代速度关键 → Node.js
```

### 具体场景

| 场景 | 选择 | 原因 |
|------|------|------|
| CLI 命令 | Rust | 用户感知延迟 |
| 任务领取 | Rust | 高频操作，竞态敏感 |
| SQLite 操作 | Rust | 数据密集 |
| 全文搜索 | Rust | 计算密集 |
| Web Dashboard | Node.js | 前端生态 |
| Hook Server | Node.js | 快速迭代 |
| 配置解析 | Node.js | 启动一次 |
| 日志输出 | Node.js | 调试方便 |

### 决策流程图

```
新功能需求
    ↓
用户能感知延迟？──是──→ Rust
    ↓ 否
高频调用？──────是──→ Rust
    ↓ 否
计算密集？──────是──→ Rust
    ↓ 否
需要快速迭代？──是──→ Node.js
    ↓ 否
前端交互？──────是──→ Node.js
    ↓ 否
默认 ──────────────→ Node.js（先跑起来）
```

---

## 🏗️ 架构实现

### Workspace 结构

```
eket/
├── rust/                    # Rust 代码
│   ├── Cargo.toml           # workspace
│   └── crates/
│       ├── eket-core/       # 核心类型、DB、Saga
│       ├── eket-engine/     # 运行时引擎
│       ├── eket-server/     # axum HTTP API
│       └── eket-cli/        # CLI 入口
│
└── node/                    # Node.js 代码
    ├── package.json
    └── src/
        ├── core/            # 核心逻辑
        ├── commands/        # CLI 命令（降级用）
        └── server/          # Hook Server
```

### 调用方式

**Node.js 调用 Rust:**

```typescript
// node/src/core/rust-bridge.ts

import { execFile } from 'child_process';

export async function rustClaimTask(taskId: string): Promise<Task> {
  return new Promise((resolve, reject) => {
    execFile('eket', ['task:claim', taskId], (error, stdout) => {
      if (error) reject(error);
      else resolve(JSON.parse(stdout));
    });
  });
}
```

**Rust 暴露 HTTP API:**

```rust
// rust/crates/eket-server/src/lib.rs

pub fn create_router() -> Router {
    Router::new()
        .route("/api/v1/tasks/:id/claim", post(claim_task))
        .route("/api/v1/knowledge/search", get(search_knowledge))
        // ...
}
```

**Node.js 调用 HTTP:**

```typescript
// node/src/core/rust-client.ts

export async function claimTask(taskId: string): Promise<Task> {
  const response = await fetch(
    `http://localhost:9877/api/v1/tasks/${taskId}/claim`,
    { method: 'POST' }
  );
  return response.json();
}
```

---

## 📈 迁移路径

### Phase 1: 全 Node.js

```
快速验证想法
    ↓
所有功能用 Node.js 实现
    ↓
发现性能瓶颈
```

### Phase 2: 热点 Rust 化

```
profile 找到热点
    ↓
task:claim 用 Rust 重写  # 提升 11x
    ↓
knowledge:search 用 Rust 重写  # 提升 7x
    ↓
SQLite 层用 Rust 重写  # 提升 13x
```

### Phase 3: 双轨并行

```
Rust 为主轨（性能）
    ↓
Node.js 为降级轨（兼容）
    ↓
断路器自动切换
```

---

## 💡 经验总结

### 1. 不要过早优化

```
❌ 一开始就用 Rust
   开发慢 → 需求变了 → 白写

✅ 先用 Node.js 跑通
   验证需求 → 发现瓶颈 → 定点优化
```

### 2. 接口先行

```rust
// 先定义接口
trait TaskManager {
    async fn claim(&self, task_id: &str) -> Result<Task>;
}

// 再实现
struct RustTaskManager { ... }
struct NodeTaskManager { ... }
```

两种实现可以无缝切换。

### 3. 测试覆盖

```
Rust 实现 = Node.js 实现
    ↓
用同一套测试用例
    ↓
保证行为一致
```

### 4. 监控对比

```typescript
// 记录两种实现的性能
metrics.record('task_claim', {
  implementation: 'rust',
  duration: 4.2,
});

metrics.record('task_claim', {
  implementation: 'node',
  duration: 47,
});
```

---

## 📊 最终效果

| 指标 | 纯 Node.js | Rust + Node.js |
|------|------------|----------------|
| task:claim 延迟 | 47ms | 4.2ms |
| 知识搜索延迟 | 89ms | 12ms |
| 开发迭代速度 | 快 | 快（Node.js 部分）|
| 生产稳定性 | 中 | 高 |
| 维护成本 | 低 | 中 |

**性能提升 7-13x，开发体验不打折。**

---

## 🚀 下一篇预告

**《文件系统 vs 数据库：分布式通信的取舍》**

为什么用文件而不是消息队列？什么场景用数据库？

---

#Rust #Node.js #架构设计 #性能优化 #技术选型
