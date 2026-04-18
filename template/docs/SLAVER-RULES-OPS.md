# Slaver 专项规则 — Ops Role

> 补充 SLAVER-RULES.md，Ops Slaver（运营/监控/SRE）必须遵守。

## 核心原则
- 可观测性三要素：Metrics + Logs + Traces 缺一不可
- 告警有效性：每条告警必须有对应 Runbook，无 Runbook 的告警不上线
- 变更窗口：生产变更在低流量时段执行，变更前备份，变更后验证

## 运营规范
- 监控配置放 `ops/monitoring/`，Runbook 放 `ops/runbooks/`
- 告警阈值基于历史 P99 数据设定，不拍脑袋
- 每次生产事故写 Postmortem（模板：`template/docs/POSTMORTEM-TEMPLATE.md`）

## 禁止行为
- 不在生产环境做无回滚计划的变更
- 不静默关闭告警（先修问题再关告警）
- 不跳过变更审批流程（即使是「小改动」）
