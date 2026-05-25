# django-django-11039

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: d5276398046ce4a102776a1e67dcac2884d80dfe
**创建时间**: 2019-03-01T10:24:38Z

## 问题描述

sqlmigrate wraps it's outpout in BEGIN/COMMIT even if the database doesn't support transactional DDL
Description
	 
		(last modified by Simon Charette)
	 
The migration executor only adds the outer BEGIN/COMMIT ​if the migration is atomic and ​the schema editor can rollback DDL but the current sqlmigrate logic only takes migration.atomic into consideration.
The issue can be addressed by
Changing sqlmigrate ​assignment of self.output_transaction to consider connection.features.can_rollback_ddl as well.
Adding a test in tests/migrations/test_commands.py based on ​an existing test for non-atomic migrations that mocks connection.features.can_rollback_ddl to False instead of overdidding MIGRATION_MODULES to point to a non-atomic migration.
I marked the ticket as easy picking because I included the above guidelines but feel free to uncheck it if you deem it inappropriate.


## 提示信息

I marked the ticket as easy picking because I included the above guidelines but feel free to uncheck it if you deem it inappropriate. Super. We don't have enough Easy Pickings tickets for the demand, so this kind of thing is great. (IMO 🙂)
Hey, I'm working on this ticket, I would like you to know as this is my first ticket it may take little longer to complete :). Here is a ​| link to the working branch You may feel free to post references or elaborate more on the topic.
Hi Parth. No problem. If you need help please reach out to e.g. ​django-core-mentorship citing this issue, and where you've got to/got stuck. Welcome aboard, and have fun! ✨

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_sqlmigrate_for_non_transactional_databases (migrations.test_commands.MigrateTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
