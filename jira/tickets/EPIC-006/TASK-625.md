# TASK-625: Git Branch 强制检查 hook

**优先级**: P0  
**状态**: `ready`  
**预估工时**: 1h  
**父级**: EPIC-006  
**角色**: devops

---

## 1. 任务描述

创建 pre-commit hook 拦截对 main/testing/miao 的直接提交。

**背景**: 2026-05-11 Master 违规直接在 miao 提交（应该 feature → PR → review）

---

## 2. 验收标准

- [ ] 创建 `.githooks/pre-commit-branch-check`
- [ ] 拦截受保护分支：main、testing、miao
- [ ] 输出错误提示：
  ```
  🔴 禁止直接提交到 miao 分支
  
  正确流程：
    1. git checkout -b feature/TASK-XXX
    2. git commit
    3. git push origin feature/TASK-XXX
    4. 创建 PR 等待 review
  
  紧急修复：git commit --no-verify（会被记录）
  ```
- [ ] 允许 --no-verify 绕过（但记录到审计日志）
- [ ] 安装：`git config core.hooksPath .githooks`
- [ ] 测试：在 miao 分支故意 commit 验证拦截

---

## 3. 实现

见 `confluence/memory/solutions/master-failure-defense-system.md` Layer 2

---

## 4. 依赖

**阻塞项**: 无  
**被阻塞**: 无

---

**创建时间**: 2026-05-11  
**创建者**: Master  
**触发**: Master 违规直接提交 miao
