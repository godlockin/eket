# 四级降级架构（Four-Level Degradation Pattern）

> 2026-05-04 更新：Rust binary 作为 Level 1 插入，原 Node.js 降为 Level 2，原三级升为四级。

## 概述

渐进式技术栈架构，允许系统在不同环境（仅 bash、有 Rust binary、有 Node.js、有 Redis）下都能运行，从最小化依赖到全功能配置自适应降级。

## 架构层级

### Level 0 — Shell 基线
- **能力**：纯 bash 脚本，零依赖，任何 POSIX 环境可用
- **适用场景**：所有上层技术栈不可用时的最终回退
- **限制**：功能受限，性能较低，仅保证基本可用性

### Level 1 — Rust Binary Core
- **能力**：高性能核心，~21ms 启动时间，内置 SQLite+Redis 支持
- **适用场景**：生产环境主力，命令行工具首选
- **限制**：需编译环境或预编译 binary，无 GUI

### Level 2 — Node.js Layer
- **能力**：Web Dashboard / LLM Gateway / 交互式向导
- **适用场景**：需要 Web 界面或 JavaScript 生态集成时
- **限制**：不含核心业务逻辑，仅作 UI 层

### Level 3 — Redis+SQLite
- **能力**：分布式任务队列 + 持久化状态存储
- **适用场景**：多节点协作或需要高可用时
- **限制**：需外部服务，故障时自动降级到 Level 1

## 设计决策

### 降级策略
1. **优雅回退**：每层在上层不可用时自动降级，不抛出异常
2. **最小保证**：Level 0 永远可用，不依赖任何外部服务
3. **透明切换**：用户无需感知当前运行级别
4. **可观测性**：通过诊断命令反映当前实际级别

### 层间依赖规则
- Level 2 数据获取必须通过 Level 1 API，禁止直接操作数据库
- Level 1 降级到 Level 0 时自动切换文件队列
- Level 3 故障时断路器防止级联失效

## 对外 API

系统对外提供统一接口，内部自动选择可用层级：

```bash
# CLI 接口（自动选择 Level 1 或 Level 0）
eket <command> [args]

# HTTP API（仅 Level 1 提供）
GET/POST http://localhost:9877/api/*

# 诊断接口
eket system:doctor  # 返回当前运行级别
```

## 适用场景

适用于需要在不同环境下保持可用性的系统：
- CI/CD 环境（可能缺少 Node.js 或 Redis）
- 容器化部署（分阶段安装依赖）
- 本地开发（允许部分依赖缺失）
- 生产环境（需要高可用和优雅降级）

---

> **实现细节**：查看 `confluence/memory/patterns/four-level-degradation.md`
