# TASK-637: DAG Schema 安全加固

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 0.5d  
**依赖**: TASK-631  
**层级**: All  
**来源**: Adversarial Review (安全)

---

## 问题描述

1. `nodes` 数组无 `maxItems` 限制，超大 DAG 可耗尽内存 (DoS)
2. `script` 字段无长度限制
3. 缺少安全边界文档说明

## 验收标准

- [x] JSON Schema 添加 `nodes.maxItems: 1000`
- [x] JSON Schema 添加 `script.maxLength: 10000`
- [x] TypeScript/Rust Schema 同步更新
- [x] 添加 `SECURITY.md` 说明 DAG YAML 信任边界

## 修复方案

```json
// jira/schemas/dag.schema.json
{
  "nodes": {
    "type": "array",
    "maxItems": 1000,
    "items": {
      "properties": {
        "script": {
          "type": "string",
          "maxLength": 10000
        }
      }
    }
  }
}
```

## 安全文档要点

```markdown
## DAG 安全边界

**信任模型**: DAG YAML 文件必须来自可信源（CI/CD 管控的 repo）。

**不支持场景**:
- 用户上传的 YAML 文件
- 来自不可信网络的 YAML

**风险**: `script` 字段直接执行，等同于 shell 命令权限。
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (安全 Review) | Master |
| 2026-06-01 | 完成安全加固: maxItems/maxLength + 文档 | Slaver |
