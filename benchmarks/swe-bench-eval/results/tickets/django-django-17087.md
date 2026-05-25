# django-django-17087

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 4a72da71001f154ea60906a2f74898d32b7322a7
**创建时间**: 2023-07-17T20:28:41Z

## 问题描述

Class methods from nested classes cannot be used as Field.default.
Description
	 
		(last modified by Mariusz Felisiak)
	 
Given the following model:
 
class Profile(models.Model):
	class Capability(models.TextChoices):
		BASIC = ("BASIC", "Basic")
		PROFESSIONAL = ("PROFESSIONAL", "Professional")
		
		@classmethod
		def default(cls) -> list[str]:
			return [cls.BASIC]
	capabilities = ArrayField(
		models.CharField(choices=Capability.choices, max_length=30, blank=True),
		null=True,
		default=Capability.default
	)
The resulting migration contained the following:
 # ...
	 migrations.AddField(
		 model_name='profile',
		 name='capabilities',
		 field=django.contrib.postgres.fields.ArrayField(base_field=models.CharField(blank=True, choices=[('BASIC', 'Basic'), ('PROFESSIONAL', 'Professional')], max_length=30), default=appname.models.Capability.default, null=True, size=None),
	 ),
 # ...
As you can see, migrations.AddField is passed as argument "default" a wrong value "appname.models.Capability.default", which leads to an error when trying to migrate. The right value should be "appname.models.Profile.Capability.default".


## 提示信息

Thanks for the report. It seems that FunctionTypeSerializer should use __qualname__ instead of __name__: django/db/migrations/serializer.py diff --git a/django/db/migrations/serializer.py b/django/db/migrations/serializer.py index d88cda6e20..06657ebaab 100644 a b class FunctionTypeSerializer(BaseSerializer): 168168 ): 169169 klass = self.value.__self__ 170170 module = klass.__module__ 171 return "%s.%s.%s" % (module, klass.__name__, self.value.__name__), { 171 return "%s.%s.%s" % (module, klass.__qualname__, self.value.__name__), { 172172 "import %s" % module 173173 } 174174 # Further error checking Would you like to prepare a patch? (regression test is required)
Also to nitpick the terminology: Capability is a nested class, not a subclass. (fyi for anyone preparing tests/commit message)
Replying to David Sanders: Also to nitpick the terminology: Capability is a nested class, not a subclass. (fyi for anyone preparing tests/commit message) You're right, that was inaccurate. Thanks for having fixed the title
Replying to Mariusz Felisiak: Thanks for the report. It seems that FunctionTypeSerializer should use __qualname__ instead of __name__: django/db/migrations/serializer.py diff --git a/django/db/migrations/serializer.py b/django/db/migrations/serializer.py index d88cda6e20..06657ebaab 100644 a b class FunctionTypeSerializer(BaseSerializer): 168168 ): 169169 klass = self.value.__self__ 170170 module = klass.__module__ 171 return "%s.%s.%s" % (module, klass.__name__, self.value.__name__), { 171 return "%s.%s.%s" % (module, klass.__qualname__, self.value.__name__), { 172172 "import %s" % module 173173 } 174174 # Further error checking Would you like to prepare a patch? (regression test is required) I would be very happy to prepare a patch, i will do my best to write a test that's coherent with the current suite
I would be very happy to prepare a patch, i will do my best to write a test that's coherent with the current suite You can check tests in tests.migrations.test_writer.WriterTests, e.g. test_serialize_nested_class().

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_serialize_nested_class_method (migrations.test_writer.WriterTests.test_serialize_nested_class_method)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
