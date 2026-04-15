# init-existing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为已有单项目提供安全的 EKET Master 初始化，并可选触发多角色并行深度分析（subagent 团队）。

**Architecture:** 两个 bash 脚本：`init-existing.sh` 负责安全目录初始化 + Master 身份写入 + 完成提示，`analyze-existing.sh` 负责角色选择 + subagent dispatch + alignment 汇总。8 个角色 prompt 模板存放在 `template/.eket/analysis-roles/`，subagent 由 Master Claude 实例通过 Agent tool 并行启动。

**Tech Stack:** bash, Claude Code Agent tool, markdown

---

### Task 1: 角色 prompt 模板

**Files:**
- Create: `template/.eket/analysis-roles/product.md`
- Create: `template/.eket/analysis-roles/dev.md`
- Create: `template/.eket/analysis-roles/security.md`
- Create: `template/.eket/analysis-roles/blueteam.md`
- Create: `template/.eket/analysis-roles/architect.md`
- Create: `template/.eket/analysis-roles/tester.md`
- Create: `template/.eket/analysis-roles/devops.md`
- Create: `template/.eket/analysis-roles/end_user.md`

每个模板结构相同，差异在角色定位和分析维度。以 `security.md` 为例：

```markdown
# IDENTITY: 安全工程师

你是一名资深安全工程师，正在对一个已有项目进行全量安全审计。

## 职责
- 识别安全漏洞面（OWASP Top 10、认证授权、输入验证）
- 发现敏感数据暴露风险（硬编码密钥、日志泄漏、不安全存储）
- 评估依赖风险（已知 CVE、过时依赖）
- 检查加密实现（弱算法、密钥管理）

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit
- ❌ 不得执行任何写操作

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

全量扫描所有源码文件，输出报告到:
{{OUTPUT_PATH}}

## 输出格式
见 docs/plans/2026-04-09-init-existing-design.md 报告格式规范
```

**Step 1: 创建 analysis-roles 目录**
```bash
mkdir -p template/.eket/analysis-roles
```

**Step 2: 创建 product.md**
```markdown
# IDENTITY: 产品经理

你是一名资深产品经理，正在对一个已有项目进行全量产品审计。

## 职责
- 评估用户价值：核心功能是否解决真实问题
- 识别功能完整性缺口：对比同类产品缺少什么
- 分析 roadmap gap：现有功能与目标用户期望的差距
- 评估产品可用性：onboarding、文档、错误提示

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

全量扫描所有文档、配置、源码，重点关注用户接触面。
输出报告到: {{OUTPUT_PATH}}
```

**Step 3: 创建 dev.md**
```markdown
# IDENTITY: 开发工程师

你是一名资深全栈开发工程师，正在对一个已有项目进行全量代码审计。

## 职责
- 代码质量：复杂度、可读性、重复代码（DRY）
- 技术债务：临时方案、TODO/FIXME、过时模式
- 架构合理性：模块划分、依赖方向、接口设计
- 可维护性：测试覆盖、文档完整性、错误处理

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

全量扫描所有源码文件。
输出报告到: {{OUTPUT_PATH}}
```

**Step 4: 创建 security.md**（见上方示例）

**Step 5: 创建 blueteam.md**
```markdown
# IDENTITY: 蓝队工程师

你是一名蓝队（防御方）安全工程师，专注运行时防护与事件响应。

## 职责
- 运行时防护：是否有入侵检测、异常行为监控
- 监控盲区：关键操作是否有日志、告警是否覆盖
- 日志完整性：敏感操作审计日志、日志防篡改
- 应急响应：是否有故障恢复机制、降级策略

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

输出报告到: {{OUTPUT_PATH}}
```

**Step 6: 创建 architect.md**
```markdown
# IDENTITY: 架构师

你是一名系统架构师，专注系统设计的长期健康度。

## 职责
- 扩展性：系统能否支撑 10x 流量/数据增长
- 耦合度：模块间依赖是否过紧，是否易于替换
- 性能瓶颈：潜在的 N+1、阻塞 IO、无缓存热点
- 技术选型：当前选型是否匹配问题规模

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

输出报告到: {{OUTPUT_PATH}}
```

**Step 7: 创建 tester.md**
```markdown
# IDENTITY: 测试工程师

你是一名资深测试工程师，专注测试策略与质量保障。

## 职责
- 测试覆盖率：单元/集成/E2E 各层覆盖情况
- 测试策略：是否有测试金字塔，mock 是否合理
- 漏测场景：边界值、异常路径、并发场景
- 测试基础设施：CI 集成、测试数据管理、flaky test

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

输出报告到: {{OUTPUT_PATH}}
```

**Step 8: 创建 devops.md**
```markdown
# IDENTITY: DevOps 工程师

你是一名 DevOps 工程师，专注交付流程与基础设施。

## 职责
- CI/CD 完整性：构建/测试/部署流水线是否完整
- 部署风险：是否有蓝绿/金丝雀部署，回滚方案
- 基础设施即代码：环境配置是否版本化
- 可观测性：metrics、tracing、alerting 是否齐备

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

输出报告到: {{OUTPUT_PATH}}
```

**Step 9: 创建 end_user.md**
```markdown
# IDENTITY: 终端用户

你需要先推断自己扮演的用户画像，然后以该用户身份审视项目。

## 用户画像推断规则
扫描 README、package.json description、docs/ 目录后：
- 含 CLI / developer tool → 你是：有经验的开发者
- 含 B2B / enterprise / SaaS → 你是：企业运营/采购人员
- 含 consumer / mobile / app → 你是：普通消费者
- 无明确信号 → 列出 2-3 种可能画像，各自评估

**报告开头必须声明：**
> "我扮演的用户画像是 [XXX]，理由是 [YYY]"

## 分析维度
- 使用体验：能否顺利完成核心任务，障碍在哪
- 功能可发现性：功能是否容易找到和理解
- 痛点：什么地方会让用户放弃
- 期望 gap：用户期望有但没有的功能

## 禁止操作
- ❌ 不得修改任何代码文件
- ❌ 不得提交任何 git commit

## 分析任务
项目路径: {{PROJECT_PATH}}
Tech Stack: {{TECH_STACK}}
Git 近期提交: {{GIT_LOG}}
目录结构: {{DIR_TREE}}

输出报告到: {{OUTPUT_PATH}}
```

**Step 10: commit**
```bash
git add template/.eket/analysis-roles/
git commit -m "feat: add analysis role prompt templates (8 roles)"
```

---

### Task 2: init-existing.sh

**Files:**
- Create: `scripts/init-existing.sh`

**Step 1: 创建脚本骨架 + 颜色变量**
```bash
#!/bin/bash
# EKET 已有项目初始化脚本
# 使用方法: ./scripts/init-existing.sh [project-path]
# project-path 默认为当前目录

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
EKET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date -Iseconds)
DATE=$(date +%Y-%m-%d)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
```

**Step 2: 实现 `init_directories()` 函数**
```bash
init_directories() {
  echo ""
  echo "========================================"
  echo "Phase 1: 目录初始化（安全模式）"
  echo "========================================"

  cd "$PROJECT_ROOT"

  local dirs=(
    ".eket"
    ".eket/state"
    ".eket/memory"
    ".eket/logs"
    "confluence"
    "confluence/analysis"
    "confluence/requirements"
    "confluence/architecture"
    "jira"
    "jira/tickets"
    "jira/epics"
    "inbox"
    "inbox/human_feedback"
    "outbox"
    "outbox/review_requests"
  )

  for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
      ok "$dir (已存在，跳过)"
    else
      mkdir -p "$dir"
      ok "$dir (已创建)"
    fi
  done
}
```

**Step 3: 实现 `init_claude_md()` 函数（追加模式）**
```bash
init_claude_md() {
  cd "$PROJECT_ROOT"

  local EKET_MARKER="## EKET Framework"

  if [ -f "CLAUDE.md" ]; then
    if grep -q "$EKET_MARKER" "CLAUDE.md"; then
      warn "CLAUDE.md 已含 EKET 段落，跳过"
    else
      cat >> "CLAUDE.md" << 'EKET_SECTION'

---

## EKET Framework

**每次启动时，请首先读取 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）！**

- **Master**：协调、需求分析、任务拆解、PR 审核、合并代码
- **Slaver**：领取任务、开发、测试、提交 PR

### 输入/输出
- 需求输入：`inbox/human_input.md`
- Review 请求：`outbox/review_requests/`
- 任务列表：`jira/tickets/`
- 文档：`confluence/`
EKET_SECTION
      ok "CLAUDE.md — 已追加 EKET 段落"
    fi
  else
    if [ -f "$EKET_ROOT/template/CLAUDE.md" ]; then
      cp "$EKET_ROOT/template/CLAUDE.md" "CLAUDE.md"
      ok "CLAUDE.md — 从模板复制"
    else
      warn "CLAUDE.md — 模板不存在，已跳过"
    fi
  fi
}
```

**Step 4: 实现 `init_gitignore()` 函数（追加模式）**
```bash
init_gitignore() {
  cd "$PROJECT_ROOT"

  local entries=(
    ".eket/data/"
    ".eket/logs/"
    ".eket/state/instance_config.yml"
  )

  if [ ! -f ".gitignore" ]; then
    touch ".gitignore"
    ok ".gitignore — 已创建"
  fi

  for entry in "${entries[@]}"; do
    if grep -qF "$entry" ".gitignore"; then
      ok ".gitignore — $entry (已存在)"
    else
      echo "$entry" >> ".gitignore"
      ok ".gitignore — 追加 $entry"
    fi
  done
}
```

**Step 5: 实现 `init_master_identity()` 函数**
```bash
init_master_identity() {
  echo ""
  echo "========================================"
  echo "Phase 2: Master 身份写入"
  echo "========================================"

  cd "$PROJECT_ROOT"

  # 复制 IDENTITY.md
  if [ -f "$EKET_ROOT/template/.eket/IDENTITY.md" ]; then
    cp "$EKET_ROOT/template/.eket/IDENTITY.md" ".eket/IDENTITY.md"
    ok ".eket/IDENTITY.md"
  fi

  # 写入 instance_config.yml
  cat > ".eket/state/instance_config.yml" << EOF
# EKET 实例配置（已有项目接入）
# 自动生成于：${TIMESTAMP}

role: "master"
agent_type: null
auto_mode: false
storage_mode: "git_full"
status: "initialized"
initialized_from: "existing_project"
initialized_at: "${TIMESTAMP}"
EOF
  ok ".eket/state/instance_config.yml (role: master)"
}
```

**Step 6: 实现 `show_next_steps()` 函数**
```bash
show_next_steps() {
  echo ""
  echo "========================================"
  echo -e "${GREEN}✅ EKET Master 初始化完成${NC}"
  echo "========================================"
  echo ""
  echo "项目路径: $PROJECT_ROOT"
  echo ""
  echo "下一步选项："
  echo ""
  echo -e "  ${BLUE}A) 启动深度分析（推荐首次接入）${NC}"
  echo "     直接输入 'y' 继续，或稍后运行："
  echo "     ./scripts/analyze-existing.sh $PROJECT_ROOT"
  echo ""
  echo -e "  ${YELLOW}B) 跳过分析，直接开始任务分配${NC}"
  echo "     在 inbox/human_input.md 写入需求，启动 Claude Code 即可"
  echo ""

  read -p "是否现在启动深度分析？[y/N]: " ANALYZE_NOW
  if [[ "$ANALYZE_NOW" =~ ^[Yy]$ ]]; then
    bash "$EKET_ROOT/scripts/analyze-existing.sh" "$PROJECT_ROOT"
  else
    info "已跳过深度分析。随时可运行："
    echo "  ./scripts/analyze-existing.sh $PROJECT_ROOT"
  fi
}
```

**Step 7: 实现 main() 并加 chmod**
```bash
main() {
  echo "========================================"
  echo "EKET 已有项目初始化"
  echo "========================================"
  echo "项目路径: $PROJECT_ROOT"
  echo ""

  init_directories
  init_claude_md
  init_gitignore
  init_master_identity
  show_next_steps
}

main "$@"
```

```bash
chmod +x scripts/init-existing.sh
```

**Step 8: 验证脚本语法**
```bash
bash -n scripts/init-existing.sh
```
Expected: 无输出（无语法错误）

**Step 9: commit**
```bash
git add scripts/init-existing.sh
git commit -m "feat: add init-existing.sh — safe init for existing projects"
```

---

### Task 3: analyze-existing.sh — Tech Stack 探测 + 角色选择

**Files:**
- Create: `scripts/analyze-existing.sh`

**Step 1: 骨架 + tech stack 探测函数**
```bash
#!/bin/bash
# EKET 已有项目深度分析脚本
# 使用方法: ./scripts/analyze-existing.sh [project-path]

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
EKET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date +%Y-%m-%d)
OUTPUT_DIR="$PROJECT_ROOT/confluence/analysis/$DATE"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }

detect_tech_stack() {
  local stack=""
  [ -f "$PROJECT_ROOT/package.json" ]      && stack="$stack Node.js/TypeScript"
  [ -f "$PROJECT_ROOT/requirements.txt" ]  && stack="$stack Python"
  [ -f "$PROJECT_ROOT/pyproject.toml" ]    && stack="$stack Python"
  [ -f "$PROJECT_ROOT/go.mod" ]            && stack="$stack Go"
  [ -f "$PROJECT_ROOT/Cargo.toml" ]        && stack="$stack Rust"
  [ -f "$PROJECT_ROOT/pom.xml" ]           && stack="$stack Java/Maven"
  [ -f "$PROJECT_ROOT/build.gradle" ]      && stack="$stack Java/Gradle"
  [ -z "$stack" ] && stack=" Unknown"
  echo "$stack"
}
```

**Step 2: 角色选择菜单函数**
```bash
select_roles() {
  echo ""
  echo "========================================"
  echo "选择分析角色（空格切换，回车确认）"
  echo "========================================"
  echo ""
  echo "可用角色："
  echo "  [1] product   - 产品经理（功能完整性、用户价值）"
  echo "  [2] dev       - 开发工程师（代码质量、技术债务）"
  echo "  [3] security  - 安全工程师（漏洞、敏感数据）"
  echo "  [4] blueteam  - 蓝队（监控、应急响应）"
  echo "  [5] architect - 架构师（扩展性、耦合度）"
  echo "  [6] tester    - 测试工程师（覆盖率、策略）"
  echo "  [7] devops    - DevOps（CI/CD、基础设施）"
  echo "  [8] end_user  - 终端用户（使用体验、痛点）"
  echo ""
  echo "推荐默认组合: 1 2 3 4 8 (product+dev+security+blueteam+end_user)"
  echo ""
  read -p "输入角色编号（空格分隔，直接回车使用默认）: " ROLE_INPUT

  # 默认组合
  if [ -z "$ROLE_INPUT" ]; then
    ROLE_INPUT="1 2 3 4 8"
    info "使用默认组合: product dev security blueteam end_user"
  fi

  SELECTED_ROLES=()
  local all_roles=("product" "dev" "security" "blueteam" "architect" "tester" "devops" "end_user")
  for num in $ROLE_INPUT; do
    idx=$((num - 1))
    if [ $idx -ge 0 ] && [ $idx -lt ${#all_roles[@]} ]; then
      SELECTED_ROLES+=("${all_roles[$idx]}")
    fi
  done

  echo ""
  info "已选角色: ${SELECTED_ROLES[*]}"
}
```

**Step 3: commit（骨架 + 探测 + 菜单）**
```bash
chmod +x scripts/analyze-existing.sh
git add scripts/analyze-existing.sh
git commit -m "feat: analyze-existing.sh — tech stack detection + role selection"
```

---

### Task 4: analyze-existing.sh — Subagent Dispatch + 汇总

**Files:**
- Modify: `scripts/analyze-existing.sh`

**Step 1: 实现 `build_subagent_prompt()` 函数**
```bash
build_subagent_prompt() {
  local role="$1"
  local output_path="$2"
  local tech_stack="$3"
  local git_log="$4"
  local dir_tree="$5"
  local template_file="$EKET_ROOT/template/.eket/analysis-roles/${role}.md"

  if [ ! -f "$template_file" ]; then
    echo "ERROR: template not found: $template_file" >&2
    return 1
  fi

  # 替换模板占位符
  sed \
    -e "s|{{PROJECT_PATH}}|$PROJECT_ROOT|g" \
    -e "s|{{TECH_STACK}}|$tech_stack|g" \
    -e "s|{{GIT_LOG}}|$git_log|g" \
    -e "s|{{DIR_TREE}}|$dir_tree|g" \
    -e "s|{{OUTPUT_PATH}}|$output_path|g" \
    "$template_file"
}
```

**Step 2: 实现 `dispatch_subagents()` 函数**

此函数生成供 Master Claude 实例直接使用的 dispatch 指令文件：
```bash
dispatch_subagents() {
  local tech_stack="$1"
  local git_log
  git_log=$(cd "$PROJECT_ROOT" && git log --oneline -20 2>/dev/null || echo "no git history")
  local dir_tree
  dir_tree=$(cd "$PROJECT_ROOT" && find . -not -path './.git/*' -not -path './node_modules/*' \
    -not -path './.eket/data/*' | head -100 | sort)

  mkdir -p "$OUTPUT_DIR"

  info "生成各角色分析 prompt..."
  for role in "${SELECTED_ROLES[@]}"; do
    local output_path="$OUTPUT_DIR/${role}-report.md"
    local prompt_file="$OUTPUT_DIR/.prompt-${role}.md"
    build_subagent_prompt "$role" "$output_path" "$tech_stack" "$git_log" "$dir_tree" \
      > "$prompt_file"
    ok "prompt 已生成: $prompt_file"
  done
}
```

**Step 3: 实现 `print_dispatch_instructions()` 函数**

核心：生成 Master 要在 Claude Code 里执行的 Agent dispatch 块：
```bash
print_dispatch_instructions() {
  local dispatch_file="$OUTPUT_DIR/DISPATCH.md"

  cat > "$dispatch_file" << DISPATCH_HEADER
# 深度分析 Dispatch 指令
**日期**: $DATE
**项目**: $PROJECT_ROOT
**角色**: ${SELECTED_ROLES[*]}

将以下内容复制到 Claude Code 会话中执行，Master 将并行启动所有 Slaver。

---

## 执行指令（在 Claude Code 中粘贴）

\`\`\`
请并行启动以下分析团队，每个角色作为独立 subagent 全量扫描项目并输出报告：

DISPATCH_HEADER

  for role in "${SELECTED_ROLES[@]}"; do
    local prompt_file="$OUTPUT_DIR/.prompt-${role}.md"
    echo "### Slaver: $role" >> "$dispatch_file"
    echo '```' >> "$dispatch_file"
    cat "$prompt_file" >> "$dispatch_file"
    echo '```' >> "$dispatch_file"
    echo "" >> "$dispatch_file"
  done

  cat >> "$dispatch_file" << DISPATCH_FOOTER

所有角色完成后，读取 $OUTPUT_DIR/ 下所有 *-report.md，
生成 $OUTPUT_DIR/alignment.md，内容包含：
1. 跨角色共识（多角色均提到的问题）
2. 跨角色冲突（不同角色建议相互矛盾的地方）
3. 优先级排序（综合所有视角的最高优先行动项 Top 10）

然后从行动项中提取，生成 jira/tickets/analysis-${DATE}-NNN.md 草稿。
\`\`\`
DISPATCH_FOOTER

  echo ""
  echo "========================================"
  echo -e "${GREEN}✅ Dispatch 指令已生成${NC}"
  echo "========================================"
  echo ""
  echo "请在 Claude Code 会话中执行以下文件内容："
  echo ""
  echo -e "  ${BLUE}$dispatch_file${NC}"
  echo ""
  echo "或直接运行（Claude Code 需已启动）："
  echo "  cat $dispatch_file"
}
```

**Step 4: 实现 main()**
```bash
main() {
  echo "========================================"
  echo "EKET 深度分析"
  echo "========================================"
  echo "项目路径: $PROJECT_ROOT"
  echo ""

  local tech_stack
  tech_stack=$(detect_tech_stack)
  info "探测到 Tech Stack:$tech_stack"

  select_roles
  dispatch_subagents "$tech_stack"
  print_dispatch_instructions

  echo ""
  info "报告输出目录: $OUTPUT_DIR"
  info "分析完成后，alignment.md 将汇总所有发现"
}

main "$@"
```

**Step 5: 验证语法**
```bash
bash -n scripts/analyze-existing.sh
```
Expected: 无输出

**Step 6: commit**
```bash
git add scripts/analyze-existing.sh
git commit -m "feat: analyze-existing.sh — subagent dispatch + alignment instructions"
```

---

### Task 5: 集成测试

**Step 1: 在临时目录模拟已有项目**
```bash
mkdir -p /tmp/test-existing-project
cd /tmp/test-existing-project
git init -b main
echo '{"name":"test-app","version":"1.0.0"}' > package.json
echo "# Test App" > README.md
echo "My existing CLAUDE.md content" > CLAUDE.md
echo "node_modules/" > .gitignore
git add . && git commit -m "initial commit"
```

**Step 2: 运行 init-existing.sh**
```bash
cd /Users/chenchen/working/sourcecode/tools/dev-tools/eket
bash scripts/init-existing.sh /tmp/test-existing-project
# 在提示处输入 n（跳过深度分析）
```

**Step 3: 验证目录结构**
```bash
ls /tmp/test-existing-project/.eket/
ls /tmp/test-existing-project/confluence/
ls /tmp/test-existing-project/jira/
```
Expected: state/ memory/ logs/ IDENTITY.md 等目录存在

**Step 4: 验证 CLAUDE.md 未被覆盖**
```bash
head -1 /tmp/test-existing-project/CLAUDE.md
```
Expected: `My existing CLAUDE.md content`（原内容保留）

**Step 5: 验证 CLAUDE.md 追加了 EKET 段落**
```bash
grep "EKET Framework" /tmp/test-existing-project/CLAUDE.md
```
Expected: 找到该行

**Step 6: 验证 .gitignore 追加**
```bash
grep ".eket/data/" /tmp/test-existing-project/.gitignore
```
Expected: 找到该行

**Step 7: 验证 instance_config.yml**
```bash
grep "role:" /tmp/test-existing-project/.eket/state/instance_config.yml
```
Expected: `role: "master"`

**Step 8: 运行 analyze-existing.sh（只到角色选择，不实际 dispatch）**
```bash
echo "1 2" | bash scripts/analyze-existing.sh /tmp/test-existing-project
```
Expected: 生成 DISPATCH.md，无报错

**Step 9: 验证 Node.js 测试无回归**
```bash
cd node && NODE_OPTIONS=--experimental-vm-modules npm test -- --no-coverage 2>&1 | tail -3
```
Expected: `1079 passed, 1079 total`

**Step 10: commit**
```bash
git add scripts/
git commit -m "test: verify init-existing + analyze-existing integration"
```

---

### Task 6: push + 更新 JIRA

**Step 1: push 到远程**
```bash
git push origin miao
```

**Step 2: 更新 jira/tickets/TASK-019.md**
```markdown
# TASK-019: init-existing — 已有项目接入 EKET

**状态**: ✅ 完成
**版本**: v2.7.0
**分支**: feature/TASK-019-init-existing
```

**Step 3: 最终 commit**
```bash
git add jira/
git commit -m "docs: TASK-019 完成"
git push origin miao
```
