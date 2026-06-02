# TASK-643: foreach ${item} Shell 注入防护

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1d  
**依赖**: TASK-641  
**层级**: All  
**来源**: Adversarial Review (安全)

---

## 问题描述

`foreach` 节点的 `${item}` 替换后直接执行，恶意 items 可注入任意命令。

**示例攻击**：
```yaml
items: ["a; rm -rf /", "$(cat /etc/passwd)"]
script: "echo processing ${item}"
# 展开后: echo processing a; rm -rf /
```

## 验收标准

- [x] items 值在 Schema 层禁止 shell 元字符 (`;|&$\`(){}[]`)
- [x] Rust 展开时 escape 特殊字符
- [x] Node.js 展开时 escape 特殊字符
- [x] 添加 `--unsafe-items` 选项跳过检查（高级用户）
- [x] 单元测试覆盖注入场景

## 修复方案

### Schema 层
```json
// dag.schema.json
"items": {
  "items": {
    "type": "string",
    "pattern": "^[a-zA-Z0-9_\\-\\.\\s/]+$"  // 仅允许安全字符
  }
}
```

### 运行时 escape
```rust
fn escape_shell_arg(s: &str) -> String {
    // 用单引号包裹 + 转义内部单引号
    format!("'{}'", s.replace("'", "'\\''"))
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (安全 Review P0) | Master |
| 2026-06-01 | 实现 Shell 注入防护 | Slaver |

## 实现摘要

### 1. JSON Schema (jira/schemas/dag.schema.json)
- items 添加 pattern: `^[a-zA-Z0-9_\-.\s/]+$`
- 仅允许安全字符: 字母数字、下划线、连字符、点、空格、斜杠

### 2. TypeScript (node/src/schemas/dag.ts)
- 新增 `SAFE_ITEM_PATTERN` 正则
- 新增 `escapeShellArg()` 函数
- 新增 `validateForeachItem()` 验证函数
- `validateDag()` 添加 `ValidationOptions` 参数支持 `unsafeItems`
- 新增 `UNSAFE_ITEM` 错误码

### 3. Rust (rust/crates/eket-engine/src/dag/schema.rs)
- 新增 `SAFE_ITEM_PATTERN` (Lazy static)
- 新增 `escape_shell_arg()` 函数
- 新增 `validate_foreach_item()` 函数
- 新增 `ValidationOptions` 结构体
- `validate_with_options()` 方法支持 `unsafe_items` 选项
- `expand_foreach()` 默认 escape items
- `expand_foreach_with_escape()` 可控制是否 escape
- 新增 `UnsafeItem` 错误类型

### 4. 测试覆盖
- Rust: 21 tests pass (包含 10 个新增 shell 注入测试)
- Node.js: 16 tests pass (新增测试文件 tests/schemas/dag.test.ts)
