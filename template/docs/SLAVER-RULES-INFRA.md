# Slaver 专项规则 — Infra Role

> 补充 SLAVER-RULES.md 通用规则，Infra Slaver 必须遵守。

## 核心原则
- 每次变更必须有回滚方案
- 环境变量改动必须同步 `.env.example`
- CI 变更必须在 feature branch 验证后合并

## 变更规范
- shell 脚本用 `shellcheck` 检查
- 新增 CI 步骤先在 workflow_dispatch 测试
- 不删除现有环境变量（标记 deprecated，下版本删）

## 禁止行为
- 不直接推送到 main/testing
- 不在 CI 中存储明文密钥
