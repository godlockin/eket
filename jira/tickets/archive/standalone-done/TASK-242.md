# TASK-242: task:claim 自动创建 git worktree 隔离工作区

**状态**: done  
**优先级**: P0  
**预估工时**: 480min  
**负责人**: slaver-rust  
**创建时间**: 2026-05-04  
**所属需求**: 团队协作4项需求 - 需求4（Slaver固定流程含workspace拆分）  
**所需专家**: Rust工程师  
**依赖**: 无  
**阻塞**: TASK-244（task:complete后通知解除阻塞）

---

## 背景

当前 `eket task:claim` 返回的 `worktree_path` 字段为空字符串（Phase 4 TODO）。Slaver 在主目录直接修改代码，无任何隔离。多个 Slaver 并行时存在冲突风险。

## 需求

`eket task:claim` 成功后自动执行：
```bash
git worktree add .worktrees/TASK-NNN feature/TASK-NNN-<slug>
```
并在返回 JSON 中填写 `worktree_path`。

## 验收标准

- [x] `eket task:claim` 执行后，`.worktrees/TASK-NNN/` 目录存在
- [x] JSON 输出 `worktree_path` 字段非空，值为绝对路径
- [x] 新 worktree 基于当前 HEAD 创建（或 `main`/`testing` 可配置）
- [x] 若 worktree 已存在（重复领取）则复用，不报错
- [x] `.worktrees/` 加入 `.gitignore`（若不存在则追加）
- [x] `eket task:complete TASK-NNN` 完成后自动移除 worktree（`git worktree remove --force`）
- [x] worktree 创建失败（非git仓库/磁盘满）只 warn，不阻断 claim

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/task_claim.rs`

```rust
// 在 claim 成功后，Step X：创建 worktree
fn create_worktree(project_root: &Path, ticket_id: &str, title_slug: &str) -> Result<PathBuf> {
    let branch = format!("feature/{}-{}", ticket_id, title_slug);
    let worktree_dir = project_root.join(".worktrees").join(ticket_id);
    
    // git worktree add <path> -b <branch> [--track origin/main]
    let status = Command::new("git")
        .args(["worktree", "add", &worktree_dir.to_string_lossy(), "-b", &branch])
        .current_dir(project_root)
        .status()?;
    
    if !status.success() {
        // 若分支已存在，尝试复用
        let _ = Command::new("git")
            .args(["worktree", "add", &worktree_dir.to_string_lossy(), &branch])
            .current_dir(project_root)
            .status();
    }
    Ok(worktree_dir)
}
```

**文件**: `rust/crates/eket-cli/src/commands/task_complete.rs`
- Step Final：`git worktree remove --force .worktrees/TASK-NNN`

**`.gitignore`**: 追加 `.worktrees/`

## 知识沉淀

完成后写入 `confluence/memory/` 记录 worktree 集成的坑和最佳实践。

---

## 实现细节（Slaver 填写）

**领取时间**: 2026-05-04  
**完成时间**: 2026-05-04  
**实现文件**:
- `rust/crates/eket-cli/src/commands/task_claim.rs` — 新增 `slugify`、`ensure_gitignore_entry`、`create_worktree` 三函数；claim 主流程调用后填充 `worktree_path`
- `rust/crates/eket-cli/src/commands/task_complete.rs` — 新增 `RemoveWorktree` SagaStep（Step 6），挂入 executor chain

**关键设计**:
1. `create_worktree` 先尝试 `-b` 创建新分支，失败则不带 `-b` 复用已有分支，worktree 目录已存在直接返回
2. `ensure_gitignore_entry` 幂等追加 `.worktrees/` 到项目 `.gitignore`
3. 任何 worktree 操作失败只 `eprintln!("[WARN]…")` 不阻断主流程
4. `RemoveWorktree.forward()` 检查目录存在性，不存在直接 Ok（幂等）

**编译验证**: `cargo build --release` — 0 errors, 2 warnings（已有警告，非本次引入）

**memory 文件**: `confluence/memory/patterns/git-worktree-eket-integration.md`
