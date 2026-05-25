# django-django-15213

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 03cadb912c78b769d6bf4a943a2a35fc1d952960
**创建时间**: 2021-12-19T10:48:23Z

## 问题描述

ExpressionWrapper for ~Q(pk__in=[]) crashes.
Description
	 
		(last modified by Stefan Brand)
	 
Problem Description
I'm reducing some Q objects (similar to what is described in ticket:32554. Everything is fine for the case where the result is ExpressionWrapper(Q(pk__in=[])). However, when I reduce to ExpressionWrapper(~Q(pk__in=[])) the query breaks.
Symptoms
Working for ExpressionWrapper(Q(pk__in=[]))
print(queryset.annotate(foo=ExpressionWrapper(Q(pk__in=[]), output_field=BooleanField())).values("foo").query)
SELECT 0 AS "foo" FROM "table"
Not working for ExpressionWrapper(~Q(pk__in=[]))
print(queryset.annotate(foo=ExpressionWrapper(~Q(pk__in=[]), output_field=BooleanField())).values("foo").query)
SELECT AS "foo" FROM "table"


## 提示信息

Good catch! >>> books = Book.objects.annotate(selected=ExpressionWrapper(~Q(pk__in=[]), output_field=BooleanField())).values('selected') >>> list(books) Traceback (most recent call last): File "/django/django/db/backends/utils.py", line 85, in _execute return self.cursor.execute(sql, params) File "/django/django/db/backends/sqlite3/base.py", line 420, in execute return Database.Cursor.execute(self, query, params) sqlite3.OperationalError: near "AS": syntax error

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_aggregate_over_full_expression_annotation (annotations.tests.NonAggregateAnnotationTestCase)", "test_full_expression_annotation (annotations.tests.NonAggregateAnnotationTestCase)", "test_full_expression_annotation_with_aggregation (annotations.tests.NonAggregateAnnotationTestCase)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
