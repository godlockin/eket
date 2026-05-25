# django-django-12184

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 5d674eac871a306405b0fbbaeb17bbeba9c68bf3
**创建时间**: 2019-12-05T13:09:48Z

## 问题描述

Optional URL params crash some view functions.
Description
	
My use case, running fine with Django until 2.2:
URLConf:
urlpatterns += [
	...
	re_path(r'^module/(?P<format>(html|json|xml))?/?$', views.modules, name='modules'),
]
View:
def modules(request, format='html'):
	...
	return render(...)
With Django 3.0, this is now producing an error:
Traceback (most recent call last):
 File "/l10n/venv/lib/python3.6/site-packages/django/core/handlers/exception.py", line 34, in inner
	response = get_response(request)
 File "/l10n/venv/lib/python3.6/site-packages/django/core/handlers/base.py", line 115, in _get_response
	response = self.process_exception_by_middleware(e, request)
 File "/l10n/venv/lib/python3.6/site-packages/django/core/handlers/base.py", line 113, in _get_response
	response = wrapped_callback(request, *callback_args, **callback_kwargs)
Exception Type: TypeError at /module/
Exception Value: modules() takes from 1 to 2 positional arguments but 3 were given


## 提示信息

Tracked regression in 76b993a117b61c41584e95149a67d8a1e9f49dd1.
It seems to work if you remove the extra parentheses: re_path(r'^module/(?P<format>html|json|xml)?/?$', views.modules, name='modules'), It seems Django is getting confused by the nested groups.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_re_path_with_missing_optional_parameter (urlpatterns.tests.SimplifiedURLTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
