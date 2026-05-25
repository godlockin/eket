# django-django-12908

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 49ae7ce50a874f8a04cd910882fb9571ff3a0d7a
**创建时间**: 2020-05-13T11:36:48Z

## 问题描述

Union queryset should raise on distinct().
Description
	 
		(last modified by Sielc Technologies)
	 
After using
.annotate() on 2 different querysets
and then .union()
.distinct() will not affect the queryset
	def setUp(self) -> None:
		user = self.get_or_create_admin_user()
		Sample.h.create(user, name="Sam1")
		Sample.h.create(user, name="Sam2 acid")
		Sample.h.create(user, name="Sam3")
		Sample.h.create(user, name="Sam4 acid")
		Sample.h.create(user, name="Dub")
		Sample.h.create(user, name="Dub")
		Sample.h.create(user, name="Dub")
		self.user = user
	def test_union_annotated_diff_distinct(self):
		qs = Sample.objects.filter(user=self.user)
		qs1 = qs.filter(name='Dub').annotate(rank=Value(0, IntegerField()))
		qs2 = qs.filter(name='Sam1').annotate(rank=Value(1, IntegerField()))
		qs = qs1.union(qs2)
		qs = qs.order_by('name').distinct('name') # THIS DISTINCT DOESN'T WORK
		self.assertEqual(qs.count(), 2)
expected to get wrapped union
	SELECT DISTINCT ON (siebox_sample.name) * FROM (SELECT ... UNION SELECT ...) AS siebox_sample


## 提示信息

distinct() is not supported but doesn't raise an error yet. As ​​per the documentation, "only LIMIT, OFFSET, COUNT(*), ORDER BY, and specifying columns (i.e. slicing, count(), order_by(), and values()/values_list()) are allowed on the resulting QuerySet.". Follow up to #27995.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_unsupported_operations_on_combined_qs (queries.test_qs_combinators.QuerySetSetOperationTests)", "test_unsupported_ordering_slicing_raises_db_error (queries.test_qs_combinators.QuerySetSetOperationTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
