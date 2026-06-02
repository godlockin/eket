# TASK-647: 日志脱敏补充 AWS/npm token

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 0.5d  
**依赖**: TASK-638  
**层级**: L1 Rust, L2 Node.js  
**来源**: Adversarial Review (安全)

---

## 问题描述

`sanitizeScript` 脱敏遗漏以下敏感模式：
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ACCESS_KEY_ID`
- `GITHUB_TOKEN`
- `npm_config_` 相关
- `xoxp-` (Slack user token)

## 验收标准

- [x] Node.js `sanitizeScript` 补充遗漏模式
- [x] Rust `sanitize_script` 同步补充
- [x] 单元测试覆盖新增模式
- [ ] 文档更新脱敏规则列表

## 补充模式

```typescript
const SENSITIVE_PATTERNS = [
  // 现有
  /(?:API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|AUTH)=\S+/gi,
  /Bearer \S+/gi,
  /Basic \S+/gi,
  /ghp_\S+/g,      // GitHub PAT
  /xoxb-\S+/g,     // Slack bot token
  
  // 新增
  /AWS_SECRET_ACCESS_KEY=\S+/gi,
  /AWS_ACCESS_KEY_ID=\S+/gi,
  /GITHUB_TOKEN=\S+/gi,
  /npm_config_\w+=\S+/gi,
  /xoxp-\S+/g,     // Slack user token
  /AKIA[0-9A-Z]{16}/g,  // AWS Access Key ID pattern
];
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (安全 Review P2) | Master |
| 2026-06-01 | 完成实现: Node.js + Rust 补充6个敏感模式 + 单元测试 | Slaver |
