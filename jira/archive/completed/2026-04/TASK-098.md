# TASK-098: Protocol 单一来源统一

## 元数据
- **状态**: done
- **类型**: chore
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: 无

## 背景

协议定义目前两处并存：
- `protocol/`（根目录）— v0.1.0-draft，Shell/Node 双引擎共同契约，含 schemas/conventions/state-machines
- `docs/reference/EKET-PROTOCOL.md` — 从 `docs/protocol/` 迁移而来，内容是协议说明文档

两者并存必然漂移。需确认权威源并消除冗余。

## 验收标准

1. `protocol/` 为唯一权威源（不变）
2. `docs/reference/EKET-PROTOCOL.md` 改为指向 `protocol/` 的导航文档（不再是内容副本）
3. `docs/reference/openapi.yaml` 确认与 `protocol/schemas/` 关系
4. `protocol/README.md` 明确说明：此目录是 Shell/Node/SDK 的共同协议源

## 实现

1. 读取 `docs/reference/EKET-PROTOCOL.md` 和 `protocol/README.md`，比较内容重叠
2. 将 `docs/reference/EKET-PROTOCOL.md` 改写为导航文档：
```markdown
# EKET 协议参考

**协议正本**：[`/protocol/`](/protocol/)（Shell/Node/SDK 共同契约）

| 目录 | 说明 |
|------|------|
| `protocol/schemas/` | JSON Schema 定义 |
| `protocol/conventions/` | 读写约定 |
| `protocol/state-machines/` | 状态机定义 |

协议版本：见 [`protocol/VERSION`](/protocol/VERSION)
```
3. `protocol/README.md` 开头添加醒目说明：「此为权威源，docs/reference/ 中有导航入口」
4. 检查 `docs/reference/openapi.yaml` —— 若与 protocol/schemas/ 重叠则合并或添加注释说明来源

## 执行命令

```bash
head -30 docs/reference/EKET-PROTOCOL.md
head -30 protocol/README.md
diff docs/reference/openapi.yaml protocol/schemas/ 2>/dev/null || ls protocol/schemas/
```
