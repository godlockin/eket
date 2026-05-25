# django-django-11179

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 19fc6376ce67d01ca37a91ef2f55ef769f50513a
**创建时间**: 2019-04-05T15:54:39Z

## 问题描述

delete() on instances of models without any dependencies doesn't clear PKs.
Description
	
Deleting any model with no dependencies not updates the PK on the model. It should be set to None after .delete() call.
See Django.db.models.deletion:276-281. Should update the model line 280.


## 提示信息

Reproduced at 1ffddfc233e2d5139cc6ec31a4ec6ef70b10f87f. Regression in bc7dd8490b882b2cefdc7faf431dc64c532b79c9. Thanks for the report.
Regression test.
I have attached a simple fix which mimics what ​https://github.com/django/django/blob/master/django/db/models/deletion.py#L324-L326 does for multiple objects. I am not sure if we need ​https://github.com/django/django/blob/master/django/db/models/deletion.py#L320-L323 (the block above) because I think field_updates is only ever filled if the objects are not fast-deletable -- ie ​https://github.com/django/django/blob/master/django/db/models/deletion.py#L224 is not called due to the can_fast_delete check at the beginning of the collect function. That said, if we want to be extra "safe" we can just move lines 320 - 326 into an extra function and call that from the old and new location (though I do not think it is needed).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_fast_delete_instance_set_pk_none (delete.tests.FastDeleteTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
