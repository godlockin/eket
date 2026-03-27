# EKET Framework - 初始化指南

**版本**: 0.9.1
**最后更新**: 2026-03-27

---

## 1. 概述

EKET (Enhanced Knowledge Execution Toolkit) Framework 是一个 AI 智能体协作框架，支持 Master/Slaver 架构、多实例协同、任务流转和 Review 机制。

本指南说明如何将 EKET 框架集成到新项目（如 openalaw）中并初始化使用。

---

## 2. 快速开始

### 2.1 前置要求

| 要求 | 说明 |
|------|------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| Git | >= 2.x |
| Docker | 可选，用于 Redis/SQLite 容器 |

### 2.2 安装步骤

```bash
# 1. 克隆 EKET 框架
git clone https://github.com/godlockin/eket.git
cd eket

# 2. 安装 Node.js 依赖
cd node
npm install

# 3. 编译 TypeScript
npm run build

# 4. 运行测试（可选）
npm test
```

### 2.3 集成到 openalaw 项目

#### 方法一：作为 Git Submodule（推荐）

```bash
# 在 openalaw 项目根目录
cd /path/to/openalaw

# 添加 EKET 为 submodule
git submodule add https://github.com/godlockin/eket.git .eket/framework

# 初始化 submodule
git submodule update --init --recursive

# 复制模板配置
cp -r .eket/framework/template/.claude/ ./.claude/
cp -r .eket/framework/template/.eket/ ./.eket/
cp .eket/framework/template/CLAUDE.md ./CLAUDE.md
```

#### 方法二：复制核心文件

```bash
# 在 openalaw 项目根目录
cd /path/to/openalaw

# 复制 Claude Code 命令
cp -r /path/to/eket/template/.claude/ ./.claude/

# 复制 EKET 配置
cp -r /path/to/eket/template/.eket/ ./.eket/

# 复制 CLAUDE.md
cp /path/to/eket/template/CLAUDE.md ./CLAUDE.md

# 复制 Ticket 模板
mkdir -p jira/templates
cp /path/to/eket/template/jira/templates/*.md jira/templates/
```

---

## 3. 项目结构

集成后的 openalaw 项目结构：

```
openalaw/
├── .claude/                    # Claude Code 配置
│   └── commands/               # 自定义命令
│       ├── eket-init.sh        # 初始化向导
│       ├── eket-start.sh       # 启动实例
│       ├── eket-claim.sh       # 领取任务
│       ├── eket-submit-pr.sh   # 提交 PR
│       └── ...                 # 其他命令
│
├── .eket/                      # EKET 框架配置
│   ├── config.yml              # 主配置文件
│   ├── config/                 # 模块配置
│   │   ├── project.yml         # 项目配置
│   │   ├── tasks.yml           # 任务配置
│   │   ├── permissions.yml     # 权限配置
│   │   └── ...
│   ├── state/                  # 运行时状态
│   ├── logs/                   # 日志目录
│   └── memory/                 # 记忆存储
│
├── CLAUDE.md                   # 项目指南（Claude Code 读取）
│
├── inbox/                      # 输入目录
│   ├── human_input.md          # 人类需求输入
│   └── human_feedback/         # 人类反馈
│
├── outbox/                     # 输出目录
│   └── review_requests/        # Review 请求
│
├── tasks/                      # 任务定义
│
├── jira/                       # Jira 任务仓库
│   ├── epics/                  # Epic 文档
│   ├── tickets/                # 任务票
│   │   ├── feature/            # 功能票
│   │   ├── bugfix/             # 缺陷票
│   │   └── task/               # 一般任务
│   └── templates/              # Ticket 模板
│
├── confluence/                 # Confluence 文档仓库
│   └── projects/               # 项目文档
│
└── code_repo/                  # 代码仓库（或在根目录）
    ├── src/                    # 源代码
    └── tests/                  # 测试代码
```

---

## 4. 初始化流程

### 4.1 首次初始化

```bash
# 在项目根目录运行
/eket-init
```

初始化流程执行以下步骤：

1. **检查项目结构** - 验证必需文件和目录
2. **检查三仓库配置** - Confluence/Jira/CodeRepo
3. **运行健康检查** - 环境检测
4. **Docker 环境检测** - 启动 Redis/SQLite 容器（可选）
5. **初始化 CLAUDE.md** - 复制模板或更新
6. **数据依赖追问检查** - 确保依赖配置完整
7. **选择任务模式** - Setup 或 Execution
8. **显示快速开始指南**

### 4.2 启动实例

```bash
# 启动 Slaver 实例（自动检测角色）
/eket-start

# 启用自动模式（自动领取任务）
/eket-start -a

# Master 实例（项目初始化时自动成为 Master）
# 当检测到 Master 标记不存在时自动成为 Master
```

### 4.3 配置文件

编辑 `.eket/config.yml` 配置项目行为：

```yaml
version: "0.9.1"

# 模式：claude_code | standalone
mode: "claude_code"

# 预设：lightweight | standard | enterprise
profile: "standard"

# 项目信息
project:
  name: "openalaw"
  stage: "phase_1"

# 验证配置
validation:
  enabled: true
  strict_mode: false
```

---

## 5. 核心工作流

### 5.1 Slaver 接卡流程

```
1. 读取任务列表 → 按优先级排序
   │
   ▼
2. 选择任务 → 标记承接
   │
   ├─ 填写领取信息（Slaver ID、开始时间）
   ├─ 更新 ticket 状态：ready → in_progress
   │
   ▼
3. 匹配角色 → 加载 Profile 和 Skills
   │
   ├─ 根据 ticket 标签匹配角色
   ├─ 写入 agent_profile.yml
   └─ 加载对应 skills/
   │
   ▼
4. 分析并制定计划
   │
   ▼
5. 创建 worktree/branch
   │
   ├─ .eket/worktrees/{ticket-id}
   └─ 分支名：{ticket-id}
   │
   ▼
6. 先写测试（TDD）
   │
   ├─ 根据需求编写单元测试
   └─ 确保测试失败（预期）
   │
   ▼
7. 开发/测试/修复循环
   │
   ├─ 实现功能
   ├─ 运行测试
   └─ 修复直到通过
   │
   ▼
8. 推送并提交 PR
   │
   ├─ git push
   └─ 创建 PR 请求 Review
   │
   ▼
9. 更新 ticket 状态 → 唤醒 Master
   │
   ├─ in_progress → testing → review
   ├─ 填写 PR 信息
   └─ 发送消息到消息队列（通知 Master）
   │
   ▼
10. 等待 Master Review
    │
    ├─ Master 审核通过 → review → done ✓
    └─ Master 要求修改 → review → in_progress
```

### 5.2 状态流转

```
Feature Ticket:
backlog → analysis → approved → design → ready → in_progress
                                                    │
                                                    ▼
                        done ←←←←←←← review ←←←← testing ←← design_review

Task/Bugfix Ticket:
backlog → ready → in_progress → documentation → testing → review → done
```

---

## 6. 可用命令

### 6.1 通用命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导 |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式启动 |
| `/eket-status` | 查看状态 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-submit-pr` | 提交 PR |
| `/eket-help` | 显示帮助 |

### 6.2 Master 专用

| 命令 | 功能 |
|------|------|
| `/eket-analyze` | 分析需求并拆解任务 |
| `/eket-review-pr` | 审核 PR |
| `/eket-merge` | 合并到 main 分支 |
| `/eket-check-progress` | 检查进度 |

### 6.3 Slaver 专用

| 命令 | 功能 |
|------|------|
| `/eket-role <role>` | 设置角色 |
| `/eket-heartbeat` | 更新心跳 |
| `/eket-checkpoint` | 创建检查点 |

---

## 7. Ticket 模板

EKET 提供标准化的 Ticket 模板，位于 `jira/templates/`：

| 模板 | 用途 |
|------|------|
| `feature-ticket.md` | 功能开发任务 |
| `task-ticket.md` | 一般任务（文档/重构） |
| `bugfix-ticket.md` | 缺陷修复任务 |
| `pr-review-checklist.md` | PR Review 检查清单 |

### Ticket 模板核心字段

```markdown
# Feature Ticket: ${FEATURE_ID} - ${FEATURE_TITLE}

**状态**: backlog | ready | in_progress | review | done
**优先级**: High/Medium/Low
**标签**: `feature`, `${MODULE_TAG}`

## 0. 状态流转记录（必须更新）
| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|

## 1. 需求概述
...

## 3. 执行记录（Slaver 填写）
### 3.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: ${CLAIM_DATE}
- **状态已更新**: [ ] 是

### 3.2 必需执行流程
- [ ] 步骤 1: 更新状态为 in_progress
- [ ] 步骤 2: 修改/补充设计文档
- [ ] 步骤 3: 编写测试
- [ ] 步骤 4: 提交 PR
```

---

## 8. 高级功能（v0.9.1）

### 8.1 四级降级策略

连接管理器支持四级降级：
1. 远程 Redis
2. 本地 Redis
3. SQLite
4. 文件系统

配置：
```yaml
connection_manager:
  remote_redis:
    host: ${EKET_REMOTE_REDIS_HOST}
    port: 6379
  local_redis:
    host: ${EKET_LOCAL_REDIS_HOST}
    port: 6380
  sqlite_path: ~/.eket/data/sqlite/eket.db
  file_queue_dir: ./.eket/data/queue
```

### 8.2 Master 选举机制

分布式 Master 选举，防止多 Master 冲突：

```
1. 尝试获取锁 (Redis SETNX / SQLite INSERT / File mkdir)
   │
   ├── 成功 → 声明等待期 (2 秒) → 无冲突 → 成为 Master
   │                              │
   │                              └── 有冲突 → 成为 Slaver
   │
   └── 失败 → 降级下一级
```

---

## 9. 故障排查

### 9.1 常见问题

**Q: /eket-init 提示项目结构不完整**
A: 运行项目初始化脚本：
```bash
/path/to/eket/scripts/init-project.sh <project-name> /path/to/project
```

**Q: Slaver 无法领取任务**
A: 检查 ticket 状态是否为 `ready`，并确认角色匹配

**Q: Docker 容器启动失败**
A: 检查 Docker 是否运行：
```bash
docker ps
docker-compose -f .eket/docker-compose.yml up -d
```

### 9.2 日志位置

| 日志 | 位置 |
|------|------|
| 实例日志 | `.eket/logs/instance.log` |
| Master 选举 | `.eket/logs/master-election.log` |
| 心跳监控 | `.eket/logs/heartbeat-monitor.log` |
| 消息队列 | `.eket/data/queue/` |

---

## 10. 最佳实践

1. **首次启动先初始化**: 运行 `/eket-init` 确保环境配置正确
2. **使用 Ticket 模板**: 统一任务格式，便于 Master/Slaver 协作
3. **状态必须更新**: 每次状态变更记录在案
4. **TDD 开发**: 先写测试，再实现功能
5. **及时提交 Review**: 完成后立即提交 PR，避免阻塞
6. **定期心跳**: Slaver 定期更新心跳，避免超时重置

---

**维护者**: EKET Framework Team
**文档**: https://github.com/godlockin/eket/docs
