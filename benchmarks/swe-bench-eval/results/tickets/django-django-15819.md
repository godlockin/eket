# django-django-15819

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 877c800f255ccaa7abde1fb944de45d1616f5cc9
**创建时间**: 2022-07-04T18:29:53Z

## 问题描述

inspectdb should generate related_name on same relation links.
Description
	
Hi!
After models generation with inspectdb command we have issue with relations to same enities
module.Model.field1: (fields.E304) Reverse accessor for 'module.Model.field1' clashes with reverse accessor for 'module.Model.field2'.
HINT: Add or change a related_name argument to the definition for 'module.Model.field1' or 'module.Model.field2'.
*
Maybe we can autogenerate
related_name='attribute_name'
to all fields in model if related Model was used for this table


## 提示信息

FIrst solution variant was - ​https://github.com/django/django/pull/15816 But now I see it is not correct. I'll be back with new pull request

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_same_relations (inspectdb.tests.InspectDBTestCase)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
