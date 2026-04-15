# EKET Red Line - 敏感信息零容忍政策

**版本**: 1.0.0
**生效日期**: 2026-03-21
**优先级**: P0 - 最高优先级

---

## 🚫 Red Line 定义

**所有敏感信息，包括而不仅限于 API Key、认证文件、本地文件绝对路径、账号密码等，禁止上传到 GitHub。**

这是一条不可逾越的 Red Line，违反此政策可能导致：
- 凭证泄露和滥用
- 未授权访问
- 数据泄露
- 法律责任

---

## 敏感信息清单

### 1. API 密钥和令牌 (API Keys & Tokens)

**禁止上传**:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- GitHub Tokens
- 任何第三方服务的 API 密钥

**正确做法**:
```bash
# ✓ 使用 .env 文件（已在 .gitignore 中）
GEMINI_API_KEY=your_key_here

# ✗ 不要硬编码在代码中
const API_KEY = "sk-xxxxx";  // ❌ RED LINE VIOLATION
```

---

### 2. 认证文件和凭证 (Credentials)

**禁止上传**:
- `*.pem` - 私钥文件
- `*.key` - 密钥文件
- `*.p12`, `*.pfx` - PKCS12 证书
- `credentials.json` - 凭证文件
- `secrets.json` - 机密文件
- `auth.json` - 认证文件
- `.netrc` - 网络认证

**正确做法**:
```bash
# ✓ 使用密钥管理服务
# - AWS Secrets Manager
# - Azure Key Vault
# - HashiCorp Vault
# - GitHub Secrets (用于 CI/CD)

# ✓ 本地开发使用 .env 文件
# 确保 .env 在 .gitignore 中
```

---

### 3. 本地文件绝对路径 (Local File Paths)

**禁止上传**:
- `/Users/username/.config/...` - 用户配置路径
- `C:\Users\username\Documents\...` - Windows 用户路径
- `/home/username/.ssh/...` - SSH 密钥路径
- 任何包含用户名的绝对路径

**正确做法**:
```typescript
// ✗ 不要硬编码绝对路径
const configPath = "/Users/chenchen/.config/app/config.json";  // ❌

// ✓ 使用相对路径或环境变量
const configPath = path.join(process.cwd(), 'config', 'config.json');  // ✓
const configPath = process.env.CONFIG_PATH || './config.json';  // ✓
```

---

### 4. 账号密码 (Usernames & Passwords)

**禁止上传**:
- 数据库密码
- 邮箱密码
- 服务器登录密码
- 任何明文密码

**正确做法**:
```bash
# ✓ 使用环境变量
DATABASE_PASSWORD=${DB_PASSWORD}

# ✓ 使用密钥管理服务
# ✓ 使用密码管理器
```

---

### 5. 数据库连接字符串 (Database Connection Strings)

**禁止上传**:
```
✗ mongodb://admin:password123@host:27017/db
✗ postgres://user:pass@localhost:5432/mydb
✗ mysql://root:root@localhost/test
```

**正确做法**:
```bash
# ✓ 使用环境变量
DATABASE_URL=${DATABASE_URL}

# ✓ .env 文件示例
DATABASE_URL=mongodb://localhost:27017/mydb
```

---

### 6. SSH 密钥 (SSH Keys)

**禁止上传**:
- `~/.ssh/id_rsa` - SSH 私钥
- `~/.ssh/id_ed25519` - Ed25519 私钥
- `~/.ssh/known_hosts` - 已知主机
- 任何 SSH 私钥文件

**正确做法**:
```bash
# ✓ SSH 私钥永远不要提交
# ✓ 使用 SSH agent 管理密钥
# ✓ 在 CI/CD 中使用 deploy keys
```

---

### 7. 私有配置文件 (Private Configuration)

**禁止上传**:
- `.env.local`
- `.env.*.local`
- `*.private`
- `*.local.yml`
- `*.local.json`

**正确做法**:
```bash
# ✓ 提供示例文件
.env.example
.env.template

# ✓ 在示例文件中不包含真实值
# .env.example
API_KEY=your_api_key_here
DATABASE_URL=postgres://localhost:5432/mydb
```

---

## .gitignore 配置

EKET 框架已在 `.gitignore` 中包含以下敏感信息保护：

```gitignore
# 敏感信息 - 凭证和密钥
.env
.env.local
.env.*.local
*.pem
*.key
*.crt
*.p12
*.pfx
secrets.json
credentials.json
credentials.yml
*.secret
*.secrets

# API 密钥和令牌
api_keys.txt
tokens.json
auth.json

# 私有配置
private/
*.private
*.local.yml
*.local.json

# 人类反馈中的敏感内容
inbox/human_feedback/*-sensitive.md
inbox/human_feedback/credentials*
inbox/human_feedback/passwords*
```

---

## 代码审查检查清单

在提交代码前，请确认：

- [ ] 代码中没有硬编码的 API 密钥
- [ ] 代码中没有硬编码的密码
- [ ] 代码中没有硬编码的绝对路径
- [ ] `.env` 文件未被添加到 git
- [ ] 凭证文件未被添加到 git
- [ ] SSH 密钥未被添加到 git
- [ ] 提交历史中没有敏感信息

### 使用工具检查

```bash
# 检查是否有敏感文件被跟踪
git ls-files | grep -E '\.(pem|key|p12|pfx|secret)$'

# 检查提交历史中是否有敏感信息
git log --all --full-history -- '**/.env' '**/credentials*' '**/secrets*'

# 使用 truffleHog 检测敏感信息
npm install -g trufflehog
trufflehog filesystem .
```

---

## 如果意外提交了敏感信息

### 立即行动

1. **立即撤销凭证**
   - 在相关服务中撤销/重置 API 密钥
   - 更改密码
   - 撤销 SSH 密钥

2. **从 Git 历史中删除**
   ```bash
   # 使用 BFG Repo-Cleaner
   java -jar bfg.jar --delete-files '*.pem'
   java -jar bfg.jar --replace-text passwords.txt

   # 或使用 git filter-branch
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch path/to/sensitive/file' \
     --prune-empty --tag-name-filter cat -- --all
   ```

3. **强制推送**
   ```bash
   git push origin --force --all
   ```

4. **通知相关人员**
   - 通知团队其他成员
   - 如果是公开仓库，考虑将仓库设为私有

---

## CI/CD 中的敏感信息管理

### GitHub Actions

```yaml
# ✓ 使用 GitHub Secrets
name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        env:
          API_KEY: ${{ secrets.API_KEY }}  # ✓ 从 Secrets 读取
        run: ./deploy.sh
```

### 本地测试

```bash
# ✓ 在本地设置环境变量
export API_KEY=your_key
npm test

# ✓ 或使用 .env 文件
# .env.local (确保在 .gitignore 中)
API_KEY=your_key
```

---

## 最佳实践

### 1. 使用密钥管理服务

| 服务 | 用途 |
|------|------|
| AWS Secrets Manager | 生产环境密钥管理 |
| Azure Key Vault | Azure 环境密钥管理 |
| HashiCorp Vault | 多环境密钥管理 |
| GitHub Secrets | CI/CD 密钥管理 |
| 1Password | 团队密码管理 |

### 2. 环境变量管理

```bash
# 开发环境
.env.development

# 测试环境
.env.test

# 生产环境
.env.production  # 永远不要提交！
```

### 3. 代码审查流程

在 PR 审查时，审查者应该：
- 检查是否有新的敏感文件被添加
- 检查代码中是否有硬编码的密钥
- 检查是否有绝对路径
- 运行安全扫描工具

---

## 违反 Red Line 的后果

### 技术后果
- 凭证可能被滥用
- 服务可能被未授权访问
- 数据可能泄露

### 组织后果
- 安全审计失败
- 合规性问题
- 声誉损失

### 个人后果
- 可能需要承担法律责任
- 影响职业声誉

---

## 培训和教育

所有使用 EKET 框架的团队成员必须：
1. 阅读并理解此 Red Line 政策
2. 完成安全编码培训
3. 定期参加安全更新会议

---

## 联系和报告

如果发现敏感信息被提交：
1. 立即报告给技术负责人
2. 按照「如果意外提交了敏感信息」流程处理
3. 记录事件并制定预防措施

---

**最后更新**: 2026-03-21
**维护者**: EKET Security Team
