# Convention: Protocol Versioning

**规范等级**: MUST
**适用**: `protocol/VERSION`、所有读取 `protocol/` 的引擎

---

## 格式

`protocol/VERSION` 是**单行** SemVer 字符串：

```
MAJOR.MINOR.PATCH[-label]
```

当前值（Phase 0）：`0.1.0-draft`

- `MAJOR`：不兼容的 schema 或 state-machine 变更
- `MINOR`：additive（新增字段、新增状态、新增可选约定）
- `PATCH`：文档澄清、typo、不改变字节的格式化
- `-label`（可选）：预发布标签，允许 `draft` / `rc.N` / `next`；带 label 时**视为未发布**，双引擎仅允许开发模式使用

读取规则：

- 文件内容 trim whitespace 后解析；多余空行忽略
- 禁止注释、禁止多行

---

## 何时 bump

### MAJOR

触发场景（任一）：

- 删除或重命名 `schemas/**` 的 required 字段
- 删除 `state-machines/ticket-status.yml` 中已发布的状态
- 更改审计日志列分隔符或列顺序
- 更改锁文件命名或锁协议

发布流程：

1. 单次 PR 同步修改 `schemas/` + `state-machines/` + `lib/state/` + `node/src/core/state/`
2. 双引擎等价性测试（`tests/dual-engine/`）必须绿
3. 迁移脚本或迁移指南落地到 `docs/plans/protocol-MAJOR-migration.md`
4. `VERSION` 从 `X.Y.Z` → `(X+1).0.0`

### MINOR

触发场景：

- 新增**可选**字段到 schema
- 新增状态到 state machine（老状态集合不变）
- 新增约定文档（如本批 5 篇）
- 新增 audit `op` 词汇

流程：schema 与实现同 PR，无需迁移脚本。`VERSION` `X.Y.Z` → `X.(Y+1).0`。

### PATCH

仅限：

- 约定文档措辞、示例修订
- 注释澄清
- 不改字节行为的重构

`VERSION` `X.Y.Z` → `X.Y.(Z+1)`。

---

## 启动自检

两侧引擎在首次共享 FS 写入前**必须**校验协议版本（代码位置已有占位）：

- Shell：`lib/state/schema.sh` → `schema_check_protocol_version`
- Node：`node/src/core/state/schema.ts` → `getProtocolVersion`，`writer.ts` 的 `ensureInit` 触发

### 兼容性矩阵

设运行引擎内置 `ENGINE_PROTO = X.Y.Z`，仓库 `protocol/VERSION = A.B.C`：

| 情况 | 行为 |
|---|---|
| `A == X` 且 `B == Y` | OK |
| `A == X` 且 `B > Y` | OK（引擎可能忽略新字段） |
| `A == X` 且 `B < Y` | OK，但 warn：`protocol: repo version older than engine` |
| `A != X` | **拒绝启动**，stderr `protocol: incompatible major A.B.C vs engine X.Y.Z`，退出码 5 |
| `-label` 存在且 `EKET_ALLOW_PRERELEASE != 1` | 拒绝启动 |

引擎内置版本定义位置：

- Shell：`lib/state/schema.sh` 顶部常量（待加 `EKET_ENGINE_PROTOCOL=0.1`）
- Node：`node/src/core/state/schema.ts` 顶部常量

两侧常量必须同步 PR 同步更新。

---

## 废弃窗口

添加新字段/状态后**不得**立即删除旧的。流程：

1. MINOR N：新字段加入，老字段仍被两侧引擎写/读；文档标注 `@deprecated since X.Y`
2. MINOR N+1：两侧引擎读时仍兼容，但写入路径不再产出老字段；CI warn
3. MAJOR N+1（下一个大版本）：schema 中删除，引擎报错

最短废弃窗口：**一个 MINOR 周期**。

---

## 与业务版本的关系

`protocol/VERSION` 独立于：

- `node/package.json` 的 `version`（Node 引擎版本）
- `CHANGELOG.md` 顶部版本（仓库整体版本）

三者**可能不同步**。发布说明需分别注明 protocol 版本与 npm 版本。

---

## 例子

```
# OK
0.1.0
0.2.0
1.0.0
1.3.2-rc.1

# 非法
v0.1.0           # 禁止前缀 v
0.1              # 必须三位
0.1.0 (draft)    # 空格与括号禁止
```

---

## CI 扫描

- `protocol/VERSION` 必须匹配 `^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$`
- 任何 `schemas/**` 或 `state-machines/**` 变更的 PR，必须同时修改 `VERSION`
- 双引擎启动冒烟测试必须读到同一 `VERSION` 并通过自检
