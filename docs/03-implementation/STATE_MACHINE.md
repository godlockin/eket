# EKET Ticket 状态机

## 状态转换图

```
                                    ┌─────────────────────────────────────────┐
                                    │                                         │
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │  ┌─────────┐
    │ backlog │───→│ analysis│───→│ design  │───→│  dev    │───→│  test   │───→│ review  │
    └─────────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘  │  └────┬────┘
         │              │              │              │              │       │       │
         │              ↓              │              │              │       │       │
         │         needs_info          │              │              │       │       │
         │              │              │              │              │       │       │
         │              └──────────────┘              │              │       │       │
         │                                            │              │       │       │
         │                                            ↓              │       │       │
         │                                       approved            │       │       │
         │                                            │              │       │       │
         │                                            ↓              │       │       │
         │                                       ready               │       │       │
         │                                                             ↓     │       │
         │                                                          passed   │       │
         │                                                                    │       │
         │                                                                    ↓       │
         │                                                           changes_requested│
         │                                                                            │
         └────────────────────────────────────────────────────────────────────────────┘
                                      rejected
```

## 状态定义

| 状态 | 说明 | 负责角色 | 下一状态 |
|------|------|---------|---------|
| `backlog` | 初始状态，需求待分析 | 需求分析师 | `analysis` |
| `analysis` | 需求分析中 | 需求分析师 | `design`, `needs_info`, `backlog` |
| `needs_info` | 需要更多信息 | 人类/需求分析师 | `analysis`, `backlog` |
| `design` | 技术方案设计 | 技术经理 | `approved`, `dev` |
| `approved` | 设计方案已批准 | 技术经理 + 人类 | `ready`, `dev` |
| `ready` | 等待领取执行 | 执行智能体 | `dev` |
| `dev` | 开发执行中 | 执行智能体 | `test` |
| `test` | 测试验证中 | 测试智能体 | `passed`, `dev` |
| `passed` | 测试通过，等待 review | 协调智能体 | `review`, `dev` |
| `review` | PR Review 中 | 协调智能体 | `done`, `changes_requested` |
| `changes_requested` | 需要修改 | 执行智能体 | `dev` |
| `done` | 任务完成 | - | - |

## 状态转换规则

### 1. backlog → analysis
- **触发条件**: 人类创建需求或需求分析师领取任务
- **前置条件**: 需求文档完整
- **负责人**: 需求分析师

### 2. analysis → design
- **触发条件**: 需求分析完成，拆解为具体任务
- **前置条件**: 验收标准明确
- **负责人**: 需求分析师 → 技术经理

### 3. analysis → needs_info
- **触发条件**: 需求不明确或缺少关键信息
- **前置条件**: 需要人类确认
- **负责人**: 需求分析师

### 4. needs_info → analysis
- **触发条件**: 人类提供所需信息
- **前置条件**: 人类反馈已收到
- **负责人**: 需求分析师

### 5. design → approved
- **触发条件**: 技术方案设计完成，等待批准
- **前置条件**: 方案文档完整
- **负责人**: 技术经理

### 6. approved → ready
- **触发条件**: 人类批准方案
- **前置条件**: 人类确认
- **负责人**: 项目经理

### 7. ready → dev
- **触发条件**: 执行智能体领取任务
- **前置条件**: 智能体有空闲资源
- **负责人**: 执行智能体

### 8. dev → test
- **触发条件**: 开发完成，提交 PR
- **前置条件**: 代码审查通过，单元测试通过
- **负责人**: 执行智能体 → 测试智能体

### 9. test → passed
- **触发条件**: 所有测试通过
- **前置条件**: 测试覆盖率达标
- **负责人**: 测试智能体

### 10. test → dev
- **触发条件**: 测试失败，需要修复
- **前置条件**: 缺陷报告已创建
- **负责人**: 测试智能体 → 执行智能体

### 11. passed → review
- **触发条件**: 测试通过，请求最终 review
- **前置条件**: 测试报告完整
- **负责人**: 测试智能体 → 协调智能体

### 12. review → done
- **触发条件**: PR 合并
- **前置条件**: 所有审查意见已解决
- **负责人**: 协调智能体

### 13. review → changes_requested
- **触发条件**: PR 需要修改
- **前置条件**: 审查意见已列出
- **负责人**: 协调智能体 → 执行智能体

### 14. changes_requested → dev
- **触发条件**: 执行智能体开始修改
- **前置条件**: 审查意见已理解
- **负责人**: 执行智能体

## 状态文件位置

每个 Ticket 的状态存储在：
```
shared/jira/tickets/{ticket-id}/state.json
```

### 状态文件格式

```json
{
  "ticket_id": "FEAT-123",
  "current_state": "dev",
  "state_history": [
    {
      "state": "backlog",
      "timestamp": "2026-03-19T10:00:00Z",
      "actor": "agent_requirement_analyst"
    },
    {
      "state": "analysis",
      "timestamp": "2026-03-19T10:30:00Z",
      "actor": "agent_requirement_analyst"
    },
    {
      "state": "design",
      "timestamp": "2026-03-19T11:00:00Z",
      "actor": "agent_tech_manager"
    },
    {
      "state": "approved",
      "timestamp": "2026-03-19T14:00:00Z",
      "actor": "human_user"
    },
    {
      "state": "dev",
      "timestamp": "2026-03-19T14:30:00Z",
      "actor": "agent_frontend_dev"
    }
  ],
  "blocked_by": [],
  "blocks": ["FEAT-124"]
}
```

## 状态查询命令

```bash
# 查看单个 ticket 状态
./scripts/manage.sh ticket FEAT-123 status

# 查看所有进行中的任务
./scripts/manage.sh tasks --state dev,test,review

# 查看 blocked 任务
./scripts/manage.sh tasks --blocked

# 生成状态报告
./scripts/manage.sh report --output state-report.md
```

## 异常处理

### 长时间停滞

如果 ticket 在同一状态停滞超过阈值：

| 状态 | 阈值 | 处理方式 |
|------|------|---------|
| `needs_info` | 24 小时 | 自动提醒人类 |
| `approved` | 48 小时 | 自动提醒项目经理分配 |
| `dev` | 4 小时 | 请求协助或重新分配 |
| `review` | 2 小时 | 升级至技术经理 |

### 状态冲突

当检测到状态冲突时（如两个智能体同时修改）：
1. 使用文件锁机制
2. 先获取锁的智能体优先
3. 冲突记录到日志
4. 通知协调智能体仲裁
