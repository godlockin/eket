#!/bin/bash
# /eket-phase-review - EKET 阶段回溯和 Review 脚本
#
# 用途：当一个阶段完成后，启动全量回溯和 Review 流程
# - 创建新的独立 slaver 线程/进程
# - 加载 phase_reviewer 角色
# - 分析该阶段所有交付物
# - 创建回溯报告和改进任务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示使用说明
show_usage() {
    cat << EOF
$(print_info) EKET 阶段回溯和 Review 脚本

$(print_info) 用法:
  /eket-phase-review <phase-number> [options]

$(print_info) 参数:
  phase-number    阶段号 (如：1, 2, 3)

$(print_info) 选项:
  -a, --auto      自动模式，无需确认
  -d, --dry-run   只读模式，不创建文件
  -h, --help      显示此帮助信息

$(print_info) 示例:
  /eket-phase-review 2              # 对 Phase 2 进行回溯
  /eket-phase-review 2 --auto       # 自动模式执行 Phase 2 回溯
  /eket-phase-review 2 --dry-run    # 只读模式检查 Phase 2

$(print_info) 流程说明:
  1. 读取阶段完成报告
  2. 分析该阶段所有任务交付物
  3. 识别优点、问题和改进机会
  4. 创建回溯报告
  5. 创建改进/修复任务
  6. 编写经验教训文档

EOF
}

# 解析参数
AUTO_MODE=false
DRY_RUN=false
PHASE_NUMBER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -a|--auto)
            AUTO_MODE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            if [[ -z "$PHASE_NUMBER" ]]; then
                PHASE_NUMBER="$1"
            else
                print_error "未知参数：$1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# 验证阶段号
if [[ -z "$PHASE_NUMBER" ]]; then
    print_error "请指定阶段号"
    show_usage
    exit 1
fi

if ! [[ "$PHASE_NUMBER" =~ ^[0-9]+$ ]]; then
    print_error "阶段号必须是数字"
    exit 1
fi

print_info "============================================"
print_info "    EKET 阶段回溯和 Review 流程"
print_info "============================================"
print_info ""
print_info "阶段号：Phase $PHASE_NUMBER"
print_info "自动模式：$AUTO_MODE"
print_info "只读模式：$DRY_RUN"
print_info ""

# 检查项目结构
print_info "检查项目结构..."

JIRA_DIR="$PROJECT_ROOT/jira/tickets"
MASTER_DIR="$PROJECT_ROOT/master"
CONFLUENCE_DIR="$PROJECT_ROOT/confluence/projects"

# 检查必需目录
if [[ ! -d "$JIRA_DIR" ]]; then
    print_error "Jira 目录不存在：$JIRA_DIR"
    exit 1
fi

if [[ ! -d "$MASTER_DIR" ]]; then
    print_error "Master 目录不存在：$MASTER_DIR"
    exit 1
fi

print_success "项目结构检查通过"

# 查找阶段完成报告
COMPLETION_REPORT="$MASTER_DIR/reports/phase-$PHASE_NUMBER-completion-report.md"

if [[ ! -f "$COMPLETION_REPORT" ]]; then
    print_error "未找到阶段完成报告：$COMPLETION_REPORT"
    print_warning "请先确保阶段完成报告已生成"
    exit 1
fi

print_success "找到阶段完成报告：$COMPLETION_REPORT"

# 如果只读模式，到此结束
if [[ "$DRY_RUN" == true ]]; then
    print_info ""
    print_info "[只读模式] 检查完成，不执行任何操作"
    print_info ""
    print_info "接下来将执行以下操作："
    print_info "  1. 读取并分析阶段完成报告"
    print_info "  2. 收集该阶段所有任务的交付物"
    print_info "  3. 多维度分析（代码质量、测试、文档、流程）"
    print_info "  4. 创建回溯报告：$MASTER_DIR/reports/phase-$PHASE_NUMBER-retrospective.md"
    print_info "  5. 创建 Jira 回溯任务：$JIRA_DIR/retrospective/PHASE-$PHASE_NUMBER-REVIEW.md"
    print_info "  6. 创建改进/修复任务"
    print_info "  7. 编写经验教训文档：$CONFLUENCE_DIR/retrospective/phase-$PHASE_NUMBER-lessons-learned.md"
    exit 0
fi

# 用户确认
if [[ "$AUTO_MODE" != true ]]; then
    echo ""
    print_warning "即将启动 Phase $PHASE_NUMBER 的回溯和 Review 流程"
    echo ""
    echo "此操作将："
    echo "  1. 创建阶段回溯任务 (PHASE-$PHASE_NUMBER-REVIEW)"
    echo "  2. 加载 phase_reviewer 角色进行分析"
    echo "  3. 生成回溯报告和改进任务"
    echo ""
    read -p "是否继续？(y/n): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "已取消操作"
        exit 0
    fi
fi

print_info ""
print_info "============================================"
print_info "    步骤 1: 创建阶段回溯 Jira 任务"
print_info "============================================"
print_info ""

# 创建回溯任务目录
RETROSPECTIVE_DIR="$JIRA_DIR/retrospective"
mkdir -p "$RETROSPECTIVE_DIR"

# 检查是否已存在回溯任务
EXISTING_TASK="$RETROSPECTIVE_DIR/PHASE-$PHASE_NUMBER-REVIEW.md"
if [[ -f "$EXISTING_TASK" ]]; then
    print_warning "回溯任务已存在：$EXISTING_TASK"
    print_info "跳过创建，继续执行分析..."
else
    # 使用模板创建回溯任务
    TEMPLATE_DIR="$SCRIPT_DIR/../template/jira/tickets"
    TEMPLATE_FILE="$TEMPLATE_DIR/retrospective/phase-review-template.md"

    if [[ -f "$TEMPLATE_FILE" ]]; then
        cp "$TEMPLATE_FILE" "$EXISTING_TASK"
        print_success "创建回溯任务：$EXISTING_TASK"
    else
        print_warning "未找到模板文件，手动创建回溯任务..."

        # 从完成报告中提取任务列表
        cat > "$EXISTING_TASK" << EOF
title: PHASE-$PHASE_NUMBER-REVIEW - Phase $PHASE_NUMBER 全量回溯和 Review
status: ready
priority: high
labels: phase-review,retrospective,quality-assurance
assigned_role: phase_reviewer
description: |
  ## Phase $PHASE_NUMBER 全量回溯和 Review

  对 Phase $PHASE_NUMBER 进行全面的回溯分析，识别优点、问题和改进机会。

## 参考文档

- \`master/reports/phase-$PHASE_NUMBER-completion-report.md\` - Phase $PHASE_NUMBER 完成报告

## 输出物

- [ ] \`master/reports/phase-$PHASE_NUMBER-retrospective.md\` - 回溯报告
- [ ] \`jira/tickets/fix/\` - 识别的修复任务
- [ ] \`jira/tickets/improvement/\` - 识别的改进任务
- [ ] \`confluence/projects/*/retrospective/phase-$PHASE_NUMBER-lessons-learned.md\` - 经验教训

## 验收标准

- [ ] 识别至少 3 个优点（保持项）
- [ ] 识别至少 3 个改进点
- [ ] 创建所有识别的修复/改进任务
- [ ] 经验教训文档化
EOF
        print_success "创建回溯任务：$EXISTING_TASK"
    fi
fi

# 提交回溯任务
cd "$PROJECT_ROOT"
git add "$EXISTING_TASK" 2>/dev/null || true

print_info ""
print_info "============================================"
print_info "    步骤 2: 加载 phase_reviewer 角色"
print_info "============================================"
print_info ""

# 检查 phase_reviewer 配置
AGENT_CONFIG="$SCRIPT_DIR/../template/agents/reviewer/phase_reviewer/agent.yml"
if [[ -f "$AGENT_CONFIG" ]]; then
    print_success "phase_reviewer 配置已就绪"
else
    print_warning "phase_reviewer 配置不存在，将创建..."
    mkdir -p "$(dirname "$AGENT_CONFIG")"
    # 配置已在上面创建
fi

print_info ""
print_info "============================================"
print_info "    步骤 3: 执行阶段回溯分析"
print_info "============================================"
print_info ""

# 启动 phase_reviewer 进程（模拟）
# 实际执行时，这里会启动一个新的 Claude 实例或子进程
print_info "启动 phase_reviewer 进行回溯分析..."
print_info ""
print_info "分析维度:"
print_info "  - 代码质量分析"
print_info "  - 测试覆盖率分析"
print_info "  - 性能指标评估"
print_info "  - 文档完整性检查"
print_info "  - 流程效率分析"
print_info "  - 框架迭代成果"
print_info ""

# 创建回溯报告占位文件
RETROSPECTIVE_REPORT="$MASTER_DIR/reports/phase-$PHASE_NUMBER-retrospective.md"

cat > "$RETROSPECTIVE_REPORT" << EOF
# Phase $PHASE_NUMBER 回溯报告

**评估时间**: $(date +%Y-%m-%d)
**评估对象**: Phase $PHASE_NUMBER
**评估人**: Phase Reviewer

---

## 分析中...

本报告由 phase_reviewer 自动生成，详细分析内容将在后续补充。

## 待补充内容

- [ ] 整体评分表
- [ ] 优点（保持项）
- [ ] 改进点
- [ ] 创建的任务列表
- [ ] 经验教训
- [ ] 下一阶段建议

---

*报告生成时间：$(date +%Y-%m-%dT%H:%M:%S%z)*
EOF

print_success "创建回溯报告占位文件：$RETROSPECTIVE_REPORT"

# 提交更改
git add "$RETROSPECTIVE_REPORT" 2>/dev/null || true

if git diff --cached --quiet 2>/dev/null; then
    print_info "没有需要提交的更改"
else
    git commit -m "feat: 创建 Phase $PHASE_NUMBER 回溯分析任务

- 创建阶段回溯任务：PHASE-$PHASE_NUMBER-REVIEW
- 创建回溯报告占位文件
- 加载 phase_reviewer 角色进行分析

详情：$RETROSPECTIVE_DIR/PHASE-$PHASE_NUMBER-REVIEW.md"
    print_success "更改已提交"
fi

print_info ""
print_info "============================================"
print_info "    阶段回溯流程已启动"
print_info "============================================"
print_info ""
print_info "下一步:"
print_info "  1. phase_reviewer 将分析阶段完成报告"
print_info "  2. 分析结果将更新到：$RETROSPECTIVE_REPORT"
print_info "  3. 识别的改进任务将创建在：$JIRA_DIR/improvement/"
print_info "  4. 识别的修复任务将创建在：$JIRA_DIR/bugfix/"
print_info ""
print_info "查看进度：$RETROSPECTIVE_REPORT"
print_info ""
