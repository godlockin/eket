---
sidebar_position: 1
---

# EKET Framework 介绍

> **EKET** 是一个 AI 智能体协作框架，通过 Master-Slaver 架构实现多智能体协作开发。

## 核心理念

**渐进式三级架构**

```
Level 1: Shell + 文件队列 (基础版)     ← 优先保证 100% 可用
  ↓ 渐进增强
Level 2: Node.js + Redis (增强版)     ← 更高效专业
  ↓ 完整功能
Level 3: SQLite + 分布式 (满血版)    ← 生产级高并发
```

## 主要特性

- 🎯 **Master-Slaver 协作**: 协调实例与执行实例分离
- 🧠 **思维框架注入**: 实例启动时自动加载工作范式
- 📦 **三级架构**: 从基础版到生产版平滑升级
- 🔌 **Skills 系统**: 可复用的能力单元（需求/设计/开发/测试/文档）
- 🌉 **OpenCLAW 集成**: 支持远程 Agent 调用

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/godlockin/eket.git
cd eket/node

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 启动实例
node dist/index.js instance:start --auto
```

## 当前版本

- **版本**: v2.6.0
- **测试覆盖率**: 100% (1046/1046 tests)
- **目标**: v3.0.0 (生产级 AI 协作框架)
