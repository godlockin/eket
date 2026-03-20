# EKET 安全指南

## 敏感信息保护

### 禁止提交的文件

以下文件**永远不要**提交到 Git 仓库：

| 类型 | 文件 pattern | 风险等级 |
|------|------------|---------|
| API 密钥 | `.env`, `*.key`, `api_keys.txt` | 🔴 高危 |
| 数据库凭证 | `credentials.json`, `*.secret` | 🔴 高危 |
| SSL 证书 | `*.pem`, `*.crt`, `*.p12` | 🔴 高危 |
| 私有配置 | `*.local.yml`, `*.private` | 🟡 中危 |
| 密码记录 | `inbox/human_feedback/passwords*` | 🔴 高危 |

### 安全存储建议

#### 1. 使用环境变量

```bash
# 推荐：在运行环境中设置
export DATABASE_URL="postgresql://user:pass@localhost/db"
export API_KEY="sk-xxxxxxxxxxxxx"

# 不要硬编码在代码中
export EKET_DB_PASSWORD="my-secret-password"  # ❌ 错误示例
```

#### 2. 使用 .gitignore 保护

确保 `.gitignore` 包含以下规则：
```
.env
*.key
*.pem
credentials.json
*.secret
```

#### 3. 敏感反馈单独存储

如需在 `inbox/human_feedback/` 中传递敏感信息：
1. 创建独立文件，命名包含 `-sensitive` 后缀
2. 确保该文件被 `.gitignore` 排除
3. 通过安全渠道（如密码管理器）分享

```markdown
# inbox/human_feedback/db-config-sensitive.md

# ⚠️ 此文件包含敏感信息，请勿提交到 Git

## 数据库连接信息

- 主机：[通过安全渠道获取]
- 用户名：[通过安全渠道获取]
- 密码：[通过安全渠道获取]

## 获取方式

请联系项目负责人获取 credentials vault 的访问权限。
```

### 清理已提交的敏感信息

如果不慎提交了敏感文件：

```bash
# 1. 立即从 Git 历史中删除
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/sensitive/file" \
  --prune-empty --tag-name-filter cat -- --all

# 2. 推送到远程（强制）
git push origin --force --all

# 3. 通知团队成员刷新本地仓库
git fetch --all
git reset --hard origin/main

# 4. 轮换所有已泄露的密钥和凭证
```

### 安全检查清单

在提交代码前，运行以下检查：

```bash
# 检查是否有未忽略的敏感文件
git status

# 搜索可能的敏感内容
git diff --cached | grep -E "(password|secret|api_key|token)"

# 使用 git-secrets 或 gitleaks 扫描
gitleaks detect --source . -v
```

### 推荐工具

| 工具 | 用途 | 安装 |
|------|------|------|
| [gitleaks](https://github.com/gitleaks/gitleaks) | Git 仓库敏感信息扫描 | `brew install gitleaks` |
| [git-secrets](https://github.com/awslabs/git-secrets) | AWS 凭证检测 | `brew install git-secrets` |
| [pre-commit](https://pre-commit.com/) | Git hooks 框架 | `pip install pre-commit` |
| [1Password](https://1password.com/) | 密码管理器 | - |
| [Vault](https://www.vaultproject.io/) | 机密管理 | - |

### 团队协作安全

#### 分享敏感信息

1. **使用密码管理器**：1Password、Bitwarden
2. **加密邮件**：PGP 加密
3. **临时链接**：使用支持自毁的分享服务
4. **不要**：
   - 在 Slack/微信直接发送
   - 通过 Git 提交
   - 放在共享文档中明文存储

#### 权限管理

```yaml
# 推荐的权限分级
roles:
  - name: developer
    access:
      - code_repo: read/write
      - confluence: read/write
      - jira: read/write
      - credentials: read-only (limited)

  - name: tech_lead
    access:
      - all developer permissions
      - credentials: read/write
      - deployment: approve

  - name: admin
    access:
      - full access
```

---

## 安全最佳实践

### 1. 最小权限原则

- 只授予必要的权限
- 定期审查权限配置
- 离职/转岗立即回收权限

### 2. 密钥轮换

- API 密钥：每 90 天
- 数据库密码：每 60 天
- 部署凭证：每 30 天或人员变动时

### 3. 审计日志

保留所有敏感操作的审计日志：
```bash
# 示例：记录敏感文件访问
auditctl -w /path/to/secrets -p rwa -k secrets_access
```

### 4. 双因素认证

所有生产环境访问强制启用 2FA

---

## 事件响应

### 发现泄露时

1. **立即轮换**所有相关凭证
2. **审查日志**确定泄露范围
3. **通知**相关团队和用户
4. **更新**安全策略防止再次发生

### 报告渠道

- 安全团队：security@company.com
- 紧急联系：+86-xxx-xxxx-xxxx
