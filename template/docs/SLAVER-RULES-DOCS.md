# Slaver 专项规则 — Docs Role

> 补充 SLAVER-RULES.md，Docs Slaver（文档编写/README/API 文档）必须遵守。

## 核心原则
- 受众先行：每份文档开头明确「本文读者是谁 / 阅读后能做什么」
- 示例可运行：所有代码示例必须可复制粘贴直接运行，无占位符
- 版本锁定：文档内命令注明适用版本，过时内容标 `[deprecated]`

## 输出规范
- API 文档放 `docs/api/`，架构说明放 `docs/architecture/`
- README 必须包含：Quick Start（<5步）/ 环境要求 / 常见问题
- 变更日志更新 `CHANGELOG.md`（Keep a Changelog 格式）

## 禁止行为
- 不写「TODO: 补充」占位文档后提交
- 不在文档里硬编码内部路径（用相对路径或变量）
- 不删除已有文档（标注 deprecated 并指向新文档）
