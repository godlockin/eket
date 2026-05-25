# django-django-11620

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 514efa3129792ec2abb2444f3e7aeb3f21a38386
**创建时间**: 2019-08-02T13:56:08Z

## 问题描述

When DEBUG is True, raising Http404 in a path converter's to_python method does not result in a technical response
Description
	
This is the response I get (plain text): 
A server error occurred. Please contact the administrator.
I understand a ValueError should be raised which tells the URL resolver "this path does not match, try next one" but Http404 is what came to my mind intuitively and the error message was not very helpful.
One could also make a point that raising a Http404 should be valid way to tell the resolver "this is indeed the right path but the current parameter value does not match anything so stop what you are doing and let the handler return the 404 page (including a helpful error message when DEBUG is True instead of the default 'Django tried these URL patterns')".
This would prove useful for example to implement a path converter that uses get_object_or_404.


## 提示信息

It seems that other exceptions correctly result in a technical 500 response.
The technical_404_response view performs a new URL resolving (cf ​https://github.com/django/django/blob/a8e492bc81fca829f5d270e2d57703c02e58701e/django/views/debug.py#L482) which will obviously raise a new Http404 which won't be caught as only Resolver404 is checked. That means the WSGI handler fails and the WSGI server returns the previously described default error message (indeed the error message is the default one from wsgiref.handlers.BaseHandler ​https://docs.python.org/3.6/library/wsgiref.html#wsgiref.handlers.BaseHandler.error_body). The solution seems to be to catch Http404 instead of Resolver404 in technical_404_response. This will result in a technical 404 page with the Http404's message displayed and will match the behaviour of when DEBUG is False.
Created ​PR , but I am not sure how to write the tests. I've looking about the response before and after catch Http404 instead of Resolver404, and there is no difference. Should I also change the technical_404.html for response?
I've added test to the patch, but not sure if it is correct.
I have made the requested changes; please review again

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_technical_404_converter_raise_404 (view_tests.tests.test_debug.DebugViewTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
