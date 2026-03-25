#!/bin/bash
# scripts/init-review-subagents.sh - Master 节点 Review 时初始化多个共享记忆的 Subagents

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "Master Review - 初始化 Subagents"
echo "========================================"
echo ""

# 检查参数
TICKET_ID="${1:-}"
MASTER_ID="${2:-master-001}"

if [ -z "$TICKET_ID" ]; then
    echo -e "${RED}用法：$0 <ticket-id> [master-id]${NC}"
    echo ""
    echo "参数:"
    echo "  ticket-id   待 Review 的任务 ID"
    echo "  master-id   Master 节点 ID (可选，默认：master-001)"
    exit 1
fi

# 检查 ticket 是否存在
TICKET_FILE="jira/tickets/*/${TICKET_ID}.md"
if ! ls $TICKET_FILE 1>/dev/null 2>&1; then
    echo -e "${RED}错误：任务不存在：$TICKET_ID${NC}"
    exit 1
fi

echo -e "${BLUE}## 任务信息${NC}"
echo "Ticket ID: $TICKET_ID"
echo "Master: $MASTER_ID"
echo "时间：$(date -Iseconds)"
echo ""

# 创建共享记忆目录
SHARED_MEMORY_DIR=".eket/state/shared-memory/reviews/${TICKET_ID}"
mkdir -p "$SHARED_MEMORY_DIR"

echo -e "${BLUE}## 创建共享记忆目录${NC}"
echo "路径：$SHARED_MEMORY_DIR"
echo ""

# 定义 Subagent 角色和职责
declare -a SUBAGENT_ROLES=(
    "code_reviewer:代码审查员:代码质量、编码规范、结构合理性"
    "test_reviewer:测试审查员:测试覆盖、边界情况、测试质量"
    "security_reviewer:安全审查员:安全漏洞、权限控制、输入验证"
    "doc_reviewer:文档审查员:文档完整性、注释、API 文档"
)

# 初始化 Subagents
echo -e "${BLUE}## 初始化 Subagents${NC}"
echo ""

for role_info in "${SUBAGENT_ROLES[@]}"; do
    IFS=':' read -r role_id role_name responsibilities <<< "$role_info"

    SUBAGENT_ID="${role_id}-${TICKET_ID}"
    SUBAGENT_DIR="$SHARED_MEMORY_DIR/$role_id"

    mkdir -p "$SUBAGENT_DIR"

    # 创建 Subagent 状态文件
    cat > "$SUBAGENT_DIR/status.yml" << EOF
# Subagent 状态文件
subagent_id: $SUBAGENT_ID
role: $role_id
role_name: $role_name
responsibilities: $responsibilities
master_id: $MASTER_ID
ticket_id: $TICKET_ID

# 生命周期状态
lifecycle:
  status: initialized  # initialized / analyzing / complete
  created_at: $(date -Iseconds)
  started_at: null
  completed_at: null

# 审查结果
review:
  status: pending
  score: null
  comments: []
  issues: []
  recommendations: []

# 共享记忆
shared_memory:
  version: 1
  last_sync: $(date -Iseconds)
EOF

    # 创建审查清单
    cat > "$SUBAGENT_DIR/checklist.md" << EOF
# $role_name - 审查清单

**Subagent ID**: $SUBAGENT_ID
**任务**: $TICKET_ID

---

## 审查项目

### 基础检查
- [ ] 代码/文档可访问
- [ ] 与任务分析文档一致
- [ ] 无明显错误

### 专项审查
EOF

    # 根据不同角色添加专项检查
    case $role_id in
        code_reviewer)
            cat >> "$SUBAGENT_DIR/checklist.md" << 'EOF'
- [ ] 代码符合编码规范
- [ ] 无重复代码 (DRY)
- [ ] 函数/方法命名清晰
- [ ] 代码结构合理
- [ ] 错误处理完善
- [ ] 日志记录适当
EOF
            ;;
        test_reviewer)
            cat >> "$SUBAGENT_DIR/checklist.md" << 'EOF'
- [ ] 单元测试覆盖核心逻辑
- [ ] 边界情况有测试
- [ ] 错误路径有测试
- [ ] 测试独立可重复
- [ ] 测试断言明确
- [ ] 测试数据合理
EOF
            ;;
        security_reviewer)
            cat >> "$SUBAGENT_DIR/checklist.md" << 'EOF'
- [ ] 输入验证完善
- [ ] 无 SQL 注入风险
- [ ] 无 XSS 风险
- [ ] 权限检查正确
- [ ] 敏感信息加密
- [ ] 无硬编码密钥
EOF
            ;;
        doc_reviewer)
            cat >> "$SUBAGENT_DIR/checklist.md" << 'EOF'
- [ ] 代码注释充分
- [ ] API 文档完整
- [ ] 更新日志已记录
- [ ] 文档与代码一致
- [ ] 示例代码正确
EOF
            ;;
    esac

    cat >> "$SUBAGENT_DIR/checklist.md" << EOF

---

## 审查意见

### 发现的问题

### 改进建议

### 评分 (1-10)

---

**状态**: initialized
**创建时间**: $(date -Iseconds)
EOF

    echo -e "  ${GREEN}✓${NC} $role_name ($SUBAGENT_ID)"
    echo "    职责：$responsibilities"
    echo "    目录：$SUBAGENT_DIR"
    echo ""
done

# 创建 Review 协调器状态文件
cat > "$SHARED_MEMORY_DIR/coordinator.yml" << EOF
# Review 协调器状态
review_id: "review-${TICKET_ID}-$(date +%Y%m%d-%H%M%S)"
ticket_id: $TICKET_ID
master_id: $MASTER_ID

# Review 状态
status:
  overall: in_progress  # pending / in_progress / completed
  started_at: $(date -Iseconds)
  expected_complete: null
  completed_at: null

# Subagents 注册表
subagents:
  - id: code_reviewer-${TICKET_ID}
    role: code_reviewer
    status: initialized
  - id: test_reviewer-${TICKET_ID}
    role: test_reviewer
    status: initialized
  - id: security_reviewer-${TICKET_ID}
    role: security_reviewer
    status: initialized
  - id: doc_reviewer-${TICKET_ID}
    role: doc_reviewer
    status: initialized

# 审查结果汇总
summary:
  all_passed: false
  total_score: null
  major_issues: 0
  minor_issues: 0
  recommendations: []

# 共享记忆同步
shared_memory:
  sync_count: 0
  last_sync: $(date -Iseconds)
  sync_interval_seconds: 30
EOF

# 创建 Review 主文档
REVIEW_DOC="$SHARED_MEMORY_DIR/review-report.md"
cat > "$REVIEW_DOC" << EOF
# Review 报告 - $TICKET_ID

**Review ID**: review-${TICKET_ID}-$(date +%Y%m%d-%H%M%S)
**Master**: $MASTER_ID
**开始时间**: $(date -Iseconds)

---

## Subagents 审查状态

| Subagent | 角色 | 状态 | 评分 | 完成时间 |
|----------|------|------|------|----------|
| code_reviewer-${TICKET_ID} | 代码审查员 | initialized | - | - |
| test_reviewer-${TICKET_ID} | 测试审查员 | initialized | - | - |
| security_reviewer-${TICKET_ID} | 安全审查员 | initialized | - | - |
| doc_reviewer-${TICKET_ID} | 文档审查员 | initialized | - | - |

---

## 审查进度

- [ ] 代码审查完成
- [ ] 测试审查完成
- [ ] 安全审查完成
- [ ] 文档审查完成
- [ ] 综合评估完成

---

## 问题汇总

### 严重问题 (P0)

### 主要问题 (P1)

### 次要问题 (P2)

---

## 综合评分

| 维度 | 评分 | 权重 | 加权分 |
|------|------|------|--------|
| 代码质量 | - | 40% | - |
| 测试质量 | - | 25% | - |
| 安全性 | - | 25% | - |
| 文档质量 | - | 10% | - |
| **总计** | - | 100% | - |

---

## Master 决策

- [ ] **批准** - 代码质量优秀，可以合并
- [ ] **有条件批准** - 有 Minor 问题，修复后可直接合并
- [ ] **需要修改** - 有 Major 问题，修复后需重新审查
- [ ] **拒绝** - 存在严重问题，需重新设计

---

**审查完成时间**: [待填写]
**Master 签名**: _______________
EOF

echo -e "${BLUE}## Review 协调器${NC}"
echo "状态文件：$SHARED_MEMORY_DIR/coordinator.yml"
echo "审查报告：$REVIEW_DOC"
echo ""

# 更新 Ticket 状态
echo -e "${BLUE}## 更新 Ticket 状态${NC}"

# 获取 ticket 文件路径
TICKET_PATH=$(ls $TICKET_FILE | head -1)

# 更新状态为 review
if grep -q "^status:" "$TICKET_PATH"; then
    sed -i.bak "s/^status:.*/status: review/" "$TICKET_PATH"
    rm -f "$TICKET_PATH.bak"
    echo -e "  ${GREEN}✓${NC} 状态已更新为：review"
else
    echo -e "  ${YELLOW}!${NC} 未找到 status 字段，跳过更新"
fi

# 添加 Review 开始时间
if ! grep -q "REVIEW_STARTED_AT:" "$TICKET_PATH"; then
    echo "REVIEW_STARTED_AT: $(date -Iseconds)" >> "$TICKET_PATH"
    echo -e "  ${GREEN}✓${NC} 已添加 Review 开始时间"
fi

echo ""

# 完成提示
echo -e "${GREEN}========================================"
echo "Subagents 初始化完成"
echo "========================================${NC}"
echo ""
echo "下一步:"
echo "1. 各 Subagent 开始独立审查"
echo "2. 审查结果写入各自的状态文件"
echo "3. Master 汇总结果并做出决策"
echo ""
echo "共享记忆目录：$SHARED_MEMORY_DIR"
echo ""

# 输出 Subagent 审查启动命令
echo -e "${YELLOW}## 启动 Subagent 审查 (示例)${NC}"
echo ""
echo "# 代码审查"
echo "./scripts/run-subagent-review.sh $TICKET_ID code_reviewer"
echo ""
echo "# 测试审查"
echo "./scripts/run-subagent-review.sh $TICKET_ID test_reviewer"
echo ""
echo "# 安全审查"
echo "./scripts/run-subagent-review.sh $TICKET_ID security_reviewer"
echo ""
echo "# 文档审查"
echo "./scripts/run-subagent-review.sh $TICKET_ID doc_reviewer"
echo ""
