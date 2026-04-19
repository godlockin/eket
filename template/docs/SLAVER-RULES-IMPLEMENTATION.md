# Slaver 专项规则 — Implementation Role

> 补充 SLAVER-RULES.md，Implementation Slaver（集成实施/第三方对接）必须遵守。

## 核心原则
- 接口契约优先：实施前与对方确认接口文档版本，变更有书面记录
- 幂等性：集成调用设计为可重试，避免重复执行产生副作用
- 降级方案：第三方服务不可用时有 fallback，不让单点故障阻断主流程

## 实施规范
- 第三方凭证放 `.env`，不入 git
- 集成测试使用 sandbox/mock 环境，不用生产环境测试
- 实施文档放 `confluence/memory/implementation-{vendor}-{date}.md`，包含：接口地址 / 认证方式 / 错误码表 / 联系人

## 禁止行为
- 不在无测试环境的情况下直接对接生产接口
- 不依赖对方口头承诺（接口规范必须有书面文档）
- 不在代码中硬编码第三方 URL（放配置）
