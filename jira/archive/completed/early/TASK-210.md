# TASK-210: Memory Index 自动生成 + GC 机制

**优先级**: P1
**类型**: Feature
**模块**: node/src/commands/knowledge.ts, confluence/memory/
**来源**: GenericAgent借鉴研究 — L1自动索引 + 防膨胀
**工作量**: 1-2天

## 背景

当前 `confluence/memory/` 无索引层，Agent 冷启动需全量读取，随积累线性增长。
GenericAgent 的 L1 ≤30行索引证明：元认知导航层（存指针不存内容）是低成本解决方案。
EKET 版本：扫描目录自动生成索引（不依赖 LLM 手写），≤50行硬约束，超出触发 GC 提示。

## 需求

1. `knowledge:index --rebuild` 命令自动扫描 `confluence/memory/` 并生成 `memory-index.md`
2. `memory-index.md` 格式：`[文件名]: [首行摘要] #tag1 #tag2`，≤50行
3. 超出 50 行时输出警告 + 建议 GC（列出最久未修改的 10 个文件）
4. `knowledge:gc --dry-run` 命令：列出候选淘汰文件（90天未访问 + 无引用）

## 验收标准

- [x] `knowledge:index --rebuild` 扫描 `confluence/memory/**/*.md`，提取首行 + frontmatter tags
- [x] 生成 `confluence/memory/memory-index.md`，格式规范，≤50行硬约束
- [x] 超出50行：`[WARN] memory index exceeds 50 lines (N lines). Run knowledge:gc to prune.`
- [x] `knowledge:gc --dry-run`：按 `mtime` 排序，输出最久未修改的文件列表 + 文件大小
- [x] `knowledge:gc --execute`：删除候选文件前二次确认，删除后自动 `--rebuild` 索引
- [x] 单元测试：index 生成正确，50行截断警告，gc dry-run 输出格式
- [x] 文档：在 `confluence/memory/README.md` 说明 L0-L4 分层规范（对标 GenericAgent）

## 实现记录

**状态**: ✅ Done (2026-04-26)

**交付物**:
- `node/src/commands/knowledge.ts` — `knowledge:index --rebuild` + `knowledge:gc --dry-run/--execute`
- `confluence/memory/memory-index.md` — 初始生成（25 条目）
- `confluence/memory/README.md` — 补充 L0-L4 分层规范
- `node/tests/commands/knowledge.test.ts` — 16 tests all pass

**测试结果**: `Tests: 16 passed, 16 total`
