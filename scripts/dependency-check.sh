#!/bin/bash
# EKET 依赖检查脚本 - 检测项目依赖并追问缺失信息

# 不使用 set -e，避免在可恢复错误处退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 依赖检查清单文件
DEPENDENCY_CHECKLIST="inbox/dependency-checklist.md"
DEPENDENCY_STATUS=".eket/state/dependency-status.yml"

# ==========================================
# 依赖检查分类
# ==========================================

# 数据源依赖
DATA_SOURCES=(
    "database"
    "api_endpoint"
    "file_storage"
    "search_engine"
    "cache_service"
)

# 外部服务依赖
EXTERNAL_SERVICES=(
    "authentication"
    "payment_gateway"
    "email_service"
    "sms_service"
    "third_party_api"
)

# 基础设施依赖
INFRASTRUCTURE=(
    "container_registry"
    "cloud_provider"
    "cdn"
    "monitoring"
    "logging"
)

# 认证和密钥
CREDENTIALS=(
    "api_keys"
    "database_credentials"
    "oauth_credentials"
    "service_accounts"
)

# ==========================================
# 检查函数
# ==========================================

check_data_sources() {
    echo -e "${BLUE}## 检查数据源依赖${NC}"
    echo ""

    local missing=()

    # 检查数据库配置
    if ! grep -q "database" "inbox/human_input.md" 2>/dev/null; then
        if [ -f "src/backend/db" ] || [ -f "src/database" ]; then
            echo -e "${GREEN}✓${NC} 检测到数据库相关代码"
        else
            missing+=("database")
        fi
    fi

    # 检查 API 配置
    if grep -qi "api" "inbox/human_input.md" 2>/dev/null; then
        if [ ! -f ".env.example" ] && [ ! -f "config/api.yml" ]; then
            missing+=("api_endpoint")
        fi
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC} 缺失的数据源配置: ${missing[*]}"
        return 1
    fi

    echo -e "${GREEN}✓${NC} 数据源配置完整"
    return 0
}

check_credentials() {
    echo -e "${BLUE}## 检查认证和密钥配置${NC}"
    echo ""

    # 检查 .env.example 是否存在
    if [ -f ".env.example" ]; then
        echo -e "${GREEN}✓${NC} .env.example 存在"
    else
        echo -e "${YELLOW}⚠${NC} .env.example 不存在"
    fi

    # 检查是否有硬编码密钥（Red Line 检查）
    local hardcoded_secrets=$(grep -rn "sk-[a-zA-Z0-9]\{20,\}" src/ 2>/dev/null | head -5 || true)
    if [ -n "$hardcoded_secrets" ]; then
        echo -e "${RED}✗${NC} 发现硬编码密钥 (违反 Red Line 政策)"
        echo "$hardcoded_secrets"
        return 1
    fi

    echo -e "${GREEN}✓${NC} 未发现硬编码密钥"
    return 0
}

check_infrastructure() {
    echo -e "${BLUE}## 检查基础设施配置${NC}"
    echo ""

    # 检查 Docker 配置
    if [ -f "Dockerfile" ] || [ -f "docker-compose.yml" ]; then
        echo -e "${GREEN}✓${NC} Docker 配置存在"
    else
        echo -e "${YELLOW}⚠${NC} Docker 配置不存在"
    fi

    # 检查 CI/CD 配置
    if [ -d ".github/workflows" ] || [ -f ".gitlab-ci.yml" ]; then
        echo -e "${GREEN}✓${NC} CI/CD 配置存在"
    else
        echo -e "${YELLOW}⚠${NC} CI/CD 配置不存在"
    fi

    return 0
}

# ==========================================
# 生成依赖清单
# ==========================================

generate_dependency_checklist() {
    cat > "$DEPENDENCY_CHECKLIST" << 'EOF'
# 项目依赖检查清单

**生成时间**: {{TIMESTAMP}}
**项目名称**: {{PROJECT_NAME}}
**状态**: pending

---

## 1. 数据源依赖

请在下方填写项目所需的数据源信息：

### 1.1 数据库

- [ ] 数据库类型：`MySQL` / `PostgreSQL` / `MongoDB` / 其他：____
- [ ] 连接字符串：`mongodb://localhost:27017/db` (示例格式，不要填真实密码)
- [ ] 是否需要迁移脚本：是 / 否
- [ ] ORM/ODM: `Prisma` / `TypeORM` / `Mongoose` / 其他：____

### 1.2 外部 API

- [ ] 需要调用的外部 API 列表：
  - API 名称：____
  - 端点：____
  - 认证方式：`API Key` / `OAuth` / `JWT` / 其他：____

- [ ] API 密钥管理方式：
  - [ ] 使用环境变量
  - [ ] 使用密钥管理服务 (Vault/Secrets Manager)
  - [ ] 其他：____

### 1.3 文件存储

- [ ] 存储类型：`本地文件系统` / `AWS S3` / `阿里云 OSS` / 其他：____
- [ ] 存储路径/桶名：____
- [ ] CDN 配置：是 / 否

### 1.4 搜索引擎

- [ ] 搜索引擎类型：`Elasticsearch` / `Algolia` / `Meilisearch` / 不需要
- [ ] 端点/配置：____

### 1.5 缓存服务

- [ ] 缓存类型：`Redis` / `Memcached` / `不需要`
- [ ] 连接配置：____

---

## 2. 认证和授权

### 2.1 用户认证

- [ ] 认证方式：
  - [ ] 用户名/密码
  - [ ] 邮箱验证码
  - [ ] 手机验证码
  - [ ] OAuth (Google/GitHub/微信)
  - [ ] JWT Token
  - [ ] Session/Cookie

### 2.2 权限管理

- [ ] 权限模型：`RBAC` / `ABAC` / `简单权限` / 不需要
- [ ] 角色列表：
  - ____
  - ____

---

## 3. 基础设施

### 3.1 部署环境

- [ ] 目标环境：
  - [ ] 开发环境 (localhost)
  - [ ] 测试环境
  - [ ] 预发布环境
  - [ ] 生产环境

- [ ] 部署方式：
  - [ ] Docker / Docker Compose
  - [ ] Kubernetes
  - [ ] 云服务 (Vercel/Netlify/Heroku)
  - [ ] 传统服务器

### 3.2 监控和日志

- [ ] 监控工具：`DataDog` / `New Relic` / `Prometheus` / 不需要
- [ ] 日志工具：`Winston` / `Bunyan` / `ELK` / 不需要
- [ ] 告警方式：`邮件` / `Slack` / `钉钉` / `企业微信`

---

## 4. 第三方服务

- [ ] 邮件服务：`SendGrid` / `AWS SES` / `阿里云邮件推送` / 不需要
- [ ] 短信服务：`Twilio` / `阿里云短信` / 不需要
- [ ] 支付服务：`Stripe` / `支付宝` / `微信支付` / 不需要
- [ ] 其他服务：____

---

## 5. 安全和合规

### 5.1 安全措施

- [ ] HTTPS 配置：是 / 否
- [ ] CORS 配置：是 / 否
- [ ] 速率限制：是 / 否
- [ ] SQL 注入防护：是 / 否
- [ ] XSS 防护：是 / 否

### 5.2 合规要求

- [ ] GDPR 合规：需要 / 不需要
- [ ] 数据保留政策：____ 天
- [ ] 审计日志：需要 / 不需要

---

## 6. 性能和扩展

### 6.1 性能要求

- [ ] 预期 QPS: ____
- [ ] 响应时间要求：____ ms
- [ ] 并发用户数：____

### 6.2 扩展策略

- [ ] 水平扩展：需要 / 不需要
- [ ] 自动扩缩容：需要 / 不需要
- [ ] 负载均衡：需要 / 不需要

---

## 确认

- [ ] 我已填写所有必要的依赖信息
- [ ] 我理解敏感信息（密码、密钥）不应直接填写，而应通过环境变量管理
- [ ] 我已确认所有第三方服务的可用性和成本

**填写人**: ________
**填写日期**: ________

EOF

    # 替换占位符
    sed -i '' "s/{{TIMESTAMP}}/$(date -Iseconds)/g" "$DEPENDENCY_CHECKLIST" 2>/dev/null || \
    sed -i "s/{{TIMESTAMP}}/$(date -Iseconds)/g" "$DEPENDENCY_CHECKLIST"

    sed -i '' "s/{{PROJECT_NAME}}/$(basename $(pwd))/g" "$DEPENDENCY_CHECKLIST" 2>/dev/null || \
    sed -i "s/{{PROJECT_NAME}}/$(basename $(pwd))/g" "$DEPENDENCY_CHECKLIST"

    echo -e "${GREEN}✓${NC} 已生成依赖检查清单: $DEPENDENCY_CHECKLIST"
}

# ==========================================
# 追问生成器
# ==========================================

generate_clarification_request() {
    local category="$1"
    local missing_items="$2"

    local feedback_file="inbox/human_feedback/clarification-$(date +%Y%m%d-%H%M%S).md"

    cat > "$feedback_file" << EOF
# 依赖信息追问

**生成时间**: $(date -Iseconds)
**类别**: $category
**状态**: awaiting_human_response

---

## 缺失的依赖信息

检测到以下必要依赖信息尚未提供：

$missing_items

---

## 请补充以下信息

### 1. 数据源配置

请说明项目使用的数据源：

\`\`\`
数据库类型：[MySQL/PostgreSQL/MongoDB/其他]
连接方式：[本地/远程/云服务]
数据量级：[GB/TB/PB]
\`\`\`

### 2. 外部 API 配置

请列出需要调用的外部 API：

\`\`\`
API 名称：
端点 URL：
认证方式：[API Key/OAuth/JWT/无]
\`\`\`

### 3. 认证和密钥管理

请说明确认信息：

- [ ] 我已了解 Red Line 政策：敏感信息禁止硬编码
- [ ] 我将通过环境变量提供 API 密钥
- [ ] 我已准备好 .env.example 文件

---

## 下一步

请在填写此文件后继续，智能体将根据提供的信息：

1. 生成 `.env.example` 文件
2. 配置数据源连接
3. 设置 API 客户端
4. 更新项目文档

---

**状态**: `pending_human_input`
EOF

    echo -e "${GREEN}✓${NC} 已生成追问文件：$feedback_file"
    echo "$feedback_file"
}

# ==========================================
# 主检查流程
# ==========================================

run_dependency_check() {
    echo "========================================"
    echo "EKET 依赖检查"
    echo "========================================"
    echo ""

    local has_issues=false

    # 检查数据源
    check_data_sources || has_issues=true
    echo ""

    # 检查认证密钥
    check_credentials || has_issues=true
    echo ""

    # 检查基础设施
    check_infrastructure || has_issues=true
    echo ""

    if [ "$has_issues" = true ]; then
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}检测到缺失的依赖配置${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""

        # 生成依赖清单
        generate_dependency_checklist

        # 生成追问文件
        generate_clarification_request "dependency_check" "
- 数据源配置未明确
- 外部 API 信息未提供
- 认证密钥管理方式未确认
"

        echo ""
        echo -e "${YELLOW}请完成以下操作后继续:${NC}"
        echo ""
        echo "1. 填写依赖检查清单：$DEPENDENCY_CHECKLIST"
        echo "2. 回复追问文件中的问题"
        echo "3. 运行 /eket-dependency-check 重新检查"
        echo ""

        # 保存状态
        mkdir -p ".eket/state"
        cat > "$DEPENDENCY_STATUS" << EOF
status: pending
missing_categories:
  - data_sources
  - api_configuration
  - credentials_management
generated_files:
  - $DEPENDENCY_CHECKLIST
created_at: $(date -Iseconds)
EOF

        return 1
    fi

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}所有依赖配置检查通过${NC}"
    echo -e "${GREEN}========================================${NC}"

    # 保存状态
    mkdir -p ".eket/state"
    cat > "$DEPENDENCY_STATUS" << EOF
status: completed
all_dependencies_verified: true
completed_at: $(date -Iseconds)
EOF

    return 0
}

# ==========================================
# 入口
# ==========================================

# 支持命令行参数
case "${1:-check}" in
    check)
        run_dependency_check
        ;;
    generate)
        generate_dependency_checklist
        ;;
    help)
        echo "用法：$0 [check|generate|help]"
        echo ""
        echo "  check    - 运行完整依赖检查"
        echo "  generate - 仅生成依赖检查清单"
        echo "  help     - 显示帮助信息"
        ;;
    *)
        echo "未知命令：$1"
        exit 1
        ;;
esac
