# SKILL-ANATOMY-TEMPLATE.md

> 7 节标准结构 + Frontmatter，统一所有 `.claude/skills/eket/experts/` 下专家文件的解剖。
> 校验脚本：`scripts/check-skill-anatomy.sh`（full / minimal / --all 模式）。

## 何时用 7 节 vs 3 节

| 文件类型 | 适用节数 | 校验命令 | 说明 |
|---------|---------|---------|------|
| default 专家（7位） | 7 节 full | `check-skill-anatomy.sh <file>` | 高频调用，必须完整 Overview/When/Process 指引 |
| optional 专家（53位） | 3 节 minimal | `check-skill-anatomy.sh --minimal <file>` | TASK-225 codemod 注入 TODO skeleton；Overview 等可逐步补充 |
| 新建 Skill 文件（非专家） | 7 节 full | `check-skill-anatomy.sh <file>` | 技能本身需完整文档，不走 minimal 兜底 |

**示范文件**：
- 7 节 full：`.claude/skills/eket/experts/default/architect.md`
- 3 节 minimal：`eket-experts-extended/experts/ai/aiml.md`（subrepo）

---

## Expert Persona Frontmatter（带注解）

```yaml
id: eket.<domain>.001          # 命名空间 + 领域 + 序号；同领域多人时递增 .002
name: <英文名>                  # 用于代码引用；单字符串无空格
name_cn: <中文名 3 字>          # 拟人化召唤用；建议 "姓+领域" 如 "陈架构"
role: <职位>                    # 中文岗位名；与 default 7 位的命名风格一致
emoji: <emoji>                  # 单 emoji；用于 Master 召唤回执醒目标识
domain: <domain>                # 与 id 中的 domain 段一致；用于按领域筛选
tier: default                   # default = 7 节 full；optional = 3 节 minimal 起步
description: <一句话核心职责>    # ≤ 60 字；frontmatter 级 description（被 INDEX 引用）
rationalizations_count: 6      # Common Rationalizations 表的实际行数；default 强制 ≥6
# 以下字段保留原有结构：
# personality / background / thinking_framework / analysis_focus / output_format / phase
```

> 校验脚本会从 frontmatter 仅强制 `description` + `rationalizations_count` 两字段；
> 其余字段由 EXPERT-PANEL-PLAYBOOK 的内容质量审查兜底。

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

---

## Reference

- **示范文件**：`.claude/skills/eket/experts/default/architect.md`（7 节 full + 完整 frontmatter）
- **示范文件（minimal）**：subrepo `eket-experts-extended/experts/ai/aiml.md`
- **校验脚本**：`scripts/check-skill-anatomy.sh`
  - `<file>` — 单文件 full 模式
  - `--minimal <file>` — 3 节 minimal 模式
  - `--all` — 主仓 default + 主仓 optional + subrepo 53 文件全量扫描（subrepo 不可达走 SKIP）
  - `--self-test` — 跑 `tests/fixtures/anatomy/` 内置 6 case
- **codemod**：`scripts/codemod-inject-3sections.sh`（含 `--exclude=INDEX.md` 参数防误注入索引文件）
