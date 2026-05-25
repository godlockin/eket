# django-django-16041

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 6df9398cce063874ae4d59db126d4adacb0fa8d3
**创建时间**: 2022-09-09T10:07:29Z

## 问题描述

Rendering empty_form crashes when empty_permitted is passed to form_kwargs
Description
	
Issue
When explicitly setting form_kwargs = {'empty_permitted':True} or form_kwargs = {'empty_permitted':False} , a KeyError occurs when rendering a template that uses a formset's empty_form.
Expected Behavior
empty_permitted is ignored for formset.empty_form since empty_permitted is irrelevant for empty_form, as empty_form is not meant to be used to pass data and therefore does not need to be validated.
Steps to Reproduce
# views.py
from django.shortcuts import render
from .models import MyModel
def test_view(request):
	context = {}
	ff = modelformset_factory(MyModel, fields = ['a_field'])
	context['formset'] = ff(
		queryset = MyModel.objects.none(),
		form_kwargs = {'empty_permitted':True} # or form_kwargs = {'empty_permitted':False}
	)
	return render(request, 'my_app/my_model_formset.html', context)
# urls.py
from django.urls import path, include
from .views import test_view
urlpatterns = [
	path('test', test_view)
]
# my_model_formset.html
{% extends "my_app/base.html" %}
{% block content %}
<form id="my-form" method="post">
 {% csrf_token %}
 {{ formset }}
 <input type="submit" value="Save">
</form>
{{ formset.empty_form }}
{% endblock %}


## 提示信息

Thanks for the report. It should be enough to change form_kwargs for empty_form, e.g. django/forms/formsets.py diff --git a/django/forms/formsets.py b/django/forms/formsets.py index 57676428ff..b73d1d742e 100644 a b class BaseFormSet(RenderableFormMixin): 257257 258258 @property 259259 def empty_form(self): 260 form = self.form( 261 auto_id=self.auto_id, 262 prefix=self.add_prefix("__prefix__"), 263 empty_permitted=True, 264 use_required_attribute=False, 260 form_kwargs = { 265261 **self.get_form_kwargs(None), 266 renderer=self.renderer, 267 ) 262 "auto_id": self.auto_id, 263 "prefix": self.add_prefix("__prefix__"), 264 "use_required_attribute": False, 265 "empty_permitted": True, 266 "renderer": self.renderer, 267 } 268 form = self.form(**form_kwargs) 268269 self.add_fields(form, None) 269270 return form 270271 Would you like to prepare a patch? (a regression test is required)
The KeyError is confusing here. It's raised because we're in the context of rendering the template: >>> self.form(empty_permitted=True, **self.get_form_kwargs(None)) Traceback (most recent call last): File "/Users/carlton/Projects/Django/django/django/template/base.py", line 880, in _resolve_lookup current = current[bit] File "/Users/carlton/Projects/Django/django/django/forms/formsets.py", line 118, in __getitem__ return self.forms[index] TypeError: list indices must be integers or slices, not str During handling of the above exception, another exception occurred: Traceback (most recent call last): File "<console>", line 1, in <module> KeyError: 'empty_permitted' The real exception is better seen using the formset directly: >>> from ticket_33995.models import MyModel >>> from django.forms import modelformset_factory >>> ff = modelformset_factory(MyModel, fields=['name']) >>> formset = ff(queryset=MyModel.objects.none(), form_kwargs={'empty_permitted': True}) >>> formset.empty_form > /Users/carlton/Projects/Django/django/django/forms/formsets.py(262)empty_form() -> form_kwargs = self.get_form_kwargs(None) (Pdb) c Traceback (most recent call last): File "<console>", line 1, in <module> File "/Users/carlton/Projects/Django/django/django/forms/formsets.py", line 265, in empty_form form = self.form( TypeError: django.forms.widgets.MyModelForm() got multiple values for keyword argument 'empty_permitted' That's expected: >>> class Example: ... def __init__(self, a_kwarg=None): ... pass ... >>> Example(a_kwarg=True) <__main__.Example object at 0x102352950> >>> Example(a_kwarg=True, a_kwarg=False) File "<stdin>", line 1 SyntaxError: keyword argument repeated: a_kwarg >>> {"a":1, **{"a":2}} {'a': 2} >>> Example(a_kwarg=True, **{"a_kwarg": False}) Traceback (most recent call last): File "<stdin>", line 1, in <module> TypeError: __main__.Example() got multiple values for keyword argument 'a_kwarg' Resolving the kwargs before the constructor call, as per Mariusz' suggestion would resolve. #21501 was on a similar topic.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_empty_permitted_ignored_empty_form (forms_tests.tests.test_formsets.FormsFormsetTestCase)", "test_empty_permitted_ignored_empty_form (forms_tests.tests.test_formsets.Jinja2FormsFormsetTestCase)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
