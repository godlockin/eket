# 文档债 / 技术债清理 — 实战方法论

**创建时间**: 2026-04-15
**来源**: EKET Round 23 实战经验（PR #49~#54）
**适用范围**: 所有长期迭代项目的文档/技术债清理

---

## 目录

1. [文档债的四种类型](#four-types)
2. [清理顺序：先移动后修链](#order)
3. [移动 vs 删除 判断规则](#move-vs-delete)
4. [批量断链检测命令](#broken-link-detection)
5. [archive/ 结构原则](#archive-structure)
6. [预防复发：文档卫生原则](#prevention)
7. [四轮清理的规模参考](#stats)

---

## 1. 文档债的四种类型 {#four-types}

| 类型 | 表现 | 根本原因 |
|------|------|----------|
| **游离文件** | 文件在错误目录，或未被 git 追踪 | 快速迭代时随手创建，没有归档意识 |
| **断链** | `.md` 中的链接指向已删除/移动的文件 | 删除文件时没有同步更新引用方 |
| **过时内容** | 版本号、状态字段、文件路径不再准确 | 内容迭代但索引/状态未同步更新 |
| **重复内容** | 同一文件出现在多个位置 | 复制粘贴而非链接引用 |

---

## 2. 清理顺序：先移动后修链 {#order}

**错误做法**：边扫描边修链，结果改了一半发现目标文件也要移位，返工。

**正确顺序**：
```
1. 先确定所有文件的最终归属（整体规划）
2. 执行所有 git mv / git rm（移动/删除）
3. 最后统一修复断链
```

**原因**：断链检查依赖文件的最终位置，在位置稳定前修链是无效劳动。

**多轮清理策略**（适用于大型积压）：
```
第一轮：整理未追踪文件 → git add + git mv 到正确目录
第二轮：删除明显过时文件（有 git 历史保底）
第三轮：修复因删除产生的断链
第四轮：深度审计（版本号、状态字段、重复内容）
```

每轮独立提交 PR，便于 review 和回滚。

---

## 3. 移动 vs 删除 判断规则 {#move-vs-delete}

| 情况 | 动作 |
|------|------|
| 文件有内容价值，只是位置错了 | `git mv` 到正确目录 |
| 文件是另一个已追踪文件的完全副本 | 删除副本，保留 canonical 版本 |
| 文件已被更新版本完全取代（同主题） | 原版 → `docs/archive/`，新版留原位 |
| 文件是一次性操作记录（归档计划、会议纪要） | → `docs/archive/` |
| 文件已执行完毕的 plan（有实现物为证） | → `docs/plans/completed/` |
| 文件内容无意义（空 README、单行占位） | 直接删除 |

**判断"是否可删"的关键问题**：
1. 是否有其他文件包含了这些内容？
2. 删掉之后哪里还能找到这些信息？
3. git 历史能还原它吗（能 → 删更安全）？

---

## 4. 批量断链检测命令 {#broken-link-detection}

```bash
# 检测所有 tracked .md 文件的内部链接是否有效
git ls-files '*.md' | while read f; do
  dir=$(dirname "$f")
  perl -ne 'while (/\]\(([^)#]+)\)/g) { print "$ARGV: $1\n" }' "$f"
done | grep -v "^http" | while IFS=: read file link; do
  dir=$(dirname "$file")
  resolved=$(python3 -c "import os; print(os.path.normpath(os.path.join('$dir', '$link')))" 2>/dev/null)
  [ -n "$resolved" ] && [ ! -f "$resolved" ] && [ ! -d "$resolved" ] && \
    echo "BROKEN: $file → $link"
done
```

**注意事项**：
- 脚本可能有前导空格误报，每个 BROKEN 结果需人工验证
- `template/` 目录下的引用参见 [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md)

```bash
# 检测特定被删文件的反向引用（删除前必做）
grep -rn "FILENAME_TO_DELETE" . --include="*.md" | grep -v "archive\|reports"

# 快速找出所有未被 git 追踪的 .md 文件
git ls-files --others --exclude-standard | grep "\.md$"
```

---

## 5. archive/ 结构原则 {#archive-structure}

**archive/ 不是垃圾桶，要有结构。**

差的做法：所有"不要的"文件都堆进 `docs/archive/` 根目录。

好的做法：
```
docs/archive/
├── v0.x/           # 按版本归档（有明确版本号的历史文档）
├── audit-history/  # 审计类报告
├── plans/          # 历史设计方案
├── status-history/ # 状态快照
└── *.md            # 确实无法分类的才放根目录
```

**根目录的文件应该尽量少，且 `README.md` 要反映实际结构（不能有死链）。**

归档标准（满足以下任一条即可归档）：
1. 描述已弃用版本的功能
2. 有更新版本的同类文档（旧版归档）
3. 原始设计方案，功能已实现
4. 某时间点的状态记录，无持续指导意义

---

## 6. 预防复发：文档卫生原则 {#prevention}

### 删除文件前必做
```bash
# 先找所有引用方，再删
grep -rn "FILENAME_TO_DELETE" . --include="*.md" | grep -v archive
```

### 新建文档时必想
- 这个文档放在哪个目录？（reports/plans/archive/active）
- 是一次性记录还是长期维护？
- 有没有已存在的同类文档可以更新而不是新建？

### 定期检查（建议每 10 轮迭代一次）
```bash
git ls-files --others --exclude-standard | grep "\.md$"  # 未追踪的 md 文件
grep -rn "IN_PROGRESS" jira/tickets/*.md                 # 僵尸 ticket
ls outbox/review_requests/                               # 过期 review request
```

### 文档位置规范
| 文档类型 | 归属目录 |
|---------|---------|
| 执行记录、完成报告 | `docs/reports/` |
| 仍在推进中的设计方案 | `docs/plans/active/` |
| 已执行完毕的方案 | `docs/plans/completed/` |
| 历史文档、旧版本 | `docs/archive/` |
| 框架知识沉淀 | `confluence/memory/` |
| 新项目脚手架 | `template/` |

---

## 7. 四轮清理的规模参考 {#stats}

*基于 EKET Round 23（22 轮迭代后的系统性清理）*

| 轮次 | 主要内容 | 变更规模 |
|------|----------|---------|
| 第一轮 | 整理游离文件到正确目录 | +79 文件追踪 |
| 第二轮 | 删除过时 v0.9.x 文件 | -5,290 行 |
| 断链修复 | 修复因删除产生的断链 | 7 文件修改 |
| 第三轮 | 移动/删除，修复绝对路径 | -796 行 |
| 第四轮 | plans 分状态整理，去重 | -382 行 |
| 第五轮 | ticket 状态、outbox、archive README | -804 行 |

**总计**：22 轮迭代积累的文档债，约 4 天完成清理，净减少约 **7,000+ 行**过时内容。

---

**参见**：
- [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md) — EKET 特有卫生规则
- [MULTI-AGENT-COLLAB-LESSONS.md](MULTI-AGENT-COLLAB-LESSONS.md) — 多智能体协作经验
- [BORROWED-WISDOM.md](BORROWED-WISDOM.md) — 完整知识库索引
