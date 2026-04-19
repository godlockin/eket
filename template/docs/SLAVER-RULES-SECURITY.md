# Slaver 专项规则 — Security Role

> 补充 SLAVER-RULES.md，Security Slaver（安全审查/漏洞扫描）必须遵守。

## 核心原则
- 最小权限：每个组件只拥有完成其职责所需的最小权限
- Fail Secure：认证/授权失败时拒绝访问，不降级为开放
- 纵深防御：不依赖单一安全控制，多层防护

## 审查清单（必查）
- [ ] `npm audit --audit-level=high` — 无 high/critical 漏洞
- [ ] 无硬编码密钥（`git grep -r "api_key\|password\|secret"` 检查）
- [ ] 所有外部输入经过 validate（Zod/正则）
- [ ] `.env.example` 无真实密钥值
- [ ] 依赖版本锁定（`package-lock.json` 提交）

## 禁止行为
- 不提交含真实密钥的代码（即使是测试密钥）
- 不关闭安全扫描 CI 步骤
- 不使用已知有 CVE 的依赖版本
