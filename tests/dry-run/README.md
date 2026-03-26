# EKET Dry-Run 测试文档

**版本**: 0.8.0
**最后更新**: 2026-03-26

---

## 概述

EKET 框架的 dry-run 测试套件用于在开发阶段验证功能的完备性和正确性，无需实际运行完整的 AI Agent 系统。

---

## 测试套件列表

### 1. Instance Lifecycle Test

**脚本**: `test-instance-lifecycle.sh`

**用途**: 测试 Instance 的注册、状态更新、查询、注销流程

**测试内容**:
- 注册 Master Instance
- 注册人类 Slaver Instance
- 注册 AI Slaver Instance
- 查询活跃 Instance
- 按角色过滤 Instance
- 更新 Instance 状态
- Instance 心跳
- Instance 注销

**运行方式**:
```bash
# 自动模式（推荐）
./tests/dry-run/test-instance-lifecycle.sh

# 指定模式
./tests/dry-run/test-instance-lifecycle.sh --mode redis
./tests/dry-run/test-instance-lifecycle.sh --mode file
./tests/dry-run/test-instance-lifecycle.sh --mode shell

# 清理测试数据
./tests/dry-run/test-instance-lifecycle.sh --clean
```

**依赖**: Phase 4.1 (Instance 注册表)

---

### 2. Task Assignment Test

**脚本**: `test-task-assignment.sh`

**用途**: 测试基于角色的任务分配逻辑

**测试内容**:
- 创建测试任务
- 按角色匹配 Instance
- 任务分配给空闲 Instance
- 人类主动领取任务
- AI 自动领取任务
- 负载均衡

**运行方式**:
```bash
# 自动模式
./tests/dry-run/test-task-assignment.sh

# 指定模式
./tests/dry-run/test-task-assignment.sh --mode redis
./tests/dry-run/test-task-assignment.sh --mode file

# 清理测试数据
./tests/dry-run/test-task-assignment.sh --clean
```

**依赖**: Phase 4.3 (Skills 执行器和任务分配)

---

### 3. Fallback Modes Test

**脚本**: `test-fallback-modes.sh`

**用途**: 测试降级模式（Redis → 文件队列 → Shell → 离线）

**测试内容**:
- 检测 Redis 可用性
- Level 1 - Redis 模式
- Level 2 - 文件队列模式
- Level 3 - Shell 模式
- 自动降级逻辑
- 消息队列降级

**运行方式**:
```bash
# 运行所有测试
./tests/dry-run/test-fallback-modes.sh

# 清理测试数据
./tests/dry-run/test-fallback-modes.sh --clean
```

**依赖**: 无（独立测试）

---

## 降级架构说明

EKET 框架支持 5 级降级模式：

| Level | 模式 | 条件 | 存储方式 |
|-------|------|------|---------|
| 1 | 完整模式 | Redis + PostgreSQL 可用 | Redis 实时状态 + PG 历史 |
| 2 | 标准模式 | 仅 Redis 可用 | Redis + 文件备份 |
| 3 | 降级模式 | 仅 Node.js 可用 | 文件队列 |
| 4 | 基础模式 | 仅 Shell 可用 | Shell 状态文件 |
| 5 | 离线模式 | 无依赖 | 本地 JSON |

---

## 测试前置条件

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30.0

### 可选依赖

- Redis >= 6.0（用于测试完整模式）
- PostgreSQL >= 13（用于测试完整模式）

### 构建项目

```bash
cd node
npm install
npm run build
```

---

## 运行所有测试

```bash
# 运行单个测试
./tests/dry-run/test-instance-lifecycle.sh
./tests/dry-run/test-task-assignment.sh
./tests/dry-run/test-fallback-modes.sh

# 运行所有测试
./tests/dry-run/run-all-tests.sh
```

---

## 测试报告格式

测试完成后会生成报告：

```
========================================
测试报告
========================================
运行：10
通过：8
失败：2

所有测试通过！ 或 部分测试失败
```

---

## 故障排查

### 问题 1: Node.js 模块未找到

**错误**: `cannot find module`

**解决**:
```bash
cd node
npm install
npm run build
```

### 问题 2: Redis 连接失败

**错误**: `Redis connection failed`

**解决**: 这是正常的，系统会自动降级到文件队列模式。如需测试 Redis 模式，请启动 Redis：
```bash
redis-server
```

### 问题 3: 权限问题

**错误**: `Permission denied`

**解决**:
```bash
chmod +x tests/dry-run/*.sh
```

---

## 持续集成

测试套件可集成到 CI/CD 流程中：

```yaml
# .github/workflows/test.yml
name: EKET Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd node
          npm install

      - name: Build
        run: |
          cd node
          npm run build

      - name: Run dry-run tests
        run: |
          ./tests/dry-run/test-instance-lifecycle.sh
          ./tests/dry-run/test-task-assignment.sh
          ./tests/dry-run/test-fallback-modes.sh
```

---

## 扩展测试

### 添加新测试

1. 在 `tests/dry-run/` 创建新的测试脚本
2. 遵循现有测试的结构和格式
3. 使用相同的日志和断言函数
4. 更新本文档

### 测试示例

```bash
#!/bin/bash
# tests/dry-run/test-new-feature.sh

source ./test-common.sh  # 导入公共函数

test_new_feature_1() {
    log TEST "测试 1: 新功能基础测试"
    # 测试代码
    assert "描述" "条件"
}

test_new_feature_2() {
    log TEST "测试 2: 新功能高级测试"
    # 测试代码
    assert "描述" "条件"
}

run_all_tests
```

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-26
