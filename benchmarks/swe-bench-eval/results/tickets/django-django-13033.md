# django-django-13033

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: a59de6e89e8dc1f3e71c9a5a5bbceb373ea5247e
**创建时间**: 2020-06-07T14:52:19Z

## 问题描述

Self referencing foreign key doesn't correctly order by a relation "_id" field.
Description
	
Initially discovered on 2.2.10 but verified still happens on 3.0.6. Given the following models:
class OneModel(models.Model):
	class Meta:
		ordering = ("-id",)
	id = models.BigAutoField(primary_key=True)
	root = models.ForeignKey("OneModel", on_delete=models.CASCADE, null=True)
	oneval = models.BigIntegerField(null=True)
class TwoModel(models.Model):
	id = models.BigAutoField(primary_key=True)
	record = models.ForeignKey(OneModel, on_delete=models.CASCADE)
	twoval = models.BigIntegerField(null=True)
The following queryset gives unexpected results and appears to be an incorrect SQL query:
qs = TwoModel.objects.filter(record__oneval__in=[1,2,3])
qs = qs.order_by("record__root_id")
print(qs.query)
SELECT "orion_twomodel"."id", "orion_twomodel"."record_id", "orion_twomodel"."twoval" FROM "orion_twomodel" INNER JOIN "orion_onemodel" ON ("orion_twomodel"."record_id" = "orion_onemodel"."id") LEFT OUTER JOIN "orion_onemodel" T3 ON ("orion_onemodel"."root_id" = T3."id") WHERE "orion_onemodel"."oneval" IN (1, 2, 3) ORDER BY T3."id" DESC
The query has an unexpected DESCENDING sort. That appears to come from the default sort order on the OneModel class, but I would expect the order_by() to take prececence. The the query has two JOINS, which is unnecessary. It appears that, since OneModel.root is a foreign key to itself, that is causing it to do the unnecessary extra join. In fact, testing a model where root is a foreign key to a third model doesn't show the problem behavior.
Note also that the queryset with order_by("record__root") gives the exact same SQL.
This queryset gives correct results and what looks like a pretty optimal SQL:
qs = TwoModel.objects.filter(record__oneval__in=[1,2,3])
qs = qs.order_by("record__root__id")
print(qs.query)
SELECT "orion_twomodel"."id", "orion_twomodel"."record_id", "orion_twomodel"."twoval" FROM "orion_twomodel" INNER JOIN "orion_onemodel" ON ("orion_twomodel"."record_id" = "orion_onemodel"."id") WHERE "orion_onemodel"."oneval" IN (1, 2, 3) ORDER BY "orion_onemodel"."root_id" ASC
So is this a potential bug or a misunderstanding on my part?
Another queryset that works around the issue and gives a reasonable SQL query and expected results:
qs = TwoModel.objects.filter(record__oneval__in=[1,2,3])
qs = qs.annotate(root_id=F("record__root_id"))
qs = qs.order_by("root_id")
print(qs.query)
SELECT "orion_twomodel"."id", "orion_twomodel"."record_id", "orion_twomodel"."twoval" FROM "orion_twomodel" INNER JOIN "orion_onemodel" ON ("orion_twomodel"."record_id" = "orion_onemodel"."id") WHERE "orion_onemodel"."oneval" IN (1, 2, 3) ORDER BY "orion_onemodel"."zero_id" ASC
ASCENDING sort, and a single INNER JOIN, as I'd expect. That actually works for my use because I need that output column anyway.
One final oddity; with the original queryset but the inverted sort order_by():
qs = TwoModel.objects.filter(record__oneval__in=[1,2,3])
qs = qs.order_by("-record__root_id")
print(qs.query)
SELECT "orion_twomodel"."id", "orion_twomodel"."record_id", "orion_twomodel"."twoval" FROM "orion_twomodel" INNER JOIN "orion_onemodel" ON ("orion_twomodel"."record_id" = "orion_onemodel"."id") LEFT OUTER JOIN "orion_onemodel" T3 ON ("orion_onemodel"."root_id" = T3."id") WHERE "orion_onemodel"."oneval" IN (1, 2, 3) ORDER BY T3."id" ASC
One gets the query with the two JOINs but an ASCENDING sort order. I was not under the impression that sort orders are somehow relative to the class level sort order, eg: does specifing order_by("-record__root_id") invert the class sort order? Testing that on a simple case doesn't show that behavior at all.
Thanks for any assistance and clarification.


## 提示信息

This is with a postgres backend. Fairly vanilla Django. Some generic middleware installed (cors, csrf, auth, session). Apps are: INSTALLED_APPS = ( "django.contrib.contenttypes", "django.contrib.auth", "django.contrib.admin", "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles", "corsheaders", "<ours>" )
Something is definitely wrong here. order_by('record__root_id') should result in ORDER BY root_id order_by('record__root') should use OneModel.Meta.ordering because that's what the root foreign key points to ​as documented. That should result in ORDER BY root_join.id DESC order_by('record__root__id') should result in ORDER BY root_join.id
Thanks for this report. A potential fix could be: diff --git a/django/db/models/sql/compiler.py b/django/db/models/sql/compiler.py index abbb1e37cb..a8f5b61fbe 100644 --- a/django/db/models/sql/compiler.py +++ b/django/db/models/sql/compiler.py @@ -727,7 +727,7 @@ class SQLCompiler: # If we get to this point and the field is a relation to another model, # append the default ordering for that model unless it is the pk # shortcut or the attribute name of the field that is specified. - if field.is_relation and opts.ordering and getattr(field, 'attname', None) != name and name != 'pk': + if field.is_relation and opts.ordering and getattr(field, 'attname', None) != pieces[-1] and name != 'pk': # Firstly, avoid infinite loops. already_seen = already_seen or set() join_tuple = tuple(getattr(self.query.alias_map[j], 'join_cols', None) for j in joins) but I didn't check this in details.
FWIW, I did apply the suggested fix to my local version and I do now get what looks like correct behavior and results that match what Simon suggested should be the sort results. Also my annotate "workaround" continues to behave correctly. Looks promising.
Jack, would you like to prepare a patch?
​PR
I did some additional work on this to verify the scope of the change. I added the following test code on master and ran the entire test suite: +++ b/django/db/models/sql/compiler.py @@ -727,6 +727,11 @@ class SQLCompiler: # If we get to this point and the field is a relation to another model, # append the default ordering for that model unless it is the pk # shortcut or the attribute name of the field that is specified. + if (field.is_relation and opts.ordering and name != 'pk' and + ((getattr(field, 'attname', None) != name) != + (getattr(field, 'attname', None) != pieces[-1]))): + print(f"JJD <{getattr(field, 'attname', '')}> <{name}> <{pieces[-1]}>") + breakpoint() if field.is_relation and opts.ordering and getattr(field, 'attname', None) != name and name != 'pk': # Firstly, avoid infinite loops. already_seen = already_seen or set() The idea being to display every time that the change from name to pieces[-1] in the code would make a difference in the execution. Of course verified that when running the reproducer one does go into the test block and outputs: JJD <root_id> <record__root_id> <root_id>. The code is not triggered for any other test across the entire test suite, so the scope of the change is not causing unexpected changes in other places. This seems reassuring.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_order_by_self_referential_fk (ordering.tests.OrderingTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
