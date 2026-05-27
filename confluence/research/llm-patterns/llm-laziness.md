---
title: LLM Laziness - 输出截断根因与补救
created: 2026-05-27
category: research/llm-patterns
tags: [llm, truncation, prompt-engineering, rlhf]
status: published
source: taste-skill research
---

# LLM Laziness - 输出截断根因与补救

> 为什么 LLM 会提前停止输出？如何可靠获取完整结果？

## 根因分析

### 1. RLHF 训练副作用

人类偏好反馈倾向于简洁回复，导致模型学习到「早停止更安全」的策略：
- 长输出增加出错概率 → 评分降低
- 简短回复更易获得正向反馈
- 训练数据中短回复占比更高

### 2. 计算成本优化

模型架构隐含的停止激励：
- 每个 token 消耗计算资源
- 停止条件（EOS）概率随输出长度增加
- 重复内容触发提前终止

### 3. Stopping Pressure

上下文长度增加导致的停止压力：
- 长上下文增加注意力计算复杂度
- 模型倾向于在「自然断点」停止
- 列表/代码块等结构化内容尤其容易截断

## 症状识别

| 症状 | 特征 | 常见场景 |
|------|------|----------|
| 列表截断 | 只输出前 N 项后停止 | 多条目生成 |
| 代码不完整 | 函数/类缺少闭合 | 代码生成 |
| 省略号结尾 | 明确表示省略 | 长文档 |
| 突然中断 | 句子/段落未完成 | 深度分析 |

## 补救技术

### 参数调优

```yaml
# 推荐配置
max_tokens: 4096           # 充足输出空间
temperature: 0.7           # 平衡创造性与完整性
stop_sequences: []         # 移除默认停止词
```

### XML 结构化包装

用 XML 标签强制完整输出：

```xml
<complete_output>
  <section name="prerequisites">
    <!-- 内容 -->
  </section>
  <section name="implementation">
    <!-- 内容 -->
  </section>
  <verification>
    ALL_SECTIONS_COMPLETE: true
  </verification>
</complete_output>
```

### 验证循环 (Verification Loop)

```
[Initial Prompt] → [Output] → [Completeness Check] → [Continue Prompt] → ...
```

检查点清单：
- [ ] 所有列表项已输出？
- [ ] 代码块闭合？
- [ ] 结论/总结存在？
- [ ] 无省略标记？

### 分段请求

大任务拆分为多个小请求：

```
Round 1: "生成步骤 1-5"
Round 2: "继续步骤 6-10"
Round 3: "总结所有步骤"
```

## 可复用提示模板

### 完整性强制模板

```
You MUST provide a COMPLETE response. Do not truncate or summarize.

Requirements:
1. Include ALL items/steps/sections
2. End with explicit completion marker: "---END---"
3. If approaching length limits, state "CONTINUATION NEEDED" instead of stopping

Output format:
<complete_response>
  [Full content here]
  <status>COMPLETE | CONTINUATION_NEEDED</status>
</complete_response>
```

### 列表生成模板

```
Generate a complete list of [N] items.

CRITICAL RULES:
- You MUST output exactly [N] items
- Number each item (1, 2, 3...)
- After item [N], write: "LIST COMPLETE ([N]/[N])"
- Do NOT stop early or use "..." or "etc."

Begin:
```

### 代码生成模板

```
Generate complete, runnable code for [task].

REQUIREMENTS:
- Include ALL imports at the top
- Include ALL function/class definitions
- Include example usage at the bottom
- End with comment: // END OF FILE - ALL CODE COMPLETE

DO NOT:
- Use "..." or "// rest of implementation"
- Leave functions incomplete
- Omit error handling
```

## 监控指标

| 指标 | 计算方式 | 阈值 |
|------|----------|------|
| 完成率 | 有完成标记的输出 / 总输出 | >95% |
| 平均输出长度 | tokens per response | 监控趋势 |
| 重试次数 | 需要 continue 的次数 | <0.1/request |

## 相关研究

- [Anthropic: Constitutional AI](https://www.anthropic.com/research/constitutional-ai) — RLHF 替代方案
- [OpenAI: GPT-4 Technical Report](https://openai.com/research/gpt-4) — 长上下文行为分析

---

*Based on taste-skill research and production observations*
