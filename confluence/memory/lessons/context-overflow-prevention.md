# Context Overflow 防御实战经验

**事件**: 2026-05-15 EPIC-009 M1 完成时崩溃  
**原因**: 多层上下文累积穿透 3 道防线  
**结果**: 单消息上下文飙到 ~180k tokens → Claude 崩溃

---

## 崩溃剖析

### 失败流程（旧）

```bash
# 导致崩溃的操作链
1. Write(M1-completion-report.md, 169 行)  →  8k tokens
2. Read(M1-completion-report.md 全文回填)  →  8k tokens
3. 输出祝贺文案（50+ 行）                 →  5k tokens
4. git log --oneline -5                   →  3k tokens
5. git log 展开 (+3 lines)                 →  5k tokens
6. Pending logs 累积                       →  3k tokens
────────────────────────────────────────────────────
                                    Total: ~32k tokens/EPIC

# 重复 2-3 个 EPIC → 崩溃
```

### 根因

**Write → Read 回填**是最大漏洞：
- Write 后自动 Read 验证 → 上下文翻倍
- 大文件（>100 行）回填 → 指数级增长
- 无 token budget check → 累积无上限

---

## 压力测试结果

**测试环境**: /tmp/eket-stress-test  
**测试数据**:
- 3 个 EPIC report（每个 3000+ 行）
- 50 条 git commits（长 message）
- 超大输出（118KB Python 生成）

### 6 道防线验证

| # | 防线 | 触发条件 | 状态 | 证据 |
|---|------|---------|------|------|
| 1 | 禁止大文件回读 | Write >100 行 | ✅ 已验证 | 手动 Read 通过 |
| 2 | git log 限制 | >20 条 log | ⚠️ 需加固 | 测试允许 -30 |
| 3 | completion 压缩 | >50 行祝贺 | ⚠️ 需加固 | 未完整测试 |
| 4 | Proactive compact | ≥60% 上下文 | ⚠️ 未触发 | 仅达 9.6% |
| 5 | **Persisted output** | >400KB | ✅ **2 次生效** | 413KB + 118KB |
| 6 | **File token limit** | >25k tokens | ✅ **生效** | 拒绝 26k 文件 |

**关键发现**: Harness 内置防御（5/6）已拦截大部分攻击向量

---

## 新防御层

### 防线 1: 禁止大文件回读

```diff
- Write(file) → Read(file) 回填上下文
+ Write(file) ✓  
+ if (lines > 100) {
+   output: "✓ 写入 {lines} 行到 {file}（省略回显）"
+ }
```

**规则**: Write 后禁止自动 Read，除非用户明确要求

### 防线 2: git log 强制限制

```diff
- git log --oneline -5
+ git log --oneline -3 --no-decorate --format="%h %s"
```

**规则**: 
- 单次 git log ≤3 条
- 禁用 `--decorate`（去掉分支/tag 信息）
- 强制简短格式

### 防线 3: completion 输出压缩

```diff
- 输出完整 completion-report + 祝贺文案（50+ 行）
+ if (epic/milestone complete) {
+   output: "✅ {EPIC} done. Report: {file}" (≤200 chars)
+ }
```

**规则**:
- EPIC/Milestone 完成 → 仅输出状态 + 文件路径
- 禁止长祝贺文案
- 禁止回显 report 内容

### 防线 4: Proactive compact

```bash
# Pre-check before large operations
before_large_op() {
  if (context > 60%) {
    compact first
  }
}
```

**规则**:
- 大文件写入前检测上下文
- ≥60% 时主动 compact
- EPIC 完成前强制 compact

### 防线 5: 渐进式上下文预警（NEW）

**问题**：接近上限时（~90%+）无提示，直接结束对话（silent failure）

**解决方案**：三级预警机制

```bash
check_context() {
  usage=$(current_context_percent)
  
  case $usage in
    9[0-9]|100)  # ≥90%
      echo "🚨 上下文 ${usage}%！立即 compact"
      /compact
      ;;
    8[0-9])      # 80-89%
      echo "⚠️ 上下文 ${usage}%，强烈建议 compact"
      ;;
    7[0-9])      # 70-79%
      echo "ℹ️ 上下文 ${usage}%，注意控制输出"
      ;;
  esac
}
```

**三级预警**：

| 级别 | 阈值 | 行为 | 输出 |
|------|-----|------|------|
| **L1 提示** | 70-79% | 输出警告 | "ℹ️ 上下文 70%，注意控制输出" |
| **L2 建议** | 80-89% | 强烈建议 | "⚠️ 上下文 80%，强烈建议 compact" |
| **L3 强制** | ≥90% | **立即 compact** | "🚨 上下文 90%！立即 compact" |

**触发时机**：
- 每次大操作前（EPIC 完成、大文件读写、git log）
- 每轮对话结束前
- 发现输出变长时

**防御效果**：
- 70% 时开始警告 → 提前 20% 发现风险
- 90% 时强制 compact → 避免 silent failure
- 用户可见警告 → 透明化上下文状态

---

## 经验教训

### 1. 永远不要相信"只有几行"

```bash
# 看似简单的操作
Write(report.md)  # "只是写个文件"

# 实际上下文消耗
Write(8k) + Read(8k) + Output(5k) = 21k tokens
```

### 2. git log 是隐形炸弹

```bash
# 长 commit message 指数级膨胀
git log -5 with 200-char messages = 5k+ tokens

# 解决方案
git log -3 --format="%h %s"  # <500 tokens
```

### 3. 祝贺文案是奢侈品

```bash
# 旧流程：50 行祝贺（5k tokens）
🎉 EPIC Complete!
## Summary...
## Tasks...
## Metrics...

# 新流程：1 行状态（50 tokens）
✅ EPIC-009 done. Report: jira/epics/EPIC-009/M1-report.md
```

### 4. Harness 内置防御很强

**Persisted output** 和 **File token limit** 已拦截大部分攻击：
- >400KB 输出 → 自动持久化
- >25k tokens 文件 → 自动拒绝

**结论**: 信任 harness，但仍需主动防御

### 5. Silent failure 比崩溃更危险（NEW）

**现象**：上下文 >90% 时无警告，直接结束对话

**危害**：
- 无错误信息 → 难定位
- 工作成果可能丢失
- 用户不知道为什么结束

**解决**：
- 70% 开始警告
- 90% 强制 compact
- 透明化上下文状态

---

## 防御清单

**每次 EPIC 完成时**:

- [ ] Write report 后**不**自动 Read
- [ ] git log 限制 `-3 --no-decorate`
- [ ] 输出压缩到 ≤200 chars
- [ ] 完成前检测上下文（≥60% compact）

**每次大操作前**:

- [ ] 检查上下文使用率
- [ ] 预估操作 token 消耗
- [ ] 必要时先 compact

---

## 参考

- 崩溃场景: EPIC-009 M1 completion (2026-05-14 20:00)
- 测试报告: 本文档 "压力测试结果" 章节
- 新规则位置: `template/docs/MASTER-RULES.md`
