# 任务分析报告：TASK-631

**Slaver**: slaver-001  
**分析时间**: 2026-05-13 01:21  
**预计工时**: 2h  

---

## 1. 需求理解

**核心目标**:  
在 UserPromptSubmit Hook 实现轻量级 context 监控，包括：
- 轮次计数（每次 Hook 触发 +1）
- 文件大小粗估（转换为近似 token 数）
- 阈值警告（10轮 或 ≥50K tokens）
- 异步 Node 触发（≥80K tokens 时启动精确检查）

**验收标准**:
- AC-1: 计数器累加（存储在 `.eket/state/context-turn-count`）
- AC-2: Token 粗估（wc -c × 0.3）
- AC-3: 10轮/50K 时打印警告
- AC-4: 80K 时后台启动 Node 进程（依赖 TASK-632）

---

## 2. 技术方案

### 2.1 Hook 集成点

**路径**: `.claude/hooks/UserPromptSubmit.sh`  
**触发时机**: 每次用户提交 prompt 时

**实现逻辑**:
```bash
#!/bin/bash
# .claude/hooks/UserPromptSubmit.sh

STATE_DIR=".eket/state"
COUNT_FILE="$STATE_DIR/context-turn-count"

# 确保状态目录存在
mkdir -p "$STATE_DIR"

# 读取并累加计数器
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"

# 粗估 tokens（扫描 md/ts/js/json 文件）
file_patterns=(-name "*.md" -o -name "*.ts" -o -name "*.js" -o -name "*.json")
total_bytes=$(find . "${file_patterns[@]}" 2>/dev/null | \
  xargs wc -c 2>/dev/null | \
  tail -1 | \
  awk '{print $1}')
approx_tokens=$((total_bytes * 3 / 10))

# 阈值判断（10轮 OR 50K tokens）
if [ "$count" -ge 10 ] || [ "$approx_tokens" -ge 50000 ]; then
  echo "⚠️ Context 接近阈值 ($count轮, ~${approx_tokens} tokens)" >&2
fi

# 高阈值（80K tokens）异步触发 Node
if [ "$approx_tokens" -ge 80000 ]; then
  if [ -f "node/dist/context-monitor.js" ]; then
    nohup node node/dist/context-monitor.js --check &>/dev/null &
  fi
fi
```

### 2.2 文件大小估算策略

**公式**: `approx_tokens = file_size_bytes × 0.3`

**假设**:
- 平均 1 byte ≈ 0.3 tokens（基于英文/代码混合内容）
- 中文内容偏高（1 byte ≈ 0.4-0.5 tokens），但项目以英文为主

**扫描范围**:
- `.md` (文档、ticket、confluence)
- `.ts` / `.js` (代码)
- `.json` (配置)
- **排除**: `node_modules/`, `.git/`, `dist/`

### 2.3 平台兼容性

**macOS**: ✅ BSD `find` / `wc` / `awk`  
**Linux**: ✅ GNU `find` / `wc` / `awk`  
**Windows Git Bash**: ⚠️ 需测试（可能需 `-maxdepth` 限制）

**风险**: `find` 命令差异（BSD vs GNU）  
**缓解**: 使用兼容参数（`-name` 而非 `-iname`）

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `.claude/hooks/` | 高 | 新增 Hook 文件（首次） |
| `.eket/state/` | 中 | 新增计数器文件 |
| `node/dist/` | 低 | 调用接口（TASK-632 提供） |
| 用户体验 | 低 | stderr 警告（不影响正常流程） |

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 说明 |
|--------|----------|--------|------|
| 4.1 创建 Hook 目录与文件 | 15min | P0 | 初始化 `.claude/hooks/UserPromptSubmit.sh` |
| 4.2 实现计数器逻辑 | 30min | P0 | 读取/累加/写入 |
| 4.3 实现粗估算法 | 30min | P0 | `find + wc + awk` pipeline |
| 4.4 实现阈值警告 | 15min | P0 | stderr 输出 |
| 4.5 实现异步 Node 触发 | 15min | P1 | nohup 后台调用（依赖 TASK-632） |
| 4.6 编写测试脚本 | 30min | P0 | 模拟 10 轮调用 + 验证输出 |

**总计**: ~2h 15min (含缓冲)

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| Hook 失败导致用户操作卡住 | 中 | 高 | 添加 `set +e` 容错，确保 Hook 失败不中断 |
| `find` 扫描大目录（node_modules）耗时 | 高 | 中 | 使用 `-prune` 排除 `node_modules/`, `.git/` |
| 计数器文件并发写入 | 低 | 低 | Shell 原子写入（单进程执行） |
| TASK-632 未完成导致 AC-4 无法验证 | 高 | 低 | AC-4 仅软依赖，失败时静默忽略 |
| Windows 兼容性问题 | 中 | 低 | CI 仅测 macOS + Linux（主流环境） |

---

## 6. 测试策略

### 6.1 单元测试

**手动测试**（Shell 脚本无 Jest）:
```bash
# 测试计数器累加
for i in {1..10}; do
  bash .claude/hooks/UserPromptSubmit.sh
done
cat .eket/state/context-turn-count  # 应输出 10
```

### 6.2 集成测试

```bash
# 测试警告输出
bash .claude/hooks/UserPromptSubmit.sh 2>&1 | grep "⚠️"
# 应在第 10 轮时出现警告
```

### 6.3 回归测试

**CI 平台**: GitHub Actions  
**测试环境**: macOS-latest + ubuntu-latest  
**验证点**:
- 计数器正确累加
- 粗估结果在合理范围（±20%）
- stderr 警告正确触发

---

## 7. 技术债务与后续优化

**已知限制**:
- 粗估算法简单（不考虑 tokenizer 特性）
- 每次全量扫描文件（可能慢）

**优化方向** (留给 TASK-636 Rust 版本):
- 增量扫描（仅统计变更文件）
- 精确 tokenizer（tiktoken-rs）
- 缓存机制（避免重复扫描）

---

## 8. 依赖关系

**上游依赖**: None（独立任务）  
**下游依赖**: TASK-632（提供 `context-monitor.js`）  
**软依赖**: AC-4 需要 TASK-632，但可先实现 AC-1/2/3

---

## 9. 验收自检清单

- [ ] AC-1: 计数器文件每次 +1
- [ ] AC-2: 粗估算法返回合理值
- [ ] AC-3: 10轮 OR 50K 时打印警告
- [ ] AC-4: 80K 时调用 Node（TASK-632 完成后验证）
- [ ] 测试: macOS + Linux 双平台通过
- [ ] 代码: 通过 shellcheck 静态检查
- [ ] 文档: 更新 Hook 说明（如需要）

---

## 10. 等待 Master 审批

**当前状态**: analysis_review  
**提交时间**: 2026-05-13 01:21  
**下一步**: 等待 Master 批准后创建 `feature/TASK-631` 分支实现
