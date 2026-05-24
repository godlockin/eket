# 增量分析指南

**版本**: 2.14.0-beta | **最后更新**: 2026-05-24 | **依赖 EPIC**: EPIC-011

> 增量分析只重新处理变更文件，大幅节省时间和计算资源。

---

## 前置要求

- EKET CLI 已安装（`eket --version` 返回 2.14.0+）
- 项目已初始化（存在 `.eket/` 目录）
- 基线 fingerprint 已建立（首次分析时自动创建）

---

## 何时使用增量分析

```
                     ┌─────────────────────────┐
                     │   检测到代码变更？       │
                     └───────────┬─────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
               ≤ 10 files                 > 10 files
                    │                         │
                    ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │   全量分析     │         │   增量分析     │
           │ analyze:full  │         │ fingerprint   │
           └───────────────┘         │    + diff     │
                                     └───────────────┘
```

**推荐场景**：
- 大型代码库（>100 文件）日常开发
- CI/CD 流水线优化
- 频繁迭代的功能开发

---

## 工作流

### 1. 建立基线

首次分析时建立 fingerprint 基线：

```bash
# 提取代码结构（确定性，不调用 LLM）
eket analyze:structure src/ --output .eket/structure.json

# 构建 fingerprint 基线
eket fingerprint:build src/ --output .eket/fingerprints.json
```

**输出文件说明**：

| 文件 | 内容 | 大小参考 |
|------|------|----------|
| `structure.json` | 函数/类/导入/导出 AST 信息 | ~1KB/文件 |
| `fingerprints.json` | 每个文件的结构+内容哈希 | ~100B/文件 |

### 2. 检测变更

开发后检测变更类型：

```bash
eket fingerprint:diff --baseline .eket/fingerprints.json
```

**输出示例**：
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

### 3. 增量分析

只分析 STRUCTURAL + NEW 文件：

```bash
eket analyze:incremental --baseline .eket/fingerprints.json
```

---

## 变更分类

| 类型 | 含义 | 触发条件 | 处理 |
|------|------|----------|------|
| `STRUCTURAL` | 结构变化 | 函数签名、类定义、导入/导出变更 | 重新分析 |
| `COSMETIC` | 表面变化 | 仅注释、空格、格式调整 | 跳过 |
| `NEW` | 新文件 | 基线中不存在的文件 | 分析 |
| `DELETED` | 已删除 | 基线中存在但文件已删除 | 从索引移除 |

**判断逻辑**：

```
STRUCTURAL = AST 指纹变化
COSMETIC   = 内容哈希变化 but AST 指纹不变
NEW        = 文件路径不在基线中
DELETED    = 基线路径在文件系统中不存在
```

---

## 性能对比

以 1000 文件项目为例（100 文件有改动）：

| 模式 | 耗时 | LLM 调用 | Token 消耗 |
|------|------|----------|------------|
| 全量分析 | ~15 min | 1000 | ~500K |
| 增量分析 | ~1.5 min | 4 | ~2K |
| **节省** | **90%** | **99.6%** | **99.6%** |

---

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: EKET Incremental Analysis

on:
  pull_request:
    paths:
      - 'src/**'

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 需要完整历史

      - name: Setup EKET
        run: npm install -g @eket/cli

      - name: Restore Fingerprint Cache
        uses: actions/cache@v4
        with:
          path: .eket/fingerprints.json
          key: fingerprints-${{ github.base_ref }}
          restore-keys: |
            fingerprints-main

      - name: Run Incremental Analysis
        run: |
          if [ -f .eket/fingerprints.json ]; then
            eket analyze:incremental --baseline .eket/fingerprints.json
          else
            eket analyze:structure src/ --output .eket/structure.json
            eket fingerprint:build src/ --output .eket/fingerprints.json
          fi

      - name: Update Fingerprint Cache
        run: eket fingerprint:build src/ --output .eket/fingerprints.json
```

---

## 组合使用示例

### 典型工作流：分析 → 批次 → 增量

```bash
# 1. 首次：全量分析 + 建立基线
eket analyze:structure src/ --output .eket/structure.json
eket fingerprint:build src/ --output .eket/fingerprints.json

# 2. 日常开发后：检测变更
eket fingerprint:diff --baseline .eket/fingerprints.json

# 3. 如果变更较多，计算批次
eket batch:compute src/ --max-nodes 40 --output .eket/batches.json

# 4. 增量分析
eket analyze:incremental --baseline .eket/fingerprints.json

# 5. 更新基线
eket fingerprint:build src/ --output .eket/fingerprints.json
```

---

## 常见问题

### Q: fingerprint 基线文件应该提交到 Git 吗？

**A**: 不建议。fingerprint 是机器本地状态，建议加入 `.gitignore`：

```gitignore
.eket/fingerprints.json
.eket/structure.json
```

但在 CI/CD 中可以使用 cache 机制跨构建保留。

### Q: 分析结果与全量分析不一致怎么办？

**A**: 重建基线：

```bash
rm .eket/fingerprints.json
eket fingerprint:build src/ --output .eket/fingerprints.json
eket analyze:structure src/ --output .eket/structure.json
```

### Q: 如何强制全量分析？

**A**: 删除基线文件或使用 `--force` 标志：

```bash
eket analyze:structure src/ --force --output .eket/structure.json
```

### Q: COSMETIC 变更真的安全跳过吗？

**A**: 是的。EKET 使用 tree-sitter 解析 AST，注释和空格不影响 AST 结构。但如果你的分析需要包含注释内容（如 JSDoc 提取），使用 `--include-cosmetic` 标志。

---

## 下一步

- [批次处理指南](batch-processing.md) — 大任务拆解
- [CLI 命令参考](../reference/cli-reference.md) — 完整命令参数
- [架构文档](../architecture/analysis-architecture.md) — 理解确定性脚本 + LLM 分离设计
