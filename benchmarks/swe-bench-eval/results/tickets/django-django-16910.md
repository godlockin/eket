# django-django-16910

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 4142739af1cda53581af4169dbe16d6cd5e26948
**创建时间**: 2023-05-31T22:28:10Z

## 问题描述

QuerySet.only() doesn't work with select_related() on a reverse OneToOneField relation.
Description
	
On Django 4.2 calling only() with select_related() on a query using the reverse lookup for a OneToOne relation does not generate the correct query.
All the fields from the related model are still included in the generated SQL.
Sample models:
class Main(models.Model):
	main_field_1 = models.CharField(blank=True, max_length=45)
	main_field_2 = models.CharField(blank=True, max_length=45)
	main_field_3 = models.CharField(blank=True, max_length=45)
class Secondary(models.Model):
	main = models.OneToOneField(Main, primary_key=True, related_name='secondary', on_delete=models.CASCADE)
	secondary_field_1 = models.CharField(blank=True, max_length=45)
	secondary_field_2 = models.CharField(blank=True, max_length=45)
	secondary_field_3 = models.CharField(blank=True, max_length=45)
Sample code:
Main.objects.select_related('secondary').only('main_field_1', 'secondary__secondary_field_1')
Generated query on Django 4.2.1:
SELECT "bugtest_main"."id", "bugtest_main"."main_field_1", "bugtest_secondary"."main_id", "bugtest_secondary"."secondary_field_1", "bugtest_secondary"."secondary_field_2", "bugtest_secondary"."secondary_field_3" FROM "bugtest_main" LEFT OUTER JOIN "bugtest_secondary" ON ("bugtest_main"."id" = "bugtest_secondary"."main_id")
Generated query on Django 4.1.9:
SELECT "bugtest_main"."id", "bugtest_main"."main_field_1", "bugtest_secondary"."main_id", "bugtest_secondary"."secondary_field_1" FROM "bugtest_main" LEFT OUTER JOIN "bugtest_secondary" ON ("bugtest_main"."id" = "bugtest_secondary"."main_id")


## 提示信息

Thanks for the report! Regression in b3db6c8dcb5145f7d45eff517bcd96460475c879. Reproduced at 881cc139e2d53cc1d3ccea7f38faa960f9e56597.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_inheritance_deferred2 (select_related_onetoone.tests.ReverseSelectRelatedTestCase.test_inheritance_deferred2)", "test_reverse_one_to_one_relations (defer_regress.tests.DeferRegressionTest.test_reverse_one_to_one_relations)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
