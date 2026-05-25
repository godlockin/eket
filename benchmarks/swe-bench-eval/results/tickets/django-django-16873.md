# django-django-16873

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: fce90950bef348803fa7cc3e6bc65f4bce429b82
**创建时间**: 2023-05-19T09:38:35Z

## 问题描述

Template filter `join` should not escape the joining string if `autoescape` is `off`
Description
	
Consider the following template code snippet:
{% autoescape off %}
{{ some_list|join:some_var }}
{% endautoescape %}
in this case, the items inside some_list will not be escaped (matching the expected behavior) but some_var will forcibly be escaped. From the docs for autoescape or join I don't think this is expected behavior.
The following testcase illustrates what I think is a bug in the join filter (run inside the template_tests/filter_tests folder):
from django.template.defaultfilters import escape
from django.test import SimpleTestCase
from ..utils import setup
class RegressionTests(SimpleTestCase):
	@setup({"join01": '{{ some_list|join:some_var }}'})
	def test_join01(self):
		some_list = ["<p>Hello World!</p>", "beta & me", "<script>Hi!</script>"]
		some_var = "<br/>"
		output = self.engine.render_to_string("join01", {"some_list": some_list, "some_var": some_var})
		self.assertEqual(output, escape(some_var.join(some_list)))
	@setup({"join02": '{% autoescape off %}{{ some_list|join:some_var }}{% endautoescape %}'})
	def test_join02(self):
		some_list = ["<p>Hello World!</p>", "beta & me", "<script>Hi!</script>"]
		some_var = "<br/>"
		output = self.engine.render_to_string("join02", {"some_list": some_list, "some_var": some_var})
		self.assertEqual(output, some_var.join(some_list))
Result of this run in current main is:
.F
======================================================================
FAIL: test_join02 (template_tests.filter_tests.test_regression.RegressionTests.test_join02)
----------------------------------------------------------------------
Traceback (most recent call last):
 File "/home/nessita/fellowship/django/django/test/utils.py", line 443, in inner
	return func(*args, **kwargs)
		 ^^^^^^^^^^^^^^^^^^^^^
 File "/home/nessita/fellowship/django/tests/template_tests/utils.py", line 58, in inner
	func(self)
 File "/home/nessita/fellowship/django/tests/template_tests/filter_tests/test_regression.py", line 21, in test_join02
	self.assertEqual(output, some_var.join(some_list))
AssertionError: '<p>Hello World!</p>&lt;br/&gt;beta & me&lt;br/&gt;<script>Hi!</script>' != '<p>Hello World!</p><br/>beta & me<br/><script>Hi!</script>'
----------------------------------------------------------------------
Ran 2 tests in 0.007s


## 提示信息

Off-topic: As far as I'm aware it's easier to follow the expected output in assertions instead of a series of function calls, e.g. self.assertEqual(output, "<p>Hello World!</p><br/>beta & me<br/><script>Hi!</script>")

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_autoescape_off (template_tests.filter_tests.test_join.FunctionTests.test_autoescape_off)", "test_join_autoescape_off (template_tests.filter_tests.test_join.JoinTests.test_join_autoescape_off)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
