# EPIC-005 决策：pkg 不可行

**决策时间**: 2026-05-07 22:00
**问题**: pkg 不支持 ESM (type: "module")

---

## 问题

CI 报错：
```
SyntaxError: Cannot use import statement outside a module
```

**根因**: 
- `node/package.json` 使用 `"type": "module"`（ESM）
- pkg 仅支持 CommonJS
- 无法打包 ESM 项目

---

## Master 决策

**方案**: **保留 Rust 预编译 + Node 研发版编译**

**理由**:
1. Rust 版已可用（~10 MB，完全满足需求）
2. Node 版作为开发者选项（本地编译）
3. 避免 ESM → CJS 转换成本（重构整个项目）
4. pkg 维护停滞（最后更新 2022）

**调整**:
- ✅ 简版 install.sh 仅下载 Rust 预编译包
- ✅ 研发版 dev-install.sh 支持本地编译 Node
- ❌ 放弃 Node 预编译包（技术限制）

---

## 更新 install-template.sh

移除 Node 下载逻辑，仅保留 Rust：

```bash
# 简版 install.sh（仅 Rust 预编译）
install_binaries() {
  PLATFORM=$(detect_platform)
  
  # 仅下载 Rust binary
  download_and_verify \
    "${BASE_URL}/eket-rust-${PLATFORM}" \
    "/tmp/eket-rust" \
    "${RUST_${PLATFORM^^}_SHA256}" || exit 1
  
  sudo mv /tmp/eket-rust /usr/local/bin/eket
  sudo chmod +x /usr/local/bin/eket
  
  echo "✅ EKET (Rust) 已安装"
  echo "   如需 Node 版，请使用研发版安装：bash scripts/dev-install.sh"
}
```

---

## 更新 CI workflow

release.yml 移除 build-node job，仅保留 build-binary（Rust）。

---

## 影响评估

| 项目 | 影响 |
|------|------|
| **简版安装** | ✅ 仍可用（Rust 版） |
| **研发版安装** | ✅ 不受影响（本地编译） |
| **体积** | ✅ 更优（仅 ~10 MB Rust） |
| **用户体验** | ⚠️ 简版仅 Rust（Node 需研发版） |

**可接受**: Rust 版功能完整，体积更小。

---

**下一步**: 更新 install-template.sh + release.yml
