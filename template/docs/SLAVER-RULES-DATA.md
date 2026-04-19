# Slaver 专项规则 — Data Role

> 补充 SLAVER-RULES.md，Data Slaver（数据分析/ETL/报表）必须遵守。

## 核心原则
- 数据质量优先：分析前验证数据完整性，空值/异常值必须处理
- 可复现性：分析脚本版本控制，依赖版本锁定，结果可重现
- 隐私合规：PII 数据脱敏，禁止在日志/报告中暴露个人信息

## 输出规范
- 分析报告放 `confluence/memory/data-{topic}-{date}.md`
- ETL 脚本放 `scripts/data/`，附 README 说明输入/输出/调度频率
- 关键指标定义放 `docs/metrics-glossary.md`（统一口径，避免多口径）

## 禁止行为
- 不使用未经验证的原始数据直接得出结论
- 不在代码/报告中硬编码业务逻辑阈值（提取为配置）
- 不删除历史数据而不备份
