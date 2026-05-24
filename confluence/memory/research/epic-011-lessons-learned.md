# EPIC-011 经验教训

> 借鉴 Understand-Anything 工程实践的复盘

## 项目概况

| 指标 | 数据 |
|------|------|
| 耗时 | ~90 分钟（专家分析 + 并行实现 + AB Review + 修复） |
| 代码量 | 11,263 行新增 |
| 测试 | 554 passed |
| 高优问题 | 4 个（全部修复） |

## 成功实践

### 1. 专家组领卡模式效果显著

**做法**：5 位专家并行分析各自领取的 ticket，从不同视角细化方案

| 专家 | 视角 | 产出 |
|------|------|------|
| 陈架构 | 系统架构 | Query-based 提取、OnceLock 延迟加载、两阶段算法渐进 |
| 数据张 | 数据工程 | 三层存储架构、两阶段过滤、Merkle Tree 稳定化 |
| 老码 | 代码质量 | 类型安全问题、边界情况、60+ 测试用例 |
| 内容孙 | 内容策略 | 金字塔四层文档结构、用户旅程设计 |

**效果**：比单人分析更全面，发现了更多边界情况

### 2. 并行 Slaver 实现效率高

**做法**：5 个 Slaver 同时实现各自模块

**问题**：并行实现导致模块间 API 不一致（如 `compute_fingerprint_auto` vs `compute_fingerprint`）

**解决**：Master 整合时统一修复

**改进**：下次应先定义模块间接口契约，再并行实现

### 3. AB Review + 对抗测试发现真实问题

| 测试类型 | 发现问题 |
|----------|----------|
| AB Review | 4 高优 + 6 中优 + 5 低优 |
| 对抗测试 | 49 项测试通过，4 个低优漏洞 |

**关键发现**：
- 递归函数无深度限制 → 栈溢出风险
- 大文件无保护 → OOM 风险
- `expect()` 滥用 → panic 风险

## 需要改进

### 1. 并行实现的接口契约

**问题**：多个 Slaver 并行实现时，对 API 命名和签名理解不一致

**改进**：
- 实现前先定义 `.rs` 接口文件（trait + 类型签名）
- 或用 `mod.rs` 先写好 `pub use` 导出清单

### 2. expect() 应改为 ? 传播

**现状**：28 处 `expect()` 用于 tree-sitter 语言设置

**风险**：语法加载失败会 panic

**改进**：统一改为 `?` 返回 `EketResult`

### 3. 提取器代码重复

**现状**：4 个语言提取器各自实现 `collect_errors`、`get_capture_text` 等

**改进**：提取到 `extractors/common.rs`

## 技术决策记录

### 为什么用 Union-Find 而不是 Louvain？

- EKET 场景多为中小项目（100-500 文件）
- 依赖图稀疏，社区结构不明显
- Union-Find 复杂度 O(n)，20 行代码
- Louvain 在大 monorepo 场景再引入

### 为什么用 DashMap 而不是 moka？

- DashMap 更轻量，无 TTL 需求
- fingerprint 缓存不需要 LRU 淘汰
- moka 适合有 TTL 需求的场景

### 为什么 Meta 文件名优先于扩展名？

- `LICENSE.md` 应是 Meta 而非 Docs
- 文件名语义（LICENSE/CHANGELOG）比扩展名更重要
- 保持与 GitHub 默认行为一致

## 可复用模式

### 1. 确定性脚本 + LLM 分离

```
结构提取（tree-sitter）→ 100% 可复现
语义增强（LLM）→ 只处理 summary/tags
```

适用场景：任何需要"提取 + 理解"的任务

### 2. 两阶段过滤

```
content_hash 先过滤 → 节省 60-70% 计算
structure_hash 再分类 → 区分 COSMETIC/STRUCTURAL
```

适用场景：增量处理大量文件

### 3. neighborMap 跨边界信息补偿

```
批次分割 → 丢失跨批次依赖
neighborMap → 记录跨边界符号引用
```

适用场景：大任务拆解后保持上下文

## 下一步行动

- [ ] 将 28 处 `expect()` 改为 `?`（中优）
- [ ] 提取 `extractors/common.rs`（低优）
- [ ] 添加 tree-sitter 解析超时（中优）
- [ ] 预构建 HashMap 优化 O(n) 文件查找（低优）

---

**记录时间**：2026-05-24
**记录人**：Master
