# django-django-16820

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: c61219a7ae051d2baab53f041e00592011fc550c
**创建时间**: 2023-05-02T06:32:13Z

## 问题描述

Squashing migrations with Meta.index_together -> indexes transition should remove deprecation warnings.
Description
	
Squashing migrations with Meta.index_together -> Meta.indexes transition should remove deprecation warnings. As far as I'm aware, it's a 4.2 release blocker because you cannot get rid of the index_together deprecation warnings without rewriting migrations, see comment.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_create_model_add_index (migrations.test_optimizer.OptimizerTests.test_create_model_add_index)", "test_create_model_index_together_rename_index (migrations.test_optimizer.OptimizerTests.test_create_model_index_together_rename_index)", "test_create_model_remove_index (migrations.test_optimizer.OptimizerTests.test_create_model_remove_index)", "test_create_model_remove_index_together_rename_index (migrations.test_optimizer.OptimizerTests.test_create_model_remove_index_together_rename_index)", "test_add_model_order_with_respect_to_index (migrations.test_autodetector.AutodetectorTests.test_add_model_order_with_respect_to_index)", "Test creation of new model with indexes already defined.", "#22275 - A migration with circular FK dependency does not try"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
