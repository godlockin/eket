# {{PROJECT_NAME}} - AI 智能体协作项目

**版本**: v2.0.0
**初始化**: EKET Agent Framework

> 本项目由 EKET Agent Framework 初始化

## 快速开始

### 1. 初始化智能体系统

```bash
# 安装依赖（如需要）
./scripts/setup.sh

# 启动智能体（如果使用独立进程模式）
./scripts/start-agents.sh
```

### 2. 提交任务

在 `inbox/human_input.md` 中描述你的需求：

```markdown
---
timestamp: "2026-03-18T15:00:00+08:00"
priority: "normal"
---

# 需求描述

## 我想要

<描述你想要的功能>

## 验收标准

- [ ] <标准 1>
- [ ] <标准 2>
```

### 3. 等待处理

智能体会自动：
1. 分析需求
2. 创建任务
3. 执行开发
4. 提交 PR

### 4. Review 并完成

检查 PR 和输出，在 `inbox/human_feedback/` 回复反馈。

---

## 项目结构

```
{{PROJECT_NAME}}/
├── .eket/                    # EKET 配置和状态
│   ├── config.yml
│   ├── state/
│   └── memory/
├── inbox/                    # 人类输入
│   ├── human_input.md
│   └── human_feedback/       # Review 反馈
├── outbox/                   # 智能体输出
│   ├── tasks/                # 任务相关输出（分析报告、PR 请求等）
│   └── review_requests/      # Review 请求（遗留兼容）
├── skills/                   # Skills 库
├── tasks/                    # 任务定义
├── src/                      # 源代码
└── ...
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `/eket-status` | 查看智能体状态 |
| `/eket-task <desc>` | 创建新任务 |
| `/eket-review` | 请求 Review |
| `/eket-help` | 获取帮助 |

---

## 智能体配置

编辑 `.eket/config.yml` 来配置智能体行为。

---

**Initialized by EKET** | [Documentation](../docs/README.md)
