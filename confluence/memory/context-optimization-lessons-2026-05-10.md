# Context Optimization 经验教训（2026-05-10）

**执行范围**: TASK-603 Context P0 优化  
**优化成果**: -4.6k tokens (-51%)  
**执行时间**: 2026-05-09 23:30-23:40

---

## 一、核心发现

### 1.1 配置文件冗余严重

**问题**:
- 项目 CLAUDE.md 124 行，60% 内容重复（MASTER-RULES.md 已有详细版）
- 全局 CLAUDE.md 130 行，包含大量示例（已外化到 patterns/）
- RTK.md 独立文件，实际只是工具配置（可合并）

**影响**:
- SessionStart 固定开销 25k tokens
- 配置文件总计 ~9k tokens，占比 36%

### 1.2 SKILL.md RAG 化未部署

**TASK-239 状态**: 已完成文件拆分，但未替换

**发现**:
- `SKILL-INDEX.md` (2.6KB) 已存在，包含命令速查表
- `SKILL-DETAIL.md` (5.8KB) 已存在，包含详细说明
- **但**: Claude Code 仍读取完整 `SKILL.md` (4.3KB)
- **解决**: 直接替换 SKILL.md 为 INDEX 内容

### 1.3 Hook 输出不可控

**发现**:
- SessionStart hook 输出 ~10KB (2.5k tokens)
- clawd-hook.js 在外部项目 (llm_apps/clawd-on-desk)
- 加载 50 observations，包含大量 done 状态 ticket

**限制**:
- EKET 项目无法直接修改外部 hook
- 需要跨项目协作

---

## 二、优化策略

### 2.1 精简原则

**保留**:
- 关键路径说明（Master/Slaver 工作流）
- 入口引用（指向详细 RULES.md）
- 项目基本信息（架构/技术栈/核心目录）

**移除**:
- 重复内容（详细规则已在其他文件）
- 长命令清单（可按需查 package.json）
- 代码示例（已外化到 patterns/）

**效果**: 124 行 → 50 行 (-60%)

---

### 2.2 文件合并策略

**RTK.md 合并**:
- 独立文件 29 行 (1.1k tokens)
- 实际只是工具配置说明
- 合并到 CLAUDE.md "工具配置"章节
- 节省文件头开销 ~0.6k tokens

**经验**: 小型配置文件（< 50 行）合并优于独立

---

### 2.3 SKILL 索引化

**实施**:
```bash
cp ~/.claude/skills/eket/SKILL.md ~/.claude/skills/eket/SKILL.md.bak
cp ~/.claude/skills/eket/SKILL-INDEX.md ~/.claude/skills/eket/SKILL.md
```

**注意**:
- Claude Code 自动加载 SKILL.md（无法 hook 控制）
- 必须直接替换文件
- 索引化后需提供 `eket skill:search` 检索 DETAIL

**节省**: 4.3KB → 2.7KB (-0.6k tokens)

---

## 三、优化结果

### 3.1 文件级别

| 文件 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 项目 CLAUDE.md | 124 行 (~5k) | 50 行 (~2k) | **-3k** |
| SKILL.md | 4.3KB (1.1k) | 2.7KB (0.5k) | **-0.6k** |
| 全局 CLAUDE.md | 130 行 (1.6k) | 100 行 (1.2k) | **-0.4k** |
| RTK.md | 29 行 (1.1k) | 合并 (0) | **-0.6k** |

### 3.2 SessionStart 开销

| 组件 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 配置文件总计 | ~9k | ~4k | **-5k** |
| SessionStart 总开销 | ~25k | ~20k | **-5k (-20%)** |

---

## 四、可复用模式

### 4.1 配置文件精简 Checklist

优化配置文件时检查：

- [ ] 是否有重复内容（详细版已在其他文件）
- [ ] 是否有冗长示例（可外化到 examples/patterns/）
- [ ] 是否有长清单（可按需查原始 source）
- [ ] 是否有入口引用（指向详细文档）
- [ ] 小文件（< 50 行）是否可合并

### 4.2 SKILL 索引化模式

**适用场景**: SKILL 文件 > 3KB

**实施步骤**:
1. 拆分为 INDEX (命令速查) + DETAIL (完整说明)
2. INDEX 包含: 命令名 + 一行描述 + 参数列表
3. DETAIL 包含: 详细说明 + 示例 + 注意事项
4. 提供 `skill:search` 命令按需检索 DETAIL
5. 替换 SKILL.md 为 INDEX 版本

**节省**: ~40-50%

### 4.3 Hook 输出优化模式

**过滤策略**:
```javascript
const filters = {
  maxObservations: 20,        // 降低数量
  excludeStatus: ['done'],    // 排除已完成
  maxAge: 7 * 24 * 3600 * 1000, // 时间窗口
  priorityTypes: ['in_progress', 'blocked', 'review']
};
```

**预期节省**: ~50% (11.9k → 5k chars)

---

## 五、陷阱与注意事项

### 5.1 过度精简风险

**错误**: 删除关键入口引用

**案例**: 删除 "读 MASTER-RULES.md" 提示
- **后果**: Master 忘记读规则，直接写代码（违反红线）
- **教训**: 入口引用必须保留

### 5.2 外部依赖限制

**问题**: Hook 输出在外部项目

**教训**:
- 先检查文件归属（本项目 vs 外部）
- 外部文件记录优化建议，不强制修改
- 跨项目协作需沟通

### 5.3 SKILL.md 替换副作用

**风险**: 直接替换破坏 DETAIL 内容

**防护**:
- 替换前备份 `.bak`
- 确认 DETAIL 文件独立存在
- 验证 `skill:search` 命令可用

---

## 六、下次改进

### 6.1 动态加载机制

**目标**: 配置文件按需加载

**方案**:
- SessionStart 只注入 < 5k tokens 核心内容
- 提供 `/config show <section>` 按需查看
- Skills 索引 → `/skills search` 检索

**预期**: SessionStart 再降 -5k → 15k tokens

### 6.2 Hook 过滤内置化

**目标**: EKET 自主控制 context 注入

**方案**:
- 实现 `eket context:filter` 命令
- Hook 调用该命令过滤 observations
- 支持配置过滤规则（.eket/context-filter.json）

### 6.3 配置文件版本化

**问题**: 优化后向后兼容性

**方案**:
- 配置文件添加 version 字段
- 支持 v1 (详细) / v2 (精简) 并存
- 用户可选择版本（默认最新）

---

## 七、统计数据

**优化前**:
- 配置文件总计: ~9k tokens
- SessionStart 开销: ~25k tokens
- 配置占比: 36%

**优化后**:
- 配置文件总计: ~4k tokens
- SessionStart 开销: ~20k tokens
- 配置占比: 20%

**节省**:
- 绝对值: -5k tokens
- 相对值: -51% (配置文件), -20% (SessionStart)

**长期影响**:
- 长会话支持轮数: +30% (预估)
- 每轮平均 token: 降低 ~500 tokens

---

## 八、验证清单

下次启动新会话时检查：

- [ ] SessionStart system reminder 长度减少
- [ ] 配置文件部分 < 5k tokens
- [ ] SKILL 部分仅显示索引（< 1k tokens）
- [ ] 首轮对话 token 消耗降低
- [ ] 长会话可支撑更多轮对话

---

## 九、相关文件

| 文件 | 用途 |
|------|------|
| `TASK-603-optimization-summary.md` | 执行总结 |
| `TASK-603-optimization-log.md` | 详细日志 |
| `CLAUDE.md` (项目) | 精简后版本 |
| `~/.claude/CLAUDE.md.bak` | 全局配置备份 |
| `~/.claude/skills/eket/SKILL.md.bak` | SKILL 备份 |
| `~/.claude/RTK.md.bak` | RTK 归档 |

---

**建立时间**: 2026-05-10  
**维护状态**: ✅ 已归档  
**适用范围**: EKET + 通用 Claude Code 配置优化  
**优先级**: P0（影响所有会话）
