# L2 模块系列：EKET 核心设计模式（4篇）

> **定位**: 技术价值担当，面向技术管理者和高级开发者
> **目标**: 可复用的设计模式 + 可落地的代码示例
> **风格**: 技术博主阿杰，理论与实战并重

---

## L2-01: 四级降级架构 —— 凌晨3点系统挂了怎么办

### Hook（技术痛点场景）

> **场景**: 凌晨3点，你被告警电话叫醒。Redis 集群挂了，主库连接超时，整个系统陷入瘫痪。你打开电脑，发现所有服务都在疯狂重试，CPU 100%，内存爆表。
> 
> **痛点**: 单点依赖 = 定时炸弹。大多数系统的降级策略是"没有策略"。

### 核心论点

**渐进式降级不是备胎方案，是生产级架构的必选项**

- 四级降级：Shell → Rust → Node.js → Redis/SQLite
- 每一级都是完整可用的系统，不是残废模式
- 降级不是"凑合用"，是"换个姿势继续跑"

### 结构大纲

```
1. 凌晨3点的噩梦（Hook故事）
   - 真实生产事故复盘
   - 单点依赖的代价
   - 为什么"高可用"经常只是PPT

2. 四级降级架构设计哲学
   - Level 4: Redis/SQLite（高性能持久化）
   - Level 3: Node.js（灵活逻辑层）
   - Level 2: Rust（高性能核心）
   - Level 1: Shell（终极保底）
   - 每级的能力边界和适用场景

3. 降级触发机制
   - 健康检查设计（3秒超时/3次重试）
   - 熔断阈值：5次失败 → 触发降级
   - 自动升级回切：30秒冷却期后探活

4. 代码实战：双轨路由器实现
   - DualTrackRouter 核心逻辑
   - detectRustEnvironment() 环境探测
   - 透明切换：业务代码零感知

5. 状态同步：降级不丢数据
   - Write-Ahead Log 设计
   - 升级后的增量同步策略
   - 冲突解决：Last-Write-Wins vs CRDT

6. 生产环境验证
   - 混沌工程：故意杀进程测试
   - 降级延迟指标：<100ms 完成切换
   - 真实案例：某次 Redis 故障的自动恢复
```

### 必要代码示例描述

1. **DualTrackRouter 核心类**（TypeScript）
   - `detectRustEnvironment()`: 300ms 超时探测
   - `tryElect()`: 双轨选举逻辑
   - `setTrack()`/`getCurrentTrack()`: 状态切换

2. **四级降级状态机**（伪代码/流程图）
   ```
   [Redis] --失败--> [Node.js] --失败--> [Rust] --失败--> [Shell]
      ^                                                      |
      +------------------< 恢复探测 <------------------------+
   ```

3. **健康检查配置示例**（YAML）
   ```yaml
   health_check:
     timeout: 3000ms
     retries: 3
     cooldown: 30000ms
   ```

### 配图需求

1. **四级降级架构图**：金字塔形，底部Shell最稳定，顶部Redis最快
2. **降级状态机流程图**：状态转换 + 触发条件
3. **时序图**：一次完整的降级→恢复流程
4. **性能对比表**：各级的 QPS / 延迟 / 功能边界

### SEO 关键词

`降级架构`, `高可用设计`, `故障恢复`, `熔断降级`, `渐进式降级`, `Rust Node.js 混合架构`, `分布式系统容错`, `凌晨故障处理`

---

## L2-02: 双轨路由器 —— Rust高性能 vs Node.js灵活性的抉择

### Hook（技术痛点场景）

> **场景**: 团队争论了一周：用 Rust 还是 Node.js？Rust 党说"性能为王"，Node 党说"迭代速度更重要"。最后各写各的，两套代码互不兼容。
> 
> **痛点**: 技术选型不是二选一，而是如何让两者协同。

### 核心论点

**双轨不是妥协，是最优解**

- Track A (Rust): 高频、计算密集、性能敏感
- Track B (Node.js): 灵活、快速迭代、业务逻辑复杂
- 运行时动态切换，业务代码无感知

### 结构大纲

```
1. 技术选型的伪命题（Hook故事）
   - Rust vs Node.js：一场没有赢家的战争
   - 为什么"全部重写"是最差方案
   - 双轨架构的诞生背景

2. Track A vs Track B 边界划分
   - Track A（Rust）适合什么？
     * Master 选举（高频心跳）
     * 事件总线（吞吐量敏感）
     * 锁服务（低延迟要求）
   - Track B（Node.js）适合什么？
     * 工作流引擎（逻辑复杂）
     * 知识库查询（灵活查询）
     * API 网关（快速迭代）

3. 双轨路由器核心设计
   - 接口抽象：IMasterElection
   - 适配器模式：RustElectionAdapter / NodeElectionFallback
   - 透明代理：DualTrackElection

4. 动态切换机制
   - 冷却期设计：30秒后才尝试回切
   - 健康探测：非阻塞异步检测
   - 状态隔离：isCheckingHealth 防重入

5. 性能对比实测
   - 选举延迟：Rust 2ms vs Node.js 15ms
   - 事件吞吐：Rust 50k/s vs Node.js 8k/s
   - 内存占用：Rust 12MB vs Node.js 80MB

6. 最佳实践：如何决定用哪条轨道
   - 决策树：性能要求 → Rust；灵活性要求 → Node.js
   - 灰度策略：先 Node.js 验证逻辑，再 Rust 优化热点
   - 统一接口：永远面向接口编程
```

### 必要代码示例描述

1. **接口定义**（TypeScript）
   ```typescript
   interface IMasterElection {
     tryElect(): Promise<boolean>;
   }
   ```

2. **Rust 适配器**
   - HTTP 调用 Rust API
   - 500ms 超时
   - Content-Type 校验防 HTML 响应

3. **Node.js 降级实现**
   - 本地 MasterElection 类
   - 文件锁 + 心跳机制

4. **双轨切换逻辑**
   ```typescript
   // 冷却期后探测 Rust 是否恢复
   if (now - lastFailureTime > cooldownMs) {
     const diagnostics = await detectRustEnvironment();
     if (diagnostics.available) setTrack('A');
   }
   ```

### 配图需求

1. **双轨架构图**：Track A / Track B 并行，中间是 Router
2. **决策流程图**：什么场景走哪条轨道
3. **性能对比柱状图**：延迟、吞吐量、内存
4. **状态切换时序图**：故障 → 降级 → 恢复

### SEO 关键词

`Rust Node.js 混合`, `双轨架构`, `技术选型`, `高性能设计`, `适配器模式`, `动态路由`, `微服务降级`, `多语言架构`

---

## L2-03: 知识飞轮 —— 让 AI 越用越聪明的知识积累机制

### Hook（技术痛点场景）

> **场景**: 新来的 AI Agent 又踩了同样的坑——上周刚有人踩过。你翻了半天 Slack 历史消息，终于找到解决方案，然后手动喂给 AI。一周后，另一个 Agent 又踩了一遍。
> 
> **痛点**: AI 没有记忆 = 每次都是新手。知识在团队里分散，无法系统复用。

### 核心论点

**知识飞轮：积累 → 索引 → 推荐 → 验证 → 再积累**

- 经验教训自动沉淀，不靠人工整理
- 上下文感知推荐，不是全量搜索
- 使用反馈驱动排序，越用越准

### 结构大纲

```
1. AI 的失忆症（Hook故事）
   - 同样的坑踩三遍
   - 知识在 Slack/文档/脑子里分散
   - 为什么 RAG 不够用

2. 知识飞轮模型
   - 积累：自动捕获 + 手动沉淀
   - 索引：多维度标签 + 全文检索
   - 推荐：上下文相关性排序
   - 验证：使用反馈 + 过期淘汰
   - 闭环：推荐结果反哺排序权重

3. 六类知识分类法
   - artifact（产物）：代码片段、配置模板
   - pattern（模式）：设计模式、最佳实践
   - decision（决策）：架构选型、技术决策
   - lesson（教训）：踩坑记录、避坑指南
   - api_info（接口）：API 文档、调用示例
   - config（配置）：环境参数、部署配置

4. 自动捕获机制
   - Ticket 关闭时自动提取关键信息
   - Error 日志关联解决方案
   - PR Review 意见沉淀为 Pattern

5. 上下文感知推荐
   - 当前 Ticket 标签匹配
   - 相似错误模式识别
   - 依赖关系图推理

6. 反馈驱动优化
   - 使用次数加权
   - 负反馈降权（"这个没用"）
   - 过期检测：180天未使用 → 归档
```

### 必要代码示例描述

1. **知识条目数据结构**
   ```typescript
   interface KnowledgeEntry {
     id: string;
     type: 'artifact' | 'pattern' | 'decision' | 'lesson' | 'api_info' | 'config';
     title: string;
     description: string;
     content: string;
     tags: string[];
     createdBy: string;
     relatedTickets: string[];
     usageCount: number;
     lastUsedAt: number;
   }
   ```

2. **自动捕获触发器**（伪代码）
   ```typescript
   onTicketClosed(ticket) {
     if (ticket.labels.includes('bug-fixed')) {
       extractLesson(ticket);
     }
     if (ticket.labels.includes('new-pattern')) {
       extractPattern(ticket);
     }
   }
   ```

3. **推荐算法核心**
   ```sql
   SELECT * FROM knowledge_base
   WHERE tags && current_ticket.tags
   ORDER BY 
     relevance_score * 0.5 +
     usage_count * 0.3 +
     recency_score * 0.2
   LIMIT 5;
   ```

4. **反馈收集接口**
   ```typescript
   recordFeedback(knowledgeId, useful: boolean);
   ```

### 配图需求

1. **知识飞轮循环图**：积累 → 索引 → 推荐 → 验证 → 积累
2. **六类知识分类示意图**：图标 + 典型示例
3. **推荐算法权重饼图**：相关性/使用量/时效性
4. **数据流向图**：Ticket → 自动提取 → 知识库 → 推荐 → Agent

### SEO 关键词

`AI 知识管理`, `知识图谱`, `经验沉淀`, `RAG 增强`, `上下文推荐`, `知识库设计`, `AI Agent 记忆`, `团队知识复用`

---

## L2-04: 断路器模式 —— 请求暴涨10倍也不崩

### Hook（技术痛点场景）

> **场景**: 大促开始，流量暴涨10倍。下游 API 开始超时，你的服务疯狂重试，线程池耗尽，连接数爆表。5分钟后，整个集群雪崩，连健康检查都超时了。
> 
> **痛点**: 没有断路器 = 没有刹车的汽车。

### 核心论点

**断路器不是防御，是止损**

- 快速失败比慢慢等死强
- 半开状态是优雅恢复的关键
- 断路器 + 重试 + 降级 = 完整容错方案

### 结构大纲

```
1. 雪崩效应（Hook故事）
   - 一个超时如何拖垮整个集群
   - 重试风暴的恶性循环
   - 为什么限流不够用

2. 断路器三态模型
   - Closed（关闭）：正常放行
   - Open（打开）：快速失败
   - Half-Open（半开）：探测恢复
   - 状态转换条件和时机

3. 核心参数设计
   - failureThreshold：5次失败触发熔断
   - timeout：30秒后尝试恢复
   - successThreshold：3次成功关闭断路器
   - monitorTimeout：60秒统计窗口

4. 与重试机制配合
   - 指数退避：100ms → 200ms → 400ms → 800ms
   - 最大重试次数：3次
   - 可重试错误白名单：网络超时、5xx

5. 代码实战：CircuitBreaker 实现
   - execute() 包装任意操作
   - onSuccess()/onFailure() 状态更新
   - canExecute() 状态检查

6. 监控与告警
   - 断路器状态指标暴露
   - 打开次数/恢复时间统计
   - Grafana Dashboard 示例
```

### 必要代码示例描述

1. **断路器核心类**（TypeScript）
   ```typescript
   class CircuitBreaker {
     private state: 'closed' | 'open' | 'half_open' = 'closed';
     private failures = 0;
     private successes = 0;
     
     async execute<T>(operation: () => Promise<T>): Promise<T> {
       if (!this.canExecute()) {
         throw new CircuitOpenError();
       }
       try {
         const result = await operation();
         this.onSuccess();
         return result;
       } catch (err) {
         this.onFailure();
         throw err;
       }
     }
   }
   ```

2. **状态转换逻辑**
   ```typescript
   // Closed → Open
   if (failures >= failureThreshold) {
     state = 'open';
     openedAt = Date.now();
   }
   
   // Open → Half-Open
   if (Date.now() - openedAt >= timeout) {
     state = 'half_open';
   }
   
   // Half-Open → Closed
   if (successes >= successThreshold) {
     state = 'closed';
     failures = 0;
   }
   ```

3. **重试机制配合**
   ```typescript
   const retryConfig = {
     maxRetries: 3,
     initialDelay: 100,
     maxDelay: 2000,
     multiplier: 2,
   };
   
   async function withRetry(fn, config) {
     let delay = config.initialDelay;
     for (let i = 0; i < config.maxRetries; i++) {
       try {
         return await fn();
       } catch (err) {
         if (!isRetryable(err)) throw err;
         await sleep(delay);
         delay = Math.min(delay * config.multiplier, config.maxDelay);
       }
     }
     throw new MaxRetriesExceeded();
   }
   ```

4. **监控指标暴露**
   ```typescript
   getStats(): CircuitStats {
     return {
       state: this.state,
       failures: this.failures,
       successes: this.successes,
       openedAt: this.openedAt,
       lastFailureTime: this.lastFailureTime,
     };
   }
   ```

### 配图需求

1. **断路器状态机图**：三态 + 转换条件
2. **雪崩效应示意图**：一个超时如何级联放大
3. **指数退避曲线图**：重试间隔递增
4. **Grafana Dashboard 截图**：断路器状态监控面板

### SEO 关键词

`断路器模式`, `熔断降级`, `Circuit Breaker`, `服务容错`, `雪崩效应`, `指数退避`, `高可用设计`, `流量突增处理`

---

## 跨文章关联

| 文章 | 前置依赖 | 后续延伸 |
|------|---------|---------|
| L2-01 四级降级 | - | L2-02 双轨路由器 |
| L2-02 双轨路由器 | L2-01 降级概念 | L2-04 断路器 |
| L2-03 知识飞轮 | - | L3 系列（AI 能力） |
| L2-04 断路器 | L2-01 降级触发 | L2-02 双轨配合 |

## 统一代码仓库

所有代码示例来源：`eket/node/src/core/`
- `dual-track-router.ts` — L2-01, L2-02
- `circuit-breaker.ts` — L2-04
- `knowledge-base.ts` — L2-03

## 视觉风格统一

- 架构图：深色背景 + 霓虹色模块
- 流程图：左到右/上到下，箭头带条件标签
- 代码：Monaco 配色，关键行高亮
- 数据可视化：Grafana 风格仪表盘
