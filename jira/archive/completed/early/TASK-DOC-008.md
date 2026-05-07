# TASK-DOC-008: 专家 × Skills 关联机制（ExpertSkillBridge）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE

## 需求描述
实现专家能力 × Skills 的双向关联：
1. 每位专家可声明"擅长 skills"，用 skills 拓展其分析/执行能力边界
2. 组建专家组时可按 skill 维度动态重组（而非只按角色固定组合）
3. ACTIVE_CONTEXT 注入专家关联的 skills，Slaver 执行时自动加载

## 验收标准
- [ ] 每个专家 persona 文件（`.md`）新增 `skills` 字段，列出该专家关联的 skill IDs
- [ ] `eket expert:skills <EXPERT_ID>` 输出该专家关联的 skills 列表
- [ ] `eket expert:compose --skills tdd,security-review --domain backend` 输出满足条件的专家组合 JSON
- [ ] `eket expert:compose --epic EPIC-001` 根据 EPIC 类型自动推荐专家+skills 组合
- [ ] `task:claim` 时 ACTIVE_CONTEXT.md 的 `## Available Skills` section 更新为专家关联 skills（而非仅 domain skills）
- [ ] `rust/crates/eket-core/src/expert_skill_bridge.rs` 实现 `ExpertSkillBridge` struct
- [ ] `cargo test -p eket-core -- expert_skill` 通过

## 技术要点
### 专家 persona 扩展字段（在所有 7 个默认专家 .md 文件中追加）
```yaml
skills:
  primary:          # 核心关联 skills（总是加载）
    - tdd
    - systematic-debugging
  contextual:       # 按任务类型条件加载
    - security-review    # 当 task type=security
    - performance-tuning # 当 task type=performance
skill_composition:  # 可与哪些专家 skills 合并增强
  - expert: backend
    merged_skills: [api-design, db-optimization]
```

### ExpertSkillBridge（新建 eket-core/src/expert_skill_bridge.rs）
```rust
pub struct ExpertSkillBridge {
    experts: HashMap<String, ExpertProfile>,  // id → profile
}
impl ExpertSkillBridge {
    pub fn load_from_dir(experts_dir: &Path) -> Result<Self>  // 解析所有 .md YAML
    pub fn skills_for_expert(&self, expert_id: &str) -> Vec<String>
    pub fn compose_by_skills(&self, required_skills: &[&str]) -> Vec<ExpertMatch>
    pub fn recommend_for_epic(&self, epic_type: &str) -> Vec<ExpertMatch>
}
pub struct ExpertMatch { pub expert_id: String, pub matched_skills: Vec<String>, pub score: f32 }
```

### expert:compose 命令（新建 expert_compose.rs）
输出 JSON：
```json
{"experts": [{"id":"architect","skills":["tdd","systematic-debugging"],"score":0.9}], "total_skills_covered": [...]}
```

### task:claim ACTIVE_CONTEXT 更新
读取已注册 slaver_role → 找对应专家 → ExpertSkillBridge.skills_for_expert() → 写入 ACTIVE_CONTEXT

## 参考文件
- `~/.claude/skills/eket/experts/default/*.md`（需追加 skills 字段）
- `rust/crates/eket-cli/src/commands/skill_extract.rs`（现有 skill 提取逻辑）
- `rust/crates/eket-cli/src/commands/task_claim.rs`（ACTIVE_CONTEXT 写入位置）
