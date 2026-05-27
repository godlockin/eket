---
name: PR Pre-Flight Checklist
created: 2026-05-27
source: EPIC-016 AB Review, taste-skill patterns, ADVERSARIAL-REVIEW-PLAYBOOK
---

# PR Pre-Flight Checklist

> **提交 PR 前的强制自检清单**

在运行 `/eket-submit-pr` 前，必须通过以下检查。P0 必须全部通过，P1 建议通过，P2 可选。

---

## P0 必须通过（阻断 PR 提交）

任何一项不通过，禁止提交 PR。

### 代码质量

- [ ] **无 placeholder 注释** — 搜索 `TODO:`, `FIXME:`, `XXX:`, `HACK:`，确认无遗留占位
  ```bash
  grep -rn "TODO:\|FIXME:\|XXX:\|HACK:" src/ --include="*.ts" --include="*.tsx"
  ```
  
- [ ] **无 any 类型泄漏** — TypeScript 严格模式，无 `any` 或 `@ts-ignore`
  ```bash
  grep -rn ": any\|as any\|@ts-ignore\|@ts-expect-error" src/ --include="*.ts" --include="*.tsx"
  ```

- [ ] **无 console.log 遗留** — 仅允许 `console.error`/`console.warn` 用于错误日志
  ```bash
  grep -rn "console\.log\|console\.debug" src/ --include="*.ts" --include="*.tsx"
  ```

- [ ] **无硬编码敏感信息** — 密钥、密码、token 必须通过环境变量
  ```bash
  grep -rn "password\|secret\|api_key\|apiKey\|token" src/ --include="*.ts" | grep -v "process\.env\|config\."
  ```

### 错误处理

- [ ] **无未处理的 Promise** — 所有 async 函数有 try/catch 或 .catch()
  
- [ ] **无空 catch 块** — catch 块必须记录错误或重新抛出
  ```bash
  grep -rn "catch.*{.*}" src/ --include="*.ts" | grep -v "console\|throw\|logger\|error"
  ```

- [ ] **配置错误有明确提示** — 环境变量缺失时抛出描述性错误，非静默失败

### 测试覆盖

- [ ] **单元测试通过** — `npm test` 全部绿灯
  
- [ ] **边界条件有测试** — 空数组、null、undefined、超大值等边界情况
  
- [ ] **核心逻辑覆盖率 >= 80%** — 新增代码的行覆盖率

### 模块导出

- [ ] **新模块已导出到 index.ts** — 公共 API 在入口文件可访问
  
- [ ] **类型定义已导出** — interface/type 在 types.ts 或 index.ts 导出

---

## P1 建议通过（强烈建议修复）

不阻断提交，但 Review 时大概率要求修改。

### 代码规范

- [ ] **函数单一职责** — 单个函数 < 50 行，做且只做一件事
  
- [ ] **命名语义清晰** — 变量/函数/类名能自解释，无缩写（除非公认）

- [ ] **无魔法数字** — 使用常量替代字面量
  ```typescript
  // Bad
  if (retryCount > 3) { ... }
  // Good
  const MAX_RETRY = 3;
  if (retryCount > MAX_RETRY) { ... }
  ```

- [ ] **无重复代码块** — 相似逻辑提取为共享函数

### 性能安全

- [ ] **无 N+1 查询** — 批量操作使用 batch/bulk API

- [ ] **无阻塞操作** — I/O 操作异步化，无 `*Sync` 调用

- [ ] **资源正确释放** — 数据库连接、文件句柄在 finally 中关闭

### 文档注释

- [ ] **公共 API 有 JSDoc** — 导出的函数/类有参数和返回值说明

- [ ] **复杂逻辑有注释** — 非显而易见的算法/业务规则有解释

- [ ] **CHANGELOG 已更新** — 新功能/修复记录到变更日志

- [ ] **大文档有快速索引** — >200行的 .md 文件必须有 `## 快速索引` 章节
  ```bash
  ./scripts/check-lazy-load.sh template/docs/  # 检查所有文档
  ```

---

## P2 可选（锦上添花）

不影响合并，但能提升代码质量。

### 进阶质量

- [ ] **圈复杂度 < 10** — 复杂函数拆分为子函数
  
- [ ] **依赖最小化** — 无未使用的 import

- [ ] **immutable 优先** — 使用 `const`、`readonly`、避免参数修改

### 可观测性

- [ ] **关键路径有日志** — 入口/出口/异常点记录结构化日志

- [ ] **错误包含上下文** — 错误信息包含操作、输入、状态

### 测试质量

- [ ] **测试名称描述行为** — `should return empty array when input is null`

- [ ] **无 flaky test** — 测试可重复运行，无随机失败

- [ ] **mock 范围最小** — 只 mock 外部依赖，不 mock 被测逻辑

---

## 快速检查脚本

```bash
#!/bin/bash
# pr-preflight.sh — 一键执行 P0 检查

echo "=== PR Pre-Flight Check ==="

# P0-1: Placeholder comments
echo -n "Checking placeholders... "
if grep -rqn "TODO:\|FIXME:\|XXX:\|HACK:" src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
  echo "FAIL - Found placeholder comments"
  exit 1
fi
echo "OK"

# P0-2: any types
echo -n "Checking any types... "
if grep -rqn ": any\|as any\|@ts-ignore" src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
  echo "FAIL - Found any types or @ts-ignore"
  exit 1
fi
echo "OK"

# P0-3: console.log
echo -n "Checking console.log... "
if grep -rqn "console\.log\|console\.debug" src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
  echo "FAIL - Found console.log"
  exit 1
fi
echo "OK"

# P0-4: Tests
echo -n "Running tests... "
npm test --silent 2>/dev/null
if [ $? -ne 0 ]; then
  echo "FAIL - Tests failed"
  exit 1
fi
echo "OK"

echo "=== All P0 checks passed ==="
```

---

## 来源与参考

本检查清单整合自：

1. **EPIC-016 AB Review** — 对抗式验收发现的常见问题模式
2. **taste-skill 核心维度** — placeholder/error/any/export/edge-case/config 六维检查
3. **ADVERSARIAL-REVIEW-PLAYBOOK** — 挑刺组发现的典型漏洞
4. **Immutable Six** — 类型安全、错误处理、fail-fast、DRY、不可变原则

---

## 使用方式

### 手动检查

1. 打开本文件
2. 复制 P0 + P1 section
3. 逐项勾选，不通过项先修复
4. 全部通过后执行 `/eket-submit-pr`

### 集成检查

将 `pr-preflight.sh` 加入 pre-push hook：

```bash
# .git/hooks/pre-push
bash scripts/pr-preflight.sh || exit 1
```

### PR 描述模板

```markdown
## Pre-Flight Checklist

### P0 必须通过
- [x] 无 placeholder 注释
- [x] 无 any 类型泄漏
- [x] 无 console.log 遗留
- [x] 无硬编码敏感信息
- [x] 无未处理的 Promise
- [x] 无空 catch 块
- [x] 配置错误有明确提示
- [x] 单元测试通过
- [x] 边界条件有测试
- [x] 核心逻辑覆盖率 >= 80%
- [x] 新模块已导出到 index.ts
- [x] 类型定义已导出

### P1 建议通过
- [x] 函数单一职责
- [x] 命名语义清晰
- [ ] _(可选说明跳过原因)_
```

---

> **核心原则**：P0 全部通过才能提交，P1 强烈建议，P2 持续改进
