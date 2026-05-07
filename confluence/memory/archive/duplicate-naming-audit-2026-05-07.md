# 重复/相似命名审查报告 — 2026-05-07

## Executive Summary

发现 **5 类重复/职责混淆**：
1. `templates/` vs `template/` — Handlebars vs 框架模板
2. `.eket/` 多实例（4个）— 项目/子模块/框架各自维护
3. `scripts/` 多实例（6个）— 分散在各模块
4. `jira/templates/` vs `template/jira/templates/` — 职责重叠
5. `docs/` 多实例（4个）— 项目/子模块/框架文档

---

## 1. templates/ vs template/ ✅ 职责明确

| 目录 | 职责 | 内容 | 格式 |
|------|------|------|------|
| `templates/` | Handlebars 动态模板 | 9个 .hbs 文件 | `{{variable}}` |
| `template/` | EKET 框架完整模板 | 16个子目录 | 完整项目结构 |

**差异**:
- `templates/confluence/architecture-plan.md.hbs` — Handlebars 模板
- `template/confluence/` — 完整目录结构（memory/, templates/, projects/）

**结论**: ✅ 职责不同，**保持两者**

---

## 2. .eket/ 多实例（4个）⚠️ 需澄清

### 分析

| 路径 | 大小 | 内容 | 用途 |
|------|------|------|------|
| `.eket/` | 主实例 | IDENTITY.md, config.yml, data/, state/, slaver-id | **项目运行时状态** |
| `node/.eket/` | Node 子模块 | ACTIVE_CONTEXT.md, eket.db, slaver-id | **Node 测试/独立运行** |
| `rust/.eket/` | Rust 子模块 | eket.db, slaver-id | **Rust 测试** |
| `template/.eket/` | 框架模板 | IDENTITY.md, config.yml, version.yml | **新项目初始化模板** |

**问题**:
- 3个 `eket.db` 文件（项目/.eket/, node/.eket/, rust/.eket/）
- 3个 `slaver-id` 文件
- 数据一致性？

**建议**:

### 方案A: 统一到项目根（推荐）
```bash
# node/.eket/ 和 rust/.eket/ 仅用于测试隔离
# 生产运行统一用 .eket/
# 在 node/rust 的 .gitignore 排除 .eket/
```

### 方案B: 保持现状（多实例独立）
- 各子模块独立维护数据
- 风险：数据不一致、状态分裂

**优先级**: 🟡 中（需澄清数据一致性策略）

---

## 3. scripts/ 多实例（6个）✅ 职责分明

| 路径 | 文件数 | 用途 |
|------|--------|------|
| `scripts/` | 84 | **项目级脚本**（check-*, analyze-*, backup-*） |
| `node/scripts/` | 2 | Node 模块专用（send-message, start-test-env） |
| `template/scripts/` | 1子目录 | 框架模板脚本（hooks/） |
| `examples/e2e-collaboration/scripts/` | 4 | 示例专用（demo, cleanup） |
| `tests/integration/scripts/` | 1 | 测试专用（run-all-tests） |

**结论**: ✅ 职责清晰，**保持现状**

---

## 4. jira/templates/ vs template/jira/templates/ ⚠️ 职责重叠

### 对比

**jira/templates/** (14个):
```
feature-ticket.md
bugfix-ticket.md
doc-ticket.md
...
```
格式: `${VARIABLE}` (Shell 风格)

**template/jira/templates/** (14个):
```
feature-ticket.md
bugfix-ticket.md
doc-ticket.md
...
```
格式: `{{VARIABLE}}` (Handlebars 风格)

**diff 结果**: 161行差异（主要是变量语法）

**问题**:
- 两套相同内容的模板，仅语法不同
- 维护成本：修改需同步2处
- 职责混淆：哪个是权威版本？

**建议**:

### 方案A: 统一为 Handlebars（推荐）
```bash
# 删除 jira/templates/（Shell 风格）
# 保留 template/jira/templates/（Handlebars 风格）
# 项目运行时从 template/ 复制/软链接
```

### 方案B: 保留 Shell 风格给项目用
- `jira/templates/` — 项目实际使用（Shell 脚本调用）
- `template/jira/templates/` — 框架模板（Handlebars）

**推荐**: **方案A**（统一 Handlebars，减少维护负担）

---

## 5. docs/ 多实例（4个）✅ 职责分明

| 路径 | .md 文件数 | 用途 |
|------|-----------|------|
| `docs/` | 147 | **EKET 项目文档**（架构/ADR/路线图） |
| `node/docs/` | 1 | Node 模块文档 |
| `rust/docs/` | 1 | Rust 模块文档 |
| `template/docs/` | 40 | **框架规范模板**（MASTER-RULES.md等） |

**结论**: ✅ 职责清晰，**保持现状**

---

## 6. 其他发现

### .eket/templates/ 与 templates/ 重复？

**检查**:
```bash
ls .eket/templates/
# master-workflow.md, slaver-workflow.md

ls templates/
# confluence/, jira/ (Handlebars)
```

**结论**: ✅ 不同内容，无重复

---

## 综合建议

### 立即执行 ✅

**合并 jira/templates/ → template/jira/templates/**:
- 职责重叠，维护成本高
- 统一为 Handlebars 风格
- 删除 Shell 风格版本

### 需澄清 ⚠️

**统一 .eket/ 数据存储策略**:
- node/.eket/eket.db (20K)
- rust/.eket/eket.db (92K)
- .eket/eket.db (0B)
- 数据一致性如何保证？
- 是否应该统一到项目根？

### 保持现状 ✅

- `templates/` vs `template/` — 职责不同
- `scripts/` 多实例 — 职责分明
- `docs/` 多实例 — 职责分明

---

## 风险评估

| 操作 | 影响范围 | 风险 | 优先级 |
|------|---------|------|--------|
| 合并 jira/templates | 14文件 + 引用 | 中 | P1 |
| 统一 .eket/ 数据 | 3个DB文件 | 高 | P0（需先澄清） |

---

## Next Steps

1. 用户澄清 `.eket/` 数据策略
2. 合并 `jira/templates/` → `template/jira/templates/`
3. 更新所有引用路径
