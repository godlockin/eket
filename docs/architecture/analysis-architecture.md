# 代码分析架构

**版本**: 2.14.0-beta | **最后更新**: 2026-05-24 | **依赖 EPIC**: EPIC-011

> 确定性脚本 + LLM 分离的混合架构设计，实现可重复、可断点、高效的代码分析。

---

## 前置要求

- 理解 [四级降级架构](degradation.md)
- 了解 tree-sitter AST 解析基础（可选）

---

## 设计目标

| 目标 | 实现方式 |
|------|----------|
| **可重复性** | 确定性操作（AST 解析、哈希计算）结果幂等 |
| **断点续跑** | 中间结果用 JSON 持久化，任意步骤可重入 |
| **成本可控** | LLM 只处理语义层，结构层零 token 消耗 |
| **增量优化** | fingerprint 机制识别变更，跳过未修改文件 |

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        确定性层 (Deterministic)                      │
│                            Rust / Node.js                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│  │  tree-sitter │   │  Fingerprint │   │    Batch     │             │
│  │  AST 解析    │ → │   计算       │ → │   分割       │             │
│  └──────────────┘   └──────────────┘   └──────────────┘             │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│  │ structure.   │   │ fingerprints │   │  batches.    │             │
│  │ json         │   │ .json        │   │  json        │             │
│  └──────────────┘   └──────────────┘   └──────────────┘             │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                          语义层 (Semantic)                           │
│                              LLM                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│  │   Summary    │   │    Tags      │   │  Complexity  │             │
│  │   生成       │   │    标注      │   │  评估        │             │
│  └──────────────┘   └──────────────┘   └──────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 确定性层

### 职责

| 组件 | 输入 | 输出 | 特性 |
|------|------|------|------|
| **tree-sitter 解析** | 源代码文件 | AST 节点列表 | 相同输入 = 相同输出 |
| **导入关系提取** | AST | 依赖图 | 静态分析，无副作用 |
| # 为什么不用 LLM 做这些？

| 操作 | LLM 问题 | 确定性方案 |
|------|----------|------------|
| 列出文件 | 幻觉、遗漏 | `fs.readdir` |
| 解析导入 | 语法错误、不稳定 | tree-sitter |
| 计算哈希 | 无法执行 | SHA-256 |
| 批次分割 | 非确定性、成本高 | 图算法 |

### 技术选型

**tree-sitter** 用于 AST 解析：
- 增量解析（编辑时只重解析变更部分）
- 多语言统一接口
- 性能优异（Rust 实现）

**支持的语言**：

| 语言 | tree-sitter grammar | 状态 |
|------|---------------------|------|
| TypeScript / JavaScript | tree-sitter-typescript | 完整 |
| Rust | tree-sitter-rust | 完整 |
| Python | tree-sitter-python | 完整 |
| Go | tree-sitter-go | 完整 |
| Java | tree-sitter-java | 基础 |
| C/C++ | tree-sitter-c/cpp | 基础 |

---

## 语义层

### 职责

| 任务 | LLM 优势 | 示例 |
|------|----------|------|
| **Summary 生成** | 理解代码意图 | "实现 Redis 分布式锁" |
| **Tags 标注** | 领域知识 | `["authentication", "security"]` |
| **Complexity 评估** | 综合判断 | `high` (多层嵌套 + 状态机) |
| **Architecture Layer** | 模式识别 | `infrastructure`, `domain`, `application` |

### 输入输出

**输入**（来自确定性层）：
```json
{
  "file": "src/core/election.rs",
  "functions": [
    {
      "name": "elect_master",
      "params": ["config: &Config"],
      "return_type": "Result<bool>",
      "body_preview": "pub fn elect_master..."
    }
  ],
  "neighborContext": {
    "src/utils/redis.rs": "Redis 连接池管理"
  }
}
```

**输出**（LLM 生成）：
```json
{
  "file": "src/core/election.rs",
  "summary": "分布式 Master 选举实现",
  "tags": ["distributed", "election", "redis"],
  "complexity": "medium",
  "layer": "infrastructure"
}
```

---

## 数据流

```
源代码 -> analyze:structure -> structure.json
                  |
                  v
           fingerprint:build -> fingerprints.json
                  |
                  v
            batch:compute -> batches.json
                  |
                  v
         analyze:batch (LLM) -> analysis.json
```

---

## neighborMap 设计

### 问题

批次分析时，单独处理每个文件会丢失跨文件上下文。

### 解决方案

neighborMap 为每个文件记录直接依赖，分析时注入上下文摘要：

```json
{
  "neighborMap": {
    "src/services/auth.ts": ["src/utils/crypto.ts"]
  }
}
```

---

## Trade-offs

| 决策 | 选择 | 理由 |
|------|------|------|
| 结构提取 | tree-sitter | 确定性、高性能、多语言 |
| 中间格式 | JSON | 可读、可编辑、通用 |
| 批次策略 | 目录优先 | 同目录文件通常上下文相关 |
| LLM 调用 | 仅语义层 | 控制成本、保证可重复性 |

### 不这样做的后果

| 反模式 | 问题 |
|--------|------|
| LLM 列出文件 | 幻觉、遗漏、不可重复 |
| LLM 解析导入 | 语法错误、格式不一致 |
| 无 fingerprint | 每次全量分析 |
| 无 neighborMap | 跨文件引用不完整 |

---

## 监控指标

| 指标 | 含义 | 健康阈值 |
|------|------|----------|
| `parse_time_ms` | tree-sitter 解析耗时 | < 100ms/文件 |
| `fingerprint_cache_hit_rate` | 缓存命中率 | > 80% |
| `batch_utilization` | 批次利用率 | > 70% |
| `llm_tokens_per_file` | 每文件 token 消耗 | < 500 |

---

## 下一步

- [CLI 命令参考](../reference/cli-reference.md)
- [增量分析指南](../guides/incremental-analysis.md)
- [Schema 定义](schema.md)
