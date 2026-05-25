# django-django-12747

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: c86201b6ed4f8256b0a0520c08aa674f623d4127
**创建时间**: 2020-04-18T16:41:40Z

## 问题描述

QuerySet.Delete - inconsistent result when zero objects deleted
Description
	
The result format of the QuerySet.Delete method is a tuple: (X, Y) 
X - is the total amount of deleted objects (including foreign key deleted objects)
Y - is a dictionary specifying counters of deleted objects for each specific model (the key is the _meta.label of the model and the value is counter of deleted objects of this model).
Example: <class 'tuple'>: (2, {'my_app.FileAccess': 1, 'my_app.File': 1})
When there are zero objects to delete in total - the result is inconsistent:
For models with foreign keys - the result will be: <class 'tuple'>: (0, {})
For "simple" models without foreign key - the result will be: <class 'tuple'>: (0, {'my_app.BlockLibrary': 0})
I would expect there will be no difference between the two cases: Either both will have the empty dictionary OR both will have dictionary with model-label keys and zero value.


## 提示信息

I guess we could adapt the code not to include any key if the count is zero in the second case.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_fast_delete_empty_no_update_can_self_select (delete.tests.FastDeleteTests)", "test_model_delete_returns_num_rows (delete.tests.DeletionTests)", "test_queryset_delete_returns_num_rows (delete.tests.DeletionTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
