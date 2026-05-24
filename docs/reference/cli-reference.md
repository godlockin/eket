# CLI 命令参考

**版本**: 2.14.0-beta | **最后更新**: 2026-05-24 | **依赖 EPIC**: EPIC-011

> EKET CLI 完整命令参考。本文档覆盖代码分析、批次处理、增量更新相关命令。

---

## 代码分析命令

### eket analyze:structure

提取代码结构（函数/类/导入/导出），使用 tree-sitter 解析，**不调用 LLM**。

```bash
eket analyze:structure <path> [options]
```

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 文件或目录路径 |

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--output <file>` | stdout | 输出 JSON 文件路径 |
| `--language <lang>` | auto | 指定语言（自动检测时使用） |
| `--force` | false | 强制重新分析（忽略缓存） |
| `--include <glob>` | `**/*` | 包含文件 glob 模式 |
| `--exclude <glob>` | - | 排除文件 glob 模式 |

**典型场景**：

```bash
# 单文件分析
eket analyze:structure src/core/election.rs

# 目录分析，输出到文件
eket analyze:structure src/ --output .eket/structure.json

# 排除测试文件
eket analyze:structure src/ --exclude "**/*.test.ts" --output .eket/structure.json

# 指定 TypeScript（当扩展名不标准时）
eket analyze:structure lib/parser.mts --language typescript
```

**输出格式**：

```json
{
  "version": "1.0",
  "analyzed_at": "2026-05-24T10:00:00Z",
  "files": [
    {
      "path": "src/core/election.rs",
      "language": "rust",
      "functions": [
        {
          "name": "elect_master",
          "line_start": 15,
          "line_end": 45,
          "params": ["config: &Config"],
          "return_type": "Result<bool>"
        }
      ],
      "classes": [],
      "imports": ["crate::queue", "std::sync::Arc"],
      "exports": ["elect_master", "ElectionConfig"]
    }
  ]
}
```

---

### eket analyze:incremental

增量分析，只处理变更文件。需要先建立 fingerprint 基线。

```bash
eket analyze:incremental [options]
```

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--baseline <file>` | `.eket/fingerprints.json` | fingerprint 基线文件 |
| `--output <file>` | `.eket/analysis.json` | 输出文件路径 |
| `--include-cosmetic` | false | 包含仅注释/空格变更的文件 |

**典型场景**：

```bash
# 使用默认基线
eket analyze:incremental

# 指定基线文件
eket analyze:incremental --baseline ./baseline.json

# 包含注释变更
eket analyze:incremental --include-cosmetic
```

---

## 批次处理命令

### eket batch:compute

计算文件批次，用于大任务拆解。

```bash
eket batch:compute <path> [options]
```

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 文件或目录路径 |

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--max-nodes <n>` | 60 | 每批最大节点数（函数+类+导入+导出） |
| `--max-tokens <n>` | 15000 | 每批最大预估 token 数 |
| `--output <file>` | stdout | 输出 JSON 文件路径 |
| `--strategy <name>` | `directory` | 分割策略：`directory`, `by-type`, `dependency-first` |
| `--neighbor-depth <n>` | 1 | neighborMap 依赖深度（0 禁用） |
| `--config <file>` | - | 配置文件路径 |
| `--estimate` | false | 显示耗时和 token 预估 |
| `--stdin` | false | 从 stdin 读取文件列表 |

**典型场景**：

```bash
# 基本批次计算
eket batch:compute src/ --output .eket/batches.json

# 保守设置（小批次）
eket batch:compute src/ --max-nodes 40 --output .eket/batches.json

# 查看预估
eket batch:compute src/ --estimate

# 按依赖图分割
eket batch:compute src/ --strategy dependency-first --output .eket/batches.json

# 从变更列表计算
eket fingerprint:diff --baseline .eket/fingerprints.json --format list | \
  eket batch:compute --stdin --output .eket/delta-batches.json
```

**输出格式**：

```json
{
  "version": "1.0",
  "computed_at": "2026-05-24T10:30:00Z",
  "total_files": 150,
  "total_batches": 8,
  "estimated_time_minutes": 24,
  "estimated_tokens": 120000,
  "batches": [
    {
      "id": "batch-001",
      "files": ["src/core/election.rs", "src/core/queue.rs"],
      "node_count": 58,
      "estimated_tokens": 12000,
      "neighborMap": {
        "src/core/election.rs": ["src/utils/redis.rs"]
      }
    }
  ]
}
```

---

### eket analyze:batch

执行批次分析任务。

```bash
eket analyze:batch [options]
```

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--input <file>` | `.eket/batches.json` | 批次定义文件 |
| `--batch-id <id>` | - | 执行指定批次 |
| `--batch-range <range>` | - | 执行批次范围（如 `1-4`） |
| `--resume` | false | 从上次中断点继续 |
| `--resume-from <id>` | - | 从指定批次恢复 |
| `--retry` | false | 重试失败的批次 |
| `--streaming` | false | 低内存流式处理模式 |
| `--output-dir <dir>` | `.eket/results/` | 结果输出目录 |

**典型场景**：

```bash
# 执行所有批次
eket analyze:batch --input .eket/batches.json

# 执行指定批次
eket analyze:batch --input .eket/batches.json --batch-id batch-003

# 多 Slaver 分工
eket analyze:batch --input .eket/batches.json --batch-range 1-4
eket analyze:batch --input .eket/batches.json --batch-range 5-8

# 断点续跑
eket analyze:batch --input .eket/batches.json --resume

# 重试失败批次
eket analyze:batch --input .eket/batches.json --retry
```

---

## Fingerprint 命令

### eket fingerprint:build

构建文件 fingerprint 基线，用于增量分析。

```bash
eket fingerprint:build <path> [options]
```

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 文件或目录路径 |

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--output <file>` | stdout | 输出 JSON 文件路径 |
| `--include <glob>` | `**/*` | 包含文件 glob 模式 |
| `--exclude <glob>` | - | 排除文件 glob 模式 |

**典型场景**：

```bash
# 构建基线
eket fingerprint:build src/ --output .eket/fingerprints.json

# 排除测试文件
eket fingerprint:build src/ \
  --exclude "**/*.test.ts" \
  --exclude "**/*.spec.ts" \
  --output .eket/fingerprints.json
```

**输出格式**：

```json
{
  "version": "1.0",
  "built_at": "2026-05-24T10:00:00Z",
  "file_count": 150,
  "files": {
    "src/core/election.rs": {
      "content_hash": "sha256:abc123...",
      "ast_hash": "sha256:def456...",
      "size_bytes": 2048,
      "node_count": 12
    }
  }
}
```

---

### eket fingerprint:diff

比较当前文件与基线，检测变更类型。

```bash
eket fingerprint:diff [options]
```

**选项**：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--baseline <file>` | `.eket/fingerprints.json` | 基线文件路径 |
| `--format <fmt>` | `summary` | 输出格式：`summary`, `json`, `list` |
| `--filter <type>` | - | 过滤变更类型：`structural`, `cosmetic`, `new`, `deleted` |

**典型场景**：

```bash
# 查看变更摘要
eket fingerprint:diff --baseline .eket/fingerprints.json

# JSON 格式输出
eket fingerprint:diff --baseline .eket/fingerprints.json --format json

# 只列出需要重分析的文件
eket fingerprint:diff --baseline .eket/fingerprints.json \
  --filter structural --filter new --format list

# 管道到批次计算
eket fingerprint:diff --filter structural --filter new --format list | \
  eket batch:compute --stdin --output .eket/delta-batches.json
```

**输出格式（summary）**：

```
╭───────────────────────────────────────────╮
│          Fingerprint Diff Report          │
├───────────────────────────────────────────┤
│ STRUCTURAL:  3   (需要重分析)              │
│ COSMETIC:   12   (仅注释/空格，跳过)        │
│ NEW:         1   (新文件)                  │
│ DELETED:     0                            │
├───────────────────────────────────────────┤
│ Total Changed: 16                         │
│ Need Reanalysis: 4                        │
╰───────────────────────────────────────────╯
```

**输出格式（json）**：

```json
{
  "summary": {
    "structural": 3,
    "cosmetic": 12,
    "new": 1,
    "deleted": 0
  },
  "files": {
    "structural": ["src/core/election.rs", "src/core/queue.rs", "src/api/handler.ts"],
    "cosmetic": ["src/utils/logger.ts", ...],
    "new": ["src/services/auth.ts"],
    "deleted": []
  }
}
```

---

## 组合使用示例

### 首次全量分析

```bash
# 1. 提取代码结构
eket analyze:structure src/ --output .eket/structure.json

# 2. 建立 fingerprint 基线
eket fingerprint:build src/ --output .eket/fingerprints.json

# 3. 如果文件较多，计算批次
eket batch:compute src/ --max-nodes 50 --output .eket/batches.json

# 4. 执行批次分析
eket analyze:batch --input .eket/batches.json
```

### 日常增量分析

```bash
# 1. 检测变更
eket fingerprint:diff --baseline .eket/fingerprints.json

# 2. 增量分析
eket analyze:incremental --baseline .eket/fingerprints.json

# 3. 更新基线
eket fingerprint:build src/ --output .eket/fingerprints.json
```

### CI/CD 流水线

```bash
# 1. 恢复缓存基线（如果存在）
if [ -f .eket/fingerprints.json ]; then
  # 增量模式
  eket fingerprint:diff --filter structural --filter new --format list | \
    eket batch:compute --stdin --output .eket/delta-batches.json
  eket analyze:batch --input .eket/delta-batches.json
else
  # 首次全量
  eket analyze:structure src/ --output .eket/structure.json
fi

# 2. 更新基线
eket fingerprint:build src/ --output .eket/fingerprints.json
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_LOG_LEVEL` | 日志级别：`debug`, `info`, `warn`, `error` | `info` |
| `EKET_CACHE_DIR` | 缓存目录 | `.eket/cache` |
| `EKET_MAX_CONCURRENCY` | 最大并发数 | CPU 核数 |
| `EKET_TREE_SITTER_TIMEOUT` | tree-sitter 解析超时（ms） | 5000 |

---

## 错误码

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `E001` | 文件不存在 | 检查路径是否正确 |
| `E002` | 不支持的语言 | 使用 `--language` 手动指定 |
| `E003` | 基线文件无效 | 重新运行 `fingerprint:build` |
| `E004` | 批次文件无效 | 重新运行 `batch:compute` |
| `E005` | 解析超时 | 增加 `EKET_TREE_SITTER_TIMEOUT` |

---

## 下一步

- [增量分析指南](../guides/incremental-analysis.md) — 详细工作流
- [批次处理指南](../guides/batch-processing.md) — 大任务拆解
- [架构文档](../architecture/analysis-architecture.md) — 理解设计原理
