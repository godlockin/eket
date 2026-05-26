# TASK-E16-05: Memory 模板规范化

**EPIC**: EPIC-016  
**状态**: ready  
**优先级**: P2  
**预估**: 1d  
**负责人**: 待分配  
**依赖**: 无

---

## 背景

借鉴 ECC 的 SKILL.md 模板结构，统一 `confluence/memory/` 文件格式。

## 目标

为 memory 文件建立统一模板，增加结构化元数据。

## 范围

### 1. 当前问题

- memory 文件格式不统一
- 缺少 frontmatter 元数据
- 无"何时使用"指引
- 无验证脚本

### 2. 目标模板

```markdown
---
name: pattern-name
type: pattern | pitfall | lesson | glossary
created: 2026-05-27
source: TASK-XXX
tags: [tag1, tag2]
confidence: high | medium | low
---

# 标题

## 场景/症状
[何时会遇到这个问题/模式]

## 方案/根因
[解决方案或问题根因]

## 示例
[代码或命令示例]

## 反模式（可选）
[不应该怎么做]

## 相关
- [[other-pattern]]
- [[related-pitfall]]
```

### 3. 目录规范

```
confluence/memory/
├── patterns/       # 可复用模式
├── pitfalls/       # 踩坑记录
├── lessons/        # 经验教训
├── glossary/       # 术语表
└── memory-index.md # 索引
```

### 4. 验证脚本

```bash
# scripts/check-memory-format.sh
# 检查 frontmatter 完整性
# 检查必要章节存在
# 检查 source 字段有效
```

## 验收标准

- [ ] 模板文档 `template/memory-template.md` 创建
- [ ] 现有 memory 文件迁移（至少 pitfalls/）
- [ ] `check-memory-format.sh` 脚本可用
- [ ] CI 添加 memory 格式检查（可选）

## 技术要点

- 参考 ECC SKILL.md frontmatter 格式
- 保持向后兼容（旧文件可继续使用）
- 索引自动生成

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Ticket | Master |
