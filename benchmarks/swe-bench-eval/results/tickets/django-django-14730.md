# django-django-14730

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 4fe3774c729f3fd5105b3001fe69a70bdca95ac3
**创建时间**: 2021-08-03T04:27:52Z

## 问题描述

Prevent developers from defining a related_name on symmetrical ManyToManyFields
Description
	
In ManyToManyField, if the symmetrical argument is passed, or if it's a self-referential ManyToMany relationship, the related field on the target model is not created. However, if a developer passes in the related_name not understanding this fact, they may be confused until they find the information about symmetrical relationship. Thus, it is proposed to raise an error when the user defines a ManyToManyField in this condition.


## 提示信息

I have a PR that implements this incoming.
​https://github.com/django/django/pull/14730
OK, I guess we can do something here — it probably is a source of confusion. The same issue was raised in #18021 (but as an invalid bug report, rather than suggesting improving the messaging). Looking at the PR — I'm sceptical about just raising an error — this will likely break code in the wild. Can we investigate adding a system check here instead? There are several similar checks for related fields already: ​https://docs.djangoproject.com/en/3.2/ref/checks/#related-fields
Same issue also came up in #12641
Absolutely. A system check is a much better approach than my initial idea of the error. I have changed the patch to use a system check.
Unchecking patch needs improvement as instructed on the page, (pending reviewer acceptance of course).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_many_to_many_with_useless_related_name (invalid_models_tests.test_relative_fields.RelativeFieldTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
