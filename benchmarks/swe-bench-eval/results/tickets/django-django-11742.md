# django-django-11742

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: fee75d2aed4e58ada6567c464cfd22e89dc65f4a
**创建时间**: 2019-09-04T08:30:14Z

## 问题描述

Add check to ensure max_length fits longest choice.
Description
	
There is currently no check to ensure that Field.max_length is large enough to fit the longest value in Field.choices.
This would be very helpful as often this mistake is not noticed until an attempt is made to save a record with those values that are too long.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_choices_in_max_length (invalid_models_tests.test_ordinary_fields.CharFieldTests)", "test_choices_named_group (invalid_models_tests.test_ordinary_fields.CharFieldTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
