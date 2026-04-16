# SETTINGS-PERMISSIONS.md — Claude Code settings.json 权限系统说明

**版本**: 1.0.0  
**创建时间**: 2026-04-15  
**相关文件**:
- `template/.claude/settings.master.json` — Master 实例权限配置
- `template/.claude/settings.slaver.json` — Slaver 实例权限配置

---

## 1. 为什么需要 settings.json 权限配置？

CLAUDE.md 中的规则（如"Master 禁止写代码"）属于**软约束**：它们是给 AI 模型的建议，在上下文压力大或对话轮次过多时可能被忽略。

`settings.json` 的权限配置属于**物理级强制约束**：Claude Code 在执行操作前会先检查 settings.json，被 deny 的操作将被直接阻断，无论上下文中有什么指令。

> **核心原则**（来自 Boris Cherny，Claude Code 创始人）：  
> **用 `settings.json` 强制执行确定性行为，而不是在 CLAUDE.md 中写"NEVER do X"。CLAUDE.md 是建议，settings.json 是执行。**

---

## 2. allow / ask / deny 三级语义

Claude Code 的 `settings.json` 支持三种权限级别，按照**优先级从高到低**：`deny` > `ask` > `allow`。

### 2.1 `deny` — 完全禁止

```json
"deny": ["Edit(node/src/**)", "Bash(git push --force origin main*)"]
```

- **含义**：匹配的操作**直接被阻断**，Claude 无法执行，也不会弹出确认对话框
- **使用场景**：强制执行角色职责边界，防止误操作破坏性变更
- **优先级最高**：deny 覆盖所有 allow 规则

### 2.2 `ask` — 执行前需确认

```json
"ask": ["Bash(git merge*)", "Bash(rm -rf*)"]
```

- **含义**：匹配的操作在执行前**弹出确认对话框**，用户批准后才执行
- **使用场景**：高风险但偶尔需要的操作（合并分支、删除文件等）
- **优先级居中**：被 deny 覆盖，可覆盖 allow

### 2.3 `allow` — 自动允许（无需确认）

```json
"allow": ["Read(*)", "Bash(git status*)"]
```

- **含义**：匹配的操作**自动执行**，无需用户确认
- **使用场景**：高频、低风险、角色必要的操作
- **优先级最低**：被 deny 和 ask 覆盖

### 2.4 优先级总结

```
deny（最高）→ 完全阻断
  ask（中） → 弹出确认
allow（低） → 自动执行
```

当一个操作**同时匹配 allow 和 ask 规则**时，ask 规则优先（需要确认）。  
当一个操作**同时匹配 allow/ask 和 deny 规则**时，deny 规则优先（直接阻断）。

---

## 3. 权限模式语法

Claude Code settings.json 支持以下操作类型和通配符：

### 3.1 操作类型

| 操作类型 | 说明 | 示例 |
|----------|------|------|
| `Read(pattern)` | 读取文件 | `Read(*)`, `Read(node/src/**)` |
| `Edit(pattern)` | 编辑已有文件 | `Edit(jira/**)`, `Edit(node/src/**)` |
| `Write(pattern)` | 创建或覆盖写入文件 | `Write(jira/**)`, `Write(node/src/**)` |
| `Bash(pattern)` | 执行 Shell 命令 | `Bash(git*)`, `Bash(npm run build*)` |

### 3.2 通配符规则

| 通配符 | 含义 | 示例 |
|--------|------|------|
| `*` | 匹配任意字符（不跨目录） | `Edit(*.json)` |
| `**` | 匹配任意字符（包括跨目录） | `Edit(node/**)` |
| 末尾 `*` | 匹配命令前缀 | `Bash(git*)`, `Bash(npm run build*)` |

---

## 4. Master 权限边界设计

**设计原则**：Master 是产品经理/Scrum Master，职责是**管理任务、协调流程、审查 PR**，不应直接写业务代码。

### 4.1 Master 允许的操作（allow）

| 操作 | 理由 |
|------|------|
| `Read(*)` | Master 需要全量只读权限来了解项目状态 |
| `Edit/Write(jira/**)` | Master 负责维护 Jira tickets（需求、优先级、验收标准） |
| `Edit/Write(confluence/**)` | Master 负责维护需求文档、架构文档 |
| `Edit/Write(inbox/**)` | Master 需要处理人类输入和反馈 |
| `Bash(git log/status/diff/fetch*)` | Master 需要查看项目状态（只读 git 操作） |
| `Bash(gh pr/issue*)` | Master 需要通过 GitHub CLI 管理 PR 和 Issue |
| `Bash(node dist/index.js gate:review*)` | Master 执行 gate review 流程 |
| `Bash(node dist/index.js task:*)` | Master 管理任务状态 |

### 4.2 Master 需要确认的操作（ask）

| 操作 | 理由 |
|------|------|
| `Bash(git merge*)` | 合并分支是高风险操作，需要明确确认 |
| `Bash(git push*)` | push 操作需要确认，避免意外推送 |
| `Edit/Write(template/**)` | 修改框架模板影响所有使用者，需谨慎 |
| `Edit/Write(scripts/**)` | 修改工具脚本可能破坏流程，需谨慎 |

### 4.3 Master 禁止的操作（deny）

| 操作 | 理由 |
|------|------|
| `Edit/Write(node/src/**)` | **核心红线**：Master 不得编写业务代码 |
| `Edit/Write(node/tests/**)` | **核心红线**：Master 不得编写测试代码 |
| `Edit(node/package.json)` | **核心红线**：Master 不得修改依赖配置 |
| `Bash(npm install*)` | Master 不应直接安装依赖 |
| `Bash(npm run build*)` | Master 不应直接执行构建操作 |

---

## 5. Slaver 权限边界设计

**设计原则**：Slaver 是执行工程师，职责是**领取任务、开发代码、提交 PR**，不应直接修改受保护分支或 Jira 元数据。

### 5.1 Slaver 允许的操作（allow）

| 操作 | 理由 |
|------|------|
| `Read(*)` | Slaver 需要读取所有文件来理解项目 |
| `Edit(*)`, `Write(*)` | Slaver 需要自由写代码（在 deny 约束范围外） |
| `Bash(git add/commit/checkout*)` | Slaver 日常 git 操作 |
| `Bash(git push origin feature/*)` | Slaver 可以 push 到 feature 分支 |
| `Bash(npm*)` | Slaver 可以执行所有 npm 命令（安装/测试/构建） |
| `Bash(node*)` | Slaver 可以执行 Node.js 脚本 |

### 5.2 Slaver 需要确认的操作（ask）

| 操作 | 理由 |
|------|------|
| `Bash(git push origin main*)` | push 到主干分支需要确认 |
| `Bash(git push origin miao*)` | push 到稳定主干需要确认 |
| `Bash(git push origin testing*)` | push 到测试分支需要确认 |
| `Bash(git reset --hard*)` | 破坏性重置操作需要确认 |
| `Bash(rm -rf*)` | 递归删除操作需要确认 |

### 5.3 Slaver 禁止的操作（deny）

| 操作 | 理由 |
|------|------|
| `Bash(git push --force origin main*)` | **核心红线**：禁止强制 push 到 main 分支 |
| `Bash(git push --force origin miao*)` | **核心红线**：禁止强制 push 到 miao 分支 |
| `Edit(jira/tickets/**)` | Slaver 不得修改 Jira 票证的元数据（优先级、验收标准等） |

---

## 6. 在 init-project.sh 中安装角色对应 settings

`scripts/init-project.sh` 在初始化时根据角色自动安装对应的 settings.json：

```bash
# 初始化 Master 时
cp template/.claude/settings.master.json .claude/settings.json

# 初始化 Slaver 时
cp template/.claude/settings.slaver.json .claude/settings.json
```

**安装后的效果**：
- 物理级强制约束立即生效
- Claude Code 在执行受限操作时自动阻断或弹出确认
- CLAUDE.md 中的软规则与 settings.json 硬规则互相补充

---

## 7. 常见权限模式参考

### 模式 A：只读分析角色

```json
{
  "permissions": {
    "allow": ["Read(*)"],
    "ask": [],
    "deny": ["Edit(**)", "Write(**)", "Bash(***)"]
  }
}
```

### 模式 B：文档维护角色

```json
{
  "permissions": {
    "allow": ["Read(*)", "Edit(docs/**)", "Write(docs/**)"],
    "ask": ["Edit(**)", "Write(**)"],
    "deny": ["Bash(git push --force*)", "Edit(node/src/**)"]
  }
}
```

### 模式 C：完整开发角色（默认 Slaver）

```json
{
  "permissions": {
    "allow": ["Read(*)", "Edit(*)", "Write(*)", "Bash(git*)", "Bash(npm*)", "Bash(node*)"],
    "ask": ["Bash(git push origin main*)", "Bash(rm -rf*)"],
    "deny": ["Bash(git push --force origin main*)", "Bash(git push --force origin miao*)"]
  }
}
```

---

## 8. 注意事项

1. **settings.json 必须是合法 JSON**：可用以下命令验证：
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('valid')"
   ```
2. **deny 规则优先级最高**：无论 allow 规则如何定义，deny 都会覆盖
3. **Bash 规则末尾的 `*` 是前缀匹配**：`Bash(git push --force*)` 会匹配所有以 `git push --force` 开头的命令
4. **settings.json 是实例级配置**：每个 Claude Code 实例根据自己的角色安装对应文件
5. **与 CLAUDE.md 互补**：settings.json 处理确定性约束，CLAUDE.md 提供上下文指导和复杂判断规则

---

## 9. 相关文档

- [CLAUDE.md](../CLAUDE.md) — 项目主指南（软规则）
- [TICKET-RESPONSIBILITIES.md](TICKET-RESPONSIBILITIES.md) — Ticket 职责边界
- [GATE-REVIEW-PROTOCOL.md](GATE-REVIEW-PROTOCOL.md) — Gate Review 协议
- [MASTER-WORKFLOW.md](MASTER-WORKFLOW.md) — Master 工作流
