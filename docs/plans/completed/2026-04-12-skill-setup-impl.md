# EKET Skill + Setup Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 eket 打包为 `.claude/skills/eket/` Claude Code skill，并新增 `scripts/setup.sh` 四层分层安装脚本。

**Architecture:** SKILL.md 主文件 + references/ 子文档；setup.sh 四层（Shell→Node→Redis→SQLite），每层独立可跳过，`--level=N` 或 `--all` 控制。

**Tech Stack:** Bash（setup.sh）、Markdown（SKILL.md + references）

---

### Task 1: 创建目录结构

**Files:**
- Create: `.claude/skills/eket/` (目录)
- Create: `.claude/skills/eket/references/` (目录)

**Step 1: 创建目录**

```bash
mkdir -p .claude/skills/eket/references
```

**Step 2: 验证**

```bash
ls .claude/skills/eket/
```
Expected: `references/` 目录存在

**Step 3: Commit**

```bash
git add .claude/
git commit -m "chore: scaffold .claude/skills/eket/ directory"
```

---

### Task 2: 写 references/architecture.md

**Files:**
- Create: `.claude/skills/eket/references/architecture.md`

**Step 1: 写文件**

内容包含：
- 三级降级架构图（Level 1 Shell → Level 2 Node+文件队列 → Level 3 Redis+SQLite）
- 核心模块表（`node/src/core/` 各文件职责，来自 CLAUDE.md）
- Master-Slaver 协作流程（master 选举 → 任务分发 → slaver 领取 → PR 提交 → 合并）

**Step 2: 验证**

```bash
wc -l .claude/skills/eket/references/architecture.md
```
Expected: ≥ 50 行

**Step 3: Commit**

```bash
git add .claude/skills/eket/references/architecture.md
git commit -m "docs(skill): add architecture reference"
```

---

### Task 3: 写 references/dev-commands.md

**Files:**
- Create: `.claude/skills/eket/references/dev-commands.md`

**Step 1: 写文件**

内容包含：
```markdown
## Build & Test
cd node
npm run build          # TypeScript → dist/
npm test               # 全量测试
npm test -- --testPathPattern=<pattern>   # 单文件
npm run lint           # ESLint 检查
npm run lint:fix       # 自动修复
npm run format         # Prettier 格式化
npm run clean          # 清理 dist/

## 脚本工具
./scripts/validate-all.sh        # 全量验证
./scripts/update-version.sh      # 版本号更新
./scripts/docker-redis.sh start  # 启动 Redis

## 发布
# PyPI (sdk/python/RELEASING.md)
cd sdk/python && python3 -m build && twine upload dist/*

# npm (sdk/javascript/RELEASING.md)
cd sdk/javascript && npm pack && npm publish
```

**Step 2: Commit**

```bash
git add .claude/skills/eket/references/dev-commands.md
git commit -m "docs(skill): add dev-commands reference"
```

---

### Task 4: 写 references/setup-guide.md

**Files:**
- Create: `.claude/skills/eket/references/setup-guide.md`

**Step 1: 写文件**

内容包含：
- 四层详细说明（每层前置条件、安装内容、验证命令）
- 环境变量完整表（来自 CLAUDE.md `## 环境变量` 节）
- 常见问题：
  - Node.js 版本 < 18：`nvm install 22 && nvm use 22`
  - Redis 连接失败：`./scripts/docker-redis.sh start`
  - better-sqlite3 编译错误：`npm rebuild better-sqlite3`
  - `.env` 缺少变量：`cp .env.example .env` 后填写

**Step 2: Commit**

```bash
git add .claude/skills/eket/references/setup-guide.md
git commit -m "docs(skill): add setup-guide reference"
```

---

### Task 5: 写主 SKILL.md

**Files:**
- Create: `.claude/skills/eket/SKILL.md`

**Step 1: 写文件**

结构：
```markdown
# EKET Framework

## Quick Start（外部项目）
## Trigger
## Commands
  ### 实例管理
  ### 任务管理
  ### Redis 操作
  ### SQLite 操作
  ### 监控服务
  ### 消息队列 & Agent Pool
## Development（内部）
## References
```

Quick Start 五步：
```markdown
1. 安装：`./scripts/setup.sh --level=2`
2. 启动 Master：`node dist/index.js instance:start --auto`
3. 领取任务：`node dist/index.js task:claim`
4. 系统诊断：`node dist/index.js system:doctor`
5. Web 仪表盘：`node dist/index.js web:dashboard --port 3000`
```

Trigger 节（让 Claude 知道何时自动调用此 skill）：
```markdown
## Trigger
当用户提到以下内容时自动调用此 skill：
- 启动 eket / 初始化框架 / 配置 Master
- 领取任务 / slaver 注册
- 系统诊断 / Redis 检查
```

**Step 2: 验证**

```bash
wc -l .claude/skills/eket/SKILL.md
```
Expected: ≥ 120 行

**Step 3: Commit**

```bash
git add .claude/skills/eket/SKILL.md
git commit -m "feat(skill): add EKET SKILL.md main entry"
```

---

### Task 6: 写 scripts/setup.sh

**Files:**
- Create: `scripts/setup.sh`

**Step 1: 写脚本框架**

```bash
#!/bin/bash
# EKET Setup Script v1.0.0
# 用法：
#   ./scripts/setup.sh              # 交互式（逐层询问）
#   ./scripts/setup.sh --level=1    # 只装到 Level 1
#   ./scripts/setup.sh --level=2    # 装到 Level 2（含 Level 1）
#   ./scripts/setup.sh --level=3    # 装到 Level 3（含前序）
#   ./scripts/setup.sh --level=4    # 装到 Level 4（含前序）
#   ./scripts/setup.sh --all        # 全部安装
#   ./scripts/setup.sh --yes        # 所有可选层自动确认

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# 颜色
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
```

**Step 2: 实现 Level 1（Shell 基础）**

```bash
level1_install() {
  echo -e "${GREEN}[Level 1] Shell 基础环境${NC}"
  # 检查 bash >= 4
  local bash_ver; bash_ver=$(bash --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
  # 检查 curl / git
  for cmd in curl git; do
    command -v "$cmd" >/dev/null 2>&1 || { echo -e "${RED}缺少 $cmd${NC}"; exit 1; }
  done
  # 设置 hybrid-adapter.sh 可执行
  chmod +x "$PROJECT_ROOT/lib/adapters/hybrid-adapter.sh"
  # 验证
  "$PROJECT_ROOT/lib/adapters/hybrid-adapter.sh" doctor
  echo -e "${GREEN}✓ Level 1 完成${NC}"
}
```

**Step 3: 实现 Level 2（Node.js）**

```bash
level2_install() {
  echo -e "${GREEN}[Level 2] Node.js 环境${NC}"
  # 检查 Node.js >= 18
  if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Node.js 未安装。请先安装：https://nodejs.org 或 nvm install 22${NC}"
    exit 1
  fi
  local node_ver; node_ver=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1) || {
    echo -e "${RED}Node.js 版本需 ≥ 18，当前：$(node --version)${NC}"; exit 1
  }
  # npm ci
  cd "$PROJECT_ROOT/node" && npm ci
  # .env 初始化
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo -e "${YELLOW}已创建 .env，请检查配置${NC}"
  fi
  # build
  npm run build
  # 验证
  node dist/index.js system:doctor
  echo -e "${GREEN}✓ Level 2 完成${NC}"
}
```

**Step 4: 实现 Level 3（Docker + Redis）**

```bash
level3_install() {
  echo -e "${GREEN}[Level 3] Docker + Redis${NC}"
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}Docker 未安装：https://docs.docker.com/get-docker/${NC}"; exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker 未运行，请先启动 Docker${NC}"; exit 1
  fi
  "$PROJECT_ROOT/scripts/docker-redis.sh" start
  echo -e "${GREEN}✓ Level 3 完成${NC}"
}
```

**Step 5: 实现 Level 4（SQLite）**

```bash
level4_install() {
  echo -e "${GREEN}[Level 4] SQLite${NC}"
  mkdir -p "$HOME/.eket/data/sqlite"
  # 检查 better-sqlite3 是否正确编译
  cd "$PROJECT_ROOT/node" && node -e "require('better-sqlite3')" 2>/dev/null || {
    echo -e "${YELLOW}better-sqlite3 需要重新编译...${NC}"
    npm rebuild better-sqlite3
  }
  echo -e "${GREEN}✓ Level 4 完成${NC}"
}
```

**Step 6: 实现主流程（参数解析 + 交互式询问）**

```bash
main() {
  local target_level=0
  local auto_yes=false
  # 解析参数
  for arg in "$@"; do
    case "$arg" in
      --level=*) target_level="${arg#--level=}" ;;
      --all)     target_level=4 ;;
      --yes|-y)  auto_yes=true ;;
    esac
  done

  # Level 1 始终运行
  level1_install

  # Level 2-4：按 target_level 或交互询问
  for lvl in 2 3 4; do
    local desc=("" "" "Node.js 依赖 + 构建" "Docker + Redis" "SQLite 数据目录")
    if [ "$target_level" -ge "$lvl" ]; then
      eval "level${lvl}_install"
    elif [ "$target_level" -eq 0 ]; then
      if [ "$auto_yes" = true ]; then
        eval "level${lvl}_install"
      else
        read -rp "安装 Level ${lvl}（${desc[$lvl]}）？[y/N] " ans
        [[ "$ans" =~ ^[Yy]$ ]] && eval "level${lvl}_install" || echo "跳过 Level ${lvl}"
      fi
    fi
  done

  echo -e "\n${GREEN}EKET 安装完成！${NC}"
}

main "$@"
```

**Step 7: 设置可执行权限**

```bash
chmod +x scripts/setup.sh
```

**Step 8: 验证脚本语法**

```bash
bash -n scripts/setup.sh
```
Expected: 无输出（无语法错误）

**Step 9: 冒烟测试 Level 1**

```bash
./scripts/setup.sh --level=1
```
Expected: `✓ Level 1 完成`

**Step 10: Commit**

```bash
git add scripts/setup.sh
git commit -m "feat(setup): add 4-level setup.sh (shell→node→redis→sqlite)"
```

---

### Task 7: 推送并验证

**Step 1: 推送**

```bash
git push origin miao
```

**Step 2: 验证 skill 可被发现**

```bash
ls .claude/skills/eket/
# Expected: SKILL.md  references/
ls .claude/skills/eket/references/
# Expected: architecture.md  dev-commands.md  setup-guide.md
```

**Step 3: 验证 setup.sh 帮助**

```bash
./scripts/setup.sh --help 2>/dev/null || ./scripts/setup.sh --level=0
```

---

## 文件清单

| 文件 | 操作 |
|------|------|
| `.claude/skills/eket/SKILL.md` | 新建 |
| `.claude/skills/eket/references/architecture.md` | 新建 |
| `.claude/skills/eket/references/dev-commands.md` | 新建 |
| `.claude/skills/eket/references/setup-guide.md` | 新建 |
| `scripts/setup.sh` | 新建 |
