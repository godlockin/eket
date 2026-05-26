# EKET Framework

**EKET (Elite Knowledge & Engineering Team) — Human-AI Special Forces Team Coordination Protocol**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.14.0--beta-blue.svg)](CHANGELOG.md)

[English](README.md) | [中文说明](README_zh-CN.md)

> **1–5 humans** set direction and make decisions. **N AI agents** handle execution at scale.
> Human Slaver and AI Slaver follow the exact same protocol: claim a ticket, deliver, get reviewed.

---

## 🚀 Quick Start

### macOS / Linux

```bash
# Level 1: 最简安装（Skills + Commands + Hooks）
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# Level 2: 项目初始化
cd your-project && curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init

# Level 3: 完整安装（含 CLI）
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --full
```

### Windows (PowerShell)

```powershell
# Level 1: 最简安装
irm https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.ps1 | iex

# Level 2: 项目初始化
cd your-project; .\quick-setup.ps1 -Init

# Level 3: 完整安装
.\quick-setup.ps1 -Full
```

> ⚠️ Windows 用户：Slash 命令 (.sh) 需要 Git Bash 或 WSL 执行

**立即使用：** 在 Claude Code 中输入 `/eket-start`

---

## 🤖 多工具支持

| 工具 | 支持级别 | 配置文件 | 说明 |
|------|----------|----------|------|
| **Claude Code** | ✅ 完整 | `CLAUDE.md` | Skills + Commands + Hooks + Subagent |
| **Cursor** | ✅ 完整 | `CURSOR.md` + `.cursorrules` | 通过项目指令支持 |
| **GitHub Copilot CLI** | ⚠️ 降级 | `COPILOT.md` | 单 Agent 模式，无 Subagent |
| **OpenAI Codex** | ⚠️ 降级 | `CODEX.md` | 单 Agent 模式，无 Subagent |
| **Gemini CLI** | ⚠️ 降级 | `AGENTS.md` | 通用规范 |
| **其他 LLM Agent** | ⚠️ 降级 | `AGENTS.md` | 通用规范 |

**降级模式说明：** 不支持 Skills/Subagent 的工具以单 Agent 模式运行，同时承担简化版 Master + Slaver 职责。

---

## 📦 安装方式对比

| 方式 | 平台 | 下载量 | 适合场景 |
|------|------|--------|----------|
| **Level 1** | macOS/Linux/Windows | ~50MB | 只用 Claude Code |
| **Level 2** | macOS/Linux/Windows | ~50MB | 项目中使用完整框架 |
| **Level 3** | macOS/Linux/Windows | ~60MB | 需要 CLI/API/Dashboard |
| **开发者** | 全平台 | ~9GB | 修改源码、贡献代码 |

### 开发者安装（完整源码）

```bash
# 完整克隆（包含历史）
git clone https://github.com/godlockin/eket.git

# 或 shallow clone（推荐，节省 8GB+）
git clone --depth 1 https://github.com/godlockin/eket.git

cd eket
npm install           # 安装依赖
npm test              # 运行测试

# 编译 Rust CLI（可选）
cd rust && cargo build --release
```

---

## 🎯 核心命令（Claude Code）

在 Claude Code 中输入 `/eket-help` 查看所有命令，常用：

| 命令 | 说明 |
|------|------|
| `/eket-start` | 启动 Master/Slaver 角色 |
| `/eket-claim` | 领取任务 |
| `/eket-status` | 查看当前状态 |
| `/eket-save` | 保存会话状态 |
| `/eket-resume` | 恢复会话 |
| `/eket-office-hours` | 需求分析六问 |
| `/eket-submit-pr` | 提交 PR |
| `/eket-review-pr` | 审核 PR |

---

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Level 0: Shell    零依赖，任何机器可用                       │
├─────────────────────────────────────────────────────────────┤
│  Level 1: Rust     高性能核心 (~21ms/cmd, ~12MB 内存)        │
│  └── CLI + HTTP API (axum :9877)                            │
├─────────────────────────────────────────────────────────────┤
│  Level 2: Node.js  Web Dashboard + LLM Gateway              │
├─────────────────────────────────────────────────────────────┤
│  Level 3: Shell    Node.js 不可用时的降级方案                 │
└─────────────────────────────────────────────────────────────┘
```

**降级顺序**: Rust → Node.js → Shell → 优雅退出

---

## 🌟 核心特性

- 🤖 **特种兵团模式**: 1–5 人指挥，N 个 AI 并行执行。人类和 AI 使用相同协议。
- 🗂️ **三仓分离**: confluence（知识库）、jira（任务）、code（代码）物理隔离
- ⚙️ **工业级约束**: Feature 分支、TDD、分析报告、PR 审核
- 🧠 **多级记忆**: 会话缓存 → 项目经验 → 全局知识库
- 🛡️ **弹性降级**: Rust → Node.js → Shell → 优雅退出

---

## 📊 性能（Rust vs Node.js）

| 操作 | Rust | Node.js | 提升 |
|------|------|---------|------|
| `task:claim` | ~21ms | ~400ms | **19×** |
| 启动时间 | ~8ms | ~1,500ms | **187×** |
| 内存占用 | ~12MB | ~120MB | **10×** |

---

## 📖 文档

| 资源 | 说明 |
|------|------|
| [`template/docs/MASTER-RULES.md`](template/docs/MASTER-RULES.md) | Master 角色规范 |
| [`template/docs/SLAVER-RULES.md`](template/docs/SLAVER-RULES.md) | Slaver 角色规范 |
| [`.claude/skills/eket/SKILL.md`](.claude/skills/eket/SKILL.md) | 命令速查 |
| [`confluence/memory/`](confluence/memory/) | 知识库 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本历史 |

---

## 🔧 升级

```bash
# 升级全局安装
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# 升级项目（保留配置）
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --upgrade
```

---

## 🤝 贡献

1. Fork 仓库
2. 创建特性分支: `git checkout -b feature/xxx`
3. 提交到 `testing` 分支
4. 创建 Pull Request

分支策略: `feature/*` → `testing` → `main` → `miao`

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📜 License

[MIT License](LICENSE)
