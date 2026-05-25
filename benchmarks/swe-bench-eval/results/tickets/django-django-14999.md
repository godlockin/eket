# django-django-14999

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: a754b82dac511475b6276039471ccd17cc64aeb8
**创建时间**: 2021-10-16T09:31:21Z

## 问题描述

RenameModel with db_table should be a noop.
Description
	
A RenameModel operation that already has db_table defined must be a noop.
In Postgres, it drops and recreates foreign key constraints. In sqlite it recreates the table (as expected for a table renaming).


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_rename_model_with_db_table_noop (migrations.test_operations.OperationTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
