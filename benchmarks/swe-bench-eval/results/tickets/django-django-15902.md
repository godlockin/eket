# django-django-15902

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 44c24bf02835323d5418512ebe8e76166739ebf8
**创建时间**: 2022-08-02T07:35:10Z

## 问题描述

"default.html" deprecation warning raised for ManagementForm's
Description
	
I have a project where I never render forms with the {{ form }} expression. However, I'm still getting the new template deprecation warning because of the formset management form production, during which the template used is insignificant (only hidden inputs are produced).
Is it worth special-casing this and avoid producing the warning for the management forms?


## 提示信息

Thanks for the report. I think it's worth changing. As far as I'm aware, it's quite often that management form is the only one that users render with {{ form }}. It should also be quite easy to workaround: django/forms/formsets.py diff --git a/django/forms/formsets.py b/django/forms/formsets.py index 3adbc6979a..2bea2987be 100644 a b class ManagementForm(Form): 3131 new forms via JavaScript, you should increment the count field of this form 3232 as well. 3333 """ 34 template_name = "django/forms/div.html" # RemovedInDjango50Warning. 3435 3536 TOTAL_FORMS = IntegerField(widget=HiddenInput) 3637 INITIAL_FORMS = IntegerField(widget=HiddenInput)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["Management forms are already rendered with the new div template."]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
