# TASK-422: 跨平台编译测试

**EPIC**: EPIC-005 | **Milestone**: M2 | **优先级**: P1 | **工时**: 4h | **状态**: ready | **依赖**: TASK-421

## 需求
在 Linux/macOS/WSL2 环境测试预编译包的可执行性和兼容性。

## AC
- **AC-1**: Linux amd64 测试
  - Given: 下载 `eket-rust-linux-amd64`
  - When: 运行 `./eket-rust-linux-amd64 --version`
  - Then: 输出版本号，无 GLIBC 错误

- **AC-2**: macOS arm64 测试
  - Given: 下载 `eket-node-darwin-arm64.js`
  - When: 运行 `node eket-node-darwin-arm64.js --version`
  - Then: 正常执行

- **AC-3**: WSL2 测试
  - Given: WSL2 环境
  - When: 运行 install.sh
  - Then: 正确识别为 linux-amd64，下载成功

## 测试计划
```bash
# 自动化测试脚本（CI）
for platform in linux-amd64 darwin-arm64 darwin-amd64; do
  curl -fsSL https://github.com/.../eket-node-${platform}.js -o /tmp/test
  chmod +x /tmp/test
  /tmp/test --version || echo "FAIL: $platform"
done
```

## 交付物
- [ ] 测试报告 `confluence/testing/EPIC-005-cross-platform-test.md`
- [ ] 兼容性矩阵（OS × 架构）
