# django-django-15061

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 2c01ebb4be5d53cbf6450f356c10e436025d6d07
**创建时间**: 2021-11-04T17:15:53Z

## 问题描述

Remove "for = ..." from MultiWidget's <label>.
Description
	
The instance from Raw MultiWidget class generate id_for_label like f'{id_}0'
It has not sense.
For example ChoiceWidget has self.add_id_index and I can decide it myself, how I will see label_id - with or without index.
I think, it is better to remove completely id_for_label method from MultiWidget Class.


## 提示信息

I agree that we should remove for from MultiWidget's <label> but not because "It has not sense" but to improve accessibility when using a screen reader, see also #32338. It should be enough to return an empty string: def id_for_label(self, id_): return ''
​PR

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_form_as_table (forms_tests.field_tests.test_multivaluefield.MultiValueFieldTest)", "test_form_as_table_data (forms_tests.field_tests.test_multivaluefield.MultiValueFieldTest)", "test_form_as_table (forms_tests.field_tests.test_splitdatetimefield.SplitDateTimeFieldTest)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
