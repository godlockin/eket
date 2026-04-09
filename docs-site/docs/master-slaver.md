---
sidebar_position: 4
---

# Master/Slaver 工作流

EKET 的核心设计是 Master-Slaver 协作模式。

## 角色定义

### Master (协调实例)

**职责**:
- 需求分析与任务拆解
- 启动 Slaver 实例并行执行
- 进度监控与仲裁
- PR 审查与合并

**禁止**:
- ❌ 直接修改功能代码
- ❌ 领取任务进行开发
- ❌ 绕过 Review 直接合并

### Slaver (执行实例)

**职责**:
- 领取任务并自主开发
- 编写测试和实现
- 提交 PR 请求审查
- 响应审查意见修改

**禁止**:
- ❌ 合并代码到 main 分支
- ❌ 审查自己的 PR
- ❌ 跳过测试提交

## 思维框架注入

实例启动时自动加载思维模板：

```
Level 1: 身份确认 (.eket/IDENTITY.md)
  ↓ 决定加载哪个思维模板
Level 2: 思维模板 (.eket/templates/{master,slaver}_workflow.md)
  ↓ 注入系统提示词
Level 3: 工作模式 (思维框架自动执行)
```

### Master 思维链

```
1. 分类输入 → 2. 分析拆解 → 3. 并行规划 → 4. 启动执行 → 5. 监控仲裁 → 6. 审查整合
```

### Slaver 思维链

```
1. 理解任务 → 2. 自主规划 → 3. 执行开发 → 4. 质量保证 → 5. 提交 PR → 6. 响应审查
```

## 启动命令

```bash
# 启动 Master 实例
node dist/index.js instance:start --role master

# 启动 Slaver 实例
node dist/index.js instance:start --role slaver --profile backend_dev
```

## 工作流程示例

```
人类： "优化 CLI 体验"
  ↓
Master: 需求分析 → 任务拆解
  ├─ TASK-001: 交互式启动菜单 (frontend_dev)
  ├─ TASK-002: 命令补全脚本 (backend_dev)
  └─ TASK-003: 错误消息优化 (backend_dev)
  ↓
Slaver A: 领取 → 开发 → 测试 → PR
Slaver B: 领取 → 开发 → 测试 → PR
  ↓
Master: 审查 → 合并 → 完成
```
