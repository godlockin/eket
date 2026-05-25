# django-django-15202

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 4fd3044ca0135da903a70dfb66992293f529ecf1
**创建时间**: 2021-12-15T15:04:13Z

## 问题描述

URLField throws ValueError instead of ValidationError on clean
Description
	
forms.URLField( ).clean('////]@N.AN')
results in:
	ValueError: Invalid IPv6 URL
	Traceback (most recent call last):
	 File "basic_fuzzer.py", line 22, in TestOneInput
	 File "fuzzers.py", line 350, in test_forms_URLField
	 File "django/forms/fields.py", line 151, in clean
	 File "django/forms/fields.py", line 136, in run_validators
	 File "django/core/validators.py", line 130, in __call__
	 File "urllib/parse.py", line 440, in urlsplit


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_urlfield_clean_invalid (forms_tests.field_tests.test_urlfield.URLFieldTest)", "test_urlfield_clean_not_required (forms_tests.field_tests.test_urlfield.URLFieldTest)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
