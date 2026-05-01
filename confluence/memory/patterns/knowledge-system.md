# EKET 知识沉淀系统模式

**场景**：AI 多智能体框架需要在 session 之间保留和传递经验教训  
**方案**：  
1. 三类结构化目录：`patterns/`（可复用模式）、`pitfalls/`（踩坑）、`glossary/`（术语）  
2. 每类有统一文件格式（场景/方案/来源）  
3. `SLAVER-RULES.md` Hard Rule 强制要求 ticket 完成后写入  
4. `scripts/check-memory-entry.sh` 脚本提醒（warn-only，不阻断）  

**效果**：  
- 经验不再随 session 消亡，所有未来 Slaver 可见  
- 结构化格式便于快速检索，避免重复踩坑  
- warn-only 机制不增加执行负担，降低遗忘风险  

**反例**：  
- 将所有内容堆入单一大文件（如旧 BORROWED-WISDOM.md 713 行）→ 难以检索  
- Soft Rule → 实际执行率趋近于 0（93 个 ticket 几乎无沉淀）  

**来源**：TASK-095
