# django-django-13757

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 3f140dde51c0fe6c350acb7727bbe489a99f0632
**创建时间**: 2020-12-09T14:48:53Z

## 问题描述

Using __isnull=True on a KeyTransform should not match JSON null on SQLite and Oracle
Description
	
The KeyTransformIsNull lookup borrows the logic from HasKey for isnull=False, which is correct. If isnull=True, the query should only match objects that do not have the key. The query is correct for MariaDB, MySQL, and PostgreSQL. However, on SQLite and Oracle, the query also matches objects that have the key with the value null, which is incorrect.
To confirm, edit tests.model_fields.test_jsonfield.TestQuerying.test_isnull_key. For the first assertion, change
		self.assertSequenceEqual(
			NullableJSONModel.objects.filter(value__a__isnull=True),
			self.objs[:3] + self.objs[5:],
		)
to
		self.assertSequenceEqual(
			NullableJSONModel.objects.filter(value__j__isnull=True),
			self.objs[:4] + self.objs[5:],
		)
The test previously only checks with value__a which could not catch this behavior because the value is not JSON null.


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_isnull_key (model_fields.test_jsonfield.TestQuerying)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
