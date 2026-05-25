# pytest-dev-pytest-5221

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 4a2fdce62b73944030cff9b3e52862868ca9584d
**创建时间**: 2019-05-06T22:36:44Z

## 问题描述

Display fixture scope with `pytest --fixtures`
It would be useful to show fixture scopes with `pytest --fixtures`; currently the only way to learn the scope of a fixture is look at the docs (when that is documented) or at the source code.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/python/fixtures.py::TestShowFixtures::test_show_fixtures", "testing/python/fixtures.py::TestShowFixtures::test_show_fixtures_verbose"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
