# Jira 索引结构 (v2.9.0)

**版本**: v2.9.0  
**创建日期**: 2026-04-10  
**目的**: 定义 EKET 框架中 Jira tickets 的分层级组织和索引机制

---

## 1. 分层级结构

```
Milestone (里程碑)
    └── Sprint (迭代周期)
        └── Epic (功能集)
            └── Ticket (任务卡)
```

### 1.1 层级定义

| 层级 | 目录位置 | 命名格式 | 用途 |
|------|----------|----------|------|
| **Milestone** | `jira/milestones/{id}.md` | `MILESTONE-001` | 长期目标（月度/季度） |
| **Sprint** | `jira/sprints/{id}.md` | `SPRINT-001` | 迭代周期（2-4 周） |
| **Epic** | `jira/epics/{id}.md` | `EPIC-001` | 功能集/模块 |
| **Ticket** | `jira/tickets/{type}/{id}.md` | `FEAT-001`/`FIX-001` | 具体任务卡 |

---

## 2. 目录结构

```
jira/
├── README.md                     # Jira 仓库说明
├── INDEX.md                      # 主索引文件（所有 tickets 汇总）
├── milestones/                   # 里程碑
│   ├── MILESTONE-001.md
│   └── MILESTONE-002.md
├── sprints/                      # Sprint
│   ├── SPRINT-001.md
│   └── SPRINT-002.md
├── epics/                        # Epic
│   ├── EPIC-001.md
│   └── EPIC-002.md
├── tickets/                      # Tickets（按类型分类）
│   ├── feature/                  # 功能需求卡
│   │   ├── FEAT-001.md
│   │   └── FEAT-002.md
│   ├── bugfix/                   # 缺陷修复卡
│   │   ├── FIX-001.md
│   │   └── FIX-002.md
│   ├── task/                     # 一般任务卡
│   │   ├── TASK-001.md
│   │   └── TASK-002.md
│   ├── improvement/              # 改进卡
│   ├── research/                 # 调研卡
│   ├── deployment/               # 部署卡
│   ├── documentation/            # 文档卡
│   └── test/                     # 测试卡
├── index/                        # 索引文件（多维度）
│   ├── by-milestone.md           # 按 Milestone 索引
│   ├── by-sprint.md              # 按 Sprint 索引
│   ├── by-epic.md                # 按 Epic 索引
│   ├── by-status.md              # 按状态索引
│   ├── by-assignee.md            # 按负责人索引
│   ├── by-priority.md            # 按优先级索引
│   └── by-role.md                # 按角色索引（前端/后端/全栈）
├── state/                        # 状态追踪
│   ├── ticket-registry.yml       # Ticket 注册表（三方存储同步用）
│   └── stats.yml                 # 统计数据
└── templates/                    # 模板
    └── README.md
```

---

## 3. 索引文件格式

### 3.1 主索引文件 `INDEX.md`

```markdown
# Jira 主索引

**最后更新**: 2026-04-10T15:30:00+08:00
**总计**: 24 tickets (12 feature, 5 bugfix, 4 task, 3 improvement)

## 状态概览

| 状态 | 数量 | 占比 |
|------|------|------|
| backlog | 5 | 21% |
| analysis | 3 | 12% |
| ready | 4 | 17% |
| in_progress | 6 | 25% |
| review | 2 | 8% |
| done | 4 | 17% |

## 快速链接

- [按 Milestone 索引](./index/by-milestone.md)
- [按 Sprint 索引](./index/by-sprint.md)
- [按 Epic 索引](./index/by-epic.md)
- [按状态索引](./index/by-status.md)
- [按负责人索引](./index/by-assignee.md)
- [按优先级索引](./index/by-priority.md)
- [按角色索引](./index/by-role.md)
```

### 3.2 按 Milestone 索引 `by-milestone.md`

```markdown
# 按 Milestone 索引

**最后更新**: 2026-04-10T15:30:00+08:00

## MILESTONE-001: Q2 基础功能完成

**目标**: 完成核心功能开发，达到 MVP 标准  
**Sprint**: SPRINT-001, SPRINT-002  
**状态**: in_progress

| Ticket ID | 类型 | 标题 | 优先级 | 状态 | 负责人 | 所属 Sprint |
|-----------|------|------|--------|------|--------|-------------|
| FEAT-001 | feature | 用户登录功能 | P0 | done | slaver_001 | SPRINT-001 |
| FEAT-002 | feature | 权限管理 | P0 | in_progress | slaver_002 | SPRINT-001 |
| FEAT-003 | feature | 数据看板 | P1 | ready | - | SPRINT-002 |

## MILESTONE-002: Q3 性能优化

**目标**: 性能指标达到生产标准  
**Sprint**: SPRINT-003, SPRINT-004  
**状态**: backlog
```

### 3.3 按 Sprint 索引 `by-sprint.md`

```markdown
# 按 Sprint 索引

**最后更新**: 2026-04-10T15:30:00+08:00

## SPRINT-001 (2026-04-01 ~ 2026-04-14)

**主题**: 用户系统基础  
**目标**: 完成用户认证和权限管理  
**状态**: in_progress

| Ticket ID | 类型 | 标题 | 优先级 | 状态 | 负责人 | 预估工时 | 实际工时 |
|-----------|------|------|--------|------|--------|----------|----------|
| FEAT-001 | feature | 用户登录功能 | P0 | done | slaver_001 | 4h | 3.5h |
| FEAT-002 | feature | 权限管理 | P0 | in_progress | slaver_002 | 8h | - |
| TASK-001 | task | 项目初始化 | P0 | done | master | 1h | 1h |

**进度**: 2/3 (67%)

## SPRINT-002 (2026-04-15 ~ 2026-04-28)

**主题**: 数据展示  
**状态**: planned
```

### 3.4 按角色索引 `by-role.md`

```markdown
# 按角色索引

**最后更新**: 2026-04-10T15:30:00+08:00

## frontend_dev (前端开发)

| Ticket ID | 标题 | 优先级 | 状态 | 负责人 | 所属 Sprint |
|-----------|------|--------|------|--------|-------------|
| FEAT-001 | 用户登录功能 | P0 | done | slaver_001 | SPRINT-001 |
| FEAT-004 | 响应式布局 | P1 | in_progress | slaver_001 | SPRINT-001 |
| FIX-001 | 移动端样式修复 | P2 | ready | - | SPRINT-002 |

## backend_dev (后端开发)

| Ticket ID | 标题 | 优先级 | 状态 | 负责人 | 所属 Sprint |
|-----------|------|--------|------|--------|-------------|
| FEAT-002 | 权限管理 API | P0 | in_progress | slaver_002 | SPRINT-001 |
| FEAT-005 | 数据库设计 | P0 | done | slaver_002 | SPRINT-001 |

## fullstack (全栈开发)

| Ticket ID | 标题 | 优先级 | 状态 | 负责人 | 所属 Sprint |
|-----------|------|--------|------|--------|-------------|
| FEAT-003 | 数据看板 | P1 | ready | - | SPRINT-002 |
```

---

## 4. 三方存储同步

### 4.1 Ticket 注册表 `ticket-registry.yml`

```yaml
# Ticket 注册表（用于三方存储同步）
# 位置：jira/state/ticket-registry.yml

last_synced: 2026-04-10T15:30:00+08:00
total_tickets: 24

tickets:
  - id: FEAT-001
    type: feature
    title: 用户登录功能
    priority: P0
    status: done
    assignee: slaver_001
    sprint: SPRINT-001
    epic: EPIC-001
    created_at: 2026-04-01T10:00:00+08:00
    updated_at: 2026-04-05T16:30:00+08:00
    file_path: tickets/feature/FEAT-001.md

  - id: FEAT-002
    type: feature
    title: 权限管理 API
    priority: P0
    status: in_progress
    assignee: slaver_002
    sprint: SPRINT-001
    epic: EPIC-001
    created_at: 2026-04-01T11:00:00+08:00
    updated_at: 2026-04-10T14:00:00+08:00
    file_path: tickets/feature/FEAT-002.md
```

### 4.2 Redis 存储结构

```
# Hash: eket:ticket:{id}
HSET eket:ticket:FEAT-001 type "feature"
HSET eket:ticket:FEAT-001 title "用户登录功能"
HSET eket:ticket:FEAT-001 priority "P0"
HSET eket:ticket:FEAT-001 status "done"
HSET eket:ticket:FEAT-001 assignee "slaver_001"
HSET eket:ticket:FEAT-001 sprint "SPRINT-001"
HSET eket:ticket:FEAT-001 epic "EPIC-001"

# Sorted Set: eket:tickets:by-priority
ZADD eket:tickets:by-priority 1 "FEAT-001"  # P0=1, P1=2, P2=3, P3=4

# Sorted Set: eket:tickets:by-status
ZADD eket:tickets:by-status 6 "FEAT-001"  # backlog=1, analysis=2, ready=3, in_progress=4, review=5, done=6

# Set: eket:sprint:SPRINT-001:tickets
SADD eket:sprint:SPRINT-001:tickets "FEAT-001" "FEAT-002" "TASK-001"

# Set: eket:epic:EPIC-001:tickets
SADD eket:epic:EPIC-001:tickets "FEAT-001" "FEAT-002"
```

### 4.3 SQLite 表结构

```sql
-- Tickets 表
CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    assignee TEXT,
    sprint_id TEXT,
    epic_id TEXT,
    milestone_id TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sprint_id) REFERENCES sprints(id),
    FOREIGN KEY (epic_id) REFERENCES epics(id),
    FOREIGN KEY (milestone_id) REFERENCES milestones(id)
);

-- Sprints 表
CREATE TABLE sprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    theme TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL,
    goal TEXT,
    created_at TEXT NOT NULL
);

-- Epics 表
CREATE TABLE epics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    milestone_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (milestone_id) REFERENCES milestones(id)
);

-- Milestones 表
CREATE TABLE milestones (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    status TEXT NOT NULL,
    target_date TEXT,
    created_at TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_assignee ON tickets(assignee);
CREATE INDEX idx_tickets_sprint ON tickets(sprint_id);
CREATE INDEX idx_tickets_epic ON tickets(epic_id);
```

---

## 5. Master 职责

### 5.1 创建 Ticket 时

1. **确定层级归属**:
   - 所属 Milestone（长期目标）
   - 所属 Sprint（当前迭代）
   - 所属 Epic（功能模块）
   - 适配角色（frontend_dev/backend_dev/fullstack 等）

2. **更新索引文件**:
   - `INDEX.md` - 更新总计和状态概览
   - `by-milestone.md` - 添加到对应 Milestone
   - `by-sprint.md` - 添加到对应 Sprint
   - `by-role.md` - 添加到对应角色
   - `by-status.md` - 添加到 backlog/ready

3. **同步三方存储**:
   - 更新 `ticket-registry.yml`
   - 如 Redis/SQLite 可用，同步写入

### 5.2 Ticket 状态变更时

1. **更新原文件**: 修改 `status` 字段和 `updated_at`
2. **更新索引**: 在 `by-status.md` 中移动位置
3. **同步存储**: 更新 `ticket-registry.yml` 和三方存储

### 5.3 定期检查

Master 心跳检查时，应验证：
- 索引文件与实际 tickets 一致
- 无响应 tickets（超过 30 分钟无更新）
- 阻塞 tickets（等待依赖）

---

## 6. 自动化脚本

### 6.1 索引生成脚本

```bash
# 生成所有索引文件
./scripts/generate-jira-index.sh

# 同步到三方存储
./scripts/sync-ticket-registry.sh
```

### 6.2 CLI 命令

```bash
# Node.js CLI 命令
node dist/index.js ticket:index --rebuild       # 重建索引
node dist/index.js ticket:sync --to-redis       # 同步到 Redis
node dist/index.js ticket:sync --to-sqlite      # 同步到 SQLite
node dist/index.js ticket:stats                 # 显示统计数据
```

---

## 7. 相关文档

- [`TICKET-TEMPLATE.md`](./ticket-template.md) - Ticket 模板
- [`TICKET-NUMBERING.md`](./TICKET-NUMBERING.md) - 编号规则
- [`MASTER-WORKFLOW.md`](../docs/MASTER-WORKFLOW.md) - Master 工作流
- [`COMMUNICATION-PROTOCOL.md`](../docs/COMMUNICATION-PROTOCOL.md) - 通信协议

---

**维护者**: EKET Framework Team  
**版本**: v2.9.0  
**最后更新**: 2026-04-10
