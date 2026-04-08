# EKET Agent 协作框架文档审查报告（修正版）

**审查日期**: 2026-04-07
**审查范围**: Agent 协作指导文档
**当前版本**: 2.0.0
**审查者**: Claude (Opus 4.6)

---

## 🎯 项目定位修正

**EKET 不是软件，而是 Agent 协作框架指南集**

- **核心产品**: CLAUDE.md、IDENTITY.md、SYSTEM-SETTINGS.md 等文档
- **用户**: AI Agent (如 Claude Code 实例)
- **目的**: 指导多个 Agent 实例协作完成软件开发
- **三仓库**: 是 Agent "应该创建"的结构，不是框架自带
- **node/**: 可选的辅助工具，用于支持框架运行

---

## 执行摘要

从 **Agent 协作指导** 的角度，本次审查发现：

| 严重等级 | 数量 | 核心问题 |
|---------|------|---------|
| **P0 (严重)** | 5 | Agent 无法理解或执行关键流程 |
| **P1 (高)** | 8 | 协作流程不清晰 |
| **P2 (中)** | 12 | 指令不完整或有歧义 |
| **P3 (低)** | 6 | 优化建议 |

---

## P0 问题（Agent 无法执行）

### 1. 【关键】`.claude/commands/` 脚本完全缺失

**问题描述**:
- `template/CLAUDE.md` 和 `template/.claude/CLAUDE.md` 都详细描述了命令：
  - `/eket-init`, `/eket-start`, `/eket-claim`, `/eket-submit-pr` 等
- 但 `template/.claude/` 目录**不存在**
- Agent 读取文档后会尝试执行这些命令，但会失败

**影响**:
- Agent 无法启动实例
- 无法领取任务
- 无法提交 PR
- 整个协作流程完全阻塞

**当前状态**:
```bash
$ ls template/.claude/
ls: template/.claude/: No such file or directory
```

**必需的脚本**:
```
template/.claude/commands/
├── eket-init.sh          # 初始化向导
├── eket-start.sh         # 启动实例（Master/Slaver 检测）
├── eket-status.sh        # 查看状态
├── eket-claim.sh         # 领取任务
├── eket-submit-pr.sh     # 提交 PR
├── eket-review-pr.sh     # Master 审核 PR
├── eket-merge-pr.sh      # Master 合并 PR
├── eket-analyze.sh       # Master 需求分析
├── eket-check-progress.sh # Master 进度检查
├── eket-role.sh          # 设置角色
├── eket-ask.sh           # 依赖追问
└── eket-help.sh          # 帮助
```

**建议修复**:
1. **立即创建** `template/.claude/commands/` 目录
2. **实现核心脚本**（至少前 5 个）
3. 或**修改文档**，改为"概念性命令"并提供手动操作指南

**优先级**: ⚠️⚠️⚠️ **P0-CRITICAL** - 阻塞所有 Agent 操作

---

### 2. 【身份】IDENTITY.md 使用未定义的变量

**问题描述**:
- `.eket/IDENTITY.md` 第 9 行：`**角色**: \`${ROLE}\` (请根据实际配置确认)`
- 第 10 行：`**启动时间**: $(date -Iseconds)`
- 第 13 行：`**实例 ID**: agent_${ROLE}_$(date +%s)`

**问题**:
- `${ROLE}` 是 shell 变量，但文档是 Markdown
- Agent 读取时看到的是字面量 `${ROLE}`，不会替换
- `$(date -Iseconds)` 也不会执行

**Agent 实际看到的内容**:
```markdown
**角色**: `${ROLE}` (请根据实际配置确认)
**启动时间**: $(date -Iseconds)
**实例 ID**: agent_${ROLE}_$(date +%s)
```

**导致问题**:
- Agent 不知道自己是什么角色
- 无法确认身份
- 可能误操作（Slaver 执行 Master 任务）

**建议修复**:

**方案 A: 模板化（推荐）**
```markdown
## 当前实例身份

> ⚠️ 首次使用前，请运行 `/eket-init` 初始化身份配置

**配置文件**: `.eket/state/instance_config.yml`

检查你的角色：
\`\`\`bash
cat .eket/state/instance_config.yml | grep role
\`\`\`

可能的值:
- `master` - 协调实例
- `slaver` - 执行实例
```

**方案 B: 脚本生成**
```bash
# 在 eket-init.sh 中生成实际的 IDENTITY.md
cat > .eket/state/IDENTITY_CURRENT.md <<EOF
# 当前实例身份

**角色**: ${ROLE}
**启动时间**: $(date -Iseconds)
**实例 ID**: agent_${ROLE}_$(date +%s)
EOF
```

**优先级**: ⚠️⚠️ **P0** - 身份混淆风险极高

---

### 3. 【流程】三仓库初始化指令不明确

**问题描述**:
- 多处文档提到"三仓库架构"
- 但**从未说明 Agent 应该何时、如何创建这三个仓库**
- 缺少明确的初始化流程

**Agent 困惑点**:
1. **何时创建三仓库**？
   - 首次启动时？
   - Master 分析需求后？
   - 人类明确要求时？

2. **如何创建**？
   - 运行 `./scripts/init-three-repos.sh`？
   - 手动 `git init` 每个目录？
   - 使用 Git submodule？

3. **是否必须**？
   - 可以不创建吗？
   - 单仓库模式如何工作？

**建议修复**:

在 `template/CLAUDE.md` 开头添加：

```markdown
## ⚠️ 首次启动必读

### 三仓库架构初始化

EKET 使用三仓库分离架构：
- `confluence/` - 文档仓库
- `jira/` - 任务仓库
- `code_repo/` - 代码仓库

**初始化时机**: Master 首次分析需求后，创建三仓库

**初始化方法**:
\`\`\`bash
# 方式 1: 使用脚本（推荐）
./scripts/init-three-repos.sh <project-name> <org> <platform>

# 方式 2: 手动创建
mkdir -p confluence jira code_repo
cd confluence && git init && cd ..
cd jira && git init && cd ..
cd code_repo && git init && cd ..
\`\`\`

**验证**:
\`\`\`bash
ls -la confluence/ jira/ code_repo/
# 应该都存在且包含 .git 目录
\`\`\`

**如果三仓库不存在**:
- Master 应先创建三仓库
- Slaver 不应领取任务
```

**优先级**: ⚠️⚠️ **P0** - 协作流程核心步骤缺失

---

### 4. 【通信】消息队列机制未实现

**问题描述**:
- 文档描述详细的消息队列机制：
  - `shared/message_queue/inbox/`
  - `shared/message_queue/outbox/`
  - 消息格式 JSON
- 但没有说明：
  - Agent 如何读取消息？
  - Agent 如何发送消息？
  - 消息如何触发 Agent 唤醒？

**Agent 困惑**:
- Slaver 提交 PR 后，如何"通知 Master"？
- Master 如何"监听"新的 PR 请求？
- 是轮询文件？还是有其他机制？

**建议修复**:

**方案 A: 文件轮询（简单）**
```markdown
### 消息通信机制

**发送消息** (Slaver):
\`\`\`bash
# 创建消息文件
cat > shared/message_queue/inbox/msg_$(date +%s).json <<EOF
{
  "from": "slaver_frontend_001",
  "to": "master",
  "type": "pr_review_request",
  "payload": {
    "ticket_id": "FEAT-001",
    "branch": "feature/feat-001-login"
  }
}
EOF
\`\`\`

**接收消息** (Master):
\`\`\`bash
# Master 定期检查
ls shared/message_queue/inbox/*.json 2>/dev/null
# 如果有文件，读取处理后移至 outbox/
\`\`\`

**注意**: Agent 无法主动"唤醒"，依赖人类手动触发 Master 检查
```

**方案 B: 人类中转（实用）**
```markdown
### 协作通信机制

由于 Agent 无法互相唤醒，采用"人类中转"模式：

1. **Slaver 完成工作** → 在 `outbox/review_requests/` 创建文件
2. **人类发现新文件** → 提醒或启动 Master 实例
3. **Master 处理请求** → 审核完成后通知人类
4. **人类转告 Slaver** → Slaver 继续修改或进入下一任务
```

**优先级**: ⚠️⚠️ **P0** - 协作机制不可用

---

### 5. 【模板】SYSTEM-SETTINGS.md 占位符未说明

**问题描述**:
- `template/SYSTEM-SETTINGS.md` 包含大量占位符：
  - `{{PROJECT_NAME}}`
  - `{{CREATE_DATE}}`
  - `{{MAINTAINER}}`
  - 等等
- 但**没有说明谁应该替换这些占位符**：
  - Agent 自动替换？
  - 人类手动替换？
  - 初始化脚本替换？

**Agent 困惑**:
- 读取到 `{{PROJECT_NAME}}` 时应该怎么处理？
- 是把它当成实际项目名吗？
- 还是应该提示人类填写？

**建议修复**:

在 `template/SYSTEM-SETTINGS.md` 开头添加：

```markdown
# {{PROJECT_NAME}} 系统设定文档

> **⚠️ 模板说明**:
>
> 本文件是模板，使用前需要替换所有 `{{VARIABLE}}` 占位符。
>
> **替换时机**:
> - **自动替换**: 使用 `./scripts/init-project.sh` 时自动替换
> - **手动替换**: 复制此文件到新项目后，手动搜索替换所有 `{{...}}`
>
> **必须替换的占位符**:
> - `{{PROJECT_NAME}}` - 项目名称
> - `{{CREATE_DATE}}` - 创建日期 (YYYY-MM-DD)
> - `{{MAINTAINER}}` - 维护者姓名
> - `{{MODULE1}}`, `{{MODULE2}}` - 实际模块名
>
> **删除本说明块**: 替换完成后删除此说明块
```

**优先级**: ⚠️ **P0** - 模板使用不明确

---

## P1 问题（协作流程不清晰）

### 6. 【流程】Master/Slaver 启动顺序不明确

**问题**:
- 新项目初始化后，应该先启动谁？
- Master 和 Slaver 可以同时运行吗？
- 如果只有一个 Agent，应该怎么办？

**建议补充**:
```markdown
## Agent 启动顺序

### 标准流程（多 Agent 模式）

1. **首次启动**: 启动 Master 实例
   \`\`\`bash
   # 在项目根目录
   /eket-start
   # 自动检测到无三仓库 → 进入任务设定模式
   \`\`\`

2. **Master 完成任务拆解**: 创建三仓库和 Jira tickets

3. **启动 Slaver 实例**:
   \`\`\`bash
   # 在新的 Claude Code 会话中
   /eket-start
   # 自动检测到三仓库存在 → 进入任务承接模式
   \`\`\`

### 单 Agent 模式

如果只有一个 Agent：
1. 以 Master 身份启动
2. 完成需求分析和任务拆解
3. 手动切换到 Slaver 角色
4. 领取任务并开发
5. 切换回 Master 审核自己的代码

**切换角色**:
\`\`\`bash
/eket-role master   # 切换到 Master
/eket-role slaver   # 切换到 Slaver
\`\`\`
```

**优先级**: 🔶 **P1** - 首次使用困惑

---

### 7. 【文档】分析报告流程描述位置不当

**问题**:
- `template/CLAUDE.md` 第 200+ 行才提到"分析报告流程"
- 但这是 Slaver 领取任务后的**第一步**
- 应该在更显眼的位置

**建议**:
- 移动到 "Slaver 职责" 章节
- 添加醒目标记
- 提供流程图

**优先级**: 🔶 **P1** - 关键流程不明显

---

### 8. 【冲突】CLAUDE.md 两个版本内容不一致

**问题**:
- `template/CLAUDE.md` (278 行)
- `template/.claude/CLAUDE.md` (85 行)
- 内容部分重复但不完全一致

**Agent 困惑**: 应该读哪个？

**建议**:
```
template/
├── CLAUDE.md                    # 完整指南（主文档）
└── .claude/
    └── CLAUDE.md                # 命令快速参考（索引）
```

在 `.claude/CLAUDE.md` 开头添加：
```markdown
# EKET Commands - Quick Reference

> 📚 **完整文档**: 请参阅 [../CLAUDE.md](../CLAUDE.md)
>
> 本文件仅列出命令快速参考，详细说明请查阅主文档。
```

**优先级**: 🔶 **P1** - 文档歧义

---

### 9-13. 【其他 P1 问题】

- 任务状态机转换条件不明确
- PR 审核标准主观性强
- 错误处理和重试机制缺失
- Slaver 角色类型定义不完整
- Git 冲突解决策略缺失

---

## P2 问题（指令不完整）

### 14. 【示例】缺少完整的端到端示例

**建议添加**:
```markdown
## 📚 完整示例：从需求到发布

### 场景
人类需求："添加用户登录功能"

### Step 1: Master 需求分析
\`\`\`markdown
# inbox/human_input.md
需求：实现用户登录功能，支持邮箱+密码登录
\`\`\`

Master 分析后创建:
- confluence/projects/my-app/requirements/user-auth.md
- jira/tickets/FEAT-001-user-login.md

### Step 2: Slaver 领取任务
\`\`\`bash
/eket-claim FEAT-001
\`\`\`

### Step 3: Slaver 提交分析报告
创建 jira/tickets/FEAT-001/analysis-report.md

### Step 4: Master 审批分析报告
批准 → Ticket 状态变为 approved

### Step 5: Slaver 开发
\`\`\`bash
git checkout -b feature/FEAT-001-user-login
# 开发...
git commit -m "feat: add user login"
/eket-submit-pr
\`\`\`

### Step 6: Master 审核 PR
批准 → 合并到 main

### Step 7: 任务完成
Ticket 状态 → done
```

**优先级**: 🟡 **P2** - 缺少实战指导

---

### 15-25. 【其他 P2 问题】

- 环境变量配置说明缺失
- 日志和调试指南缺失
- 性能监控指标未定义
- 安全检查清单不完整
- 依赖追问模板过于简单
- Skills 系统未与 Superpowers 集成说明
- 测试策略未明确
- 文档版本控制策略缺失
- 多语言支持未说明
- 时区处理未说明
- 文件编码规范缺失

---

## P3 问题（优化建议）

### 26-31. 【优化建议】

- 添加 Mermaid 流程图
- 提供配置检查工具
- 添加常见问题排查
- 提供性能调优建议
- 建立文档维护流程
- 添加社区贡献指南

---

## 修正后的问题优先级

### 之前认为是 P0 但实际不是的

1. ~~"三仓库不存在"~~ → **不是问题**，应该由 Agent 创建
2. ~~"Node.js 依赖未安装"~~ → **P2 问题**，辅助工具而非核心
3. ~~"版本号不一致"~~ → **P2 问题**，历史文档可以保留不同版本
4. ~~".env 缺失"~~ → **P2 问题**，高级功能配置

### 真正的 P0 问题

1. **`.claude/commands/` 脚本缺失** → Agent 无法执行任何操作
2. **IDENTITY.md 变量未定义** → 身份混淆
3. **三仓库初始化流程缺失** → 不知道何时如何创建
4. **消息队列机制不可用** → 协作无法进行
5. **模板占位符使用不明** → 配置错误

---

## 立即行动项（从 Agent 视角）

### 🚨 最高优先级（今天必须修复）

1. **创建命令脚本骨架** (30 分钟)
   ```bash
   mkdir -p template/.claude/commands

   # 创建核心命令（即使是 stub）
   for cmd in init start status claim submit-pr role help; do
     cat > template/.claude/commands/eket-$cmd.sh <<'EOF'
   #!/bin/bash
   echo "🚧 eket-$cmd 正在实现中"
   echo "请参考 template/CLAUDE.md 手动执行相应操作"
   EOF
     chmod +x template/.claude/commands/eket-$cmd.sh
   done
   ```

2. **修复 IDENTITY.md 变量** (10 分钟)
   - 改为纯文档描述
   - 移除 shell 变量语法
   - 添加初始化说明

3. **添加三仓库初始化明确指令** (15 分钟)
   - 在 CLAUDE.md 开头添加"首次启动必读"
   - 明确初始化时机和方法
   - 提供验证步骤

4. **说明消息通信机制** (15 分钟)
   - 文档中明确说明"人类中转"模式
   - 或提供文件轮询脚本
   - 设定合理预期

5. **模板占位符说明** (5 分钟)
   - 在 SYSTEM-SETTINGS.md 顶部添加说明块
   - 列出所有占位符
   - 说明替换时机

**总时间**: 约 75 分钟

---

## 修正后的结论

### EKET 作为 Agent 协作框架的核心优势

✅ **清晰的角色定义** - Master/Slaver 职责明确
✅ **完整的协作流程** - 从需求到发布全覆盖
✅ **文档即协议** - 所有规则都文档化
✅ **灵活的架构** - 支持单/多 Agent 模式

### 核心问题

❌ **操作层缺失** - 文档描述了"做什么"，但缺少"怎么做"
❌ **Agent 执行障碍** - 关键命令脚本不存在
❌ **协作机制未实现** - 消息通信依赖外部触发
❌ **初始化流程不明** - Agent 不知道从哪里开始

### 建议

**短期**（本周）:
1. ✅ 实现核心命令脚本（至少 stub）
2. ✅ 修复文档中的执行障碍
3. ✅ 明确初始化和协作流程

**中期**（本月）:
1. 🔄 完善命令脚本实现
2. 🔄 添加端到端示例
3. 🔄 建立测试验证机制

**长期**（持续）:
1. 📝 收集 Agent 使用反馈
2. 📝 迭代优化协作流程
3. 📝 构建 Agent 行为模式库

---

## 附录：文档结构建议

```
eket/
├── README.md                    # 框架概述（给人类看）
├── template/
│   ├── CLAUDE.md                # 完整 Agent 指南（主文档）
│   ├── .claude/
│   │   ├── CLAUDE.md            # 命令快速参考（索引）
│   │   └── commands/            # 可执行命令脚本 ⚠️ 缺失
│   ├── .eket/
│   │   └── IDENTITY.md          # 身份卡片模板 ⚠️ 需修复
│   ├── SYSTEM-SETTINGS.md       # 项目配置模板 ⚠️ 需说明
│   └── inbox/
│       └── human_input.md       # 需求输入模板
├── docs/
│   ├── README.md                # 文档索引
│   ├── 01-getting-started/      # 给人类的入门指南
│   ├── 02-architecture/         # 架构设计（给人类理解用）
│   ├── MASTER-WORKFLOW.md       # Master Agent 详细流程
│   ├── SLAVER-AUTO-EXEC-GUIDE.md # Slaver Agent 详细流程
│   └── IDENTITY.md              # 身份系统说明
├── scripts/
│   ├── init-project.sh          # 项目初始化
│   └── init-three-repos.sh      # 三仓库初始化
└── node/                        # 可选辅助工具
    ├── src/                     # CLI 实现
    └── package.json             # 版本 2.0.0
```

---

**审查完成（修正版）**
**下一步**: 请确认是否立即开始修复 P0 问题

