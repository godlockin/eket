# 大规模文档重组的经验教训

## 背景

Round 23~24 对 docs/ 和 confluence/memory/ 进行大规模重组：
- docs/ 从 6 个数字编号目录 → 语义目录，删除 33,875 行历史文件
- confluence/memory/ 新增 research/、lessons/ 目录，修正文件位置，清理 INBOX 重复
- docs/reference/EKET-PROTOCOL.md 从 20KB 全文副本压缩为 19 行导航文档

## 经验教训

### ✅ 有效做法

**两步法：先结构重组，后内容审计**
- Step 1：只移动文件/重命名目录，不修改内容（git mv）
- Step 2：审计内容质量（冗余/过时/缺失），做增删改
- 两步合并 = 无法判断文件消失是"移走了"还是"删掉了"

**协议/规范的单一权威源原则**
- 规范正文只存一份（如 EKET-PROTOCOL.md 在 template/docs/）
- docs/reference/ 应是导航文档（19 行），指向权威源，不维护副本
- 副本必然落后于原文，且无法通过搜索发现哪个是最新的

**confluence/memory/ 分类法**
```
confluence/memory/
  patterns/       # 可复用的架构/设计模式
  pitfalls/       # 已知坑，避免重蹈
  glossary/       # 术语表
  research/       # 外部项目研究笔记
  lessons/        # 经验教训（本目录）
  retrospectives/ # 里程碑回顾
```
分类依据：能查到 vs 怕踩坑 vs 学到了什么

**git tag 打在正确分支**
- 重组完成后如需打版本 tag，先确认当前分支
- `git log --oneline -3` 验证 HEAD 是预期的 commit

### ❌ 踩坑记录

**数字编号目录无法表达语义**
- 问题：`docs/01/`、`docs/02/` 在文件系统中不可读，搜索结果无意义
- 教训：目录名应直接表达内容（`architecture/`、`reference/`、`guides/`）

**存根文件遗留空 TODO**
- 症状：创建了 `confluence/memory/lessons/` 目录，放了一个只有标题和 `TODO` 的文件
- 后果：下一个 instance 不知道这是"占位"还是"遗忘"，浪费 context 处理
- 规则：**要么当场完成，要么不建文件**；必须建时写明 `STATUS: PLACEHOLDER，预计完成于 [ticket]`

**INBOX 重复文件**
- 现象：同一条 human_feedback 同时存在于 inbox/ 和 confluence/ 下
- 根因：没有在归档时删除原文件
- 规则：INBOX 处理 = 移动（不是复制），移动后原路径不保留

**20KB 副本维护成本**
- EKET-PROTOCOL.md 在 docs/reference/ 维护了完整副本
- 一旦 template/docs/ 的原文更新，副本即刻过时
- 发现时已有 3 处内容偏差，且无 diff 记录

### 💡 下次建议

1. **重组前先建目标目录树**（纸上/注释），确认结构后再动文件
2. **每个新目录必须有 README.md**（哪怕 2 行），说明"放什么"/"不放什么"
3. **reference/ 目录约定**：只放导航文档，正文必须有 `> 权威源：[链接]` 声明
4. **存根文件检查命令**：
   ```bash
   grep -r "^TODO\|^## TODO" confluence/memory/ --include="*.md" -l
   ```
   每次重组结束后运行，确保无遗留空 TODO
5. **大规模删除前**：`git stash` 或新建分支，确保可回滚

## 相关 Ticket

- Round 23~24 文档重组会话
- docs/ 语义化重组（删除 33,875 行）
- EKET-PROTOCOL.md 导航化（20KB → 19 行）
