# DYNAMIC-INJECTION.md — 动态 Shell 注入语法说明

**版本**: v1.0.0  
**最后更新**: 2026-04-15  
**适用范围**: EKET Master/Slaver CLAUDE.md 模板

---

## 1. 基本语法

Claude Code 支持在 CLAUDE.md 中使用 **`` !`command` ``** 语法进行动态 Shell 注入。

### 语法格式

```markdown
!`shell command here`
```

### 工作原理

1. Claude Code 加载 CLAUDE.md 时，自动执行 `` !`...` `` 中的 Shell 命令
2. 命令的 **stdout 输出**被注入到上下文，替换原始语法标记
3. 每次 Claude Code 启动（或重新加载上下文）时刷新

### 示例

```markdown
**当前分支**:
!`git branch --show-current 2>/dev/null || echo "unknown"`

**ready 任务数量**:
!`find jira/tickets -name "*.md" | xargs grep -l "^\*\*状态\*\*: ready" 2>/dev/null | wc -l | tr -d ' '`
```

加载后，上下文中显示实际输出，如：

```
**当前分支**: feature/TASK-032-dynamic-injection
**ready 任务数量**: 3
```

---

## 2. 安全原则

### ✅ 允许的命令（只读操作）

```bash
# 文件系统读取
find <dir> -name "*.md"
ls -la <dir>
cat <file>
head -N <file>
wc -l <file>

# Git 状态查询
git status --short
git log --oneline -N
git branch --show-current
git diff --stat

# GitHub CLI 查询
gh pr list --state open --json number,title
gh issue list --state open --json number,title

# 文本处理（组合使用）
grep -l "pattern" <files>
sed 's/old/new/'
awk '{print $1}'
sort | uniq
```

### ❌ 禁止的命令（有副作用）

```bash
# 写入操作
echo "text" > file.txt
tee, cp, mv, rm

# Git 写入操作
git add, git commit, git push
git checkout -b, git merge

# 系统操作
curl, wget（可能泄露信息）
npm install, pip install
docker run, docker exec

# 危险操作
rm -rf, chmod, chown
```

### 安全原则总结

1. **只读原则**：动态注入命令只能读取状态，不得修改任何文件或状态
2. **幂等原则**：相同命令多次执行，结果一致，无副作用
3. **降级原则**：命令失败时必须有 `|| echo "(fallback message)"` 兜底
4. **最小权限原则**：只读取必要的信息，避免过度扫描

---

## 3. Master 推荐注入模式

### 模式 A：任务队列状态

```markdown
**待执行任务（ready）**:
!`find jira/tickets -name "*.md" 2>/dev/null | xargs grep -l "^\*\*状态\*\*: ready" 2>/dev/null | sed 's|jira/tickets/||;s|\.md||' | sort | tr '\n' ' ' || echo "(无)"`
```

### 模式 B：PR 列表（需要 gh CLI）

```markdown
**待 Review 的 PR**:
!`gh pr list --base miao --state open --json number,title,headRefName 2>/dev/null | jq -r '.[] | "#\(.number) \(.title)"' | head -5 || echo "(无法获取)"`
```

### 模式 C：CI 状态

```markdown
**最新 CI 状态**:
!`gh pr list --base miao --state open --json number,statusCheckRollup 2>/dev/null | jq -r '.[] | "\(.number): \(.statusCheckRollup[0].state // "unknown")"' | head -3 || echo "(无法获取)"`
```

### 模式 D：Inbox 最新消息

```markdown
**最新 inbox 消息**:
!`ls -t inbox/human_feedback/*.md 2>/dev/null | head -3 | xargs -I{} sh -c 'echo "--- {} ---"; head -2 "{}"' 2>/dev/null || echo "(inbox 为空)"`
```

---

## 4. Slaver 推荐注入模式

### 模式 A：当前任务状态

```markdown
**我的当前任务**:
!`find jira/tickets -name "*.md" 2>/dev/null | xargs grep -l "^\*\*状态\*\*: in_progress" 2>/dev/null | sed 's|jira/tickets/||;s|\.md||' | head -5 || echo "(无领取中的任务)"`
```

### 模式 B：工作区分支状态

```markdown
**当前分支状态**:
!`git status --short 2>/dev/null | head -10 || echo "(无法读取 git 状态)"`
```

### 模式 C：可领取任务

```markdown
**可领取任务（ready）**:
!`find jira/tickets -name "*.md" 2>/dev/null | xargs grep -l "^\*\*状态\*\*: ready" 2>/dev/null | sed 's|jira/tickets/||;s|\.md||' | sort | head -10 || echo "(无 ready 任务)"`
```

---

## 5. 与静态内容的组合方式

动态注入最佳实践是**动静结合**：

```markdown
## 实时项目状态（启动时自动刷新）

<!-- 动态区块：每次加载时更新 -->
**待执行任务（ready）**:
!`find jira/tickets -name "*.md" | xargs grep -l "^\*\*状态\*\*: ready" 2>/dev/null | wc -l | tr -d ' '` 个任务等待执行

<!-- 静态区块：规则和约束，不变的内容 -->
## Master 职责（静态规则）

- 需求分析、任务拆解
- Slaver 团队初始化
- PR 审核（必须 CI 绿灯）
```

**推荐结构**：
1. 文件顶部：**动态区块**（实时状态、队列信息）
2. 文件中部：**角色职责**（静态规则，不常变）
3. 文件底部：**参考文档**（链接到详细说明）

---

## 6. 调试与故障排除

### 命令不执行

- 确认文件名为 `CLAUDE.md`（不是其他名称）
- 确认语法是 `` !`command` ``（反引号，不是单引号或双引号）

### 命令输出为空

检查命令是否有 fallback：
```markdown
!`your-command || echo "(fallback)"`
```

### 命令报错

使用 `2>/dev/null` 抑制错误输出：
```markdown
!`find jira/tickets -name "*.md" 2>/dev/null | head -5`
```

### 输出过长

使用 `head -N` 限制输出行数：
```markdown
!`gh pr list --json number,title 2>/dev/null | jq -r '.[].title' | head -5`
```

---

## 7. 参考

- [Claude Code 官方文档 - CLAUDE.md](https://docs.anthropic.com/claude-code)
- `template/CLAUDE.master.md` — Master 角色模板（含 5 处动态注入示例）
- `template/CLAUDE.slaver.md` — Slaver 角色模板（含 3 处动态注入示例）
