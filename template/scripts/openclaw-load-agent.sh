#!/bin/bash

# OpenCLAW Agent Profile 加载器
# 动态生成 Agent 配置文件

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
PROFILE_DIR="${PROJECT_ROOT}/.eket/profiles"

# 确保目录存在
mkdir -p "$PROFILE_DIR"

# 环境变量
OPENCLAW_ASSIGNED_ROLE="${OPENCLAW_ASSIGNED_ROLE:-slaver}"
OPENCLAW_SKILLS="${OPENCLAW_SKILLS:-}"
OPENCLAW_MODE="${OPENCLAW_MODE:-auto}"
MESSAGE_QUEUE_URL="${MESSAGE_QUEUE_URL:-redis://localhost:6379}"

# 生成 Profile
generate_profile() {
    local profile_name="$1"
    local agent_type="$2"
    local capabilities="$3"
    local execution_mode="$4"

    cat > "${PROFILE_DIR}/${profile_name}.yml" << EOF
# OpenCLAW Managed Agent Profile
# 由 OpenCLAW 动态生成和管理

source: openclaw
agent_type: ${agent_type}
capabilities:
$(echo "$capabilities" | tr ',' '\n' | sed 's/^ */  - /')

execution_mode: ${execution_mode}

reporting:
  to: openclaw
  channel: ${MESSAGE_QUEUE_URL}
  format: json

metadata:
  created_by: openclaw
  created_at: $(date -Iseconds)
  managed: true
EOF

    echo "Profile 已生成：${profile_name}.yml"
}

# 从环境变量读取并生成 Profile
if [[ -n "$OPENCLAW_ASSIGNED_ROLE" ]]; then
    generate_profile \
        "openclaw_managed" \
        "$OPENCLAW_ASSIGNED_ROLE" \
        "$OPENCLAW_SKILLS" \
        "$OPENCLAW_MODE"

    echo "✓ OpenCLAW Agent Profile 加载完成"
    echo "  角色：${OPENCLAW_ASSIGNED_ROLE}"
    echo "  模式：${OPENCLAW_MODE}"
    echo "  配置文件：${PROFILE_DIR}/openclaw_managed.yml"
else
    echo "错误：缺少 OPENCLAW_ASSIGNED_ROLE 环境变量"
    exit 1
fi
