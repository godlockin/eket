# django-django-12284

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: c5e373d48cbdd923575956fed477b63d66d9603f
**创建时间**: 2020-01-07T11:06:31Z

## 问题描述

Model.get_FOO_display() does not work correctly with inherited choices.
Description
	 
		(last modified by Mariusz Felisiak)
	 
Given a base model with choices A containing 3 tuples
Child Model inherits the base model overrides the choices A and adds 2 more tuples
get_foo_display does not work correctly for the new tuples added
Example:
class A(models.Model):
 foo_choice = [("A","output1"),("B","output2")]
 field_foo = models.CharField(max_length=254,choices=foo_choice)
 class Meta:
	 abstract = True
class B(A):
 foo_choice = [("A","output1"),("B","output2"),("C","output3")]
 field_foo = models.CharField(max_length=254,choices=foo_choice)
Upon invoking get_field_foo_display() on instance of B , 
For value "A" and "B" the output works correctly i.e. returns "output1" / "output2"
but for value "C" the method returns "C" and not "output3" which is the expected behaviour


## 提示信息

Thanks for this report. Can you provide models and describe expected behavior? Can you also check if it's not a duplicate of #30931?, that was fixed in Django 2.2.7.
Replying to felixxm: Thanks for this report. Can you provide models and describe expected behavior? Can you also check if it's not a duplicate of #30931?, that was fixed in Django 2.2.7.
Added the models and expected behaviour. It is not a duplicate of #30931. Using Django 2.2.9 Replying to felixxm: Thanks for this report. Can you provide models and describe expected behavior? Can you also check if it's not a duplicate of #30931?, that was fixed in Django 2.2.7.
Thanks for an extra info. I was able to reproduce this issue, e.g. >>> B.objects.create(field_foo='A').get_field_foo_display() output1 >>> B.objects.create(field_foo='B').get_field_foo_display() output2 >>> B.objects.create(field_foo='C').get_field_foo_display() C Regression in 2d38eb0ab9f78d68c083a5b78b1eca39027b279a (Django 2.2.7).
may i work on this?
After digging in, i have found that the choices of B model are the same with the A model, despiite them being the proper ones in init. Migration is correct, so now i must find why the choices of model B are ignored. Being my first issue, some hints would be appreciated. Thanks
​https://github.com/django/django/pull/12266
I think this ticket is very much related to the discussions on #30931. The line if not hasattr(cls, 'get_%s_display' % self.name) breaks the expected behaviour on model inheritance, which causing this bug. (see ​https://github.com/django/django/commit/2d38eb0ab9f78d68c083a5b78b1eca39027b279a#diff-bf776a3b8e5dbfac2432015825ef8afeR766) IMO there are three important points to discuss: 1- Obviously get_<field>_display() should work as expected with inheritance, so this line should be reverted/fixed: if not hasattr(cls, 'get_%s_display' % self.name) 2- I think developers should be able to override get_<field>_display() method on the model class: class Bar(models.Model): foo = models.CharField('foo', choices=[(0, 'foo')]) def get_foo_display(self): return 'something' b = Bar(foo=0) assert b.get_foo_display() == 'something' 3- I think Field should not check an attribute of model class and make a decision based on it. This check and set logic should be delegated to BaseModel with an abstraction to make it less magical and more clean. Maybe something like this: class ModelBase(type): .... def add_overridable_to_class(cls, name, value): // Set value only if the name is not already defined in the class itself (no `hasattr`) if name not in cls.__dict__: setattr(cls, name, value) class Field(RegisterLookupMixin): ... def contribute_to_class(self, cls, name, private_only=False): ... if self.choices is not None: cls.add_overridable_to_class('get_%s_display' % self.name, partialmethod(cls._get_FIELD_display, field=self))
Why would checking on fields class be a bad idea? If you are a field of a model that is not abstract but your parent is an abstract method, wouldn't you want to override your parent's method if you both have the same method?
Replying to George Popides: Why would checking on fields class be a bad idea? If you are a field of a model that is not abstract but your parent is an abstract method, wouldn't you want to override your parent's method if you both have the same method? Well it is not something I would prefer because it makes two classes tightly coupled to each other, which means it is hard to change one without touching to the other one and you always need to think about side effects of your change. Which eventually makes this two classes hard to test and makes the codebase hard to maintain. Your logic about overriding might/or might not be true. I would just execute this logic on ModelBase rather than Field.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_overriding_inherited_FIELD_display (model_fields.tests.GetFieldDisplayTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
