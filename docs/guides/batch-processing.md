# 批次处理指南

**版本**: 2.14.0-beta | **最后更新**: 2026-05-24 | **依赖 EPIC**: EPIC-011

> 批次处理将大型分析任务拆分为可管理的小块，支持断点续跑和资源控制。

---

## 前置要求

- EKET CLI 已安装（`eket --version` 返回 2.14.0+）
- 项目结构已提取（`eket analyze:structure` 已运行）
- 了解 [增量分析指南](incremental-analysis.md)（可选但推荐）

---

## 为什么需要批次处理

| 问题 | 批次处理解决方案 |
|------|-----------------|
| LLM 上下文窗口限制 | 每批控制在 token 限制内 |
| 长任务中断后需重头开始 | 支持断点续跑 |
| 并发分析节点分工 | neighborMap 保证上下文完整性 |
| 资源消耗不可预测 | 预先计算批次，精确评估 |

---

## 批次计算

### 基本用法

```bash
eket batch:compute src/ --max-nodes 60 --output .eket/batches.json
```

### 输出结构

```json
{
  "version": "1.0",
  "computed_at": "2026-05-24T10:30:00Z",
  "total_files": 150,
  "total_batches": 8,
  "batches": [
    {
      "id": "batch-001",
      "files": ["src/core/election.rs", "src/core/queue.rs", ...],
      "node_count": 58,
      "estimated_tokens": 12000,
      "neighborMap": {
        "src/core/election.rs": ["src/core/queue.rs", "src/utils/redis.rs"]
      }
    }
  ]
}
```

### 输出字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 批次唯一标识 |
| `files` | string[] | 本批次包含的文件路径 |
| `node_count` | number | AST 节点数（函数+类+导入+导出） |
| `estimated_tokens` | number | 预估 LLM token 消耗 |
| `neighborMap` | object | 文件的直接依赖关系，用于保证上下文完整性 |

---

## neighborMap 机制

### 什么是 neighborMap

`neighborMap` 记录每个文件的直接依赖文件。分析时，除了本批次文件，还会加载 neighborMap 中的文件摘要，确保 LLM 理解跨文件引用。

### 示例

```
src/services/auth.ts
├── imports: src/utils/crypto.ts
├── imports: src/models/user.ts
└── imports: src/config/env.ts
```

即使 `crypto.ts` 不在当前批次，LLM 也会收到其摘要：

```
[Context: src/utils/crypto.ts]
- hashPassword(password: string): string
- verifyPassword(password: string, hash: string): boolean
```

### 控制 neighborMap 深度

```bash
# 默认深度 1（直接依赖）
eket batch:compute src/ --neighbor-depth 1

# 深度 2（依赖的依赖）
eket batch:compute src/ --neighbor-depth 2

# 禁用 neighborMap
eket batch:compute src/ --neighbor-depth 0
```

---

## 批次分割策略

### 默认策略：按目录聚合

```
src/
├── core/          → Batch 1-2
├── services/      → Batch 3-4
├── utils/         → Batch 5
└── models/        → Batch 6
```

同目录文件优先放入同一批次，最大化共享上下文。

### 自定义策略

```bash
# 按文件类型分组
eket batch:compute src/ --strategy by-type

# 按依赖图深度优先
eket batch:compute src/ --strategy dependency-first

# 使用配置文件
eket batch:compute src/ --config .eket/batch-config.json
```

**batch-config.json 示例**：

```json
{
  "max_nodes": 40,
  "max_tokens": 10000,
  "strategy": "dependency-first",
  "neighbor_depth": 1,
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "priority_dirs": ["src/core", "src/services"]
}
```

---

## 执行批次任务

### 串行执行

```bash
# 执行所有批次
eket analyze:batch --input .eket/batches.json

# 执行指定批次
eket analyze:batch --input .eket/batches.json --batch-id batch-003

# 从指定批次恢复
eket analyze:batch --input .eket/batches.json --resume-from batch-003
```

### 并行执行（多 Slaver 协作）

```bash
# Slaver 1
eket analyze:batch --input .eket/batches.json --batch-range 1-4

# Slaver 2
eket analyze:batch --input .eket/batches.json --batch-range 5-8
```

### 断点续跑

批次执行状态保存在 `.eket/batch-progress.json`：

```json
{
  "completed": ["batch-001", "batch-002"],
  "in_progress": "batch-003",
  "failed": [],
  "last_checkpoint": "2026-05-24T10:45:00Z"
}
```

中断后重新运行，自动从上次位置继续：

```bash
eket analyze:batch --input .eket/batches.json --resume
```

---

## 典型场景

### 场景 1：大型代码库首次分析

```bash
# 1. 提取结构
eket analyze:structure src/ --output .eket/structure.json

# 2. 计算批次（保守设置）
eket batch:compute src/ --max-nodes 40 --output .eket/batches.json

# 3. 查看批次概览
cat .eket/batches.json | jq '.total_batches, .batches[].node_count'

# 4. 分批执行
eket analyze:batch --input .eket/batches.json
```

### 场景 2：多 Slaver 并行分析

```bash
# Master 分配任务
eket batch:compute src/ --output .eket/batches.json
eket task:create --type batch-analysis \
  --data '{"batches": ".eket/batches.json", "range": "1-4"}' \
  --assign slaver-backend-001

eket task:create --type batch-analysis \
  --data '{"batches": ".eket/batches.json", "range": "5-8"}' \
  --assign slaver-backend-002
```

### 场景 3：CI/CD 中的增量批次

```yaml
- name: Incremental Batch Analysis
  run: |
    # 获取变更文件
    changed=$(eket fingerprint:diff --baseline .eket/fingerprints.json --format list)
    
    # 只对变更文件计算批次
    echo "$changed" | eket batch:compute --stdin --output .eket/delta-batches.json
    
    # 执行
    eket analyze:batch --input .eket/delta-batches.json
```

---

## 性能调优

### 批次大小建议

| 项目规模 | max-nodes | 预估批次数 | 单批次耗时 |
|----------|-----------|------------|------------|
| 小型 (<100 files) | 80-100 | 1-3 | ~1 min |
| 中型 (100-500 files) | 50-60 | 5-15 | ~2 min |
| 大型 (>500 files) | 30-40 | 20+ | ~3 min |

### 内存优化

```bash
# 限制 neighborMap 缓存大小
eket batch:compute src/ --neighbor-cache-size 100

# 流式处理（低内存模式）
eket analyze:batch --input .eket/batches.json --streaming
```

---

## 常见问题

### Q: 批次之间的分析结果如何合并？

**A**: 自动合并。每个批次输出增量结果到 `.eket/results/batch-{id}.json`，最终合并到 `.eket/analysis.json`。

### Q: 某个批次失败了怎么办？

**A**: 使用 `--resume` 重试，或单独重跑失败批次：

```bash
# 查看失败批次
cat .eket/batch-progress.json | jq '.failed'

# 单独重跑
eket analyze:batch --input .eket/batches.json --batch-id batch-003 --retry
```

### Q: neighborMap 导致批次重叠怎么办？

**A**: neighborMap 只提供摘要上下文，不会重复分析。即使 `file-A` 出现在多个批次的 neighborMap 中，它只会被完整分析一次（在其主批次中）。

### Q: 如何估算总耗时？

**A**: 

```bash
# 查看预估
eket batch:compute src/ --output .eket/batches.json --estimate

# 输出
# Total batches: 12
# Estimated time: 24-36 minutes
# Token budget: ~120K tokens
```

---

## 下一步

- [增量分析指南](incremental-analysis.md) — 结合 fingerprint 进一步优化
- [CLI 命令参考](../reference/cli-reference.md) — 完整命令参数
- [架构文档](../architecture/analysis-architecture.md) — 理解批次分割算法
