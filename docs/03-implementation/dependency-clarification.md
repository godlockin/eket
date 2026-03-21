# EKET 依赖追问机制

**版本**: 1.0.0
**创建时间**: 2026-03-21

---

## 概述

EKET 框架现在包含智能依赖追问机制，当检测到项目缺少必要的依赖配置时，会自动停止并追问用户，确保项目能够正确构建和部署。

---

## 触发条件

当智能体分析用户需求时，会检测以下依赖配置是否缺失：

### 1. 数据源配置 ⚠️ 必选

- 数据库类型和连接方式
- 外部 API 端点和认证
- 文件存储方案
- 搜索引擎配置
- 缓存服务

### 2. 认证和密钥管理 ⚠️ 必选

- API 密钥管理方式
- 用户认证方案
- OAuth 凭证

### 3. 基础设施

- 部署目标（本地/Docker/云服务）
- 域名和 HTTPS 配置
- CDN 配置

### 4. 第三方服务

- 邮件服务
- 短信服务
- 支付服务
- 监控和日志

---

## 追问流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 用户提交需求 (inbox/human_input.md)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 智能体分析需求，检测依赖配置                               │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   配置完整                    配置缺失
        │                         │
        │                         │
        ▼                         ▼
┌───────────────┐       ┌─────────────────────────────────────┐
│  继续执行     │       │  3. 创建追问文件                       │
│               │       │  inbox/dependency-clarification.md  │
└───────────────┘       └────────────────┬────────────────────┘
                                         │
                                         ▼
                                ┌─────────────────────────────────────┐
                                │  4. 停止执行，等待用户填写             │
                                └────────────────┬────────────────────┘
                                                 │
                                                 ▼
                                ┌─────────────────────────────────────┐
                                │  5. 用户填写依赖信息                  │
                                └────────────────┬────────────────────┘
                                                 │
                                                 ▼
                                ┌─────────────────────────────────────┐
                                │  6. 用户运行 /eket-ask 确认           │
                                └────────────────┬────────────────────┘
                                                 │
                                                 ▼
                                ┌─────────────────────────────────────┐
                                │  7. 智能体继续执行项目构建            │
                                └─────────────────────────────────────┘
```

---

## 用户操作指南

### 步骤 1: 查看追问文件

当智能体检测到缺失依赖配置时，会创建：

```
inbox/dependency-clarification.md
```

### 步骤 2: 填写依赖信息

编辑追问文件，填写必要信息：

```markdown
## 数据源配置

数据库：PostgreSQL
连接方式：Docker (docker-compose)

外部 API:
- Gemini API (AI 对话)
- SendGrid (邮件发送)

## 认证配置

API 密钥:
- GEMINI_API_KEY
- SENDGRID_API_KEY

用户认证：JWT Token
```

**注意**: 不要填写真实的密钥值，使用占位符即可：

```bash
# ✓ 正确做法
GEMINI_API_KEY=your_api_key_here

# ✗ 错误做法
GEMINI_API_KEY=sk-AbCdEfGhIjKlMnOpQrStUvWxYz123456
```

### 步骤 3: 确认依赖配置

填写完成后，运行：

```bash
/eket-ask
```

智能体会检查填写的信息是否完整。

### 步骤 4: 继续项目构建

依赖配置确认后，智能体会自动继续执行项目构建。

---

## 可用命令

| 命令 | 功能 |
|------|------|
| `/eket-ask` | 检查依赖配置状态，或创建追问文件 |
| `/eket-init` | 项目初始化（包含依赖检查） |
| `/eket-dependency-check` | 运行完整的依赖检查（可选） |

---

## 依赖状态文件

依赖状态保存在：

```
.eket/state/dependency-status.yml
```

状态包括：

| 状态 | 说明 |
|------|------|
| `pending_clarification` | 等待用户填写 |
| `awaiting_human_response` | 等待用户回复 |
| `completed` | 依赖配置已完成 |

---

## 示例追问文件

```markdown
# 数据依赖追问

**生成时间**: 2026-03-21T10:30:00+08:00
**状态**: awaiting_human_response

---

## 🚨 检测到缺失的依赖配置

---

## 1. 数据源配置

### 1.1 数据库

- [x] **需要数据库**:
  - 类型：PostgreSQL
  - 部署方式：Docker

### 1.2 外部 API

- API 名称：Gemini
- 用途：AI 对话
- 认证方式：API Key

---

## 人类回复

**填写日期**: 2026-03-21

### 数据源配置

```
数据库：PostgreSQL
连接方式：Docker (docker-compose)
外部 API: Gemini API
```

### 认证配置

```
API 密钥：GEMINI_API_KEY
用户认证：JWT Token
```

---

**状态**: `awaiting_human_response`
```

---

## Red Line 安全政策

**所有敏感信息禁止上传到 GitHub**

- API Key、Token、Secret
- 数据库密码
- 认证文件（.pem, .key）
- 本地文件绝对路径

敏感信息应通过环境变量管理：

```bash
# .env.example (可以上传)
GEMINI_API_KEY=your_api_key_here
DATABASE_URL=postgresql://localhost:5432/dbname

# .env (禁止上传，已在 .gitignore)
GEMINI_API_KEY=sk-xxxxx
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

---

## 最佳实践

### 1. 提前说明依赖

在 `inbox/human_input.md` 中就说明所需依赖：

```markdown
## 项目需求

我需要创建一个搜索应用，使用以下技术栈：

- 数据库：PostgreSQL
- 外部 API: Gemini API (AI 搜索)
- 部署：Docker + Docker Compose
- 认证：JWT Token
```

### 2. 使用占位符

永远不要填写真实密钥值：

```bash
# ✓ 正确
API_KEY=your_key_here

# ✗ 错误
API_KEY=sk-AbCdEfGhIjKlMnOpQrStUvWxYz123456
```

### 3. 分离环境配置

```bash
.env                # 真实配置（禁止上传）
.env.example        # 示例配置（可以上传）
.env.production     # 生产配置（禁止上传）
```

---

## 故障排查

### 问题 1: 追问文件未创建

**解决**: 手动运行 `/eket-ask` 创建

### 问题 2: 填写后仍然提示缺失

**解决**: 检查填写格式是否正确，确保包含必要字段

### 问题 3: 依赖状态未更新

**解决**: 运行 `/eket-ask` 重新检查

---

## 技术实现

### 依赖检查脚本

```bash
# 运行完整依赖检查
./scripts/dependency-check.sh

# 仅生成依赖清单
./scripts/dependency-check.sh generate
```

### 状态管理

依赖状态使用 YAML 格式：

```yaml
status: pending_clarification
missing_categories:
  - data_sources
  - api_configuration
  - credentials_management
clarification_file: inbox/dependency-clarification.md
created_at: 2026-03-21T10:30:00+08:00
```

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-21
