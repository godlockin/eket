# django-django-15498

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: d90e34c61b27fba2527834806639eebbcfab9631
**创建时间**: 2022-03-10T19:47:15Z

## 问题描述

Fix handling empty string for If-Modified-Since header
Description
	
Empty string used to be ignored for If-Modified-Since header, but now raises exception since d6aff369ad3.
Fix handling empty string for If-Modified-Since header
Description
	
Empty string used to be ignored for If-Modified-Since header, but now raises exception since d6aff369ad3.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_was_modified_since_empty_string (view_tests.tests.test_static.StaticUtilsTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
