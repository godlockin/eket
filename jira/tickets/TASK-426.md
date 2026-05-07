# TASK-426: 🔴 修复 setup.sh 缺失 sha256 校验（P0 安全）

**EPIC**: EPIC-005  
**Milestone**: M0 - 紧急安全修复  
**优先级**: 🔴 P0（阻塞所有后续 TASK）  
**预估工时**: 2h  
**实际工时**: 1.5h  
**状态**: code-review  
**依赖**: 无  
**发现来源**: DevOps 评审  
**领取人**: Slaver A（Backend Developer）  
**领取时间**: 2026/05/07  
**PR**: https://github.com/godlockin/eket/pull/182

---

## 🔴 P0 安全问题

### 发现
```bash
# scripts/setup.sh L193
curl -fsSL "$download_url" -o "$tmp_bin" 2>/dev/null
# ❌ 无 sha256 校验！MITM 攻击风险
```

### 风险
- **中间人攻击**：攻击者可在传输过程中替换预编译包
- **供应链污染**：用户安装被篡改的二进制文件
- **影响范围**：所有使用 `scripts/setup.sh` 安装的用户

---

## 验收标准（AC）

- **AC-1**: sha256 校验实现
  - Given: 下载 `eket-rust-linux-amd64` + `*.sha256`
  - When: 运行 setup.sh
  - Then: 自动校验 sha256，匹配通过才继续安装

- **AC-2**: 校验失败处理
  - Given: sha256 不匹配
  - When: 校验失败
  - Then: 删除下载文件，提示用户，返回非 0 退出码

- **AC-3**: 降级方案
  - Given: GitHub 未提供 `.sha256` 文件（旧版本）
  - When: 校验文件不存在
  - Then: **警告用户 + 询问是否继续**（不直接失败）

---

## 技术方案

### 修改 `scripts/setup.sh`

```bash
# L193 附近新增校验逻辑
download_and_verify() {
  local url=$1
  local dest=$2
  
  echo "下载: $url"
  curl -fsSL "$url" -o "$dest" 2>/dev/null || {
    echo "❌ 下载失败: $url"
    return 1
  }
  
  # 尝试下载 sha256 文件
  if curl -fsSL "$url.sha256" -o "$dest.sha256" 2>/dev/null; then
    echo "正在校验 sha256..."
    
    EXPECTED=$(cat "$dest.sha256" | awk '{print $1}')
    ACTUAL=$(sha256sum "$dest" 2>/dev/null | awk '{print $1}')
    
    if [[ "$EXPECTED" != "$ACTUAL" ]]; then
      echo "❌ SHA256 校验失败！"
      echo "  期望: $EXPECTED"
      echo "  实际: $ACTUAL"
      echo "  可能原因: 文件被篡改或传输错误"
      rm -f "$dest" "$dest.sha256"
      return 1
    fi
    
    echo "✅ 校验通过"
    rm -f "$dest.sha256"
  else
    echo "⚠️  警告: 无法下载校验文件 $url.sha256"
    echo "  当前无法验证文件完整性"
    read -p "  是否继续安装？[y/N] " CONTINUE
    [[ "$CONTINUE" != "y" ]] && {
      rm -f "$dest"
      return 1
    }
  fi
  
  return 0
}

# 替换原有 curl 调用
# curl -fsSL "$download_url" -o "$tmp_bin"
download_and_verify "$download_url" "$tmp_bin" || {
  echo "下载或校验失败，退出安装"
  exit 1
}
```

---

## 实现步骤

1. **备份现有文件**:
   ```bash
   cp scripts/setup.sh scripts/setup.sh.backup
   ```

2. **新增 `download_and_verify()` 函数**（脚本顶部）

3. **替换所有 curl 下载调用**:
   - L193: Rust 预编译包下载
   - 其他可能的下载点（全局搜索 `curl.*-o`）

4. **测试场景**:
   - ✅ 正常下载 + 校验通过
   - ✅ sha256 不匹配 → 失败并清理
   - ✅ 无 sha256 文件 → 警告 + 用户确认
   - ✅ 网络异常 → 失败并提示

---

## 注意事项

1. **向后兼容**: 旧版本 Release 无 `.sha256` 时不直接失败
2. **错误提示**: 明确告知用户校验失败原因
3. **清理机制**: 校验失败后删除已下载文件，防止污染
4. **退出码**: 所有失败路径返回 1

---

## 交付物

- [ ] `scripts/setup.sh` 更新（新增 `download_and_verify()` 函数）
- [ ] 测试脚本 `tests/sha256-verify-test.sh`（模拟 3 种场景）
- [ ] 提交 PR 到 `testing` 分支
- [ ] 更新 TASK-417（引用此修复，避免重复工作）

---

## 依赖关系更新

**阻塞**: 
- TASK-417（sha256 逻辑）可复用本 TASK 的 `download_and_verify()` 函数
- TASK-420/421（GitHub Actions）需确保上传 `.sha256` 文件

**前置**: 
- 无（紧急修复，立即执行）

---

**Master 决策**: 
- 本 TASK 完成前，暂停 TASK-416 ~ TASK-425 执行
- Slaver 领取顺序：**TASK-426 → TASK-417/418 → 其他**

---

## 📦 交付物

### 代码变更
- ✅ `scripts/setup.sh`（新增 `download_and_verify()` + 替换 curl 调用）
- ✅ `tests/sha256-verify-test.sh`（3 场景自动化测试）

### 文档
- ✅ 测试验证报告：`jira/tickets/TASK-426/test-report.md`
- ✅ PR #182：https://github.com/godlockin/eket/pull/182

### 测试结果
```bash
场景 1: 正常下载 + 校验通过 ✓
场景 2: sha256 不匹配检测 ✓
场景 3: 无校验文件降级 ✓
```

### 分支同步
- ✅ `feature/TASK-426-sha256-v2` → `testing`
- ✅ `testing` → `main`
- ✅ `main` → `miao`

---

**完成时间**: 2026/05/07  
**状态**: 等待 Master Review
