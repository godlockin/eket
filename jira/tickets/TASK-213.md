# TASK-213: MerkleDAG增量索引 — knowledge:index只重索引变更文件

**优先级**: P1
**类型**: Feature
**模块**: node/src/commands/knowledge.ts, node/src/commands/knowledge-index.ts
**来源**: claude-context借鉴研究 — MerkleDAG增量同步
**工作量**: 2天

## 背景

`knowledge:index --rebuild` 目前是全量扫描 `confluence/memory/`，文件增多后每次重建成本线性增长。
借鉴 claude-context 的 MerkleDAG 增量同步：用 SHA-256 content hash 记录文件状态，
只重索引变更（新增/修改/删除）的文件。

## 需求

为 knowledge:index 引入增量模式，默认只处理变更文件，
`--rebuild` flag 强制全量重建。

## 验收标准

- [x] 新建 `.eket-index-state.json`（存于 `confluence/memory/` 目录）：
  ```json
  {
    "version": 1,
    "files": {
      "relative/path.md": {
        "sha256": "abc123...",
        "indexed_at": "2026-04-26T00:00:00Z",
        "entry_count": 5
      }
    },
    "last_full_rebuild": "2026-04-26T00:00:00Z"
  }
  ```
- [x] `knowledge:index`（无 `--rebuild`）：
  1. 读取 `.eket-index-state.json`
  2. 扫描所有 md 文件，计算 SHA-256
  3. 只处理：hash 变更的文件 + 新增文件 + 已删除文件（从索引移除）
  4. 更新 state 文件
- [x] `knowledge:index --rebuild`：忽略 state，全量重建，更新 state
- [x] 输出摘要：`Indexed 3 changed files (47 unchanged, 2 deleted) in 120ms`
- [x] state 文件写入前加文件锁（防多进程并发写）
- [x] 单元测试：首次建索引（无state）、增量检测变更文件、删除文件从索引移除、--rebuild 强制全量
- [x] state 文件加入 `.gitignore`（构建产物不提交）
