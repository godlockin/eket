# EKET 框架安全审查报告

**审查者**: 安全专家团队
**审查日期**: 2026-03-30
**审查范围**: OpenCLAW 集成后的 REST API 和 Redis 消息通道
**框架版本**: v0.7.3 - v0.9.2

---

## 执行摘要

**整体风险评级**: **中危 (Medium)**

| 风险等级 | 数量 | 状态 |
|---------|------|------|
| 严重 (CVSS >= 9) | 0 | - |
| 高危 (CVSS 7-8.9) | 2 | 待修复 |
| 中危 (CVSS 4-6.9) | 5 | 待修复 |
| 低危 (CVSS < 4) | 4 | 建议改进 |

---

## 严重漏洞 (CVSS >= 9)

**无严重漏洞**

---

## 高危漏洞 (CVSS 7-8.9)

### 1. API Key 硬编码默认值

- **CVSS 评分**: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **位置**: `node/src/index.ts:547`, `node/src/api/openclaw-gateway.ts`
- **影响**: API Gateway 使用硬编码的默认 API Key (`eket-dev-key`)，攻击者可直接绕过认证
- **利用方式**:
  ```bash
  # 攻击者无需任何配置即可使用默认 Key 访问 API
  curl -H "Authorization: Bearer eket-dev-key" http://localhost:8080/api/v1/workflow
  ```
- **修复建议**:
  ```typescript
  // ❌ 当前代码 (高危)
  .option('-k, --api-key <key>', 'API Key', process.env.OPENCLAW_API_KEY || 'eket-dev-key')

  // ✓ 修复方案
  .option('-k, --api-key <key>', 'API Key', process.env.OPENCLAW_API_KEY)

  // 启动时验证
  if (!apiKey) {
    throw new Error('API Key is required. Set OPENCLAW_API_KEY environment variable.');
  }
  ```

### 2. SQL 注入风险 - 参数化查询不完整

- **CVSS 评分**: 7.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N)
- **位置**: `node/src/core/sqlite-client.ts`
- **影响**: 虽然使用了参数化查询，但搜索功能使用 LIKE 语句时未对通配符进行转义
- **代码分析**:
  ```typescript
  // 第 304 行 - 通配符未转义
  const searchPattern = `%${keyword}%`;  // 用户可输入 % _ 等特殊字符
  const retros = stmt.all(searchPattern, searchPattern) as Retrospective[];
  ```
- **利用方式**:
  ```sql
  -- 攻击者输入: %' OR '1'='1
  -- 可能导致信息泄露
  ```
- **修复建议**:
  ```typescript
  // 转义 SQL LIKE 通配符
  function escapeLikePattern(str: string): string {
    return str.replace(/([%_\\])/g, '\\$1');
  }

  const searchPattern = `%${escapeLikePattern(keyword)}%`;
  ```

---

## 中危漏洞 (CVSS 4-6.9)

### 3. Redis 密码明文传输

- **CVSS 评分**: 6.5 (AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:N/A:N)
- **位置**: `node/src/core/redis-client.ts`, `node/src/core/message-queue.ts`
- **影响**: Redis 密码在配置中明文存储，未加密传输
- **修复建议**:
  - 使用 TLS 加密 Redis 连接
  - 支持从密钥管理服务 (如 AWS Secrets Manager) 加载凭证

### 4. 文件路径遍历风险 - 部分缓解

- **CVSS 评分**: 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)
- **位置**: `node/src/api/web-server.ts:215-223`
- **影响**: 虽然有安全检查，但 `path.normalize` 在某些边缘情况下可能绕过
- **代码分析**:
  ```typescript
  // 第 217-223 行 - 检查逻辑正确，但建议增强
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(this.config.staticPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  ```
- **修复建议**:
  ```typescript
  // 使用 path.resolve 确保绝对路径
  const resolvedPath = path.resolve(filePath);
  const resolvedStaticPath = path.resolve(this.config.staticPath);
  if (!resolvedPath.startsWith(resolvedStaticPath + path.sep)) {
    return res.status(403).send('Forbidden');
  }
  ```

### 5. 命令注入风险 - 已缓解但需审查

- **CVSS 评分**: 5.0 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **位置**: `node/src/commands/submit-pr.ts`, `node/src/utils/execFileNoThrow.ts`
- **影响**: 虽然使用了 `execFile` (参数数组) 而非 `exec`，但部分命令参数来自用户输入
- **代码分析**:
  ```typescript
  // 第 376-384 行 - curl 命令参数来自用户
  const result = await execFileNoThrow('curl', [
    '-X', 'POST',
    '-H', ...Object.entries(headers).flatMap(([k, v]) => [k, v]),
    '-d', JSON.stringify(body),  // body 包含用户输入
    apiUrl,
  ]);
  ```
- **修复建议**: 对 curl 参数进行严格验证，特别是 URL 和 Header 值

### 6. 敏感数据明文存储

- **CVSS 评分**: 4.5 (AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H)
- **位置**: `node/src/core/file-queue-manager.ts`
- **影响**: 消息队列数据以明文 JSON 文件存储，包含敏感操作信息
- **修复建议**:
  - 对敏感字段进行加密
  - 设置严格的文件权限 (chmod 600)

### 7. 无速率限制 (Rate Limiting)

- **CVSS 评分**: 4.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L)
- **位置**: `node/src/api/openclaw-gateway.ts`, `node/src/api/web-server.ts`
- **影响**: API 端点无速率限制，可能导致 DoS 攻击
- **修复建议**:
  ```typescript
  import rateLimit from 'express-rate-limit';

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 100, // 最多 100 请求
    message: { error: 'rate_limit_exceeded' }
  });
  app.use('/api/', limiter);
  ```

---

## 低危漏洞 (CVSS < 4)

### 8. 错误信息泄露

- **CVSS 评分**: 3.7 (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N)
- **位置**: 多处 API 错误处理
- **影响**: 详细错误信息可能泄露内部实现细节
- **修复建议**: 生产环境使用通用错误消息，详细日志记录到安全位置

### 9. 无安全响应头

- **CVSS 评分**: 2.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:N)
- **位置**: `node/src/api/web-server.ts`, `node/src/api/openclaw-gateway.ts`
- **影响**: 缺少 CSP、X-Frame-Options 等安全头
- **修复建议**:
  ```typescript
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  ```

### 10. 依赖漏洞风险

- **CVSS 评分**: 依赖具体版本
- **位置**: `node/package.json`
- **当前依赖状态**:
  | 依赖 | 版本 | 已知漏洞 |
  |------|------|---------|
  | better-sqlite3 | ^11.0.0 | 需定期检查 |
  | express | ^5.2.1 | 需定期检查 |
  | ioredis | ^5.3.2 | 需定期检查 |
  | zod | ^3.22.4 | 无已知高危 |
- **修复建议**:
  ```bash
  # 定期运行
  npm audit
  npm audit fix
  ```

### 11. Git 提交历史潜在密钥泄露

- **CVSS 评分**: 3.0 (AV:L/AC:H/PR:H/UI:N/S:L/C:H/I:N/A:N)
- **位置**: `.gitignore`
- **影响**: `.gitignore` 未排除 `.env` 文件
- **修复建议**:
  ```gitignore
  # 添加到 .gitignore
  .env
  .env.*
  *.pem
  *.key
  ```

---

## 最佳实践建议

### 1. API Key 轮换机制
```typescript
interface ApiKeyManager {
  generateKey(): string;
  validateKey(key: string): boolean;
  revokeKey(keyId: string): void;
  rotateKey(keyId: string): Promise<string>;
}
```

### 2. Redis 通信加密
- 启用 Redis TLS
- 使用 `rediss://` 协议前缀
- 配置证书验证

### 3. Git 预提交密钥扫描
```yaml
# .github/workflows/secret-scan.yml
- uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
```

### 4. 依赖漏洞自动检测
```json
// package.json
"scripts": {
  "security:audit": "npm audit --audit-level=high",
  "security:fix": "npm audit fix"
}
```

---

## 合规检查

| 检查项 | 状态 | 备注 |
|-------|------|------|
| [x] OWASP Top 10 覆盖 | 部分 | 需加强 A01:2021 认证和 A03:2021 注入防护 |
| [ ] 数据加密 | 否 | 敏感数据明文存储 |
| [ ] 审计日志 | 部分 | 有基础日志，缺少安全事件审计 |
| [ ] 访问控制 | 部分 | API Key 认证存在，但无细粒度权限 |
| [ ] 速率限制 | 否 | 需添加 |
| [ ] 安全响应头 | 否 | 需添加 |

---

## 修复优先级

### P0 (立即修复)
1. 移除硬编码的默认 API Key
2. 修复 SQL LIKE 注入风险

### P1 (本周内修复)
3. 添加 API 速率限制
4. 增强文件路径遍历保护
5. 添加安全响应头

### P2 (本月内修复)
6. 实现 API Key 轮换机制
7. Redis 通信加密
8. 敏感数据加密存储

### P3 (下季度修复)
9. 完整的审计日志系统
10. Git 预提交密钥扫描

---

## 结论

EKET 框架在安全方面有一定基础（如使用 `execFile` 防止命令注入、参数化 SQL 查询），但在认证、数据保护和访问控制方面存在需要改进的地方。建议优先修复高危漏洞，特别是 API Key 硬编码问题。

**下一步行动**:
1. 创建安全修复追踪 Issue
2. 建立定期安全审计流程
3. 实施 CI/CD 安全门禁

---

**报告版本**: 1.0
**下次审查日期**: 2026-06-30
