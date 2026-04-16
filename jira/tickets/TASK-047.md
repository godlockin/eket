# TASK-047: 新增 HR / Algorithm / LLM 三种专家角色

## 元数据
- **ID**: TASK-047
- **优先级**: P1
- **状态**: Done
- **依赖**: TASK-046
- **分支**: feature/TASK-047-expert-roles

## 需求
在 TASK-046 建立的 12 种基础角色上，追加 HR、Algorithm、LLM 三种专家角色，完善 EKET 框架对人才、算法、大模型场景的覆盖。

## 验收标准
- [x] `SlaverRole` 类型扩展至 15 种（hr / algorithm / llm）
- [x] `ALL_ROLES` 长度 = 15
- [x] `ROLE_MAP` 覆盖三类关键词（hr: 8条 / algorithm: 6条 / llm: 6条）
- [x] 三份规则文档：`SLAVER-RULES-HR/ALGORITHM/LLM.md`
- [x] 三个 Skill 文件：`hr/jd-writing`, `algorithm/model-evaluation`, `llm/prompt-engineering`
- [x] role-selector 测试：18 passed（含 3 个新 it 块）
- [x] `npm run build` 0 errors

## 实现细节（Slaver 填写）
- **领取时间**: 2026-04-16
- **完成时间**: 2026-04-16
- **PR**: feature/TASK-047-expert-roles → feature/TASK-046-role-redesign

### 变更文件
| 文件 | 变更类型 |
|------|---------|
| `node/src/core/role-selector.ts` | 修改：扩展 SlaverRole/ALL_ROLES/ROLE_MAP |
| `node/tests/core/role-selector.test.ts` | 修改：length 15, 3 新测试块 |
| `template/docs/SLAVER-RULES-HR.md` | 新增 |
| `template/docs/SLAVER-RULES-ALGORITHM.md` | 新增 |
| `template/docs/SLAVER-RULES-LLM.md` | 新增 |
| `node/src/skills/hr/jd-writing.ts` | 新增 |
| `node/src/skills/algorithm/model-evaluation.ts` | 新增 |
| `node/src/skills/llm/prompt-engineering.ts` | 新增 |

## 测试结果
- role-selector: **18 passed** (0 failed)
- 全量: **1201 passed, 1 pre-existing failed** (rate-limiter，与本 ticket 无关)
- build: **0 errors**

## 知识沉淀
- Skill 文件须 `export default` + named export 双出口，方便注册和按名引用
- `SkillCategory.CUSTOM` 可用于跨领域 skill（hr/llm 等无对应预设分类时）
