# 分级安装体系设计经验

**日期**: 2026-05-26  
**类型**: feedback  
**状态**: ✅ 已实施

---

## 背景

用户反馈仓库太大（9GB），需要精简安装方式。

## 问题分析

| 问题 | 原因 | 影响 |
|------|------|------|
| 仓库 9GB | `.git/` 7.5GB + `rust/target/` 1.2GB + `node_modules/` 285MB | 新用户望而却步 |
| 安装脚本指向不存在的文件 | README 引用 `install.sh` 但实际不存在 | 用户无法安装 |
| 一刀切安装 | 无论需求都下载全部 | 大多数用户只需要 Claude Code 增强 |

## 解决方案

### 三级安装体系

```
Level 1 (最简)     Level 2 (项目)      Level 3 (完整)
    │                   │                   │
    ▼                   ▼                   ▼
┌─────────┐       ┌─────────┐         ┌─────────┐
│ Skills  │       │ Skills  │         │ Skills  │
│ Commands│  →    │ Commands│    →    │ Commands│
│ Hooks   │       │ Hooks   │         │ Hooks   │
└─────────┘       │ CLAUDE.md         │ CLAUDE.md
   ~50MB          │ confluence/       │ confluence/
                  │ jira/     │       │ jira/     │
                  └─────────┘         │ CLI binary│
                     ~50MB            └─────────┘
                                         ~60MB
```

### 关键技术决策

1. **Sparse Checkout** - 只下载必要文件，50MB vs 9GB
2. **分级递进** - Level 1 是 Level 2 的子集，Level 2 是 Level 3 的子集
3. **链接而非复制** - 项目级 commands 链接到全局安装，升级自动生效

---

## 经验教训

### 1. 安装体验决定第一印象

**Why:** 用户在安装阶段放弃 = 永远失去这个用户。9GB 下载让大多数人直接关闭页面。

**How to apply:** 
- 默认提供最轻量选项
- 完整功能应该是可选的渐进增强
- 下载量要在 README 中明确标注

### 2. README 是产品的一部分

**Why:** README 中的命令如果跑不通，用户会认为整个项目不靠谱。

**How to apply:**
- 每次修改安装脚本后，同步更新 README
- 定期测试 README 中的所有命令
- 使用 CI 验证安装流程

### 3. 分级设计优于一刀切

**Why:** 不同用户有不同需求。强迫轻度用户安装完整系统是浪费；限制重度用户只能用轻量版是阻碍。

**How to apply:**
- 识别用户群体的不同需求
- 设计可组合的模块化安装
- 每个级别都应该是完整可用的

---

## 相关文件

- `scripts/quick-setup.sh` - 分级安装脚本
- `README.md` - 更新后的快速开始指南

---

*安装体验是产品体验的第一道门*
