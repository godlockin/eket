# TASK-093: docs/06-sop 与 template/docs 职责边界明确 + 06-sop 清理

## 元数据
- **状态**: ready
- **类型**: chore
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: TASK-090

## 背景

`docs/06-sop/` 包含 MASTER-RULES、SLAVER-RULES 等运作规程，共 30+ 文件。
但这些文件的**正本**在 `template/docs/`（供外部项目初始化时复制），
CLAUDE.md 也明确引用的是 `template/docs/MASTER-RULES.md`。

`docs/06-sop/` 是副本还是主本？两者是否同步？需要在 TASK-090 完成后
（docs/ 清理完毕）明确：

- 正本 = `template/docs/`（用于 init-project.sh 复制到外部项目）
- `docs/06-sop/` = eket 内部遵循的运作规程（内外模型下，eket 自用版本）

两者**可以不同**（外部简化版 vs 内部完整版），但需要在 README.md 中注明。

## 验收标准

1. 比对 `docs/06-sop/` vs `template/docs/` 重叠文件列表
2. 对于完全重复的文件：删除 `docs/06-sop/` 副本，改为 symlink 或在 README 中标注「正本在 template/docs/」
3. 对于 `docs/06-sop/` 独有内容：保留并说明为何 eket 内部有额外规程
4. 更新 `docs/README.md` 中关于 SOP 的说明

## 重叠文件检查命令

```bash
ls template/docs/ | sort > /tmp/template.txt
ls docs/06-sop/ | sort > /tmp/sop.txt
comm -12 /tmp/template.txt /tmp/sop.txt
```
