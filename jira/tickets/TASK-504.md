# TASK-504: CI 跨平台测试

**EPIC**: EPIC-005 | **Milestone**: M1 | **优先级**: P1 | **工时**: 4h | **状态**: ready | **依赖**: TASK-503

## 需求
在 CI 中测试生成的 binaries 和 install.sh 在 3 个平台的可执行性。

## AC
- **AC-1**: binary 可执行测试
  - Given: 每个平台 binary
  - When: 运行 `./eket-* --version`
  - Then: 输出版本号，无报错

- **AC-2**: install.sh 测试
  - Given: 生成的 install.sh
  - When: 在 3 个平台运行
  - Then: 下载 + 校验 + 安装成功

## 技术方案
```yaml
test-install:  # 新增 job
  needs: create-release
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, macos-14]
  runs-on: ${{ matrix.os }}
  steps:
    - run: curl -fsSL https://github.com/godlockin/eket/releases/download/${{ github.ref_name }}/install.sh | bash
    - run: eket --version
    - run: eket doctor
```

## 交付物
- [ ] `.github/workflows/release.yml` 新增 `test-install` job
- [ ] 测试报告

## 时限
**4h**
