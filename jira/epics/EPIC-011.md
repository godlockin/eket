# EPIC-011: 借鉴 Understand-Anything 的工程实践

## 背景

分析 [Understand-Anything](https://github.com/Lum1104/Understand-Anything) 项目后，识别出 3 个高价值借鉴点：

1. **确定性脚本 + LLM 分离** — 结构提取用脚本，语义增强用 LLM
2. **批次分割 + neighborMap** — 大任务拆解时保留跨批次依赖
3. **增量更新策略** — git diff + fingerprints 只重分析变更

## 目标

将这些实践融入 EKET 框架，提升：
- 分析准确性（确定性脚本不会幻觉）
- 大任务处理能力（批次分割）
- 执行效率（增量更新）

## 范围

| 优先级 | 领域 | 说明 |
|--------|------|------|
| P0 | 代码分析 | tree-sitter 集成 + 结构提取脚本 |
| P0 | 任务拆解 | 批次分割 + neighborMap 机制 |
| P1 | 增量更新 | fingerprint + git diff 检测 |
| P2 | Schema 扩展 | 非代码文件节点类型 |

## 验收标准

- [x] Rust CLI 支持 `eket analyze:structure <path>` 命令
- [x] 大 ticket 自动拆解时生成 neighborMap
- [x] 支持增量分析，只重分析变更文件
- [x] 文档更新

## 相关文档

- [分析报告](../../confluence/memory/research/understand-anything-analysis.md)
- [原项目 SKILL.md](https://github.com/Lum1104/Understand-Anything/blob/main/understand-anything-plugin/skills/understand/SKILL.md)

## 拆解任务

| Ticket | 标题 | 优先级 | 估时 |
|--------|------|--------|------|
| TASK-E11-001 | 集成 tree-sitter 做代码结构提取 | P0 | 8h |
| TASK-E11-002 | 实现批次分割 + neighborMap 机制 | P0 | 6h |
| TASK-E11-003 | 实现 fingerprint 增量更新检测 | P1 | 4h |
| TASK-E11-004 | 扩展 ticket schema 支持非代码文件 | P2 | 3h |
| TASK-E11-005 | 文档更新 + 使用指南 | P2 | 2h |

---

**状态**: `done`  
**创建时间**: 2026-05-24  
**完成时间**: 2026-05-24  
**来源**: Understand-Anything 项目分析
