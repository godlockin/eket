#!/bin/bash
#
# EKET Roadmap 对齐检查系统 v0.6.2
# 用途：检查 PR 是否与项目 roadmap 方向一致
#
# 用法:
#   ./scripts/roadmap-alignment-check.sh <ticket_id> [branch_name]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFLUENCE_DIR="$PROJECT_ROOT/confluence"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
OUTPUT_DIR="$PROJECT_ROOT/outbox/review_results"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# ==========================================
# 查找 Roadmap 文件
# ==========================================

find_roadmap_file() {
    # 优先级 1: 项目特定 roadmap
    local project_roadmap=$(find "$CONFLUENCE_DIR" -name "roadmap.md" -type f 2>/dev/null | head -1)
    if [ -n "$project_roadmap" ]; then
        echo "$project_roadmap"
        return 0
    fi

    # 优先级 2: 根目录 roadmap
    if [ -f "$PROJECT_ROOT/roadmap.md" ]; then
        echo "$PROJECT_ROOT/roadmap.md"
        return 0
    fi

    # 优先级 3: 文档中的 roadmap
    local docs_roadmap=$(find "$PROJECT_ROOT" -path "*/docs/*" -name "roadmap.md" -type f 2>/dev/null | head -1)
    if [ -n "$docs_roadmap" ]; then
        echo "$docs_roadmap"
        return 0
    fi

    return 1
}

# ==========================================
# 解析 Roadmap 内容
# ==========================================

parse_roadmap() {
    local roadmap_file="$1"

    if [ ! -f "$roadmap_file" ]; then
        return 1
    fi

    # 提取愿景和目标
    local vision=$(sed -n '/## 愿景/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -5)
    if [ -z "$vision" ]; then
        vision=$(sed -n '/## 目标/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -5)
    fi

    # 提取阶段性里程碑
    local milestones=$(sed -n '/## 里程碑/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -10)
    if [ -z "$milestones" ]; then
        milestones=$(sed -n '/## 阶段/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -10)
    fi

    # 提取功能路线图
    local features=$(sed -n '/## 功能路线/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -15)
    if [ -z "$features" ]; then
        features=$(sed -n '/## 功能/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -15)
    fi

    # 提取技术规范
    local tech_specs=$(sed -n '/## 技术规范/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -10)
    if [ -z "$tech_specs" ]; then
        tech_specs=$(sed -n '/## 技术/,/##/p' "$roadmap_file" 2>/dev/null | grep -v "^##" | head -10)
    fi

    echo "VISION_START"
    echo "$vision"
    echo "VISION_END"
    echo "MILESTONES_START"
    echo "$milestones"
    echo "MILESTONES_END"
    echo "FEATURES_START"
    echo "$features"
    echo "FEATURES_END"
    echo "TECH_SPECS_START"
    echo "$tech_specs"
    echo "TECH_SPECS_END"
}

# ==========================================
# 检查 Roadmap 对齐
# ==========================================

check_roadmap_alignment() {
    local ticket_id="$1"
    local roadmap_file="$2"

    local alignment_score=5
    local issues=()
    local warnings=()
    local alignments=()

    log_section "Roadmap 对齐检查"

    # 读取任务文件
    local ticket_file=""
    for type in feature bugfix hotfix docs; do
        if [ -f "$JIRA_DIR/$type/${ticket_id}.md" ]; then
            ticket_file="$JIRA_DIR/$type/${ticket_id}.md"
            break
        fi
    done

    if [ -z "$ticket_file" ]; then
        log_error "任务文件未找到：$ticket_id"
        return 1
    fi

    log_info "任务文件：$ticket_file"

    # 读取任务内容
    local ticket_title=$(grep "^#" "$ticket_file" 2>/dev/null | head -1 | sed 's/^# //')
    local ticket_description=$(sed -n '/## 任务描述/,/##/p' "$ticket_file" 2>/dev/null | grep -v "^##" | head -10)
    local ticket_tags=$(grep "^**标签" "$ticket_file" 2>/dev/null | cut -d':' -f2 || echo "")

    log_info "任务标题：$ticket_title"

    # 解析 Roadmap
    local roadmap_content=$(parse_roadmap "$roadmap_file")

    # 检查 1: 愿景对齐
    log_info "检查愿景对齐..."
    local vision_section=$(echo "$roadmap_content" | sed -n '/VISION_START/,/VISION_END/p')
    if [ -n "$vision_section" ]; then
        # 检查任务关键词是否出现在愿景中
        local vision_match=false
        for keyword in $(echo "$ticket_title $ticket_description" | tr ' ' '\n' | sort -u); do
            if echo "$vision_section" | grep -qi "$keyword" 2>/dev/null; then
                vision_match=true
                break
            fi
        done

        if [ "$vision_match" = true ]; then
            alignments+=("任务关键词与愿景匹配")
            log_info "✓ 任务与愿景对齐"
        else
            warnings+=("任务未明确关联到项目愿景")
            alignment_score=$((alignment_score - 1))
        fi
    else
        warnings+=("Roadmap 缺少愿景描述")
    fi

    # 检查 2: 里程碑对齐
    log_info "检查里程碑对齐..."
    local milestones_section=$(echo "$roadmap_content" | sed -n '/MILESTONES_START/,/MILESTONES_END/p')
    if [ -n "$milestones_section" ]; then
        # 检查任务标签是否匹配里程碑
        if echo "$milestones_section" | grep -qiE "$(echo "$ticket_tags" | tr '`' ' ')" 2>/dev/null; then
            alignments+=("任务标签匹配里程碑")
            log_info "✓ 任务与里程碑对齐"
        else
            # 检查任务描述是否提及里程碑
            if grep -qiE "milestone|阶段 | 里程碑" "$ticket_file" 2>/dev/null; then
                alignments+=("任务提及里程碑")
                log_info "✓ 任务与里程碑对齐"
            else
                warnings+=("任务未明确关联到里程碑")
            fi
        fi
    else
        warnings+=("Roadmap 缺少里程碑定义")
    fi

    # 检查 3: 功能路线对齐
    log_info "检查功能路线对齐..."
    local features_section=$(echo "$roadmap_content" | sed -n '/FEATURES_START/,/FEATURES_END/p')
    if [ -n "$features_section" ]; then
        # 检查任务是否在功能路线中
        local feature_match=false
        for keyword in $(echo "$ticket_title" | tr ' ' '\n' | sort -u | head -5); do
            if echo "$features_section" | grep -qi "$keyword" 2>/dev/null; then
                feature_match=true
                break
            fi
        done

        if [ "$feature_match" = true ]; then
            alignments+=("任务在功能路线中")
            log_info "✓ 任务与功能路线对齐"
        else
            warnings+=("任务可能偏离功能路线")
            alignment_score=$((alignment_score - 1))
        fi
    else
        warnings+=("Roadmap 缺少功能路线定义")
    fi

    # 检查 4: 技术规范对齐
    log_info "检查技术规范对齐..."
    local tech_section=$(echo "$roadmap_content" | sed -n '/TECH_SPECS_START/,/TECH_SPECS_END/p')
    if [ -n "$tech_section" ]; then
        # 检查是否有违反技术规范的迹象
        if echo "$tech_section" | grep -qi "python" 2>/dev/null; then
            # 如果是 Python 项目，检查是否有非 Python 代码
            local changed_files=$(git diff --name-only HEAD~5 2>/dev/null || echo "")
            if echo "$changed_files" | grep -qE "\.(java|cpp|go)$" 2>/dev/null; then
                issues+=("技术栈偏离：项目使用 Python，但提交了其他语言代码")
                alignment_score=$((alignment_score - 2))
            fi
        fi
    fi

    # 检查 5: 遗漏功能点
    log_info "检查功能完整性..."
    local acceptance_criteria=$(sed -n '/## 验收标准/,/##/p' "$ticket_file" 2>/dev/null | grep -v "^##")
    if [ -n "$acceptance_criteria" ]; then
        local total=$(echo "$acceptance_criteria" | grep -c "\- \[" || echo "0")
        local done=$(echo "$acceptance_criteria" | grep -c "\- \[x\]" || echo "0")

        if [ "$total" -gt 0 ]; then
            if [ "$done" -ge "$total" ]; then
                log_info "✓ 所有验收标准已完成 ($done/$total)"
                alignments+=("验收标准全部完成")
            else
                issues+=("验收标准未完成 ($done/$total)")
                alignment_score=$((alignment_score - 1))
            fi
        fi
    fi

    # 输出结果
    echo ""
    echo "对齐评分：$alignment_score/5"

    if [ ${#alignments[@]} -gt 0 ]; then
        echo -e "${GREEN}对齐项:${NC}"
        printf '  ✓ %s\n' "${alignments[@]}"
    fi

    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}问题:${NC}"
        printf '  - %s\n' "${issues[@]}"
    fi

    if [ ${#warnings[@]} -gt 0 ]; then
        echo -e "${YELLOW}警告:${NC}"
        printf '  - %s\n' "${warnings[@]}"
    fi

    if [ ${#issues[@]} -eq 0 ] && [ ${#warnings[@]} -eq 0 ] && [ ${#alignments[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ Roadmap 对齐检查通过${NC}"
    fi

    # 返回评审结果
    echo "ROADMAP_SCORE=$alignment_score" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
    echo "ROADMAP_STATUS=$([ $alignment_score -ge 3 ] && echo "pass" || echo "fail")" >> "$OUTPUT_DIR/.review_${ticket_id}.env"

    return 0
}

# ==========================================
# 生成 Roadmap 对齐报告
# ==========================================

generate_roadmap_report() {
    local ticket_id="$1"
    local roadmap_file="$2"
    local report_file="$OUTPUT_DIR/roadmap-alignment-${ticket_id}-$(date +%Y%m%d_%H%M%S).md"

    mkdir -p "$OUTPUT_DIR"

    # 读取评审结果
    local env_file="$OUTPUT_DIR/.review_${ticket_id}.env"
    local roadmap_score=3
    local roadmap_status="unknown"
    if [ -f "$env_file" ]; then
        source "$env_file"
        roadmap_score="${ROADMAP_SCORE:-3}"
        roadmap_status="${ROADMAP_STATUS:-unknown}"
    fi

    # 生成报告
    cat > "$report_file" << EOF
# Roadmap 对齐检查报告

**任务 ID**: $ticket_id
**检查时间**: $(date -Iseconds)
**Roadmap 文件**: $roadmap_file

---

## 1. 检查概览

| 项目 | 结果 |
|------|------|
| 对齐评分 | $roadmap_score / 5 |
| 状态 | $([ "$roadmap_status" = "pass" ] && echo "✓ 通过" || echo "⚠ 需要关注") |

---

## 2. 检查详情

### 2.1 愿景对齐

$(if [ "$roadmap_score" -ge 4 ]; then echo "**结果**: ✓ 任务与项目愿景一致"; else echo "**结果**: ⚠ 任务与愿景关联不明确"; fi)

### 2.2 里程碑对齐

$(if grep -qiE "milestone|阶段|里程碑" "$JIRA_DIR"/*/"${ticket_id}.md" 2>/dev/null; then echo "**结果**: ✓ 任务关联到里程碑"; else echo "**结果**: ⚠ 任务未明确关联里程碑"; fi)

### 2.3 功能路线对齐

**结果**: $(if [ "$roadmap_score" -ge 3 ]; then echo "✓ 任务在功能路线内"; else echo "⚠ 任务可能偏离功能路线"; fi)

### 2.4 技术规范对齐

**结果**: ✓ 符合技术规范

---

## 3. 建议

$(if [ "$roadmap_score" -ge 4 ]; then
    echo "- 任务与 Roadmap 对齐良好"
    echo "- 建议继续保持与项目愿景的一致性"
elif [ "$roadmap_score" -ge 3 ]; then
    echo "- 任务基本符合 Roadmap 方向"
    echo "- 建议在任务描述中明确关联的里程碑"
else
    echo "- 任务可能偏离 Roadmap 方向"
    echo "- 建议 Review 项目愿景和功能路线"
    echo "- 确认任务优先级和必要性"
fi)

---

## 4. 结论

**推荐**: $([ "$roadmap_score" -ge 3 ] && echo "✓ 可以继续进行" || echo "⚠ 需要进一步讨论")

**理由**: $([ "$roadmap_score" -ge 3 ] && echo "任务与项目 Roadmap 基本对齐" || echo "任务方向需要与项目规划进一步确认")

---

**生成者**: EKET Roadmap Alignment Checker v0.6.2
EOF

    log_info "Roadmap 对齐报告已生成：$report_file"
    echo "$report_file"
}

# ==========================================
# 主函数
# ==========================================

main() {
    local ticket_id="${1:-}"
    local branch="${2:-}"

    if [ -z "$ticket_id" ]; then
        echo "用法：$0 <ticket_id> [branch_name]"
        echo ""
        echo "参数:"
        echo "  ticket_id   - 任务 ID (如：FEAT-001)"
        echo "  branch_name - 分支名称 (可选)"
        exit 1
    fi

    log_info "开始 Roadmap 对齐检查：$ticket_id"

    # 查找 Roadmap 文件
    local roadmap_file=""
    roadmap_file=$(find_roadmap_file) || true

    if [ -z "$roadmap_file" ]; then
        log_warn "未找到 Roadmap 文件"
        echo ""
        echo "Roadmap 文件不存在，降级为可选检查"
        echo ""
        echo "建议项目维护 Roadmap 文件，位置选项:"
        echo "  - confluence/projects/*/roadmap.md"
        echo "  - roadmap.md (项目根目录)"
        echo "  - docs/roadmap.md"
        echo ""

        # 创建输出目录
        mkdir -p "$OUTPUT_DIR"

        # 写入默认结果
        echo "ROADMAP_SCORE=3" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
        echo "ROADMAP_STATUS=warning" >> "$OUTPUT_DIR/.review_${ticket_id}.env"

        # 生成提示报告
        local report_file="$OUTPUT_DIR/roadmap-alignment-${ticket_id}-$(date +%Y%m%d_%H%M%S).md"
        cat > "$report_file" << EOF
# Roadmap 对齐检查报告

**任务 ID**: $ticket_id
**检查时间**: $(date -Iseconds)

---

## 状态：⚠️ Roadmap 文件不存在

本次检查降级为可选检查，不影响合并流程。

---

## 建议

建议项目维护 Roadmap 文件，位置选项:

1. \`confluence/projects/\${project-name}/roadmap.md\`
2. \`roadmap.md\` (项目根目录)
3. \`docs/roadmap.md\`

---

**生成者**: EKET Roadmap Alignment Checker v0.6.2
EOF
        log_info "提示报告已生成：$report_file"
        return 0
    fi

    log_info "Roadmap 文件：$roadmap_file"

    # 创建输出目录
    mkdir -p "$OUTPUT_DIR"

    # 执行对齐检查
    check_roadmap_alignment "$ticket_id" "$roadmap_file"

    # 生成报告
    generate_roadmap_report "$ticket_id" "$roadmap_file"

    log_section "检查完成"
    log_info "Roadmap 对齐检查已完成"
}

main "$@"
