# EKET 框架 v0.4 风险审查报告

**审查时间**: 2026-03-23
**审查依据**: Searcher 项目实战经验 + 框架升级分析
**审查范围**: 风险、漏洞、缺陷、隐患、问题

---

## 一、 Executive Summary

### 1.1 风险等级总览

| 风险等级 | 数量 | 状态 |
|---------|------|------|
| 🔴 Critical | 5 | 需要立即修复 |
| 🟡 High | 8 | 需要本周修复 |
| 🟢 Medium | 6 | 需要规划修复 |
| ⚪ Low | 4 | 可选优化 |

### 1.2 核心问题

**最严重的问题**:
1. Slaver 执行无追踪机制 - 无法检测 slave 是否真正开始工作
2. Mock 实现检测缺失 - 假代码可以绕过所有检查
3. Master/Slaver 权限边界模糊 - 存在安全风险
4. 任务超时配置无效 - 没有实际执行限制
5. 状态同步机制脆弱 - worktree 同步无错误处理

---

## 二、Critical 风险 (🔴)

### C-01: Slaver 执行追踪缺失

**风险描述**:
Slaver 领取任务后，系统无法追踪其是否真正开始执行。在 Searcher 项目中，slave-004 和 slave-006 被分配任务后超过 24 小时无任何产出，但系统仍显示"进行中"。

**影响**:
- 任务停滞无法自动检测
- 项目延期风险无法预警
- 需要人工介入检查进度

**复现路径**:
```
1. Slaver 领取任务 #32 (E2E 测试)
2. Slaver 不执行任何代码
3. 系统状态仍为 "in_progress"
4. 24 小时后仍无产出，无警报
```

**当前代码问题**:
```bash
# eket-start.sh 步骤 4.4
if [ "$AUTO_MODE" = true ]; then
    # 领取任务后无追踪机制
    READY_COUNT=$(grep -l "status: ready" jira/tickets/*/*.md)
    # 领取后不记录开始时间，不设置心跳
fi
```

**修复建议**:
```yaml
# .eket/state/slaver-heartbeat.yml
slaver_heartbeat:
  check_interval_minutes: 5
  timeout_minutes: 30
  stalled_task_alert_hours: 4

# scripts/heartbeat-monitor.sh (新增)
while true; do
    for task in jira/tickets/*/in_progress/*.md; do
        check_task_activity "$task"
        if stalled_for 4_hours; then
            create_alert "task_stalled" "$task"
        fi
    done
    sleep 300
done
```

---

### C-02: Mock/Empty 实现检测缺失

**风险描述**:
框架的依赖追问机制仅基于关键词匹配，无法检测代码中的 Mock 实现。Searcher 项目中 `MockLegacySearchAdapter` 返回空数组，但通过了所有初始化检查。

**影响**:
- 假代码可以绕过检查
- 项目看似完成但实际无功能
- 依赖追问机制被绕过

**复现路径**:
```
1. 创建空实现：async searchById() { return []; }
2. 运行 /eket-init
3. 依赖检查通过 (grep 检测到"api"关键词)
4. 实际无数据接入
```

**当前代码问题**:
```bash
# eket-init.sh 步骤 5
if grep -qiE "(database|mongodb|api.*key|存储)" "inbox/human_input.md"; then
    HAS_DEPENDENCY_INFO=true
    echo "✓ 检测到数据依赖信息"
else
    echo "⚠ 未检测到数据依赖信息"
fi
# ❌ 不检查代码实际实现
```

**修复建议**:
```bash
# scripts/detect-mock-implementation.sh (新增)
detect_mock_implementations() {
    echo "检测 Mock/Empty 实现..."

    # 检测空函数体
    for file in $(find src -name "*.ts" -o -name "*.js"); do
        if grep -q "return \[\]" "$file" && ! grep -q "test\|spec" "$file"; then
            echo "⚠️ 发现空实现：$file"
            ALERT_FILES+=("$file")
        fi
    done

    # 检测 TODO 注释
    TODO_COUNT=$(grep -r "// TODO" src/ --exclude="*.test.ts" --exclude="*.spec.ts" | wc -l)
    if [ "$TODO_COUNT" -gt 10 ]; then
        echo "⚠️ 发现 $TODO_COUNT 个 TODO 未实现"
    fi

    # 如果有 Mock 实现，阻塞流程
    if [ ${#ALERT_FILES[@]} -gt 0 ]; then
        echo "❌ 检测到 Mock 实现，阻塞流程"
        create_clarification_file "mock_implementation_detected"
        exit 1
    fi
}
```

---

### C-03: Master/Slaver 权限边界模糊

**风险描述**:
v0.4 引入 Master/Slaver 模式，但权限边界定义模糊。Slaver 理论上不能操作 main 分支，但实际没有强制限制。

**影响**:
- Slaver 可能意外提交到 main
- 代码质量无法保证
- 回滚困难

**当前代码问题**:
```bash
# eket-start.sh
# Slaver 模式约束仅靠文档说明
echo "│  • 不得直接操作主分支 (main)                                   │"
# ❌ 无实际技术限制
```

**修复建议**:
```bash
# scripts/branch-protection.sh (新增)
enforce_branch_protection() {
    local role=$(grep "^role:" ".eket/state/instance_config.yml" | cut -d':' -f2 | tr -d ' ')
    local current_branch=$(git branch --show-current)

    if [ "$role" = "slaver" ] && [ "$current_branch" = "main" ]; then
        echo "❌ Slaver 禁止在 main 分支操作"
        echo "请切换到 feature 分支或 testing 分支"
        exit 1
    fi

    # 配置 Git hook 防止意外提交
    if [ "$role" = "slaver" ]; then
        cat > ".git/hooks/pre-commit" << 'EOF'
#!/bin/bash
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
    echo "❌ Slaver 禁止提交到 main 分支"
    exit 1
fi
EOF
        chmod +x ".git/hooks/pre-commit"
    fi
}
```

---

### C-04: 任务超时配置无效

**风险描述**:
`config.yml` 中配置了 `timeout_minutes: 120`，但没有任何实际执行机制来限制任务超时。

**影响**:
- 任务可以无限期占用资源
- 阻塞其他任务
- 项目进度无法控制

**当前代码问题**:
```yaml
# config.yml
tasks:
  timeout_minutes: 120  # ❌ 配置但无实际作用
```

**修复建议**:
```bash
# scripts/task-timeout-monitor.sh (新增)
check_task_timeouts() {
    local now=$(date +%s)

    for task_file in jira/tickets/*/*.md; do
        local status=$(grep "^status:" "$task_file" | cut -d' ' -f2)

        if [ "$status" = "in_progress" ] || [ "$status" = "dev" ]; then
            local started_at=$(grep "^started_at:" "$task_file" | cut -d':' -f2-)
            local started_ts=$(date -d "$started_at" +%s 2>/dev/null || echo 0)
            local elapsed=$(( (now - started_ts) / 60 ))
            local timeout=$(grep "^timeout_minutes:" ".eket/config.yml" | cut -d':' -f2 | tr -d ' ')

            if [ "$elapsed" -gt "$timeout" ]; then
                echo "⚠️ 任务 $(basename $task_file) 超时 ($elapsed > $timeout 分钟)"

                # 创建警报
                cat > "inbox/human_feedback/task-timeout-$(basename $task_file)" << EOF
# 任务超时警报

**任务**: $(basename $task_file .md)
**状态**: $status
**已运行**: $elapsed 分钟
**超时限制**: $timeout 分钟

**建议行动**:
1. 检查 Slaver 是否遇到问题
2. 评估是否需要增加资源
3. 考虑重新分配任务
EOF
            fi
        fi
    done
}
```

---

### C-05: 状态同步机制脆弱

**风险描述**:
v0.4 引入 worktree 同步三仓库状态，但无错误处理和冲突解决机制。

**影响**:
- 同步失败无提示
- 数据可能丢失
- 多 Slaver 状态不一致

**当前代码问题**:
```bash
# eket-start.sh 步骤 4.1 (Slaver 模式)
WORKTREE_DIR=".eket/worktrees/slaver_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$WORKTREE_DIR"
# ❌ 无错误处理
# ❌ 无冲突检测
# ❌ 无同步验证
```

**修复建议**:
```bash
# scripts/sync-worktree.sh (新增)
sync_worktree_safely() {
    local worktree_dir="$1"

    echo "同步 Worktree..."

    # 检查远程连接
    if ! git remote -v | grep -q "origin"; then
        echo "❌ 无远程仓库配置"
        return 1
    fi

    # Fetch 远程状态
    if ! git fetch origin 2>&1; then
        echo "❌ 无法连接远程仓库"
        return 1
    fi

    # 检查工作树是否干净
    if ! git diff-index --quiet HEAD --; then
        echo "⚠️ 工作树有未提交变更"
        # 尝试 stash
        git stash push -m "worktree-sync-stash-$(date +%s)"
    fi

    # 同步
    git worktree prune
    git worktree add -f "$worktree_dir" origin/main 2>&1 || {
        echo "❌ Worktree 同步失败"
        return 1
    }

    # 验证同步
    if [ -d "$worktree_dir/confluence" ] && [ -d "$worktree_dir/jira" ]; then
        echo "✓ Worktree 同步成功"
        return 0
    else
        echo "❌ Worktree 内容不完整"
        return 1
    fi
}
```

---

## 三、High 风险 (🟡)

### H-01: 依赖追问机制被动

**风险描述**:
依赖追问仅在 `/eket-init` 时触发一次，运行时不再检测。

**影响**: Searcher 项目中，数据接入问题在 Sprint 1 完成后才被发现。

**修复建议**: 在任务阶段变更时触发依赖检查。

---

### H-02: 验收标准无自动检查

**风险描述**:
任务状态变更（如 `dev` → `test`）不检查验收标准是否满足。

**影响**: 任务可能在验收标准未完成时进入下一阶段。

**修复建议**:
```bash
# scripts/check-acceptance-criteria.sh
before_status_change() {
    local task_id="$1"
    local from_status="$2"
    local to_status="$3"

    # 提取验收标准
    local criteria=$(sed -n '/^## 验收标准/,/^---/p' "$task_file" | grep "^\- \[")
    local completed=$(echo "$criteria" | grep "^\- \[x\]" | wc -l)
    local total=$(echo "$criteria" | wc -l)

    if [ "$completed" -lt "$total" ]; then
        echo "❌ 验收标准未完成 ($completed/$total)"
        return 1
    fi
}
```

---

### H-03: Git 历史污染风险

**风险描述**:
Slaver worktree 同步可能导致 Git 历史混乱，特别是在多 Slaver 场景。

**影响**:
- Git 历史不清晰
- 回滚困难
- 审计困难

**修复建议**:
- 每个 Slaver 使用独立分支前缀
- 强制 squash merge
- 定期清理 worktree

---

### H-04: Review 超时无升级机制

**风险描述**:
Review 超时 24 小时后无升级机制，任务可能无限期等待。

**影响**: PR 可能无人审核，阻塞进度。

**修复建议**:
```yaml
review:
  timeout_hours: 24
  escalation:
    - after_24h: notify_tech_lead
    - after_48h: notify_project_manager
    - after_72h: auto_assign_alternative_reviewer
```

---

### H-05: 记忆机制无清理策略

**风险描述**:
长期记忆无清理策略，可能无限增长。

**影响**:
- 磁盘空间耗尽
- 上下文加载缓慢
- 过时信息误导

**修复建议**:
```yaml
memory:
  long_term:
    max_size_mb: 100
    retention_days: 30
    cleanup_policy: oldest_first
```

---

### H-06: 日志轮转缺失

**风险描述**:
日志配置无轮转策略，可能无限增长。

**修复建议**:
```yaml
logging:
  max_file_size_mb: 10
  max_files: 10
  compress_old: true
```

---

### H-07: 并发任务数限制无效

**风险描述**:
`max_concurrent: 3` 配置无实际执行机制。

**修复建议**:
```bash
# scripts/concurrency-limit.sh
check_concurrency_limit() {
    local in_progress=$(grep -l "status: in_progress" jira/tickets/*/*.md | wc -l)
    local max=$(grep "^max_concurrent:" ".eket/config.yml" | cut -d':' -f2 | tr -d ' ')

    if [ "$in_progress" -ge "$max" ]; then
        echo "❌ 已达最大并发任务数 ($in_progress >= $max)"
        return 1
    fi
}
```

---

### H-08: 无回滚机制

**风险描述**:
任务失败后无回滚机制，可能遗留脏状态。

**修复建议**:
```yaml
advanced:
  rollback:
    enabled: true
    auto_rollback_on_error: false
    keep_backup: true
```

---

## 四、Medium 风险 (🟢)

### M-01: Checkpoint 定义不明确

**风险描述**: 无正式 checkpoint 触发机制。

### M-02: Milestone Review 不充分

**风险描述**: Sprint Review 不检查代码质量。

### M-03: Retrospective 流程缺失

**风险描述**: 无定期回顾改进机制。

### M-04: 自动化 Milestone 报告缺失

**风险描述**: 需要手动创建 review 文档。

### M-05: 代码级依赖扫描缺失

**风险描述**: 不扫描实际使用的依赖。

### M-06: 三仓库状态深度检查缺失

**风险描述**: 不验证 submodule 状态。

---

## 五、Low 风险 (⚪)

### L-01: 通知方式单一

**风险描述**: 仅支持文件通知，无 Slack/邮件集成。

### L-02: 团队负载分析不精确

**风险描述**: 基于任务数量，不基于实际工时。

### L-03: 可视化 Dashboard 缺失

**风险描述**: 无项目进度可视化。

### L-04: 文档版本控制缺失

**风险描述**: Confluence 文档无版本控制。

---

## 六、修复优先级

### 6.1 立即修复 (本周)

| 风险 | 优先级 | 预计工时 | 负责人 |
|------|--------|---------|--------|
| C-01 Slaver 追踪 | P0 | 4h | framework_team |
| C-02 Mock 检测 | P0 | 3h | framework_team |
| C-03 权限边界 | P0 | 2h | framework_team |
| C-04 超时机制 | P0 | 2h | framework_team |
| C-05 同步机制 | P0 | 3h | framework_team |

### 6.2 本周修复

| 风险 | 优先级 | 预计工时 |
|------|--------|---------|
| H-01 ~ H-08 | P1 | 16h |

### 6.3 规划修复

| 风险 | 优先级 | 建议 Sprint |
|------|--------|------------|
| M-01 ~ M-06 | P2 | Sprint 3 |
| L-01 ~ L-04 | P3 | Sprint 4 |

---

## 七、Searcher 项目具体问题

### 7.1 当前阻塞

**问题**: 数据接入实现等待用户确认存储方案

**根本原因**: C-01 (Slaver 追踪缺失) + C-02 (Mock 检测缺失)

**建议行动**:
1. 用户尽快填写 `inbox/data-integration-clarification.md`
2. 实现 C-01 和 C-02 修复
3. 重新评估被阻塞的任务

### 7.2 Sprint 2 风险

| 风险 | 状态 | 缓解措施 |
|------|------|---------|
| slave-004 未开始 E2E 测试 | 🟡 高 | 实现 C-01 心跳机制 |
| slave-006 未开始监控告警 | 🟡 高 | 实现 C-01 心跳机制 |
| 数据接入阻塞 | 🟡 中 | 用户确认存储方案 |

---

## 八、总结

### 8.1 风险分布

```
Critical: ████████████ 5 项 (立即修复)
High:     ████████████████████ 8 项 (本周修复)
Medium:   ██████████████ 6 项 (规划修复)
Low:      ████████ 4 项 (可选优化)
```

### 8.2 核心改进方向

1. **执行追踪** - 心跳机制 + 停滞检测
2. **代码质量** - Mock 检测 + 验收检查
3. **安全边界** - 权限强制 + 分支保护
4. **流程控制** - 超时机制 + 升级机制
5. **状态同步** - 错误处理 + 冲突解决

### 8.3 下一步

1. 立即修复 C-01 ~ C-05
2. 本周修复 H-01 ~ H-08
3. 用户确认 Searcher 存储方案
4. Sprint 3 实现 M 级别改进

---

**审查人**: Master Node + AI Agent
**审查日期**: 2026-03-23
**下次审查**: Critical 风险修复完成后
