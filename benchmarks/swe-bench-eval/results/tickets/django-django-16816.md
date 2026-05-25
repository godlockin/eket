# django-django-16816

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 191f6a9a4586b5e5f79f4f42f190e7ad4bbacc84
**创建时间**: 2023-04-30T15:37:43Z

## 问题描述

Error E108 does not cover some cases
Description
	 
		(last modified by Baha Sdtbekov)
	 
I have two models, Question and Choice. And if I write list_display = ["choice"] in QuestionAdmin, I get no errors.
But when I visit /admin/polls/question/, the following trace is returned:
Internal Server Error: /admin/polls/question/
Traceback (most recent call last):
 File "/some/path/django/contrib/admin/utils.py", line 334, in label_for_field
	field = _get_non_gfk_field(model._meta, name)
 File "/some/path/django/contrib/admin/utils.py", line 310, in _get_non_gfk_field
	raise FieldDoesNotExist()
django.core.exceptions.FieldDoesNotExist
During handling of the above exception, another exception occurred:
Traceback (most recent call last):
 File "/some/path/django/core/handlers/exception.py", line 55, in inner
	response = get_response(request)
 File "/some/path/django/core/handlers/base.py", line 220, in _get_response
	response = response.render()
 File "/some/path/django/template/response.py", line 111, in render
	self.content = self.rendered_content
 File "/some/path/django/template/response.py", line 89, in rendered_content
	return template.render(context, self._request)
 File "/some/path/django/template/backends/django.py", line 61, in render
	return self.template.render(context)
 File "/some/path/django/template/base.py", line 175, in render
	return self._render(context)
 File "/some/path/django/template/base.py", line 167, in _render
	return self.nodelist.render(context)
 File "/some/path/django/template/base.py", line 1005, in render
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 1005, in <listcomp>
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 966, in render_annotated
	return self.render(context)
 File "/some/path/django/template/loader_tags.py", line 157, in render
	return compiled_parent._render(context)
 File "/some/path/django/template/base.py", line 167, in _render
	return self.nodelist.render(context)
 File "/some/path/django/template/base.py", line 1005, in render
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 1005, in <listcomp>
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 966, in render_annotated
	return self.render(context)
 File "/some/path/django/template/loader_tags.py", line 157, in render
	return compiled_parent._render(context)
 File "/some/path/django/template/base.py", line 167, in _render
	return self.nodelist.render(context)
 File "/some/path/django/template/base.py", line 1005, in render
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 1005, in <listcomp>
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 966, in render_annotated
	return self.render(context)
 File "/some/path/django/template/loader_tags.py", line 63, in render
	result = block.nodelist.render(context)
 File "/some/path/django/template/base.py", line 1005, in render
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 1005, in <listcomp>
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 966, in render_annotated
	return self.render(context)
 File "/some/path/django/template/loader_tags.py", line 63, in render
	result = block.nodelist.render(context)
 File "/some/path/django/template/base.py", line 1005, in render
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 1005, in <listcomp>
	return SafeString("".join([node.render_annotated(context) for node in self]))
 File "/some/path/django/template/base.py", line 966, in render_annotated
	return self.render(context)
 File "/some/path/django/contrib/admin/templatetags/base.py", line 45, in render
	return super().render(context)
 File "/some/path/django/template/library.py", line 258, in render
	_dict = self.func(*resolved_args, **resolved_kwargs)
 File "/some/path/django/contrib/admin/templatetags/admin_list.py", line 326, in result_list
	headers = list(result_headers(cl))
 File "/some/path/django/contrib/admin/templatetags/admin_list.py", line 90, in result_headers
	text, attr = label_for_field(
 File "/some/path/django/contrib/admin/utils.py", line 362, in label_for_field
	raise AttributeError(message)
AttributeError: Unable to lookup 'choice' on Question or QuestionAdmin
[24/Apr/2023 15:43:32] "GET /admin/polls/question/ HTTP/1.1" 500 349913
I suggest that error E108 be updated to cover this case as well
For reproduce see ​github


## 提示信息

I think I will make a bug fix later if required
Thanks bakdolot 👍 There's a slight difference between a model instance's attributes and the model class' meta's fields. Meta stores the reverse relationship as choice, where as this would be setup & named according to whatever the related_name is declared as.
fyi potential quick fix, this will cause it to start raising E108 errors. this is just a demo of where to look. One possibility we could abandon using get_field() and refer to _meta.fields instead? 🤔… though that would mean the E109 check below this would no longer work. django/contrib/admin/checks.py a b from django.core.exceptions import FieldDoesNotExist 99from django.db import models 1010from django.db.models.constants import LOOKUP_SEP 1111from django.db.models.expressions import Combinable 12from django.db.models.fields.reverse_related import ManyToOneRel 1213from django.forms.models import BaseModelForm, BaseModelFormSet, _get_foreign_key 1314from django.template import engines 1415from django.template.backends.django import DjangoTemplates … … class ModelAdminChecks(BaseModelAdminChecks): 897898 return [] 898899 try: 899900 field = obj.model._meta.get_field(item) 901 if isinstance(field, ManyToOneRel): 902 raise FieldDoesNotExist 900903 except FieldDoesNotExist: 901904 try: 902905 field = getattr(obj.model, item)
This is related to the recent work merged for ticket:34481.
@nessita yup I recognised bakdolot's username from that patch :D
Oh no they recognized me :D I apologize very much. I noticed this bug only after merge when I decided to check again By the way, I also noticed two bugs related to this
I checked most of the fields and found these fields that are not working correctly class QuestionAdmin(admin.ModelAdmin): list_display = ["choice", "choice_set", "somem2m", "SomeM2M_question+", "somem2m_set", "__module__", "__doc__", "objects"] Also for reproduce see ​github
Replying to Baha Sdtbekov: I checked most of the fields and found these fields that are not working correctly class QuestionAdmin(admin.ModelAdmin): list_display = ["choice", "choice_set", "somem2m", "SomeM2M_question+", "somem2m_set", "__module__", "__doc__", "objects"] Also for reproduce see ​github System checks are helpers that in this case should highlight potentially reasonable but unsupported options. IMO they don't have to catch all obviously wrong values that you can find in __dir__.
Yup agreed with felixx if they're putting __doc__ in there then they probably need to go back and do a Python tutorial :) As for choice_set & somem2m – I thought that's what you fixed up in the other patch with E109.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_invalid_m2m_related_name (modeladmin.test_checks.ListDisplayTests.test_invalid_m2m_related_name)", "test_invalid_related_field (modeladmin.test_checks.ListDisplayTests.test_invalid_related_field)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
