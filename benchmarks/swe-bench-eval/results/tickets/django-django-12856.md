# django-django-12856

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 8328811f048fed0dd22573224def8c65410c9f2e
**创建时间**: 2020-05-04T21:29:23Z

## 问题描述

Add check for fields of UniqueConstraints.
Description
	 
		(last modified by Marnanel Thurman)
	 
When a model gains a UniqueConstraint, makemigrations doesn't check that the fields named therein actually exist.
This is in contrast to the older unique_together syntax, which raises models.E012 if the fields don't exist.
In the attached demonstration, you'll need to uncomment "with_unique_together" in settings.py in order to show that unique_together raises E012.


## 提示信息

Demonstration
Agreed. We can simply call cls._check_local_fields() for UniqueConstraint's fields. I attached tests.
Tests.
Hello Django Team, My name is Jannah Mandwee, and I am working on my final project for my undergraduate software engineering class (here is the link to the assignment: ​https://web.eecs.umich.edu/~weimerw/481/hw6.html). I have to contribute to an open-source project and was advised to look through easy ticket pickings. I am wondering if it is possible to contribute to this ticket or if there is another ticket you believe would be a better fit for me. Thank you for your help.
Replying to Jannah Mandwee: Hello Django Team, My name is Jannah Mandwee, and I am working on my final project for my undergraduate software engineering class (here is the link to the assignment: ​https://web.eecs.umich.edu/~weimerw/481/hw6.html). I have to contribute to an open-source project and was advised to look through easy ticket pickings. I am wondering if it is possible to contribute to this ticket or if there is another ticket you believe would be a better fit for me. Thank you for your help. Hi Jannah, I'm working in this ticket. You can consult this report: https://code.djangoproject.com/query?status=!closed&easy=1&stage=Accepted&order=priority there are all the tickets marked as easy.
CheckConstraint might have the same bug.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_unique_constraint_pointing_to_m2m_field (invalid_models_tests.test_models.ConstraintsTests)", "test_unique_constraint_pointing_to_missing_field (invalid_models_tests.test_models.ConstraintsTests)", "test_unique_constraint_pointing_to_non_local_field (invalid_models_tests.test_models.ConstraintsTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
