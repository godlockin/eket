# EKET Three-Repo Deployment Guide

> 本指南说明如何用 EKET 的三仓库 submodule 模型部署一个真实项目。
> 主项目（`{project-name}/`）是 submodule 宿主，三个子仓库是其 submodule，
> 各自拥有独立 remote、独立分支、独立 CI，可以独立 push/pull。

---

## Why Three Repos?

| 关注点 | 原因 |
|--------|------|
| **访问控制** | 人类和 AI agent 对三个仓库的权限不同。code 需要分支保护和 CI；jira 需要所有 agent 写权限；confluence 以读为主 |
| **审计追溯** | ticket 生命周期历史需要独立查询，不应混入代码 diff |
| **体积隔离** | code repo 可能有大型产物（LFS）；隔离避免污染 ticket/知识库 |
| **协议边界** | 跨 repo 引用使通信边界显式——agent 清楚知道自己被授权写哪个 repo |

---

## 快速开始（推荐：自动脚本）

```bash
# 克隆 EKET 框架
git clone https://github.com/your-org/eket.git
cd eket && ./scripts/setup.sh --level=1

# 初始化三仓库（本地模式）
./scripts/init-three-repos.sh myproject --local-only

# 初始化三仓库（含远程）
./scripts/init-three-repos.sh myproject --remote-org my-org --platform github
```

---

## 1. 目录结构

```
myproject/                          ← 主项目 git repo（submodule 宿主）
├── .gitmodules                     ← submodule 注册表
├── README.md
├── myproject-confluence/           ← submodule（独立 git repo）
│   ├── memory/
│   │   ├── retrospectives/
│   │   ├── lessons/
│   │   ├── patterns/
│   │   └── research/
│   ├── architecture/               ← ADR（架构决策记录）
│   ├── skills/                     ← EKET Skill 定义
│   ├── team/                       ← 成员、角色
│   └── inbox/                      ← 跨仓库消息
├── myproject-jira/                 ← submodule（独立 git repo）
│   ├── tickets/                    ← TASK-xxx.md
│   ├── epics/
│   ├── inbox/
│   │   ├── human_feedback/
│   │   ├── agent_feedback/
│   │   └── master_inbox/
│   └── .eket/
│       ├── IDENTITY.md
│       ├── config/config.yml
│       ├── mailbox/                ← 运行时（不提交 git）
│       ├── heartbeat/              ← 运行时（不提交 git）
│       └── queue/                  ← 运行时（不提交 git）
└── myproject-code/                 ← submodule（独立 git repo）
    ├── src/
    ├── tests/
    └── .github/workflows/ci.yml
```

---

## 2. 创建远程仓库

### GitHub

```bash
# 需要 GitHub CLI：brew install gh && gh auth login

# 主项目
gh repo create my-org/myproject --private --description "EKET project: myproject"

# 三个子仓库
gh repo create my-org/myproject-confluence \
  --private --description "EKET knowledge base for myproject"

gh repo create my-org/myproject-jira \
  --private --description "EKET task tracker for myproject"

gh repo create my-org/myproject-code \
  --private --description "myproject source code"
```

### GitLab

```bash
# 需要 glab CLI：brew install glab
glab repo create my-org/myproject           --private
glab repo create my-org/myproject-confluence --private
glab repo create my-org/myproject-jira       --private
glab repo create my-org/myproject-code       --private
```

### Gitee

Gitee 无官方 CLI，请在 [gitee.com](https://gitee.com) 网页创建，或使用 API：

```bash
for name in myproject myproject-confluence myproject-jira myproject-code; do
  curl -X POST https://gitee.com/api/v5/user/repos \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"private\":true,\"access_token\":\"<TOKEN>\"}"
done
```

---

## 3. 本地初始化（手动步骤，不用脚本时参考）

```bash
# 1. 创建主项目
mkdir myproject && cd myproject
git init -b main

# 2. 初始化三个子仓库
git clone git@github.com:my-org/myproject-confluence.git myproject-confluence
git clone git@github.com:my-org/myproject-jira.git       myproject-jira
git clone git@github.com:my-org/myproject-code.git       myproject-code

# 3. 添加为 submodule
git submodule add git@github.com:my-org/myproject-confluence.git myproject-confluence
git submodule add git@github.com:my-org/myproject-jira.git       myproject-jira
git submodule add git@github.com:my-org/myproject-code.git       myproject-code

# 4. 提交主项目的 .gitmodules + submodule 指针
git add .gitmodules myproject-confluence myproject-jira myproject-code
git commit -m "feat: 注册三个 submodule"
git remote add origin git@github.com:my-org/myproject.git
git push -u origin main
```

---

## 4. Clone（团队成员 / Slaver）

```bash
# 一次性克隆主项目 + 所有 submodule
git clone --recurse-submodules git@github.com:my-org/myproject.git

# 或：已克隆主项目，补充初始化 submodule
git clone git@github.com:my-org/myproject.git
cd myproject
git submodule update --init --recursive
```

---

## 5. 日常更新

```bash
# 拉取主项目 + 所有 submodule 最新
git pull && git submodule update --remote --merge

# 只更新某个子仓库
cd myproject-jira && git pull origin main
```

---

## 6. Submodule 独立 Push

每个子仓库是完整的独立 git repo，可以单独 push：

```bash
# Slaver 在 jira 中提交 ticket 更新
cd myproject-jira
git add tickets/TASK-200.md
git commit -m "feat: TASK-200 实现完成"
git push origin main

# 回到主项目，更新 submodule 指针（可选，由 Master 统一提交）
cd ..
git add myproject-jira
git commit -m "chore: 更新 jira submodule 指针到最新"
```

---

## 7. config.yml 详解

`myproject-jira/.eket/config/config.yml`：

```yaml
eket_version: "1.0"
project_name: "myproject"

repos:
  confluence:
    # 相对路径：从 jira 根目录访问 confluence（同级 submodule）
    local_path: "../myproject-confluence"
  jira:
    local_path: "."
  code:
    local_path: "../myproject-code"

runtime:
  mailbox_dir: ".eket/mailbox"      # Agent 间消息收发
  heartbeat_dir: ".eket/heartbeat"  # Slaver 心跳文件
  queue_dir: ".eket/queue"          # 任务事件队列
  tickets_dir: "tickets"            # Ticket 存储目录

# 可选：配置后支持自动 push
# remote:
#   confluence: git@github.com:my-org/myproject-confluence.git
#   jira:       git@github.com:my-org/myproject-jira.git
#   code:       git@github.com:my-org/myproject-code.git
```

---

## 8. 跨 Repo 路径访问

Agent 在 `myproject-jira/` 目录下工作时：

```bash
# 访问知识库
cat ../myproject-confluence/memory/lessons/onboarding.md

# 访问架构文档
ls ../myproject-confluence/architecture/

# 访问代码（查看实现）
cat ../myproject-code/src/auth.rs

# 写入 inbox（通知知识库管理员）
echo "新 ADR 待审阅" > ../myproject-confluence/inbox/from-jira.md
```

---

## 9. 权限矩阵

| 角色 | `myproject` (主) | `-confluence` | `-jira` | `-code` |
|------|:---:|:---:|:---:|:---:|
| Human Master | read/write | read/write | read/write | read/write |
| Human Slaver | read | read/write | read/write | read/write |
| AI Master | read | read/write | read/write | review only |
| AI Slaver | read | read | read/write | feature/* only |
| CI/CD Bot | - | - | read | read/write |

---

## 10. 更新 Submodule 远程 URL

本地模式初始化后，设置远程时更新 `.gitmodules`：

```bash
cd myproject

# 更新每个 submodule 的远程 URL
git submodule set-url myproject-confluence git@github.com:my-org/myproject-confluence.git
git submodule set-url myproject-jira       git@github.com:my-org/myproject-jira.git
git submodule set-url myproject-code       git@github.com:my-org/myproject-code.git

# 同步到 .git/config
git submodule sync

# 提交 .gitmodules 变更
git add .gitmodules
git commit -m "chore: 更新 submodule 远程 URL"
```

---

## 常见问题

**Q: Slaver clone 后 submodule 是空目录？**

```bash
git submodule update --init --recursive
```

**Q: 如何让 submodule 跟踪远程最新而非固定 commit？**

```bash
# 在主项目 .gitmodules 中添加 branch = main
git config -f .gitmodules submodule.myproject-jira.branch main
git submodule update --remote myproject-jira
```

**Q: 本地 submodule 修改未被主项目感知？**

```bash
# 子仓库 commit 后，回到主项目 add submodule 目录（更新指针）
cd myproject
git add myproject-jira
git status   # 显示 "modified: myproject-jira (new commits)"
git commit -m "chore: 更新 jira submodule 指针"
```

**Q: 能否不用 submodule，纯平级目录？**

可以。在 `config.yml` 中用相对路径 `../sibling` 访问即可，EKET 运行时不依赖 git submodule 机制。submodule 仅是便于主项目统一追踪版本一致性。

**Q: git submodule update 后进入了 detached HEAD？**

```bash
# 解决：进入子仓库切换到 main 分支
cd myproject-jira && git checkout main
# 或：用 --remote --merge 避免 detached HEAD
git submodule update --remote --merge
```
