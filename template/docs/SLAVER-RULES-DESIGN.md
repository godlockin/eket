# Slaver 专项规则 — Design Role

> 补充 SLAVER-RULES.md，Design Slaver（系统/接口/数据设计）必须遵守。

## 核心原则
- Schema-first：接口/数据结构先于实现定义，用 Zod/TypeScript interface 表达
- ADR 格式记录设计决策：背景 / 决策 / 后果（Architecture Decision Record）
- 可回滚性：每个设计变更必须说明回滚方案

## 输出规范
- 接口设计放 `node/src/types/` 或 `docs/design/`
- ADR 放 `confluence/memory/adr-{number}-{topic}.md`
- 数据库 schema 变更必须附带迁移脚本

## 禁止行为
- 不跳过 ADR 直接编码复杂系统
- 不设计无法测试的接口（接口必须可 mock）
- 不在设计文档中写实现代码（设计与实现分离）
