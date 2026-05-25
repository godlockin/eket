# django-django-15347

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 7c4f3965098baad2396e24501e09237425a7bd6f
**创建时间**: 2022-01-22T01:56:48Z

## 问题描述

Messages framework incorrectly serializes/deserializes extra_tags when it's an empty string
Description
	
When a message is serialised and then deserialised with any of the built in storage backends, then extra_tags=="" is converted to extra_tags==None. This is because MessageEncoder checks for the truthyness of extra_tags rather than checking it is not None.
To replicate this bug
>>> from django.conf import settings
>>> settings.configure() # Just to allow the following import
>>> from django.contrib.messages.storage.base import Message
>>> from django.contrib.messages.storage.cookie import MessageEncoder, MessageDecoder
>>> original_message = Message(10, "Here is a message", extra_tags="")
>>> encoded_message = MessageEncoder().encode(original_message)
>>> decoded_message = MessageDecoder().decode(encoded_message)
>>> original_message.extra_tags == ""
True
>>> decoded_message.extra_tags is None
True
Effect of the bug in application behaviour
This error occurred in the wild with a template tag similar to the following:
{% if x not in message.extra_tags %}
When the message was displayed as part of a redirect, it had been serialised and deserialized which meant that extra_tags was None instead of the empty string. This caused an error.
It's important to note that this bug affects all of the standard API (messages.debug, messages.info etc. all have a default value of extra_tags equal to "").


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["A message's extra_tags attribute is correctly preserved when retrieved"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
