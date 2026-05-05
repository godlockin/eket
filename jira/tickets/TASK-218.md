# TASK-218: context_filter Phase2非连续去重 + O(n²) Levenshtein

**状态**: ready

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/context_filter.rs
**来源**: 红队审查 Linus#5/#8 / Jeff P1
**工作量**: 1天

## 问题1：非连续去重（Linus#5）
Phase2 dedup 用 `.rev().find()` 找"同 sender 的最后一条消息"，
跨越中间其他 sender 的消息进行比较，错误丢弃非连续但相似的消息。
应只比较**连续相邻**的同 sender 消息。

## 问题2：O(m×n) Levenshtein OOM（Linus#8/Jeff P1）
对全量 payload JSON 做 Levenshtein，4000字符消息 = 128MB 矩阵，50条消息 = 6GB。
应改为：先比较长度（差异>20%直接判不相似），再用 hash 快速判同，最后 Levenshtein 只用于短文本（<500字符）。

## 修复方案
1. Phase2：只与**紧邻前一条**同 sender 消息比较
2. similarity 函数：`if (a.len() as f32 / b.len() as f32 - 1.0).abs() > 0.2 { return 0.0 }` 快速路径；长文本改用 hash 比较或 simhash

## 验收标准
- [x] 非连续同sender消息不被错误去重
- [x] 4000字符 payload 比较不 OOM，<1ms
- [x] 测试：A→B→A(相似) 场景，第二条A不被丢弃
- [x] 全部测试通过

## 实现细节
- Phase2: `result.last()` 替换 `result.iter().rev().find()`，只比较紧邻前一条
- `similarity()` 新增快路径：长度比>1.2x返回0.0，exact match返回1.0
- 长文本(>500字符)用 `DefaultHasher` hash比较替代Levenshtein
- `levenshtein()` 改为双行滚动数组，O(min(m,n))空间
- 顺手修复workflow.rs中EscalateToMaster分支的`inst`作用域编译错误（pre-existing bug）

## 完成时间
2026-04-26
