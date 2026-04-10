# init-project.sh 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `scripts/init-project.sh` 中的 4 个 bug，使新项目初始化后产物与框架模板完全一致。

**Architecture:** 所有修改集中在 `scripts/init-project.sh` 一个文件和 `template/.gitignore` 一个文件上。不修改命令脚本、不修改模板内容（除了 SYSTEM-SETTINGS.md 的占位符格式统一）。修复采用"最小改动、最大覆盖"原则：用目录级 `cp -r` 替代逐文件 hardcode，用格式对齐替代格式转换。

**Tech Stack:** Bash shell script, macOS/Linux 兼容 sed（`sed -i ''` macOS 兼容写法已沿用）

---

## 文件变更映射

| 文件 | 操作 | 改动内容 |
|------|------|----------|
| `scripts/init-project.sh` | 修改 | `copy_templates()`：补充 `.eket/config/` 和 `analysis-roles/` 复制；修复 SYSTEM-SETTINGS.md sed 格式；`create_directories()`：补充 `shared/message_queue/{inbox,outbox,broadcast}` |
| `template/.gitignore` | 修改 | 补充 `shared/message_queue/` 忽略规则 |
| `template/SYSTEM-SETTINGS.md` | 修改 | 将 `{{CREATE_DATE}}`、`{{UPDATE_DATE}}`、`{{MAINTAINER}}` 改为 `{{VAR}}` 格式（与脚本对齐），统一所有需自动替换的占位符为 `{{}}` 格式 |

---

## Task 1：修复 SYSTEM-SETTINGS.md 占位符格式

**问题根因：** `init-project.sh` 对 SYSTEM-SETTINGS.md 用 `sed` 匹配 `${VAR}` 格式，但模板实际用 `{{VAR}}` 格式，导致 4 个占位符（PROJECT_NAME、CREATE_DATE、UPDATE_DATE、MAINTAINER）静默替换失败。

**修复策略：** 统一为 `{{VAR}}` 格式（与其他所有模板文件一致），并修改 `init-project.sh` 里对应的 sed 命令。

**Files:**
- Modify: `scripts/init-project.sh`（`copy_templates()` 函数中 SYSTEM-SETTINGS.md 的 sed 替换部分，约第 129-136 行）

- [ ] **Step 1: 确认当前模板 SYSTEM-SETTINGS.md 中需要自动替换的占位符**

```bash
grep -n "{{CREATE_DATE}}\|{{UPDATE_DATE}}\|{{MAINTAINER}}\|{{PROJECT_NAME}}" \
  /Users/steven.chen/Desktop/working/sourcecode/research/eket/template/SYSTEM-SETTINGS.md | head -10
```

预期输出：看到 `{{PROJECT_NAME}}`、`{{CREATE_DATE}}` 等行。

- [ ] **Step 2: 修改 init-project.sh 中 SYSTEM-SETTINGS.md 的 sed 替换命令（4 行，从 `${VAR}` 改为 `{{VAR}}`）**

找到文件中这段代码（约第 129-136 行）：
```bash
            sed -i '' "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${CREATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${CREATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${UPDATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${UPDATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${MAINTAINER}/$(whoami)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${MAINTAINER}/$(whoami)/g" "SYSTEM-SETTINGS.md"
```

替换为：
```bash
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{CREATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{CREATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{UPDATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{UPDATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{MAINTAINER}}/$(whoami)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{MAINTAINER}}/$(whoami)/g" "SYSTEM-SETTINGS.md"
```

- [ ] **Step 3: 同理修复 CLAUDE.md 的 sed（`${PROJECT_NAME}` → `{{PROJECT_NAME}}`，约第 78-79 行）**

找到：
```bash
            sed -i '' "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "CLAUDE.md" 2>/dev/null || \
            sed -i "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "CLAUDE.md"
```

替换为：
```bash
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "CLAUDE.md" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "CLAUDE.md"
```

- [ ] **Step 4: 验证替换正确**

```bash
grep -n "sed.*PROJECT_NAME\|sed.*CREATE_DATE\|sed.*MAINTAINER\|sed.*UPDATE_DATE" \
  /Users/steven.chen/Desktop/working/sourcecode/research/eket/scripts/init-project.sh
```

预期：所有 sed 都用 `{{VAR}}` 格式，没有 `\${VAR}` 格式。

- [ ] **Step 5: Commit**

```bash
cd /Users/steven.chen/Desktop/working/sourcecode/research/eket
git add scripts/init-project.sh
git commit -m "fix(init): 统一 sed 占位符格式为 {{VAR}}，修复 SYSTEM-SETTINGS.md 和 CLAUDE.md 替换失败"
```

---

## Task 2：补充 `.eket/config/` 子配置和 `analysis-roles/` 目录复制

**问题根因：** `copy_templates()` 函数逐文件 hardcode 了 `.eket/` 下的复制内容，遗漏了 `config/` 子目录（9 个子配置文件）和 `analysis-roles/` 目录（9 个角色定义文件）。

**修复策略：** 在 `.eket/version.yml` 复制代码块之后，新增两段目录级复制逻辑（条件幂等：仅在目录不存在时复制）。

**Files:**
- Modify: `scripts/init-project.sh`（`copy_templates()` 函数，`.eket/version.yml` 复制块之后插入）

- [ ] **Step 1: 确认模板目录存在**

```bash
ls /Users/steven.chen/Desktop/working/sourcecode/research/eket/template/.eket/config/
ls /Users/steven.chen/Desktop/working/sourcecode/research/eket/template/.eket/analysis-roles/
```

预期：`config/` 有 9 个 `.yml` 文件，`analysis-roles/` 有 9 个 `.md` 文件。

- [ ] **Step 2: 在 `copy_templates()` 中 `.eket/version.yml` 复制块之后，插入 `.eket/config/` 复制逻辑**

找到这段（约第 187-195 行，version.yml 复制块）：
```bash
        if [ -f "$EKET_TEMPLATE_DIR/.eket/version.yml" ]; then
            mkdir -p ".eket"
            cp "$EKET_TEMPLATE_DIR/.eket/version.yml" ".eket/version.yml"
            # 替换占位符
            sed -i '' "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/version.yml" 2>/dev/null || \
            sed -i "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/version.yml"
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/version.yml" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/version.yml"
            echo -e "${GREEN}✓${NC} .eket/version.yml"
        fi
```

在这个 `fi` 之后插入：
```bash

        # 复制 .eket/config/ 子配置目录（模块化配置）
        if [ -d "$EKET_TEMPLATE_DIR/.eket/config" ]; then
            mkdir -p ".eket/config"
            # 幂等：只复制尚不存在的文件
            for cfg in "$EKET_TEMPLATE_DIR/.eket/config/"*.yml; do
                cfg_name="$(basename "$cfg")"
                if [ ! -f ".eket/config/$cfg_name" ]; then
                    cp "$cfg" ".eket/config/$cfg_name"
                fi
            done
            echo -e "${GREEN}✓${NC} .eket/config/ (模块化子配置)"
        fi

        # 复制 .eket/analysis-roles/ 目录（分析角色定义）
        if [ -d "$EKET_TEMPLATE_DIR/.eket/analysis-roles" ] && [ ! -d ".eket/analysis-roles" ]; then
            cp -r "$EKET_TEMPLATE_DIR/.eket/analysis-roles" ".eket/analysis-roles"
            echo -e "${GREEN}✓${NC} .eket/analysis-roles/ (分析角色定义)"
        fi
```

- [ ] **Step 3: 验证插入位置正确**

```bash
grep -n "analysis-roles\|\.eket/config/" \
  /Users/steven.chen/Desktop/working/sourcecode/research/eket/scripts/init-project.sh
```

预期：看到新增的两段复制逻辑。

- [ ] **Step 4: Commit**

```bash
cd /Users/steven.chen/Desktop/working/sourcecode/research/eket
git add scripts/init-project.sh
git commit -m "fix(init): 补充 .eket/config/ 子配置目录和 analysis-roles/ 的复制逻辑"
```

---

## Task 3：补充 `shared/message_queue` 目录创建和 gitignore 保护

**问题根因：** `eket-submit-pr.sh`、`eket-merge.sh`、`eket-review-pr.sh` 等命令在运行时写入 `shared/message_queue/`，但初始化时未创建该目录，且模板 `.gitignore` 未将其排除，导致运行时产生的 JSON 消息文件会被 git 追踪。

**修复策略：**
1. 在 `create_directories()` 中补充 `shared/message_queue/{inbox,outbox,broadcast,dead_letter}` 目录
2. 在 `template/.gitignore` 补充 `shared/message_queue/` 忽略规则

**Files:**
- Modify: `scripts/init-project.sh`（`create_directories()` 函数的 directories 数组）
- Modify: `template/.gitignore`

- [ ] **Step 1: 在 `create_directories()` 的 `directories` 数组中补充 `shared/` 相关目录**

找到（约第 43-57 行）：
```bash
    directories=(
        ".eket"
        ".eket/state"
        ".eket/memory/long_term"
        ".eket/memory/docs"
        ".eket/logs"
        "inbox"
        "inbox/human_feedback"
        "outbox"
        "outbox/review_requests"
        "tasks"
        "outbox"
    )
```

替换为：
```bash
    directories=(
        ".eket"
        ".eket/state"
        ".eket/memory/long_term"
        ".eket/memory/docs"
        ".eket/logs"
        "inbox"
        "inbox/human_feedback"
        "outbox"
        "outbox/review_requests"
        "tasks"
        "shared/message_queue/inbox"
        "shared/message_queue/outbox"
        "shared/message_queue/broadcast"
        "shared/message_queue/dead_letter"
    )
```

注意：同时删除重复的 `"outbox"` 行（原数组末尾多了一个 `"outbox"`）。

- [ ] **Step 2: 在 `template/.gitignore` 末尾补充 `shared/message_queue/` 规则**

在文件末尾追加：
```
# 智能体消息队列（运行时产物，不追踪）
shared/message_queue/inbox/
shared/message_queue/outbox/
shared/message_queue/broadcast/
shared/message_queue/dead_letter/
```

- [ ] **Step 3: 验证**

```bash
# 验证 init-project.sh 中新目录
grep "shared" /Users/steven.chen/Desktop/working/sourcecode/research/eket/scripts/init-project.sh

# 验证 .gitignore 模板
grep "shared" /Users/steven.chen/Desktop/working/sourcecode/research/eket/template/.gitignore
```

预期：两处都能看到 `shared/message_queue` 相关内容。

- [ ] **Step 4: Commit**

```bash
cd /Users/steven.chen/Desktop/working/sourcecode/research/eket
git add scripts/init-project.sh template/.gitignore
git commit -m "fix(init): 创建 shared/message_queue 目录并在 .gitignore 模板中排除运行时消息文件"
```

---

## Task 4：端到端验证（用临时项目测试）

**目的：** 用修复后的 `init-project.sh` 初始化一个临时项目，验证全部 4 个 bug 已修复，不引入新问题。

**Files:**
- 只读：不修改任何文件，验证完后删除临时项目

- [ ] **Step 1: 用修复后的脚本初始化临时测试项目**

```bash
cd /Users/steven.chen/Desktop/working/sourcecode/research/eket
# 以非交互方式运行（绕过 read 提示）
echo -e "2\n1\n\n\n\n\nn" | bash scripts/init-project.sh test-verify /tmp/eket-verify-test 2>&1 | tail -40
```

- [ ] **Step 2: 验证 Bug 1 修复 — .eket/config/ 子配置存在**

```bash
ls /tmp/eket-verify-test/.eket/config/
```

预期：看到 `advanced.yml`、`git.yml`、`monitoring.yml` 等 9 个文件，以及 `connection.yml`。

- [ ] **Step 3: 验证 Bug 1 修复 — analysis-roles/ 存在**

```bash
ls /tmp/eket-verify-test/.eket/analysis-roles/
```

预期：看到 `architect.md`、`dev.md`、`devops.md` 等文件。

- [ ] **Step 4: 验证 Bug 2 修复 — SYSTEM-SETTINGS.md 占位符已替换**

```bash
head -10 /tmp/eket-verify-test/SYSTEM-SETTINGS.md
```

预期：第 1 行显示 `# test-verify 系统设定文档`（而非 `{{PROJECT_NAME}}`），`创建时间` 显示当前日期，`维护者` 显示当前用户名。

- [ ] **Step 5: 验证 Bug 3 修复 — shared/message_queue 目录已创建**

```bash
ls /tmp/eket-verify-test/shared/message_queue/
```

预期：看到 `inbox/`、`outbox/`、`broadcast/`、`dead_letter/` 四个子目录。

- [ ] **Step 6: 验证 Bug 3 修复 — .gitignore 包含 shared/ 规则**

```bash
grep "shared" /tmp/eket-verify-test/.gitignore
```

预期：看到 `shared/message_queue/inbox/` 等规则。

- [ ] **Step 7: 验证 CLAUDE.md 占位符已替换**

```bash
grep "{{PROJECT_NAME}}\|test-verify" /tmp/eket-verify-test/CLAUDE.md | head -5
```

预期：看到 `test-verify/` 而非 `{{PROJECT_NAME}}/`。

- [ ] **Step 8: 清理临时项目**

```bash
rm -rf /tmp/eket-verify-test
```

- [ ] **Step 9: 最终 Commit（如验证全部通过）**

```bash
cd /Users/steven.chen/Desktop/working/sourcecode/research/eket
git log --oneline -5
```

确认 3 个修复 commit 都已就位。

---

## 验收标准

全部 4 个 Step 的验证结果应为：

| 验证项 | 期望结果 |
|--------|----------|
| `.eket/config/` | 包含 10 个文件（9 个子配置 + connection.yml） |
| `.eket/analysis-roles/` | 包含 9 个 .md 角色文件 |
| `SYSTEM-SETTINGS.md` 第 1 行 | `# <project-name> 系统设定文档` |
| `SYSTEM-SETTINGS.md` 创建时间 | 当前日期（非 `{{CREATE_DATE}}`） |
| `shared/message_queue/` | 4 个子目录均已创建 |
| `.gitignore` | 包含 `shared/message_queue/` 相关规则 |
| `CLAUDE.md` 项目结构节 | 显示项目名而非 `{{PROJECT_NAME}}` |
