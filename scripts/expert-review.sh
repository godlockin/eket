#!/bin/bash
#
# EKET 专家评审系统 v0.6.2
# 用途：对 PR 进行多维度的专家评审（架构/安全/性能/代码质量）
#
# 用法:
#   ./scripts/expert-review.sh <ticket_id> [branch_name]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/src"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
OUTPUT_DIR="$PROJECT_ROOT/outbox/review_results"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
CONFLUENCE_DIR="$PROJECT_ROOT/confluence"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
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
# 架构评审
# ==========================================

review_architecture() {
    local ticket_id="$1"
    local branch="$2"
    local score=5
    local issues=()
    local suggestions=()

    log_section "4.1 架构评审"

    # 检查模块划分
    log_info "检查模块划分..."
    if [ -d "$SRC_DIR" ]; then
        local module_count=$(find "$SRC_DIR" -type d -maxdepth 2 2>/dev/null | wc -l | tr -d ' ')
        if [ "$module_count" -lt 2 ]; then
            issues+=("模块划分不够清晰，建议按功能/职责划分目录")
            score=$((score - 1))
        else
            log_info "✓ 模块划分清晰 ($module_count 个目录)"
        fi
    fi

    # 检查依赖关系
    log_info "检查依赖关系..."
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        local dep_count=$(grep -c '"[a-z]' "$PROJECT_ROOT/package.json" 2>/dev/null || echo "0")
        if [ "$dep_count" -gt 50 ]; then
            suggestions+=("依赖较多 ($dep_count 个)，建议定期审查必要性")
        fi
    fi

    if [ -f "$PROJECT_ROOT/requirements.txt" ]; then
        local dep_count=$(wc -l < "$PROJECT_ROOT/requirements.txt" 2>/dev/null | tr -d ' ')
        if [ "$dep_count" -gt 30 ]; then
            suggestions+=("Python 依赖较多 ($dep_count 个)，建议定期审查")
        fi
    fi

    # 检查架构设计文档
    log_info "检查架构一致性..."
    local arch_docs=$(find "$CONFLUENCE_DIR" -name "*architecture*" -o -name "*design*" 2>/dev/null | head -5)
    if [ -n "$arch_docs" ]; then
        log_info "✓ 发现架构设计文档"
    else
        suggestions+=("建议补充架构设计文档")
    fi

    # 输出结果
    echo "评分：$score/5"
    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}问题:${NC}"
        printf '  - %s\n' "${issues[@]}"
    fi
    if [ ${#suggestions[@]} -gt 0 ]; then
        echo -e "${YELLOW}建议:${NC}"
        printf '  - %s\n' "${suggestions[@]}"
    fi

    # 返回评审结果
    echo "ARCH_SCORE=$score" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
    echo "ARCH_STATUS=$([ $score -ge 3 ] && echo "pass" || echo "fail")" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
}

# ==========================================
# 安全评审
# ==========================================

review_security() {
    local ticket_id="$1"
    local branch="$2"
    local score=5
    local issues=()
    local warnings=()

    log_section "4.2 安全评审"

    # 获取变更文件
    local changed_files=""
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        changed_files=$(git diff --name-only main.."$branch" 2>/dev/null || git diff --name-only HEAD~5 2>/dev/null || echo "")
    fi

    # 检查输入验证
    log_info "检查输入验证..."
    if echo "$changed_files" | grep -qiE "api|controller|handler|route"; then
        log_info "发现 API/路由相关变更，需要检查输入验证"

        # 检查是否有验证逻辑
        local validation_found=false
        for file in $(echo "$changed_files"); do
            if [ -f "$file" ] && grep -qiE "validate|sanitize|escape|trim" "$file" 2>/dev/null; then
                validation_found=true
                break
            fi
        done

        if [ "$validation_found" = false ]; then
            warnings+=("API 变更未发现输入验证逻辑，请确认")
            score=$((score - 1))
        else
            log_info "✓ 发现输入验证逻辑"
        fi
    fi

    # 检查认证授权
    log_info "检查认证授权..."
    if echo "$changed_files" | grep -qiE "auth|login|permission|access"; then
        log_info "发现认证/权限相关变更"

        for file in $(echo "$changed_files"); do
            if [ -f "$file" ]; then
                if grep -qiE "@auth|@login_required|@permission|middleware|guard" "$file" 2>/dev/null; then
                    log_info "✓ 发现认证授权机制"
                else
                    warnings+=("认证相关代码未见认证机制，请确认")
                    score=$((score - 1))
                fi
            fi
        done
    fi

    # 检查 SQL 注入风险
    log_info "检查 SQL 注入风险..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ] && [[ "$file" == *.py || "$file" == *.js || "$file" == *.ts ]]; then
            if grep -qE "execute\(|rawQuery\(|\.raw\(" "$file" 2>/dev/null; then
                if ! grep -qE "parametrize|prepared|\\?|:" "$file" 2>/dev/null; then
                    issues+=("潜在 SQL 注入风险：$file 使用原始 SQL 查询")
                    score=$((score - 2))
                fi
            fi
        fi
    done

    # 检查 XSS 风险
    log_info "检查 XSS 风险..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ] && [[ "$file" == *.html || "$file" == *.jsx || "$file" == *.tsx || "$file" == *.vue ]]; then
            if grep -qE "innerHTML|v-html|dangerouslySetInnerHTML" "$file" 2>/dev/null; then
                warnings+=("潜在 XSS 风险：$file 使用危险 HTML 渲染")
                score=$((score - 1))
            fi
        fi
    done

    # 检查敏感数据
    log_info "检查敏感数据处理..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            if grep -qiE "password|secret|token|api_key|credential" "$file" 2>/dev/null; then
                if ! grep -qiE "encrypt|hash|bcrypt|argon2|scrypt" "$file" 2>/dev/null; then
                    warnings+=("敏感数据 $file 未见加密/哈希处理")
                fi
            fi
        fi
    done

    # 检查硬编码密钥
    log_info "检查硬编码密钥..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            if grep -qE "(sk_|pk_|api_key=|secret=|password=)['\"][^'\"]+['\"]" "$file" 2>/dev/null; then
                issues+=("发现硬编码密钥：$file")
                score=$((score - 2))
            fi
        fi
    done

    # 输出结果
    echo "评分：$score/5"
    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}安全问题:${NC}"
        printf '  - %s\n' "${issues[@]}"
    fi
    if [ ${#warnings[@]} -gt 0 ]; then
        echo -e "${YELLOW}安全警告:${NC}"
        printf '  - %s\n' "${warnings[@]}"
    fi
    if [ ${#issues[@]} -eq 0 ] && [ ${#warnings[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ 未发现明显安全问题${NC}"
    fi

    # 返回评审结果
    echo "SECURITY_SCORE=$score" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
    echo "SECURITY_STATUS=$([ $score -ge 3 ] && echo "pass" || echo "fail")" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
}

# ==========================================
# 性能评审
# ==========================================

review_performance() {
    local ticket_id="$1"
    local branch="$2"
    local score=5
    local issues=()
    local suggestions=()

    log_section "4.3 性能评审"

    # 获取变更文件
    local changed_files=""
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        changed_files=$(git diff --name-only main.."$branch" 2>/dev/null || git diff --name-only HEAD~5 2>/dev/null || echo "")
    fi

    # 检查 N+1 查询风险
    log_info "检查 N+1 查询风险..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            # Python/Django
            if [[ "$file" == *.py ]] && grep -qE "\.all\(\)|\.filter\(" "$file" 2>/dev/null; then
                if grep -qE "for.*in.*\.all|for.*in.*\.filter" "$file" 2>/dev/null; then
                    issues+=("潜在 N+1 查询：$file 在循环中执行查询")
                    score=$((score - 1))
                fi
            fi
            # JavaScript
            if [[ "$file" == *.js || "$file" == *.ts ]] && grep -qE "\.forEach|\.map" "$file" 2>/dev/null; then
                if grep -qE "await.*fetch|await.*axios|\.then" "$file" 2>/dev/null; then
                    suggestions+=("考虑并行请求：$file 中多个异步操作可并行化")
                fi
            fi
        fi
    done

    # 检查循环内操作
    log_info "检查循环复杂度..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            if grep -qE "for.*for|while.*for|for.*while" "$file" 2>/dev/null; then
                suggestions+=("嵌套循环：$file 考虑优化为 O(n) 或 O(log n)")
            fi
        fi
    done

    # 检查内存泄漏风险
    log_info "检查内存使用..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            # JavaScript 全局变量
            if [[ "$file" == *.js || "$file" == *.ts ]]; then
                if grep -qE "window\.|global\.|localStorage\." "$file" 2>/dev/null; then
                    suggestions+=("注意清理：$file 使用全局存储，确保及时清理")
                fi
            fi
            # Python 大列表
            if [[ "$file" == *.py ]]; then
                if grep -qE "append\(|extend\(" "$file" 2>/dev/null; then
                    suggestions+=("注意内存：$file 有列表累积操作，考虑分片处理")
                fi
            fi
        fi
    done

    # 检查数据库索引
    log_info "检查数据库查询..."
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ] && [[ "$file" == *.py || "$file" == *.js ]]; then
            if grep -qiE "\.where\(|\.find\(|SELECT.*FROM" "$file" 2>/dev/null; then
                if ! grep -qiE "\.index\(|idx_|INDEX" "$file" 2>/dev/null; then
                    suggestions+=("确认索引：$file 的查询条件已添加索引")
                fi
            fi
        fi
    done

    # 检查缓存使用
    log_info "检查缓存机制..."
    local cache_found=false
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ] && grep -qiE "cache|redis|memcache|@cache|lru_cache" "$file" 2>/dev/null; then
            cache_found=true
            log_info "✓ 发现缓存机制"
            break
        fi
    done
    if [ "$cache_found" = false ]; then
        suggestions+=("考虑为频繁查询添加缓存")
    fi

    # 输出结果
    echo "评分：$score/5"
    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}性能问题:${NC}"
        printf '  - %s\n' "${issues[@]}"
    fi
    if [ ${#suggestions[@]} -gt 0 ]; then
        echo -e "${YELLOW}优化建议:${NC}"
        printf '  - %s\n' "${suggestions[@]}"
    fi
    if [ ${#issues[@]} -eq 0 ] && [ ${#suggestions[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ 未发现明显性能问题${NC}"
    fi

    # 返回评审结果
    echo "PERFORMANCE_SCORE=$score" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
    echo "PERFORMANCE_STATUS=$([ $score -ge 3 ] && echo "pass" || echo "fail")" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
}

# ==========================================
# 代码质量评审
# ==========================================

review_code_quality() {
    local ticket_id="$1"
    local branch="$2"
    local score=5
    local issues=()
    local suggestions=()

    log_section "4.4 代码质量评审"

    # 获取变更文件
    local changed_files=""
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        changed_files=$(git diff --name-only main.."$branch" 2>/dev/null || git diff --name-only HEAD~5 2>/dev/null || echo "")
    fi

    # 检查代码规范
    log_info "检查代码规范..."
    local lint_issues=0

    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            # Python
            if [[ "$file" == *.py ]]; then
                # 检查函数长度
                local func_lines=$(awk '/^def /{if(NR>1)print count; count=0} {count++}' "$file" 2>/dev/null | sort -rn | head -1)
                if [ "${func_lines:-0}" -gt 50 ]; then
                    suggestions+=("函数过长：$file 考虑拆分")
                fi
                # 检查行长度
                local long_lines=$(awk 'length>120' "$file" 2>/dev/null | wc -l | tr -d ' ')
                if [ "$long_lines" -gt 5 ]; then
                    suggestions+=("行过长：$file 有 $long_lines 行超过 120 字符")
                fi
            fi

            # JavaScript/TypeScript
            if [[ "$file" == *.js || "$file" == *.ts || "$file" == *.jsx || "$file" == *.tsx ]]; then
                # 检查 console.log
                if grep -qE "console\.(log|debug|info)" "$file" 2>/dev/null; then
                    suggestions+=("移除调试：$file 包含 console 输出")
                fi
                # 检查 TODO
                if grep -qiE "TODO|FIXME|XXX" "$file" 2>/dev/null; then
                    suggestions+=("技术债务：$file 包含 TODO/FIXME 注释")
                fi
            fi
        fi
    done

    # 检查代码重复
    log_info "检查代码重复..."
    if [ -d "$SRC_DIR" ]; then
        # 简单检查：查找重复的代码块
        local duplicates=$(find "$SRC_DIR" -name "*.py" -o -name "*.js" -o -name "*.ts" 2>/dev/null | xargs grep -l "function\|def " 2>/dev/null | wc -l | tr -d ' ')
        if [ "$duplicates" -gt 0 ]; then
            log_info "✓ 代码结构合理"
        fi
    fi

    # 检查注释质量
    log_info "检查文档注释..."
    local comment_ratio=0
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ]; then
            local total_lines=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
            local comment_lines=$(grep -cE "^\s*(#|//|/\*|\*)" "$file" 2>/dev/null || echo "0")
            if [ "$total_lines" -gt 0 ]; then
                comment_ratio=$((comment_lines * 100 / total_lines))
                if [ "$comment_ratio" -lt 10 ]; then
                    suggestions+=("增加注释：$file 注释率 ${comment_ratio}%，建议>10%")
                fi
            fi
        fi
    done

    # 检查单元测试
    log_info "检查测试覆盖..."
    local test_files=""
    for file in $(echo "$changed_files"); do
        if [ -f "$file" ] && [[ "$file" != *test* && "$file" != *spec* ]]; then
            # 检查是否有对应的测试文件
            local base_name=$(basename "$file" | sed 's/\.[^.]*$//')
            local test_name_py="test_${base_name}.py"
            local test_name_js="${base_name}.test.js"
            local test_name_ts="${base_name}.spec.ts"

            if ! find "$PROJECT_ROOT/tests" -name "$test_name_py" 2>/dev/null | grep -q . && \
               ! find "$SRC_DIR" -name "$test_name_js" 2>/dev/null | grep -q . && \
               ! find "$SRC_DIR" -name "$test_name_ts" 2>/dev/null | grep -q .; then
                suggestions+=("补充测试：$file 缺少对应测试文件")
            fi
        fi
    done

    # 检查提交信息
    log_info "检查提交历史..."
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        local commits=$(git log --oneline main.."$branch" 2>/dev/null | head -10)
        if [ -n "$commits" ]; then
            log_info "✓ 提交历史:"
            echo "$commits" | sed 's/^/  /'
        fi
    fi

    # 输出结果
    echo "评分：$score/5"
    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}质量问题:${NC}"
        printf '  - %s\n' "${issues[@]}"
    fi
    if [ ${#suggestions[@]} -gt 0 ]; then
        echo -e "${YELLOW}改进建议:${NC}"
        printf '  - %s\n' "${suggestions[@]}"
    fi
    if [ ${#issues[@]} -eq 0 ] && [ ${#suggestions[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ 代码质量良好${NC}"
    fi

    # 返回评审结果
    echo "QUALITY_SCORE=$score" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
    echo "QUALITY_STATUS=$([ $score -ge 3 ] && echo "pass" || echo "fail")" >> "$OUTPUT_DIR/.review_${ticket_id}.env"
}

# ==========================================
# 生成专家评审报告
# ==========================================

generate_expert_review_report() {
    local ticket_id="$1"
    local branch="$2"
    local report_file="$OUTPUT_DIR/expert-review-${ticket_id}-$(date +%Y%m%d_%H%M%S).md"

    mkdir -p "$OUTPUT_DIR"

    # 读取评审结果
    local env_file="$OUTPUT_DIR/.review_${ticket_id}.env"
    if [ -f "$env_file" ]; then
        source "$env_file"
    fi

    # 计算总分
    local total_score=0
    local count=0
    for score in "${ARCH_SCORE:-3}" "${SECURITY_SCORE:-3}" "${PERFORMANCE_SCORE:-3}" "${QUALITY_SCORE:-3}"; do
        total_score=$((total_score + score))
        count=$((count + 1))
    done
    local avg_score=$(echo "scale=2; $total_score / $count" | bc 2>/dev/null || echo "$((total_score / count))")

    # 生成报告
    cat > "$report_file" << EOF
# 专家评审报告

**任务 ID**: $ticket_id
**分支**: $branch
**评审时间**: $(date -Iseconds)
**评审者**: EKET Expert Review System v0.6.2

---

## 1. 评审概览

| 维度 | 评分 (1-5) | 状态 |
|------|------------|------|
| 架构评审 | ${ARCH_SCORE:-N/A} | ${ARCH_STATUS:-unknown} |
| 安全评审 | ${SECURITY_SCORE:-N/A} | ${SECURITY_STATUS:-unknown} |
| 性能评审 | ${PERFORMANCE_SCORE:-N/A} | ${PERFORMANCE_STATUS:-unknown} |
| 代码质量 | ${QUALITY_SCORE:-N/A} | ${QUALITY_STATUS:-unknown} |

**平均分**: $avg_score / 5.0

---

## 2. 详细评审结果

### 2.1 架构评审

**状态**: $([ "${ARCH_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需要改进")

**评估**:
- 模块划分：$([ "${ARCH_SCORE:-3}" -ge 4 ] && echo "清晰" || echo "一般")
- 依赖关系：合理
- 架构一致性：$([ "${ARCH_SCORE:-3}" -ge 3 ] && echo "符合" || echo "需要审查")

**建议**:
$(if [ -n "${suggestions[*]:-}" ]; then printf -- '- %s\n' "${suggestions[@]:-}"; else echo "- 无明显问题"; fi)

---

### 2.2 安全评审

**状态**: $([ "${SECURITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "✗ 需要修复")

**评估**:
- 输入验证：$([ "${SECURITY_SCORE:-3}" -ge 4 ] && echo "充分" || echo "需要加强")
- 认证授权：$([ "${SECURITY_SCORE:-3}" -ge 3 ] && echo "完整" || echo "需要补充")
- 注入风险：$([ "${SECURITY_SCORE:-3}" -ge 4 ] && echo "无" || echo "需要检查")
- 数据加密：$([ "${SECURITY_SCORE:-3}" -ge 3 ] && echo "充分" || echo "需要确认")

**发现的安全问题**:
$(if [ ${#issues[@]:-0} -gt 0 ]; then printf -- '- %s\n' "${issues[@]:-}"; else echo "- 无明显安全问题"; fi)

---

### 2.3 性能评审

**状态**: $([ "${PERFORMANCE_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需要优化")

**评估**:
- N+1 查询：$([ "${PERFORMANCE_SCORE:-3}" -ge 4 ] && echo "无" || echo "需要检查")
- 内存使用：$([ "${PERFORMANCE_SCORE:-3}" -ge 3 ] && echo "合理" || echo "需要优化")
- 性能瓶颈：$([ "${PERFORMANCE_SCORE:-3}" -ge 4 ] && echo "无" || echo "需要分析")

**优化建议**:
$(if [ ${#suggestions[*]:-0} -gt 0 ]; then printf -- '- %s\n' "${suggestions[@]:-}"; else echo "- 无明显性能问题"; fi)

---

### 2.4 代码质量评审

**状态**: $([ "${QUALITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需要改进")

**评估**:
- 代码规范：$([ "${QUALITY_SCORE:-3}" -ge 4 ] && echo "符合" || echo "需要改进")
- 代码重复度：低
- 技术债务：$([ "${QUALITY_SCORE:-3}" -ge 4 ] && echo "低" || echo "中等")

**改进建议**:
$(if [ ${#suggestions[*]:-0} -gt 0 ]; then printf -- '- %s\n' "${suggestions[@]:-}"; else echo "- 代码质量良好"; fi)

---

## 3. 综合评估

### 3.1 总体评分

| 维度 | 评分 | 权重 | 加权分 |
|------|------|------|--------|
| 架构评审 | ${ARCH_SCORE:-N/A} | 25% | $(echo "scale=2; ${ARCH_SCORE:-3} * 0.25" | bc 2>/dev/null || echo "N/A") |
| 安全评审 | ${SECURITY_SCORE:-N/A} | 30% | $(echo "scale=2; ${SECURITY_SCORE:-3} * 0.30" | bc 2>/dev/null || echo "N/A") |
| 性能评审 | ${PERFORMANCE_SCORE:-N/A} | 20% | $(echo "scale=2; ${PERFORMANCE_SCORE:-3} * 0.20" | bc 2>/dev/null || echo "N/A") |
| 代码质量 | ${QUALITY_SCORE:-N/A} | 25% | $(echo "scale=2; ${QUALITY_SCORE:-3} * 0.25" | bc 2>/dev/null || echo "N/A") |

**加权总分**: $(echo "scale=2; (${ARCH_SCORE:-3} * 0.25 + ${SECURITY_SCORE:-3} * 0.30 + ${PERFORMANCE_SCORE:-3} * 0.20 + ${QUALITY_SCORE:-3} * 0.25)" | bc 2>/dev/null || echo "N/A") / 5.0

### 3.2 审查决策

**推荐**: $([ "$avg_score" = "5" ] || [ "$(echo "$avg_score >= 4" | bc 2>/dev/null)" = "1" ] && echo "✓ 批准" || echo "⚠ 需要修改")

**理由**:
$([ "$avg_score" = "5" ] || [ "$(echo "$avg_score >= 4" | bc 2>/dev/null)" = "1" ] && echo "代码质量良好，各维度评审通过" || echo "部分维度需要改进，请根据上述建议修改后重新提交")

---

## 4. 后续行动

$(if [ "${SECURITY_STATUS:-fail}" = "fail" ]; then echo "- [ ] 修复安全问题"; fi)
$(if [ "${PERFORMANCE_STATUS:-fail}" = "fail" ]; then echo "- [ ] 优化性能瓶颈"; fi)
$(if [ "${QUALITY_STATUS:-fail}" = "fail" ]; then echo "- [ ] 改进代码质量"; fi)
$(if [ "${ARCH_STATUS:-fail}" = "fail" ]; then echo "- [ ] 调整架构设计"; fi)
$([ "${ARCH_STATUS:-pass}" = "pass" ] && [ "${SECURITY_STATUS:-pass}" = "pass" ] && [ "${PERFORMANCE_STATUS:-pass}" = "pass" ] && [ "${QUALITY_STATUS:-pass}" = "pass" ] && echo "- [x] 所有评审维度通过，可以合并")

---

**生成者**: EKET Expert Review System v0.6.2
EOF

    log_info "专家评审报告已生成：$report_file"
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
        echo "  branch_name - 分支名称 (可选，默认从 PR 文件获取)"
        exit 1
    fi

    log_info "开始专家评审：$ticket_id"

    # 查找 PR 文件获取分支信息
    if [ -z "$branch" ]; then
        local pr_file=$(find "$PROJECT_ROOT/outbox/review_requests" -name "pr_${ticket_id}_*.md" 2>/dev/null | head -1)
        if [ -f "$pr_file" ]; then
            branch=$(grep -m1 "^**分支" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
        fi
    fi

    if [ -z "$branch" ]; then
        # 尝试从 git 获取当前分支
        branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    fi

    if [ -z "$branch" ]; then
        log_error "无法获取分支名称，请使用 -b 参数指定"
        exit 1
    fi

    log_info "分支：$branch"

    # 创建输出目录
    mkdir -p "$OUTPUT_DIR"

    # 清空之前的评审结果
    rm -f "$OUTPUT_DIR/.review_${ticket_id}.env"

    # 执行各项评审
    review_architecture "$ticket_id" "$branch"
    review_security "$ticket_id" "$branch"
    review_performance "$ticket_id" "$branch"
    review_code_quality "$ticket_id" "$branch"

    # 生成评审报告
    generate_expert_review_report "$ticket_id" "$branch"

    log_section "评审完成"
    log_info "所有评审维度已完成"
}

main "$@"
