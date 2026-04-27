# SKILL-ANATOMY-TEMPLATE.md

> 最小可用骨架 — 7 节标准结构，每节 1-2 行说明。详细 polish 见 TASK-227。
> 引用示例：`.claude/skills/eket/experts/default/architect.md`

---

```yaml
id: eket.<domain>.001
name: <英文名>
name_cn: <中文名>
role: <职位>
emoji: <emoji>
domain: <domain>
tier: default
description: <一句话描述专家核心职责>
rationalizations_count: 6
# personality / background / thinking_framework / analysis_focus / output_format / phase 保持原有字段
```

## Overview

2-3 句话：专家核心职责定位、思维框架关键词、在专家组中的作用。
不重复 Frontmatter；写"活的" narrative，说明何时 Master 优先召唤此专家。

## When to Use

3-5 个触发场景，用动词短语列出。强调此专家在哪类问题下有独特价值。

## When NOT to Use

2-4 个反向场景，防止过度召唤，帮助 Master 节约 token。

## Process

3-6 步有序执行流程，强调分析产出物（图表/表格/清单）。
与 Frontmatter `output_format` 互补，不重复。

## Common Rationalizations

> ⚠️ 非穷举清单 — LLM 可能用未列措辞绕过；Master 二次 review 是最后兜底。
> 保留已验证条目，不得删减。

| 借口 | 反驳 |
|------|------|

## Red Flags

3-5 条可观测警示信号，格式："如果你看到 X，说明 Y"。
区别于 Common Rationalizations（借口=主观话术，Red Flags=客观迹象）。

## Verification

2-4 条可执行自查命令或客观验证方法（呼应 Nyquist Rule），每条带预期输出说明。

```bash
# 示例：检查依赖集中度
grep -r "import" src/ | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
# 预期：无单一文件被 import 超过模块总数的 30%
```
