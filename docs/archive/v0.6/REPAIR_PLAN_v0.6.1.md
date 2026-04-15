# EKET Framework v0.6.1 修复计划

**制定日期**: 2026-03-24
**审查版本**: v0.6.1
**审查依据**: 项目经理/Scrum Master/Online 运营三视角评审报告

---

## 一、Executive Summary

### 1.1 风险状态总览

| 风险等级 | 原数量 | 已修复 | 剩余 | 状态 |
|---------|--------|--------|------|------|
| 🔴 Critical | 5 | 3 ✅ | 2 | 部分修复 |
| 🟡 High | 8 | 0 | 8 | 待修复 |
| 🟢 Medium | 6 | 0 | 6 | 待修复 |
| ⚪ Low | 4 | 0 | 4 | 待优化 |

### 1.2 评审发现

**好消息** 🎉:
- C-01 (YAML 语法错误): 已修复 - key 已使用英文
- C-02 (配置验证): 已集成到 `eket-start.sh`
- C-04 (Merge 绕过门禁): 已集成 test-gate-system.sh 和 merge-strategy.sh

**待修复** ⚠️:
- C-03: 脚本路径硬编码问题在模板中已修复，但需确认所有脚本一致
- C-05: 守护进程 PID 管理未实现

---

## 二、修复路线图

### Sprint 0 (24 小时内) - P0 Critical

| ID | 任务 | 涉及文件 | 工作量 | 状态 |
|----|------|----------|--------|------|
| S0-1 | 守护进程 PID 管理 | `template/.claude/commands/eket-start.sh` | 1 小时 | 🔴 |
| S0-2 | 脚本路径一致性检查 | 所有 `.claude/commands/*.sh` | 1 小时 | 🔴 |

**验收标准**:
- [ ] 心跳监控和 Memory Review Agent 使用 PID 文件管理
- [ ] 所有脚本使用动态路径 `$SCRIPT_DIR` 和 `$PROJECT_ROOT`

---

### Sprint 1 (本周内) - P0/P1 High

| ID | 任务 | 涉及文件 | 工作量 | 状态 |
|----|------|----------|--------|------|
| S1-1 | 权限检查集成 | `template/.claude/commands/eket-claim.sh` | 2 小时 | 🔴 |
| S1-2 | 并发控制集成 | `template/.claude/commands/eket-claim.sh` | 1 小时 | 🟡 |
| S1-3 | 统一错误处理规范 | 所有脚本 | 3 小时 | 🟡 |
| S1-4 | 动态覆盖率阈值 | `scripts/test-gate-system.sh` | 2 小时 | 🟡 |
| S1-5 | 健康检查端点 | `scripts/health-check.sh` (新建) | 2 小时 | 🟡 |

**验收标准**:
- [ ] 所有 Git 操作和 Jira 更新前调用权限检查
- [ ] 任务领取时检查并发限制
- [ ] 所有脚本使用统一退出码和日志格式
- [ ] 覆盖率阈值支持按模块配置
- [ ] 健康检查脚本可检测三仓库、心跳、进程状态

---

### Sprint 2 (下周) - P1 High 增强

| ID | 任务 | 涉及文件 | 工作量 | 状态 |
|----|------|----------|--------|------|
| S2-1 | 告警通知集成 | `scripts/notify.sh` (新建) | 4 小时 | 🟡 |
| S2-2 | 集成测试框架 | `tests/integration/` (新建) | 8 小时 | 🟡 |
| S2-3 | Worktree 清理调度 | `scripts/worktree-cleaner.sh` | 2 小时 | 🟢 |
| S2-4 | 文档同步机制 | `scripts/sync-docs.sh` (新建) | 4 小时 | 🟡 |
| S2-5 | 配置热重载 | `scripts/reload-config.sh` (新建) | 4 小时 | 🟡 |

**验收标准**:
- [ ] 支持 Webhook 通知（Slack/钉钉/企业微信）
- [ ] 集成测试覆盖核心流程
- [ ] Worktree 清理支持定时调度
- [ ] 文档自动同步到 Confluence
- [ ] 配置修改后无需重启实例

---

## 三、详细修复方案

### S0-1: 守护进程 PID 管理

**问题描述**: `heartbeatmonitor.sh` 和 `memory-review-agent.sh` 使用简单 `&` 后台运行，无进程管理。

**修复方案**:

```bash
# 在 eket-start.sh 中添加
start_daemon() {
    local script="$1"
    local name="$2"
    local pid_file=".eket/state/${name}.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "✓ $name 已在运行 (PID: $pid)"
            return 0
        fi
        rm -f "$pid_file"
    fi

    # 启动并保存 PID
    nohup "$script" --daemon > "logs/${name}.log" 2>&1 &
    echo $! > "$pid_file"
    echo "✓ $name 已启动 (PID: $!)"
}

# 替换原有的后台启动
start_daemon "$SCRIPTS_DIR/heartbeatmonitor.sh" "heartbeat-monitor"
start_daemon "$SCRIPTS_DIR/memory-review-agent.sh" "memory-review-agent"
```

**验证方法**:
```bash
# 检查 PID 文件
ls -la .eket/state/*.pid

# 检查进程是否在运行
ps aux | grep heartbeat-monitor
ps aux | grep memory-review-agent
```

---

### S0-2: 脚本路径一致性检查

**问题描述**: 部分脚本可能仍使用相对路径 `../../scripts/`。

**修复方案**:

```bash
# 所有脚本文件开头必须添加
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 使用动态路径
"$SCRIPTS_DIR/xxx.sh"  # 代替 ../../scripts/xxx.sh
```

**检查命令**:
```bash
# 查找使用相对路径的脚本
grep -r " ../../scripts/" template/.claude/commands/

# 验证所有脚本使用动态路径
for f in template/.claude/commands/*.sh; do
    if ! grep -q 'SCRIPT_DIR=' "$f"; then
        echo "⚠ $f 未使用动态路径"
    fi
done
```

---

### S1-1: 权限检查集成

**问题描述**: 配置了 `check.before_each_operation: true`，但无实际检查逻辑。

**修复方案**:

在以下脚本中添加权限检查：
- `eket-claim.sh` - 任务领取前
- `eket-submit-pr.sh` - 提交 PR 前
- `eket-review-merge.sh` - 合并前

```bash
# 在 Git 操作和 Jira 更新前添加
check_permission() {
    local operation="$1"
    local resource="$2"

    if [ -x "$SCRIPTS_DIR/slaver-permissions.sh" ]; then
        if ! "$SCRIPTS_DIR/slaver-permissions.sh" check "$operation" "$resource"; then
            echo "❌ 权限检查失败：不允许执行 $operation 操作"
            return 1
        fi
    fi
}

# 使用示例
check_permission "git_checkout" "$BRANCH" || exit 1
check_permission "jira_update" "$TASK_ID" || exit 1
```

---

### S1-3: 统一错误处理规范

**问题描述**: 各脚本退出码不一致，日志格式不统一。

**修复方案**:

创建 `scripts/error-handler.sh`:

```bash
#!/bin/bash
# 统一错误处理规范

# 错误码定义
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_CONFIG_ERROR=2
readonly EXIT_PERMISSION_ERROR=3
readonly EXIT_TIMEOUT_ERROR=4
readonly EXIT_VALIDATION_ERROR=5

# 日志格式
log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [ERROR] $1" >&2
}

log_warn() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [WARN] $1" >&2
}

log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [INFO] $1"
}

# 退出函数
exit_with_error() {
    local error_code="$1"
    local message="$2"
    log_error "$message"
    exit "$error_code"
}
```

所有脚本引用：
```bash
source "$SCRIPTS_DIR/error-handler.sh"

# 使用
exit_with_error "$EXIT_PERMISSION_ERROR" "权限检查失败"
```

---

### S1-5: 健康检查端点

**问题描述**: 无法快速判断实例健康状态。

**修复方案**:

创建 `scripts/health-check.sh`:

```bash
#!/bin/bash
# EKET 健康检查脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 健康检查"
echo "========================================"
echo ""

HEALTH_STATUS=0

# 1. 检查三仓库
echo "## 检查三仓库状态"
for repo in confluence jira code_repo; do
    if [ -d "$PROJECT_ROOT/$repo" ]; then
        echo "  ✓ $repo 存在"
    else
        echo "  ✗ $repo 不存在"
        HEALTH_STATUS=1
    fi
done
echo ""

# 2. 检查心跳
echo "## 检查心跳状态"
if [ -f "$PROJECT_ROOT/.eket/state/heartbeat.log" ]; then
    LAST_HEARTBEAT=$(tail -1 "$PROJECT_ROOT/.eket/state/heartbeat.log" | cut -d' ' -f1)
    echo "  最后心跳：$LAST_HEARTBEAT"
else
    echo "  ✗ 心跳日志不存在"
    HEALTH_STATUS=1
fi
echo ""

# 3. 检查守护进程
echo "## 检查守护进程"
for pid_file in "$PROJECT_ROOT/.eket/state/"*.pid; do
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  ✓ $(basename "$pid_file" .pid) 运行中 (PID: $pid)"
        else
            echo "  ✗ $(basename "$pid_file" .pid) 未运行"
            HEALTH_STATUS=1
        fi
    fi
done
echo ""

# 4. 检查配置
echo "## 检查配置有效性"
if [ -x "$SCRIPTS_DIR/validate-config.sh" ]; then
    if "$SCRIPTS_DIR/validate-config.sh" 2>/dev/null; then
        echo "  ✓ 配置验证通过"
    else
        echo "  ✗ 配置验证失败"
        HEALTH_STATUS=1
    fi
fi
echo ""

# 总结
echo "========================================"
if [ "$HEALTH_STATUS" -eq 0 ]; then
    echo "健康状态：✓ 正常"
else
    echo "健康状态：✗ 异常"
fi
echo "========================================"

exit "$HEALTH_STATUS"
```

---

## 四、测试计划

### 单元测试

| 脚本 | 测试场景 |
|------|----------|
| `health-check.sh` | 三仓库缺失、心跳超时、进程挂掉、配置错误 |
| `error-handler.sh` | 各错误码正确退出、日志格式正确 |
| `slaver-permissions.sh` | 权限允许/拒绝/询问三种场景 |

### 集成测试

| 流程 | 测试场景 |
|------|----------|
| Master 启动 | 守护进程正确启动、PID 文件创建 |
| Slaver 领取任务 | 权限检查调用、并发限制生效 |
| Merge 流程 | 门禁验证、策略检查、Checkpoint 验证 |

---

## 五、验收标准

### Sprint 0 验收

- [ ] 守护进程 PID 管理实现
- [ ] 所有脚本路径动态化
- [ ] 无硬编码相对路径

### Sprint 1 验收

- [ ] 权限检查在所有操作前调用
- [ ] 并发控制生效
- [ ] 错误处理规范统一
- [ ] 健康检查可运行
- [ ] 覆盖率阈值支持模块配置

### Sprint 2 验收

- [ ] 告警通知支持 Webhook
- [ ] 集成测试覆盖率 >80%
- [ ] Worktree 清理定时执行
- [ ] 文档自动同步
- [ ] 配置热重载生效

---

## 六、责任矩阵

| 任务 | 负责人 | 审查人 | 预计完成 |
|------|--------|--------|----------|
| Sprint 0 | AI Agent | 人类 | 2026-03-25 |
| Sprint 1 | AI Agent | 人类 | 2026-03-31 |
| Sprint 2 | AI Agent | 人类 | 2026-04-07 |

---

## 七、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 脚本改造引入新 bug | 中 | 中 | 集成测试覆盖 |
| 权限检查影响性能 | 低 | 低 | 缓存检查结果 |
| 配置热重载复杂度高 | 中 | 中 | 分阶段实现 |

---

## 八、后续行动

1. **立即行动** (Sprint 0):
   - 创建 `start_daemon` 函数
   - 扫描并修复所有脚本路径

2. **本周行动** (Sprint 1):
   - 集成权限检查
   - 创建错误处理规范
   - 实现健康检查

3. **下周行动** (Sprint 2):
   - 告警通知集成
   - 集成测试框架
   - 配置热重载

---

**制定人**: Master Node + AI Agent
**批准人**: Human User
**下次审查**: Sprint 0 完成后
