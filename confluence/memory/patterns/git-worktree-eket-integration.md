---
title: Git Worktree 集成 EKET task:claim/complete 模式
category: pattern
source_ticket: TASK-242
created_at: 2026-05-04
review_status: accepted
---

# Git Worktree 集成 EKET task:claim/complete 模式

## 场景

EKET Slaver 在 `task:claim` 时需要自动创建隔离的 git worktree，避免多 Slaver 并行时文件冲突；`task:complete` 时自动清理。

## 实现方案

### claim 侧（task_claim.rs）

```rust
fn slugify(title: &str, max_len: usize) -> String {
    title.to_lowercase()
        .chars()
        .map(|c| if c == ' ' { '-' } else { c })
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(max_len)
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn create_worktree(project_root: &Path, ticket_id: &str, title: &str) -> Result<PathBuf, String> {
    let slug = slugify(title, 30);
    let branch = format!("feature/{}-{}", ticket_id, slug);
    let worktree_dir = project_root.join(".worktrees").join(ticket_id);
    if worktree_dir.exists() { return Ok(worktree_dir); } // 复用
    // 先尝试创建新分支
    let s = Command::new("git").args(["worktree", "add", &worktree_dir.to_string_lossy(), "-b", &branch])
        .current_dir(project_root).status();
    if matches!(s, Ok(st) if st.success()) { return Ok(worktree_dir); }
    // 分支已存在时复用
    let s2 = Command::new("git").args(["worktree", "add", &worktree_dir.to_string_lossy(), &branch])
        .current_dir(project_root).status();
    if matches!(s2, Ok(st) if st.success()) { Ok(worktree_dir) }
    else { Err(format!("Failed to create worktree for {}", ticket_id)) }
}
```

调用侧：失败只 warn，不阻断主流程：
```rust
let worktree_path = match create_worktree(&project_root, &ticket.id, &ticket.title) {
    Ok(p) => p.canonicalize().unwrap_or(p).display().to_string(),
    Err(e) => { eprintln!("[WARN] worktree: {e}"); String::new() }
};
```

### complete 侧（task_complete.rs）

作为 Saga Step 6 挂入：
```rust
struct RemoveWorktree;
impl SagaStep<CompleteState> for RemoveWorktree {
    async fn forward(&self, state: CompleteState) -> Result<CompleteState, ...> {
        let worktree_dir = state.project_root.join(".worktrees").join(&state.ticket_id);
        if !worktree_dir.exists() { return Ok(state); }
        let status = Command::new("git")
            .args(["worktree", "remove", "--force", &worktree_dir.to_string_lossy()])
            .current_dir(&state.project_root).status();
        // 失败只 warn，不中断 saga
        if !matches!(status, Ok(s) if s.success()) {
            eprintln!("[WARN] worktree remove failed");
        }
        Ok(state)
    }
}
```

### .gitignore 幂等追加

```rust
fn ensure_gitignore_entry(project_root: &Path) {
    let gitignore = project_root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == ".worktrees/") { return; }
    let new = if existing.ends_with('\n') || existing.is_empty() {
        format!("{}.worktrees/\n", existing)
    } else {
        format!("{}\n.worktrees/\n", existing)
    };
    let _ = std::fs::write(&gitignore, new);
}
```

## 关键坑（Pitfalls）

1. **`-b` vs 无 `-b`**：分支已存在时 `git worktree add -b <branch>` 会失败，需 fallback 到不带 `-b` 复用分支。两次都失败才算真正失败。
2. **worktree 目录已存在**：`git worktree add` 对已存在目录也会失败。需提前 `exists()` 检查直接复用。
3. **非 git 仓库**：`git` 命令直接返回错误退出码，`Command::status()` 返回 `Ok(non-zero)`，需正确判断 `s.success()`。
4. **Saga 中 worktree 清理**：`compensate` 无需操作（worktree 清理是单向的），只在 `forward` 中执行。
5. **`canonicalize()` 只对已存在路径有效**：新建 worktree 后立即 `canonicalize()` 即可，但若创建失败则路径不存在，需 `unwrap_or(p)` 降级。

## 验证方法

```bash
# 编译验证
cd rust && cargo build --release 2>&1 | grep -E "^error"

# 功能验证（需 git 仓库）
eket task:claim TASK-NNN
ls .worktrees/TASK-NNN/       # 目录存在
grep worktree_path <output>   # 非空绝对路径
cat .gitignore | grep .worktrees  # 已追加

eket task:complete TASK-NNN
ls .worktrees/TASK-NNN/       # 目录已删除
```
