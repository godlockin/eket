# TASK-426: 测试验证报告

**测试执行时间**: 2026/05/07  
**执行人**: Slaver A（Backend Developer）  
**测试环境**: macOS（shasum）

---

## 测试结果

```bash
$ bash tests/sha256-verify-test.sh
[测试] TASK-426 sha256 校验功能

场景 1: 正常下载 + 校验通过
✓ 场景 1 通过：校验匹配

场景 2: sha256 不匹配
✓ 场景 2 通过：检测到校验失败（符合预期）

场景 3: 无 sha256 文件（降级）
✓ 场景 3 通过：检测到无校验文件（会警告用户）

═══════════════════════════════════
所有测试场景通过！
═══════════════════════════════════

测试覆盖：
  ✓ 场景 1: 校验通过
  ✓ 场景 2: 校验失败检测
  ✓ 场景 3: 无校验文件降级
```

---

## 验收标准（AC）验证

### AC-1: sha256 校验实现 ✅
- **Given**: 下载预编译包 + `.sha256` 文件
- **When**: 运行 setup.sh
- **Then**: 自动校验 sha256，匹配通过才继续
- **状态**: ✅ 通过（场景 1 验证）

### AC-2: 校验失败处理 ✅
- **Given**: sha256 不匹配
- **When**: 校验失败
- **Then**: 删除下载文件 + 提示用户 + 返回 1
- **状态**: ✅ 通过（场景 2 验证）

### AC-3: 降级方案 ✅
- **Given**: 无 `.sha256` 文件（旧版本 Release）
- **When**: 校验文件不存在
- **Then**: 警告用户 + 询问是否继续
- **状态**: ✅ 通过（场景 3 验证）

---

## 代码变更

### 1. 新增 `download_and_verify()` 函数（L44-L94）
- 支持 `sha256sum`（Linux）和 `shasum`（macOS）
- 三条路径：
  1. 校验通过 → 删除 `.sha256` 临时文件，返回 0
  2. 校验失败 → 删除下载文件 + 校验文件，返回 1
  3. 无校验文件 → 警告用户 + 询问确认，返回 0/1

### 2. 替换原有 curl 调用（L246）
- **Before**: `curl -fsSL "$download_url" -o "$tmp_bin"`
- **After**: `download_and_verify "$download_url" "$tmp_bin"`

### 3. 新增测试脚本 `tests/sha256-verify-test.sh`
- 3 种场景自动化测试
- 退出码 0 表示所有测试通过

---

## PR 信息

- **PR 链接**: https://github.com/godlockin/eket/pull/182
- **分支**: `feature/TASK-426-sha256-v2` → `testing`
- **提交哈希**: d67fafe3f
- **文件变更**: 
  - `scripts/setup.sh` (+59 行)
  - `tests/sha256-verify-test.sh` (+109 行)

---

## 兼容性测试

- **macOS**: ✅ 使用 `shasum -a 256`
- **Linux**: ⚠️ 未测试（但代码支持 `sha256sum`）
- **降级场景**: ✅ 旧版本 Release 无 `.sha256` 时警告 + 用户确认

---

## 注意事项

1. **依赖关系**:
   - TASK-417 可复用本 TASK 的 `download_and_verify()` 函数
   - TASK-420/421 需确保 GitHub Actions 上传 `.sha256` 文件

2. **风险**:
   - 旧版本 Release 无 `.sha256` 时会进入降级模式（用户可选择继续）
   - 无 `sha256sum`/`shasum` 命令时会直接失败

3. **改进建议**:
   - 可考虑在 `download_and_verify()` 中增加重试逻辑（网络不稳定场景）
   - 可增加 `--skip-checksum` 参数绕过校验（CI 场景）

---

**状态**: ✅ 测试通过，等待 Master Review
