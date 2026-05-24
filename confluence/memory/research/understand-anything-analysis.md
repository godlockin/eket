# Understand-Anything 项目分析报告

> 分析时间: 2026-05-24  
> 项目地址: https://github.com/Lum1104/Understand-Anything  
> 版本: v2.7.5

## 项目定位

多平台 AI 代码理解插件，将代码库转换为可交互的知识图谱，支持 Claude Code / Copilot / Gemini / Cursor / Codex 等 12 个平台。

## 架构亮点

### 1. 多 Agent Pipeline (7 Phase)

```
Phase 0   → Pre-flight (worktree 检测)
Phase 0.5 → .understandignore 配置
Phase 1   → SCAN (project-scanner agent)
Phase 1.5 → BATCH (语义批次计算)
Phase 2   → ANALYZE (file-analyzer × 5 并发)
Phase 3   → ASSEMBLE REVIEW
Phase 4   → ARCHITECTURE (层识别)
Phase 5   → TOUR (学习路径)
Phase 6   → REVIEW (图验证)
Phase 7   → SAVE (指纹+元数据)
```

### 2. 确定性脚本 + LLM 混合

| 层 | 工具 | 职责 |
|---|---|---|
| 确定性 | scan-project.mjs | 文件枚举、语言检测 |
| 确定性 | extract-import-map.mjs | 导入解析 (12 种语言) |
| 确定性 | extract-structure.mjs | tree-sitter AST 提取 |
| 确定性 | merge-batch-graphs.py | 节点/边规范化、去重 |
| LLM | file-analyzer agent | summary/tags/complexity |
| LLM | architecture-analyzer agent | 层识别 |
| LLM | tour-builder agent | 学习路径 |

### 3. 知识图谱 Schema

- 21 种节点类型 (5 code + 8 non-code + 3 domain + 5 knowledge)
- 35 种边类型 (8 类别)
- Layer + Tour 内嵌数据结构

## 工程实践

### 批次分割

- compute-batches.mjs 按依赖关系聚类
- neighborMap 保留跨批次引用
- 每批 ≤60 节点 / ≤120 边
- 5 个 file-analyzer 并发

### 增量更新

```bash
git diff <lastCommitHash>..HEAD --name-only > changed-files.txt
node compute-batches.mjs --changed-files=changed-files.txt
```

### Dashboard

- React Flow + ELK layout
- Zustand 状态管理
- Token Gate 访问控制
- i18n 国际化 (en/zh/ja/ko/ru)

## EKET 可借鉴点

### P0 — 立即

1. **确定性脚本 + LLM 分离** — 用 tree-sitter 做结构提取，LLM 只做语义增强
2. **批次分割 + neighborMap** — 大任务拆解时保留跨批次依赖
3. **增量更新** — git diff + fingerprints 只重分析变更

### P1 — 中期

4. **Knowledge Graph Schema** — 扩展 ticket/memory 的节点和边类型
5. **Dashboard 技术选型** — 如果需要可视化

### P2 — 长期

6. **多平台兼容** — 抽象 skill 层适配不同 AI 工具
7. **国际化** — i18n 支持

## 不适用点

- 过重的 Dashboard (EKET 是 CLI 为主)
- tree-sitter WASM (EKET 有 Rust native 能力)
- 7 Phase Pipeline (EKET Master-Slaver 已足够灵活)

## 参考链接

- [README](https://github.com/Lum1104/Understand-Anything/blob/main/README.md)
- [CLAUDE.md](https://github.com/Lum1104/Understand-Anything/blob/main/CLAUDE.md)
- [设计文档](https://github.com/Lum1104/Understand-Anything/blob/main/docs/superpowers/specs/2026-03-14-understand-anything-design.md)
