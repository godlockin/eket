# TASK-152: CLI 命令签名对齐 — Rust vs Node 接口兼容性修复

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

通过对比分析，Rust CLI 命令与 Node.js 版本在以下方面存在不兼容：
1. Flag 名称不同（`--body` vs `--description`，`--limit` vs `--top`）
2. Flag 缺失（`--auto`、`--role`、`--draft`、`--reviewers` 等）
3. 命令语义不同（`gate:review` 审查的东西完全不同）
4. 输出格式不统一（Rust 全 JSON，Node 全 terminal UI）

Shell hybrid-adapter 依赖固定的命令签名，不兼容会导致现有 Slaver 脚本失效。

## 差异清单

### `task:create`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| 类型推断 | `--type` 手动 | 支持从 title 自动推断（可 override） |
| 优先级推断 | `--priority` 手动 | 支持关键词推断 |
| 依赖关系 | `--blocked-by` 逗号串 | 保持，但格式对齐 Node |
| 输出格式 | JSON | JSON（保持，Node 侧加 `--json` flag） |

### `task:claim`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| `--auto` / `-a` 缺失 | ❌ | ✅ 自动领取最高优先级 |
| `--role` / `-r` 缺失 | ❌ | ✅ 指定角色过滤 |
| worktree 路径 | 硬编码 `""` | 实际创建 git worktree |
| SSE 事件 | ❌ | ✅ 发布 `task_started`（依赖 TASK-141） |
| 输出字段 | `worktree_path: ""` | 实际路径 |

### `slaver:register`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| `--role` 默认值 | 无默认 | 从 `.eket/IDENTITY.md` 读取 |
| db-path 默认 | `~/.eket/eket.db` | 对齐 `~/.eket/data/sqlite/eket.db` |
| 扫描 ready tasks | ❌ | ✅（可选，`--scan-tasks` flag） |

### `gate:review`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| **审查对象** | PR CI checks（`gh pr checks`） | 也支持 ticket 内容审查 |
| `--auto-approve` | ❌ | ✅ |
| `--force-veto` | ❌ | ✅ |
| `--dry-run` | ❌ | ✅ |
| 输出 schema | `{ pass, checks[] }` | 扩展为 `{ decision, ticketId?, checks?, dimensions? }` |

### `submit:pr`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| `--description` | `--body` | 兼容 `--description` / `--body` 两者 |
| `--reviewers` 缺失 | ❌ | ✅ 逗号分隔 |
| `--draft` 缺失 | ❌ | ✅ |
| 平台支持 | GitHub only | 保持，文档注明限制 |

### `knowledge:index`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| 输入模式 | 单条 entry（`--ticket-id` required） | 增加 `--dir` 批量扫描目录 |
| `--ticket-id` | required | optional（批量时不需要） |
| 输出 | `{ ok, id }` 单条 | 批量时 `{ ok, indexed, failed }` |

### `knowledge:search`
| 问题 | 当前 Rust | 目标 |
|------|-----------|------|
| `--limit` | 默认 `10` | 对齐 `--top` 别名，默认 `5` |
| 增加 `--top` 别名 | ❌ | ✅ |

## 统一输出策略

**原则**：Rust 命令默认 JSON 输出（机器友好），加 `--human` flag 切换 terminal 展示。
Node 命令（Web Dashboard 层）保持 terminal UI。
Shell hybrid-adapter 使用 JSON 管道解析 Rust 输出。

```bash
# 示例：hybrid-adapter.sh 调用方式
RESULT=$(eket task:claim 2>/dev/null)
if [ $? -eq 0 ]; then
  TICKET_ID=$(echo "$RESULT" | jq -r '.ticket_id')
fi
```

## 验收标准

- [ ] 所有 flag 名称与 Node 版本对齐（或提供别名）
- [ ] `task:claim` 支持 `--auto` / `--role` 
- [ ] `gate:review` 支持 ticket 内容审查模式
- [ ] `submit:pr` 支持 `--description`（`--body` 别名）、`--draft`、`--reviewers`
- [ ] `knowledge:index` 支持 `--dir` 批量模式
- [ ] `knowledge:search` 支持 `--top` 别名，默认 5
- [ ] `slaver:register` db-path 默认值对齐
- [ ] hybrid-adapter.sh 更新为 JSON 解析模式
- [ ] 所有命令输出 JSON schema 文档化（`docs/cli-schema.md`）

## 不在本卡范围
- worktree 创建（依赖后续独立 ticket）
- SSE 事件发布（依赖 TASK-141）
- 新增命令（依赖 TASK-149）

## 负责人
待认领（推荐：Rust 工程师 + 后端工程师）
