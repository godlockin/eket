#!/usr/bin/env bash
# generate-codebase-map.sh — 扫描项目目录，生成 codebase-map.md
#
# 用法：
#   bash scripts/generate-codebase-map.sh                    # 扫描当前项目
#   bash scripts/generate-codebase-map.sh /path/to/project  # 扫描目标项目
#   bash scripts/generate-codebase-map.sh --self             # 扫描 eket 自身
#
# 输出：<PROJECT_ROOT>/confluence/memory/codebase-map.md
# 行为：首次创建；已有文件时只更新"目录骨架"区块，保留人工注释

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EKET_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# ─── 参数处理 ────────────────────────────────────────────────────────────────
PROJECT_ROOT=""
if [[ "${1:-}" == "--self" ]]; then
  PROJECT_ROOT="$EKET_ROOT"
elif [[ -n "${1:-}" && -d "$1" ]]; then
  PROJECT_ROOT="$(cd "$1" && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

OUT_DIR="$PROJECT_ROOT/confluence/memory"
OUT_FILE="$OUT_DIR/codebase-map.md"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
TIMESTAMP="$(date '+%Y-%m-%d')"

mkdir -p "$OUT_DIR"

echo -e "${BLUE}扫描项目：$PROJECT_ROOT${NC}"

# ─── 技术栈探测 ──────────────────────────────────────────────────────────────
detect_stacks() {
  local dir="$1"
  local stacks=()
  [[ -f "$dir/Cargo.toml" ]]                                         && stacks+=("Rust")
  [[ -f "$dir/package.json" ]]                                       && stacks+=("Node.js")
  [[ -f "$dir/pyproject.toml" || -f "$dir/requirements.txt" ]]      && stacks+=("Python")
  [[ -f "$dir/go.mod" ]]                                             && stacks+=("Go")
  [[ -f "$dir/pom.xml" || -f "$dir/build.gradle" ]]                 && stacks+=("Java")
  [[ -f "$dir/Gemfile" ]]                                            && stacks+=("Ruby")
  find "$dir" -maxdepth 2 -name "*.sh" | grep -q . 2>/dev/null      && stacks+=("Shell")
  find "$dir" -maxdepth 3 -name "Dockerfile" | grep -q . 2>/dev/null && stacks+=("Docker")
  find "$dir" -maxdepth 3 \( -name "*.yml" -o -name "*.yaml" \) \
    | xargs grep -l "kind:\|apiVersion:" 2>/dev/null | grep -q .    && stacks+=("Kubernetes")
  find "$dir" -maxdepth 3 -name "*.tf" | grep -q . 2>/dev/null      && stacks+=("Terraform")
  find "$dir" -maxdepth 3 -name "*.md" | grep -q . 2>/dev/null      && stacks+=("Docs/Markdown")
  printf '%s\n' "${stacks[@]}"
}

STACKS=$(detect_stacks "$PROJECT_ROOT" | paste -sd '、' -)

# ─── 目录扫描 ────────────────────────────────────────────────────────────────

# 通用"有意义"目录规则（排除构建产物/依赖/隐藏目录）
EXCLUDE_DIRS="node_modules|target|dist|.git|__pycache__|.venv|venv|vendor|.next|build|out|coverage|.cache"

scan_dirs() {
  local root="$1"
  find "$root" -maxdepth 3 -type d \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | grep -v "^\.$" \
    | sed "s|^$root/||" \
    | grep -v "^\." \
    | sort
}

# 代码目录（commands/core/api/routes/models/handlers 等约定名）
CODE_PATTERN="commands|core|api|routes|models|handlers|services|controllers|middleware|hooks|engine|server|cli|lib|pkg|src|internal"
scan_code_dirs() {
  local root="$1"
  find "$root" -maxdepth 4 -type d \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | grep -E "($CODE_PATTERN)" \
    | sed "s|^$root/||" \
    | sort
}

# 配置文件
scan_config_files() {
  local root="$1"
  find "$root" -maxdepth 3 -type f \
    \( -name "*.toml" -o -name "*.yml" -o -name "*.yaml" \
     -o -name "*.json" -o -name ".env*" -o -name "*.config.*" \
     -o -name "Makefile" -o -name "Dockerfile" \) \
    | grep -Ev "($EXCLUDE_DIRS|package-lock|yarn\.lock|Cargo\.lock)" \
    | sed "s|^$root/||" \
    | sort | head -30
}

# 部署运维文件
scan_ops_files() {
  local root="$1"
  find "$root" -maxdepth 4 -type f \
    \( -name "*.tf" -o -name "*.sh" \) \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | sed "s|^$root/||" \
    | sort | head -30
  find "$root" -maxdepth 4 -type d \
    \( -name "k8s" -o -name "kubernetes" -o -name "helm" \
     -o -name "deploy" -o -name "infra" -o -name "ops" \
     -o -name "scripts" -o -name "ci" -o -name ".github" \) \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | sed "s|^$root/||" \
    | sort | head -10
}

# 文档文件
scan_doc_files() {
  local root="$1"
  find "$root" -maxdepth 4 -type f -name "*.md" \
    | grep -Ev "($EXCLUDE_DIRS|node_modules)" \
    | grep -v "codebase-map" \
    | sed "s|^$root/||" \
    | sort | head -30
}

# ─── 生成核心流程入口表（仅 eket-style 项目） ────────────────────────────────
gen_entrypoints_table() {
  local root="$1"
  local rows=""

  # Rust commands
  if [[ -d "$root/rust" ]]; then
    while IFS= read -r f; do
      local base
      base=$(basename "$f" .rs)
      [[ "$base" == "mod" ]] && continue
      rows+="| $(echo "$base" | tr '_' ':') | ${f#$root/} | |\n"
    done < <(find "$root/rust" -path "*/commands/*.rs" | grep -v "mod.rs" | sort)
  fi

  # Node commands
  if [[ -d "$root/node/src/commands" ]]; then
    while IFS= read -r f; do
      local base
      base=$(basename "$f" .ts)
      rows+="| $base | ${f#$root/} | |\n"
    done < <(find "$root/node/src/commands" -name "*.ts" | sort)
  fi

  # Generic: src/commands, app/commands, etc.
  find "$root" -maxdepth 5 -path "*/commands/*" -type f \
    | grep -Ev "($EXCLUDE_DIRS|/rust/|/node/)" \
    | while read -r f; do
        local base
        base=$(basename "$f")
        echo "| $base | ${f#$root/} | |"
      done

  printf "%b" "$rows"
}

# ─── 生成数据模型表 ───────────────────────────────────────────────────────────
gen_models_table() {
  local root="$1"
  local rows=""

  # Rust types
  find "$root" -maxdepth 5 -name "types.rs" -o -name "models.rs" -o -name "schema.rs" 2>/dev/null \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | while read -r f; do echo "| (见文件) | ${f#$root/} |"; done

  # Node/TS types
  find "$root" -maxdepth 5 \( -name "types.ts" -o -name "models.ts" -o -name "interfaces.ts" \) 2>/dev/null \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | while read -r f; do echo "| (见文件) | ${f#$root/} |"; done

  # Python models
  find "$root" -maxdepth 5 -name "models.py" -o -name "schemas.py" 2>/dev/null \
    | grep -Ev "($EXCLUDE_DIRS)" \
    | while read -r f; do echo "| (见文件) | ${f#$root/} |"; done
}

# ─── 生成配置表 ───────────────────────────────────────────────────────────────
gen_config_table() {
  local root="$1"
  scan_config_files "$root" | while read -r f; do
    echo "| $f | |"
  done
}

# ─── 生成目录骨架表 ───────────────────────────────────────────────────────────
gen_dir_table() {
  local root="$1"
  scan_dirs "$root" | while read -r d; do
    # 跳过太深或无意义的
    local depth
    depth=$(echo "$d" | tr -cd '/' | wc -c)
    [[ $depth -gt 2 ]] && continue
    echo "| $d/ | |"
  done
}

# ─── 生成运维部署表 ───────────────────────────────────────────────────────────
gen_ops_table() {
  local root="$1"
  scan_ops_files "$root" | while read -r f; do
    echo "| $f | |"
  done
}

# ─── 生成文档表 ───────────────────────────────────────────────────────────────
gen_doc_table() {
  local root="$1"
  # 只列顶层和约定目录下的 md
  find "$root" -maxdepth 4 -name "*.md" \
    | grep -Ev "($EXCLUDE_DIRS|codebase-map)" \
    | grep -E "(README|CLAUDE|docs/|confluence/|template/docs)" \
    | sed "s|^$root/||" \
    | sort | head -20 \
    | while read -r f; do echo "| $f | |"; done
}

# ─── 组装文件 ────────────────────────────────────────────────────────────────

# 如果文件已存在，只刷新"目录骨架"区块；否则全量创建
if [[ -f "$OUT_FILE" ]]; then
  echo -e "${YELLOW}已存在 codebase-map.md，仅刷新 §5 目录骨架…${NC}"
  MODE="update"
else
  MODE="create"
fi

if [[ "$MODE" == "create" ]]; then
cat > "$OUT_FILE" << HEADER
# Codebase Map — ${PROJECT_NAME}

> 自动扫描生成（${TIMESTAMP}）+ 人工补注。
> 变更时由 post-commit hook 提示更新，累计提示 ≥3 次未更新则阻断 push。
> **人工注释请填写在"备注"列，重新扫描不会覆盖已有内容。**

**技术栈**：${STACKS}

---

## 1. 核心流程入口

> 扫描 commands/ 目录生成，备注列人工填写。

| 功能/命令 | 文件 | 备注 |
|---------|------|------|
HEADER

  gen_entrypoints_table "$PROJECT_ROOT" >> "$OUT_FILE"

cat >> "$OUT_FILE" << 'SECTION2'

---

## 2. 数据模型定义

| 模型 | 文件 |
|------|------|
SECTION2

  gen_models_table "$PROJECT_ROOT" >> "$OUT_FILE"

cat >> "$OUT_FILE" << 'SECTION3'

---

## 3. 配置 & 环境变量

> 扫描配置文件生成，具体变量名人工补充。

| 文件/变量 | 备注 |
|---------|------|
SECTION3

  gen_config_table "$PROJECT_ROOT" >> "$OUT_FILE"

cat >> "$OUT_FILE" << 'SECTION4'

---

## 4. 常见修改点（Convention）

> 人工维护。记录"要做 X → 改哪里"的约定，新 Slaver 上手必读。

| 要做什么 | 文件/目录 | 注意事项 |
|---------|---------|---------|
| （示例）新增功能模块 | src/commands/ | 需在入口文件注册 |

---

## 5. 目录骨架

<!-- eket:auto-section:dir-skeleton -->
| 目录 | 职责 |
|------|------|
SECTION4

  gen_dir_table "$PROJECT_ROOT" >> "$OUT_FILE"

cat >> "$OUT_FILE" << 'SECTION5'
<!-- eket:auto-section:end -->

---

## 6. 运维 & 部署

| 文件/目录 | 说明 |
|---------|------|
SECTION5

  gen_ops_table "$PROJECT_ROOT" >> "$OUT_FILE"

cat >> "$OUT_FILE" << 'SECTION6'

---

## 7. 文档导航

| 文档 | 说明 |
|------|------|
SECTION6

  gen_doc_table "$PROJECT_ROOT" >> "$OUT_FILE"

  echo "" >> "$OUT_FILE"

  echo -e "${GREEN}✓ 已创建 $OUT_FILE${NC}"

else
  # update 模式：只替换 §5 目录骨架区块（<!-- eket:auto-section --> 标记之间）
  local_new_rows=$(gen_dir_table "$PROJECT_ROOT")

  # 构建新的区块内容
  NEW_BLOCK="<!-- eket:auto-section:dir-skeleton -->
| 目录 | 职责 |
|------|------|
${local_new_rows}
<!-- eket:auto-section:end -->"

  # Python 做替换（sed 多行替换不稳定）
  python3 - "$OUT_FILE" "$NEW_BLOCK" << 'PYEOF'
import sys, re

path = sys.argv[1]
new_block = sys.argv[2]

content = open(path).read()
pattern = r'<!-- eket:auto-section:dir-skeleton -->.*?<!-- eket:auto-section:end -->'
updated = re.sub(pattern, new_block, content, flags=re.DOTALL)

if updated == content:
    print("[WARN] 未找到 eket:auto-section 标记，跳过自动更新")
else:
    open(path, 'w').write(updated)
    print(f"✓ 已刷新 §5 目录骨架")
PYEOF

fi

echo -e "${BLUE}完成。路径：$OUT_FILE${NC}"
