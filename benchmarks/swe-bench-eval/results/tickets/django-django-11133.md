# django-django-11133

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 879cc3da6249e920b8d54518a0ae06de835d7373
**创建时间**: 2019-03-27T06:48:09Z

## 问题描述

HttpResponse doesn't handle memoryview objects
Description
	
I am trying to write a BinaryField retrieved from the database into a HttpResponse. When the database is Sqlite this works correctly, but Postgresql returns the contents of the field as a memoryview object and it seems like current Django doesn't like this combination:
from django.http import HttpResponse																	 
# String content
response = HttpResponse("My Content")																			
response.content																								 
# Out: b'My Content'
# This is correct
# Bytes content
response = HttpResponse(b"My Content")																		 
response.content																								 
# Out: b'My Content'
# This is also correct
# memoryview content
response = HttpResponse(memoryview(b"My Content"))															 
response.content
# Out: b'<memory at 0x7fcc47ab2648>'
# This is not correct, I am expecting b'My Content'


## 提示信息

I guess HttpResponseBase.make_bytes ​could be adapted to deal with memoryview objects by casting them to bytes. In all cases simply wrapping the memoryview in bytes works as a workaround HttpResponse(bytes(model.binary_field)).
The fact make_bytes would still use force_bytes if da56e1bac6449daef9aeab8d076d2594d9fd5b44 didn't refactor it and that d680a3f4477056c69629b0421db4bb254b8c69d0 added memoryview support to force_bytes strengthen my assumption that make_bytes should be adjusted as well.
I'll try to work on this.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_memoryview_content (httpwrappers.tests.HttpResponseTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
