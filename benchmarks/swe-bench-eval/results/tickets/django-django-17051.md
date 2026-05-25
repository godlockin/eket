# django-django-17051

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: b7a17b0ea0a2061bae752a3a2292007d41825814
**创建时间**: 2023-07-07T11:01:09Z

## 问题描述

Allow returning IDs in QuerySet.bulk_create() when updating conflicts.
Description
	
Currently, when using bulk_create with a conflict handling flag turned on (e.g. ignore_conflicts or update_conflicts), the primary keys are not set in the returned queryset, as documented in bulk_create.
While I understand using ignore_conflicts can lead to PostgreSQL not returning the IDs when a row is ignored (see ​this SO thread), I don't understand why we don't return the IDs in the case of update_conflicts.
For instance:
MyModel.objects.bulk_create([MyModel(...)], update_conflicts=True, update_fields=[...], unique_fields=[...])
generates a query without a RETURNING my_model.id part:
INSERT INTO "my_model" (...)
VALUES (...)
	ON CONFLICT(...) DO UPDATE ...
If I append the RETURNING my_model.id clause, the query is indeed valid and the ID is returned (checked with PostgreSQL).
I investigated a bit and ​this in Django source is where the returning_fields gets removed.
I believe we could discriminate the cases differently so as to keep those returning_fields in the case of update_conflicts.
This would be highly helpful when using bulk_create as a bulk upsert feature.


## 提示信息

Thanks for the ticket. I've checked and it works on PostgreSQL, MariaDB 10.5+, and SQLite 3.35+: django/db/models/query.py diff --git a/django/db/models/query.py b/django/db/models/query.py index a5b0f464a9..f1e052cb36 100644 a b class QuerySet(AltersData): 18371837 inserted_rows = [] 18381838 bulk_return = connection.features.can_return_rows_from_bulk_insert 18391839 for item in [objs[i : i + batch_size] for i in range(0, len(objs), batch_size)]: 1840 if bulk_return and on_conflict is None: 1840 if bulk_return and (on_conflict is None or on_conflict == OnConflict.UPDATE): 18411841 inserted_rows.extend( 18421842 self._insert( 18431843 item, 18441844 fields=fields, 18451845 using=self.db, 1846 on_conflict=on_conflict, 1847 update_fields=update_fields, 1848 unique_fields=unique_fields, 18461849 returning_fields=self.model._meta.db_returning_fields, 18471850 ) 18481851 ) Would you like to prepare a patch via GitHub PR? (docs changes and tests are required)
Sure I will.
Replying to Thomas C: Sure I will. Thanks. About tests, it should be enough to add some assertions to existing tests: _test_update_conflicts_two_fields(), test_update_conflicts_unique_fields_pk(), _test_update_conflicts_unique_two_fields(), _test_update_conflicts(), and test_update_conflicts_unique_fields_update_fields_db_column() when connection.features.can_return_rows_from_bulk_insert is True.
See ​https://github.com/django/django/pull/17051

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_update_conflicts_two_fields_unique_fields_first (bulk_create.tests.BulkCreateTests.test_update_conflicts_two_fields_unique_fields_first)", "test_update_conflicts_two_fields_unique_fields_second (bulk_create.tests.BulkCreateTests.test_update_conflicts_two_fields_unique_fields_second)", "test_update_conflicts_unique_fields (bulk_create.tests.BulkCreateTests.test_update_conflicts_unique_fields)", "test_update_conflicts_unique_fields_update_fields_db_column (bulk_create.tests.BulkCreateTests.test_update_conflicts_unique_fields_update_fields_db_column)", "test_update_conflicts_unique_two_fields_unique_fields_both (bulk_create.tests.BulkCreateTests.test_update_conflicts_unique_two_fields_unique_fields_both)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
