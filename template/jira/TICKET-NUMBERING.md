# EKET Ticket 编号管理规范

**版本**: 1.0
**创建时间**: 2026-03-28

---

## 1. Ticket 编号规则

### 1.1 编号格式

所有 Ticket 采用统一的编号格式：`{PREFIX}-{SEQUENCE_NUMBER}`

- **PREFIX**: 大写英文字母前缀，表示 Ticket 类型
- **SEQUENCE_NUMBER**: 3 位数字序号，从 001 开始递增

### 1.2 Ticket 类型与前缀

| 类型 | 前缀 | 编号示例 | 用途说明 |
|------|------|----------|----------|
| **功能需求卡** | `FEAT` | `FEAT-001`, `FEAT-002` | 功能开发任务，用户故事实现 |
| **任务卡** | `TASK` | `TASK-001`, `TASK-002` | 一般任务（文档、重构、调研等） |
| **缺陷修复卡** | `FIX` | `FIX-001`, `FIX-002` | Bug 修复任务 |
| **测试卡** | `TEST` | `TEST-001`, `TEST-002` | 测试编写任务（单元/集成/E2E） |
| **产品需求卡** | `PRD` | `PRD-001`, `PRD-002` | 产品需求文档编写任务 |
| **UI/UX设计卡** | `U-DESIGN` | `U-DESIGN-001`, `U-DESIGN-002` | 界面/用户体验设计任务 |
| **技术设计卡** | `T-DESIGN` | `T-DESIGN-001`, `T-DESIGN-002` | 架构/技术设计任务 |
| **部署卡** | `DEPL` | `DEPL-001`, `DEPL-002` | 部署/发布任务 |

---

## 2. 编号生成规则

### 2.1 序号管理

- 每种类型的 Ticket 独立计数
- 序号从 `001` 开始，每次递增 1
- 序号不足 3 位时，前面补零（如：`FEAT-001`）

### 2.2 编号生成位置

编号由 Master Agent 在创建 Ticket 时自动生成：

```bash
# 查找当前最大序号
NEXT_NUM=$(($(find jira/tickets/feature/ -name "FEAT-*.md" 2>/dev/null | \
    sed -n 's/.*FEAT-\([0-9]*\).md/\1/p' | sort -n | tail -1) + 1))

# 生成新编号
NEW_ID="FEAT-$(printf '%03d' $NEXT_NUM)"
```

### 2.3 编号存储

每个 Ticket 文件的元数据区域必须包含编号信息：

```markdown
# Feature Ticket: FEAT-001 - 用户登录功能

**Ticket ID**: FEAT-001
**创建时间**: 2026-03-28T10:30:00+08:00
**创建者**: Master Agent
```

---

## 3. Ticket 使用场景

### 3.1 功能开发流程

```
PRD-001 (产品需求)
    ↓
T-DESIGN-001 (技术设计)
    ↓
U-DESIGN-001 (UI/UX 设计)
    ↓
FEAT-001 (功能开发)
    ↓
TEST-001 (测试编写)
    ↓
DEPL-001 (部署发布)
```

### 3.2 Bug 修复流程

```
FIX-001 (Bug 修复)
    ↓
TEST-001 (回归测试，如需要)
    ↓
DEPL-001 (热修复部署)
```

### 3.3 依赖关系

Ticket 之间的依赖关系在元数据中声明：

```yaml
# FEAT-005 的依赖关系
dependencies:
  blocks: []  # 本任务阻塞的任务
  blocked_by:
    - PRD-001     # 依赖产品需求
    - T-DESIGN-001 # 依赖技术设计
  related:
    - U-DESIGN-001 # 关联 UI 设计
  external: []    # 外部依赖
```

---

## 4. Ticket 目录结构

```
jira/
├── tickets/
│   ├── feature/       # FEAT 功能卡
│   │   ├── FEAT-001.md
│   │   ├── FEAT-002.md
│   │   └── ...
│   ├── task/          # TASK 任务卡
│   │   ├── TASK-001.md
│   │   └── ...
│   ├── bugfix/        # FIX 缺陷卡
│   │   ├── FIX-001.md
│   │   └── ...
│   ├── test/          # TEST 测试卡
│   │   ├── TEST-001.md
│   │   └── ...
│   ├── prd/           # PRD 产品需求卡
│   │   ├── PRD-001.md
│   │   └── ...
│   ├── design/
│   │   ├── ui/        # U-DESIGN UI 设计卡
│   │   │   ├── U-DESIGN-001.md
│   │   │   └── ...
│   │   └── tech/      # T-DESIGN 技术设计卡
│   │       ├── T-DESIGN-001.md
│   │       └── ...
│   └── deployment/    # DEPL 部署卡
│       ├── DEPL-001.md
│       └── ...
├── epics/             # Epic 文档
│   └── EPIC-001.md
└── index/             # 索引
    ├── by-feature/
    ├── by-status/
    └── by-assignee/
```

---

## 5. Ticket 状态机

### 5.1 通用状态

```
backlog → analysis → approved → design → ready → in_progress → review → done
```

### 5.2 各类型 Ticket 的状态流转

| Ticket 类型 | 状态流转 |
|------------|----------|
| **FEAT** | `backlog` → `analysis` → `approved` → `design` → `ready` → `in_progress` → `design_review` → `testing` → `review` → `done` |
| **TASK** | `backlog` → `ready` → `in_progress` → `documentation` → `testing` → `review` → `done` |
| **FIX** | `backlog` → `analysis` → `ready` → `in_progress` → `testing` → `review` → `done` |
| **TEST** | `backlog` → `ready` → `in_progress` → `testing` → `review` → `done` |
| **PRD** | `backlog` → `analysis` → `drafting` → `review` → `approved` → `done` |
| **U-DESIGN** | `backlog` → `analysis` → `concept` → `draft` → `review` → `approved` → `done` |
| **T-DESIGN** | `backlog` → `analysis` → `draft` → `review` → `approved` → `done` |
| **DEPL** | `backlog` → `ready` → `in_progress` → `preparing` → `dry_run` → `staging` → `production` → `verifying` → `done` |

---

## 6. Ticket 关联规则

### 6.1 Epic 与 Feature

- 一个 Epic 可以包含多个 Feature
- Feature 必须归属于一个 Epic

```markdown
## 元数据
**Epic**: EPIC-001  # 所属 Epic
```

### 6.2 Feature 与 Task

- Feature 可以拆解为多个 Task
- Task 可以独立执行

### 6.3 Feature 与 Test

- 每个 Feature 应该至少有一个关联的 Test
- Test 可以验证一个或多个 Feature

### 6.4 Bug 与 Feature

- Bug 可能是由某个 Feature 引入的
- 修复 Bug 可能需要修改 Feature

---

## 7. Ticket 管理命令

### 7.1 创建 Ticket

```bash
# 使用 CLI 命令创建
eket-cli ticket:create --type feat --title "用户登录功能"

# 输出：Created ticket FEAT-001
```

### 7.2 查询 Ticket

```bash
# 查询特定类型的 Ticket
eket-cli ticket:list --type feat --status ready

# 查询特定编号的 Ticket
eket-cli ticket:get FEAT-001
```

### 7.3 更新状态

```bash
# 更新 Ticket 状态
eket-cli ticket:update FEAT-001 --status in_progress
```

---

## 8. 最佳实践

### 8.1 Ticket 粒度

- **FEAT**: 2-5 天可完成的功能
- **TASK**: 0.5-2 天可完成的任务
- **FIX**: 0.5-1 天可修复的 Bug
- **TEST**: 1-2 天可完成的测试
- **PRD**: 1-3 天可完成的需求文档
- **U-DESIGN**: 1-3 天可完成的设计
- **T-DESIGN**: 1-3 天可完成的技术设计
- **DEPL**: 0.5-1 天可完成的部署

### 8.2 Ticket 命名

- 使用简洁明确的标题
- 包含关键信息（功能名、模块名）
- 避免模糊词汇（如"优化"、"改进"）

**好的示例**:
- `FEAT-001: 实现用户登录功能（JWT 认证）`
- `FIX-001: 修复登录页面在 Safari 下的样式问题`

**不好的示例**:
- `FEAT-001: 用户功能` (太模糊)
- `FIX-001: 修 bug` (不明确)

### 8.3 Ticket 关联

- 在创建子任务时，明确声明依赖关系
- 使用 `blocked_by` 和 `blocks` 追踪依赖
- 定期检查和更新依赖关系

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-28
