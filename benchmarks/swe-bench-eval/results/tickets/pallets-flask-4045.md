# pallets-flask-4045

**来源**: SWE-bench Lite
**仓库**: pallets/flask
**Base Commit**: d8c37f43724cd9fb0870f77877b7c4c7e38a19e0
**创建时间**: 2021-05-13T21:32:41Z

## 问题描述

Raise error when blueprint name contains a dot
This is required since every dot is now significant since blueprints can be nested. An error was already added for endpoint names in 1.0, but should have been added for this as well.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_blueprints.py::test_dotted_name_not_allowed", "tests/test_blueprints.py::test_route_decorator_custom_endpoint_with_dots"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
