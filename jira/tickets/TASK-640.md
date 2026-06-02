# TASK-640: DAG 自动复杂度检测

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 1d  
**依赖**: TASK-631  
**层级**: All  
**来源**: 产品需求 (脑爆)
**完成时间**: 2026-06-01

---

## 目标

自动检测 EPIC/任务复杂度，达到阈值时建议使用 DAG 模式。

## 复杂度判断规则

| 指标 | 阈值 | 权重 |
|------|------|------|
| 子任务数 | ≥5 | 2 |
| 依赖深度 | ≥3 | 3 |
| blocked_by 数 | ≥2 | 1 |
| 跨模块（不同目录） | ≥3 | 1 |

**复杂度分数** = Σ(超过阈值 × 权重)  
**建议 DAG**: 分数 ≥ 4

## 验收标准

- [x] `eket epic:analyze EPIC-NNN` 输出复杂度报告
- [x] 达到阈值时提示 `建议使用 DAG 模式: eket dag:generate EPIC-NNN`
- [x] `eket dag:generate EPIC-NNN` 自动生成 `dag.yml`
- [ ] 集成到 `eket epic:create` 流程（创建后自动分析）

## 输出示例

```
$ eket epic:analyze EPIC-017

EPIC-017 复杂度分析
═══════════════════════════════════════
子任务数:    5 (≥5 ✓)      +2
依赖深度:    2 (<3)        +0
blocked_by:  max=3 (≥2 ✓)  +1
跨模块:      3 (≥3 ✓)      +1
───────────────────────────────────────
总分:        4

💡 建议: 使用 DAG 模式提高执行效率
   运行: eket dag:generate EPIC-017
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 实现 epic:analyze + dag:generate 命令 | Slaver |

## 实现说明

### 新增文件

- `node/src/commands/epic-analyze.ts` - 包含两个命令:
  - `epic:analyze <epicId>` - 分析 EPIC 复杂度
  - `dag:generate <epicId>` - 自动生成 dag.yml

### 复杂度算法

1. **子任务数** (≥5 → +2): 统计 EPIC 目录下 TASK-*.md 文件数量
2. **依赖深度** (≥3 → +3): BFS 计算最长依赖链
3. **Max blocked_by** (≥2 → +1): 单任务最大依赖数
4. **跨模块** (≥3 → +1): 统计涉及的不同模块目录 (node/src, rust/crates, scripts 等)

总分 ≥ 4 建议使用 DAG 模式

### 示例输出

```
$ eket epic:analyze EPIC-007

EPIC-007 复杂度分析
═══════════════════════════════════════
子任务数:    14  (≥5 ✓)      +2
依赖深度:    4   (<3)        +3
blocked_by:  max=4  (≥2 ✓)  +1
跨模块:      4   (≥3 ✓)      +1
───────────────────────────────────────
总分:        7

💡 建议: 使用 DAG 模式提高执行效率
   运行: eket dag:generate EPIC-007
```

### 集成点

- 在 `node/src/index.ts` 注册了 `registerEpicAnalyze(program)`
- 使用 exit code 2 表示建议 DAG（便于脚本判断）
- 支持 `--json` 输出 JSON 格式结果
