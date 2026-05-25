# django-django-12983

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 3bc4240d979812bd11365ede04c028ea13fdc8c6
**创建时间**: 2020-05-26T22:02:40Z

## 问题描述

Make django.utils.text.slugify() strip dashes and underscores
Description
	 
		(last modified by Elinaldo do Nascimento Monteiro)
	 
Bug generation slug
Example:
from django.utils import text
text.slugify("___This is a test ---")
output: ___this-is-a-test-
Improvement after correction
from django.utils import text
text.slugify("___This is a test ---")
output: this-is-a-test
​PR


## 提示信息

The current version of the patch converts all underscores to dashes which (as discussed on the PR) isn't an obviously desired change. A discussion is needed to see if there's consensus about that change.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_slugify (utils_tests.test_text.TestUtilsText)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
