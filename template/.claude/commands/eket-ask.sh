#!/bin/bash
# /eket-ask - EKET 依赖追问脚本
# 用途：当检测到缺失依赖配置时，主动追问用户

# 不使用 set -e，避免在可恢复错误处退出

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DEPENDENCY_STATUS=".eket/state/dependency-status.yml"
CLARIFICATION_FILE="inbox/dependency-clarification.md"

echo "========================================"
echo "EKET 依赖追问"
echo "========================================"
echo ""

# 检查项目根目录
if [ ! -f "inbox/human_input.md" ]; then
    echo -e "${RED}✗${NC} 未找到 inbox/human_input.md"
    echo "请先运行项目初始化：/eket-init"
    exit 1
fi

# 检查依赖状态
if [ -f "$DEPENDENCY_STATUS" ]; then
    STATUS=$(grep "^status:" "$DEPENDENCY_STATUS" | cut -d: -f2 | tr -d ' ')
    if [ "$STATUS" = "completed" ]; then
        echo -e "${GREEN}✓${NC} 依赖配置已完成"
        exit 0
    fi
fi

# 检查 human_input.md 中是否包含数据依赖信息
HAS_DEPENDENCY_INFO=false

# 检查是否包含数据库、API 等关键词
if grep -qiE "(database|mongodb|mysql|postgresql|sqlite|api.*key|api.*endpoint|存储 | 数据源 | 认证|认证方式|密钥)" "inbox/human_input.md" 2>/dev/null; then
    HAS_DEPENDENCY_INFO=true
fi

# 检查是否已有依赖检查清单
if [ -f "inbox/dependency-checklist.md" ]; then
    # 检查是否已填写
    if grep -q "^\*\*填写人\*\*" "inbox/dependency-checklist.md" 2>/dev/null; then
        HAS_DEPENDENCY_INFO=true
    fi
fi

if [ "$HAS_DEPENDENCY_INFO" = true ]; then
    echo -e "${GREEN}✓${NC} 数据依赖信息完整"
    echo ""
    echo "已检测到的配置："
    grep -iE "(database|mongodb|mysql|postgresql|sqlite|api|存储 | 数据源 | 认证 | 密钥)" "inbox/human_input.md" | head -10
    echo ""

    # 更新状态为完成
    mkdir -p ".eket/state"
    cat > "$DEPENDENCY_STATUS" << EOF
status: completed
all_dependencies_verified: true
completed_at: $(date -Iseconds)
EOF

    echo -e "${GREEN}✓${NC} 依赖状态已更新为 completed"
    exit 0
fi

# 需要追问
echo -e "${YELLOW}⚠${NC} 检测到缺失的依赖配置信息"
echo ""

# 检查是否已有追问文件
if [ -f "$CLARIFICATION_FILE" ]; then
    echo -e "${YELLOW}⚠${NC} 追问文件已存在：$CLARIFICATION_FILE"
    echo ""
    echo "内容摘要："
    head -30 "$CLARIFICATION_FILE"
    echo ""
    echo "---"
    echo ""
    echo "请填写此文件后重新运行 /eket-ask"
    exit 1
fi

# 创建追问文件
echo "创建追问文件..."

# 从模板复制或使用内置模板
if [ -f "$(dirname "$0")/../../template/inbox/dependency-clarification.md" ]; then
    cp "$(dirname "$0")/../../template/inbox/dependency-clarification.md" "$CLARIFICATION_FILE"
else
    # 内置模板
    cat > "$CLARIFICATION_FILE" << 'EOF'
# 数据依赖追问

**生成时间**: $(date -Iseconds)
**状态**: awaiting_human_response

---

## 🚨 检测到缺失的依赖配置

智能体在分析项目需求时，发现以下必要信息尚未提供。

---

## 1. 数据源配置 ⚠️ 必选

### 1.1 数据库

- [ ] **不需要数据库**
- [ ] **需要数据库**:
  - 类型：`MySQL` / `PostgreSQL` / `MongoDB` / `SQLite` / 其他：____
  - 部署方式：`本地` / `Docker` / `云服务` / 已有实例

### 1.2 外部 API

- [ ] **不需要外部 API**
- [ ] **需要外部 API**:
  - API 名称：____
  - 用途：____
  - 认证方式：`API Key` / `OAuth` / `JWT` / 无

### 1.3 文件存储

- [ ] **不需要文件存储**
- [ ] **需要文件存储**:
  - 类型：`本地文件系统` / `AWS S3` / `阿里云 OSS` / 其他

---

## 2. 认证和密钥管理 ⚠️ 必选

### 2.1 需要的 API 密钥

请列出需要的环境变量名（不要填写真实值）：

```bash
# 示例
GEMINI_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here
```

### 2.2 用户认证

- [ ] **不需要用户认证**
- [ ] **需要用户认证**:
  - 方式：`用户名/密码` / `OAuth` / `JWT` / `手机验证码` / 其他

---

## 3. 基础设施

### 3.1 部署目标

- [ ] **本地开发**
- [ ] **Docker 容器**
- [ ] **云服务**: ____
- [ ] **其他**: ____

---

## 人类回复

**填写日期**: ____

### 数据源配置

```
数据库：[填写类型]
连接方式：[填写部署方式]
外部 API: [列出 API 名称]
```

### 认证配置

```
API 密钥：[列出环境变量名]
用户认证：[填写认证方式]
```

### 其他说明

```
[其他需要说明的内容]
```

---

**状态**: `awaiting_human_response`
EOF

    # 替换时间占位符
    sed -i '' "s/\$(date -Iseconds)/$(date -Iseconds)/g" "$CLARIFICATION_FILE" 2>/dev/null || \
    sed -i "s/\$(date -Iseconds)/$(date -Iseconds)/g" "$CLARIFICATION_FILE"
fi

echo -e "${GREEN}✓${NC} 已创建追问文件：$CLARIFICATION_FILE"
echo ""

# 保存追问状态
mkdir -p ".eket/state"
cat > "$DEPENDENCY_STATUS" << EOF
status: pending_clarification
missing_categories:
  - data_sources
  - api_configuration
  - credentials_management
clarification_file: $CLARIFICATION_FILE
created_at: $(date -Iseconds)
retry_required: true
EOF

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}等待用户补充依赖信息${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "请完成以下操作："
echo ""
echo "1. 编辑并填写：$CLARIFICATION_FILE"
echo "2. 填写完成后，重新运行：/eket-ask"
echo ""
echo "或者，您也可以直接编辑 inbox/human_input.md 补充相关信息"
echo ""

exit 1
