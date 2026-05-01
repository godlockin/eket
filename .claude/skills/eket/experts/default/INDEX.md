# EKET Default 专家库索引（7 位常驻）

> **使用方式**：找到需要的专家 → 读取对应 `.md` 文件获取完整 persona。
> 路径相对于 `.claude/skills/eket/experts/default/`。
> **anatomy 校验**：`bash scripts/check-skill-anatomy.sh <file>`（7 节 full 模式）。

---

## 🎭 常驻 7 位

| id | name_cn | role | emoji | description（一句话核心职责） | rationalizations |
|----|---------|------|-------|------------------------------|------------------|
| eket.architect.001 | 陈架构 | 系统架构师 | 🏗️ | 模块边界划定、技术选型评估与架构债务识别，为专家组提供全局地图 | 6 |
| eket.backend.001 | 张后端 | 后端工程师 | 🖥️ | API 设计、数据模型、性能瓶颈与安全隐患，基于架构全局视图深入后端维度 | 6 |
| eket.frontend.001 | 李前端 | 前端工程师 | 🎨 | 组件架构、状态管理、构建性能与可访问性，从用户视角识别体验与技术双重风险 | 6 |
| eket.fullstack.001 | 林全栈 | 全栈工程师 | 🧰 | 端到端调用链梳理、前后端职责分配与接口契约健康度，为跨层问题提供一线止血视角 | 6 |
| eket.product.001 | 赵产品 | 产品经理 | 📋 | 功能完整性评估、用户故事梳理与优先级决策，为专家组提供业务价值视角 | 6 |
| eket.tester.001 | 吴测试 | 测试工程师 | 🧪 | 测试金字塔设计、关键路径风险加权覆盖、Flaky 治理与 CI 失败归因，守护质量底线 | 6 |
| eket.ux.001 | 王UX | UI/UX 设计师 | 🖌️ | 用户旅程分析、交互一致性审查与可用性启发式评估，以共情视角识别体验断点 | 6 |

---

## 🔗 与扩展专家库的关系

- **default（本目录，7 位）** = 高频常驻；`tier: default`，强制 7 节 full anatomy + frontmatter `description` + `rationalizations_count` ≥ 6
- **optional（subrepo 53 位）** = 按需召唤；`tier: optional`，最低 3 节 minimal anatomy（含 ≥ 3 个 verification checkbox）
- 扩展专家索引：`eket-experts-extended/experts/INDEX.md`

---

## ✅ 校验

```bash
# 单文件
bash scripts/check-skill-anatomy.sh .claude/skills/eket/experts/default/architect.md

# 全量（default 7 + optional + subrepo 53）
bash scripts/check-skill-anatomy.sh --all
# 期望汇总：default: 7/7 PASS, optional: N/53+ PASS
```

> INDEX.md 本身不是专家 persona，自动从 `--all` 扫描中排除。

---

*最后更新：2026-04-27 · TASK-227*
