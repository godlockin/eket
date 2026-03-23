#!/bin/bash
# EKET Mock 实现检测 v0.5
# 检测代码中的 Mock/Empty 实现并主动创建依赖补全任务

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置文件
CONFIG_FILE=".eket/config.yml"
STATE_DIR=".eket/state"

# ==========================================
# Mock 模式定义
# ==========================================

MOCK_PATTERNS=(
    # TypeScript/JavaScript 空返回
    'return \[\]'
    'return \{\}'
    'return undefined'
    'return null'

    # Python 空返回
    'return pass'
    'raise NotImplementedError'
    'pass  # TODO'

    # 通用 TODO
    '// TODO'
    '# TODO'
    '/* TODO'
    'TODO:'

    # 空实现标记
    'MockLegacySearchAdapter'
    'Mock.*Adapter'
    'Fake.*Impl'
)

# ==========================================
# 检测 Mock 实现
# ==========================================

detect_mock_implementations() {
    local src_dir="${1:-code_repo/src}"
    local results=()

    echo -e "${BLUE}## 开始检测 Mock 实现${NC}"
    echo ""

    if [ ! -d "$src_dir" ]; then
        echo -e "${YELLOW}⚠${NC} 源代码目录不存在：$src_dir"
        return 0
    fi

    # 遍历所有源代码文件
    for pattern in "${MOCK_PATTERNS[@]}"; do
        echo -e "${BLUE}搜索模式：$pattern${NC}"

        while IFS= read -r line; do
            if [ -n "$line" ]; then
                results+=("$line")
            fi
        done < <(grep -rn "$pattern" "$src_dir" --include="*.ts" --include="*.js" --include="*.py" --exclude="*.test.*" --exclude="*.spec.*" 2>/dev/null || true)
    done

    if [ ${#results[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}⚠ 发现 ${#results[@]} 处 Mock/Empty 实现：${NC}"

        for result in "${results[@]}"; do
            echo "  $result"
        done

        # 创建报告文件
        create_mock_report "${results[@]}"

        return 1
    else
        echo -e "${GREEN}✓${NC} 未发现 Mock 实现"
        return 0
    fi
}

# ==========================================
# 创建 Mock 报告
# ==========================================

create_mock_report() {
    local report_file="inbox/mock-implementation-report-$(date +%Y%m%d-%H%M%S).md"

    cat > "$report_file" << EOF
# Mock 实现检测报告

**检测时间**: $(date -Iseconds)
**检测范围**: code_repo/src

---

## 发现的 Mock 实现

EOF

    for result in "$@"; do
        echo "- $result" >> "$report_file"
    done

    cat >> "$report_file" << EOF

---

## 建议行动

1. **立即处理**: 这些 Mock 实现可能导致功能不完整
2. **创建依赖补全任务**: 要求用户或开发者提供真实实现
3. **添加到检查清单**: 在任务验收时必须检查

---

**状态**: pending_action
**生成者**: EKET Mock Detector v0.5
EOF

    echo -e "${GREEN}✓${NC} 报告已创建：$report_file"

    # 创建依赖补全任务
    create_dependency_task "$report_file" "$@"
}

# ==========================================
# 创建依赖补全任务
# ==========================================

create_dependency_task() {
    local report_file="$1"
    shift
    local mock_items=("$@")

    # 生成任务 ID
    local task_id="DEP-$(date +%Y%m%d-%H%M%S)"
    local task_file="jira/tickets/task/${task_id}.md"

    # 分析 Mock 实现涉及的模块
    local modules=""
    local description=""

    for item in "${mock_items[@]}"; do
        local file=$(echo "$item" | cut -d':' -f1)
        local line=$(echo "$item" | cut -d':' -f2)
        modules="$modules- $file:$line\n"
    done

    mkdir -p "jira/tickets/task"

    cat > "$task_file" << EOF
# ${task_id}: 补全 Mock 实现的数据接入

**阶段**: Phase 3 改进
**优先级**: P0 - 高
**估计工时**: 120 分钟
**状态**: ready
**标签**: \`mock-detection\` \`dependency-clarification\` \`data-integration\`

---

## 任务描述

检测到代码中存在 Mock/Empty 实现，需要补全真实的数据接入逻辑。

**检测报告**: $report_file

**涉及的 Mock 实现**:
$(echo -e "$modules")

---

## 验收标准

- [ ] 所有 Mock 实现已替换为真实实现
- [ ] 数据接入已验证可用
- [ ] 集成测试通过
- [ ] 无硬编码 TODO 注释

---

## 时间追踪

- **预估时间**: 120 分钟
- **开始时间**: (待领取后填写)
- **截止时间**: (待领取后填写)
- **最后更新**: (待领取后填写)
- **最后心跳**: (待领取后填写)

---

## 依赖

- [ ] 用户提供数据源配置信息
- [ ] 用户提供 API 端点或数据库连接

---

## 人类参与

- [x] 依赖确认 - 需要用户填写数据接入信息
- [ ] 仲裁决策 - (如需要)
- [ ] 任务完成确认

---

**创建时间**: $(date -Iseconds)
**创建者**: EKET Mock Detector v0.5
**关联报告**: $report_file
EOF

    echo -e "${GREEN}✓${NC} 依赖补全任务已创建：$task_file"
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  需要用户参与 - 依赖确认                                      │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  检测到 Mock 实现，已创建任务 $task_id                        │"
    echo "│                                                              │"
    echo "│  请用户填写以下信息：                                        │"
    echo "│  1. 数据源配置 (REST API / GraphQL / 数据库直连)             │"
    echo "│  2. 认证方式 (API Key / OAuth / JWT)                         │"
    echo "│  3. 数据 Schema 信息                                          │"
    echo "│                                                              │"
    echo "│  填写位置：$task_file                                        │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
}

# ==========================================
# 深度代码分析
# ==========================================

deep_code_analysis() {
    local src_dir="${1:-code_repo/src}"

    echo -e "${BLUE}## 深度代码分析${NC}"

    # 检测空函数体
    echo "检测空函数体..."
    local empty_funcs=$(grep -A 3 "^async.*Promise.*{" "$src_dir" -r --include="*.ts" 2>/dev/null | grep -B 1 "return \[\]" || true)

    if [ -n "$empty_funcs" ]; then
        echo -e "${RED}⚠ 发现空函数体：${NC}"
        echo "$empty_funcs"
    fi

    # 检测未实现的接口
    echo "检测未实现的接口..."
    local unimplemented=$(grep -rn "throw new.*NotImplemented" "$src_dir" --include="*.ts" --include="*.js" 2>/dev/null || true)

    if [ -n "$unimplemented" ]; then
        echo -e "${RED}⚠ 发现未实现接口：${NC}"
        echo "$unimplemented"
    fi

    # 检测硬编码的空值
    echo "检测硬编码空值..."
    local hardcoded_empty=$(grep -rn "data: \[\]" "$src_dir" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "test\|spec" || true)

    if [ -n "$hardcoded_empty" ]; then
        echo -e "${YELLOW}⚠ 发现硬编码空值：${NC}"
        echo "$hardcoded_empty"
    fi
}

# ==========================================
# 依赖追问触发
# ==========================================

trigger_dependency_clarification() {
    local task_file="$1"

    if [ ! -f "$task_file" ]; then
        echo -e "${RED}✗${NC} 任务文件不存在：$task_file"
        return 1
    fi

    # 检查是否需要人类参与
    local needs_human=$(grep -c "\- \[x\] 依赖确认" "$task_file" 2>/dev/null || echo "0")

    if [ "$needs_human" -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC} 任务需要人类参与"

        # 创建人类参与请求
        local request_file="inbox/human_feedback/dependency-clarification-$(date +%Y%m%d-%H%M%S).md"

        cat > "$request_file" << EOF
# 依赖澄清请求

**任务**: $(basename "$task_file")
**时间**: $(date -Iseconds)

---

## 需要确认的信息

EOF

        # 提取任务中的依赖部分
        sed -n '/## 依赖/,/##/p' "$task_file" >> "$request_file"

        cat >> "$request_file" << EOF

---

## 请人类填写以下信息

1. 数据源类型和连接方式
2. API 端点或数据库 Schema
3. 认证和授权方式

---

**状态**: awaiting_human_input
EOF

        echo -e "${GREEN}✓${NC} 依赖澄清请求已创建：$request_file"
    fi
}

# ==========================================
# 入口
# ==========================================

case "${1:-detect}" in
    detect)
        detect_mock_implementations "${2:-}"
        ;;
    deep)
        deep_code_analysis "${2:-}"
        ;;
    clarify)
        trigger_dependency_clarification "${2:-}"
        ;;
    full)
        detect_mock_implementations "${2:-}"
        deep_code_analysis "${2:-}"
        ;;
    *)
        echo "用法：$0 <command> [args]"
        echo ""
        echo "命令:"
        echo "  detect [src_dir]        - 检测 Mock 实现"
        echo "  deep [src_dir]          - 深度代码分析"
        echo "  clarify <task_file>     - 触发依赖追问"
        echo "  full [src_dir]          - 完整检测流程"
        ;;
esac
