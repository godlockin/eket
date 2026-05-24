# EPIC-010: Rust 高性能核心演进（Master 租约与消息总线 Native 化）

**创建时间**: 2026-05-24  
**状态**: ready_to_execute  
**优先级**: P0-核心架构  
**预估工时**: 32h  

---

## 概述

为将 EKET 框架推向工业级高并发与超高可靠性，计划将 Node.js 层的两个核心状态与事务密集型组件（Master 选举/租约与消息总线）迁移至 Rust 原生层，同时在 Node.js 中实现健壮的**“双轨制（Dual-Track）自适应降级运行引擎”**。

在无 Rust 运行环境或编译失败的机器上，Node.js 能够无缝且不崩溃地回退到纯 JS 版本的选举、消息总线与自愈器，确保 EKET 渐进式多级降级架构的终极柔韧性。

---

## 子模块拆解

### Milestone 1: Rust 原生高并发事务层（16h）
- **TASK-Z01**: Rust Native Master 选举与 Slaver 注册表设计
- **TASK-Z02**: Rust Native 消息总线与 Pub/Sub 订阅分发

### Milestone 2: Node.js 弹性双轨自适应引擎（16h）
- **TASK-Z03**: Node.js 双轨制运行与自适应降级 Fallback 引擎

---

## 验收标准

- [ ] 在具备 Rust 二进制环境的系统上，高频命令（如选举和消息发布）由 Rust 代理，响应延迟缩短至微秒级（< 5ms）。
- [ ] 在**无 Rust 编译或运行环境**（如极简 Docker 或部分 CI/CD 机器）的机器上，系统不仅**绝对不能崩溃**，而且应自动检测并无缝降级回退至纯 JS 轨道运行。
- [ ] 多 Agent 并行运行时租约刷新无死锁，且当数据库中断恢复后，WAL 重放引擎能幂等回放消息。

---

**Master 下一步**: 呼叫 Slaver 团队开始认领 Milestone 1 核心卡片。
