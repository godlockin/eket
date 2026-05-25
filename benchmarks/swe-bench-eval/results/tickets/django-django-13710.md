# django-django-13710

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 1bd6a7a0acc11e249fca11c017505ad39f15ebf6
**创建时间**: 2020-11-23T04:39:05Z

## 问题描述

Use Admin Inline verbose_name as default for Inline verbose_name_plural
Description
	
Django allows specification of a verbose_name and a verbose_name_plural for Inline classes in admin views. However, verbose_name_plural for an Inline is not currently based on a specified verbose_name. Instead, it continues to be based on the model name, or an a verbose_name specified in the model's Meta class. This was confusing to me initially (I didn't understand why I had to specify both name forms for an Inline if I wanted to overrule the default name), and seems inconsistent with the approach for a model's Meta class (which does automatically base the plural form on a specified verbose_name). I propose that verbose_name_plural for an Inline class should by default be based on the verbose_name for an Inline if that is specified.
I have written a patch to implement this, including tests. Would be happy to submit that.


## 提示信息

Please push your patch as a ​Django pull request.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_verbose_name_inline (admin_inlines.tests.TestVerboseNameInlineForms)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
