# django-django-12453

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: b330b918e979ea39a21d47b61172d112caf432c3
**创建时间**: 2020-02-13T20:03:27Z

## 问题描述

`TransactionTestCase.serialized_rollback` fails to restore objects due to ordering constraints
Description
	
I hit this problem in a fairly complex projet and haven't had the time to write a minimal reproduction case. I think it can be understood just by inspecting the code so I'm going to describe it while I have it in mind.
Setting serialized_rollback = True on a TransactionTestCase triggers ​rollback emulation. In practice, for each database:
BaseDatabaseCreation.create_test_db calls connection._test_serialized_contents = connection.creation.serialize_db_to_string()
TransactionTestCase._fixture_setup calls connection.creation.deserialize_db_from_string(connection._test_serialized_contents)
(The actual code isn't written that way; it's equivalent but the symmetry is less visible.)
serialize_db_to_string orders models with serializers.sort_dependencies and serializes them. The sorting algorithm only deals with natural keys. It doesn't do anything to order models referenced by foreign keys before models containing said foreign keys. That wouldn't be possible in general because circular foreign keys are allowed.
deserialize_db_from_string deserializes and saves models without wrapping in a transaction. This can result in integrity errors if an instance containing a foreign key is saved before the instance it references. I'm suggesting to fix it as follows:
diff --git a/django/db/backends/base/creation.py b/django/db/backends/base/creation.py
index bca8376..7bed2be 100644
--- a/django/db/backends/base/creation.py
+++ b/django/db/backends/base/creation.py
@@ -4,7 +4,7 @@ import time
 from django.apps import apps
 from django.conf import settings
 from django.core import serializers
-from django.db import router
+from django.db import router, transaction
 from django.utils.six import StringIO
 from django.utils.six.moves import input
 
@@ -128,8 +128,9 @@ class BaseDatabaseCreation(object):
		 the serialize_db_to_string method.
		 """
		 data = StringIO(data)
-		for obj in serializers.deserialize("json", data, using=self.connection.alias):
-			obj.save()
+		with transaction.atomic(using=self.connection.alias):
+			for obj in serializers.deserialize("json", data, using=self.connection.alias):
+				obj.save()
 
	 def _get_database_display_str(self, verbosity, database_name):
		 """
Note that loaddata doesn't have this problem because it wraps everything in a transaction:
	def handle(self, *fixture_labels, **options):
		# ...
		with transaction.atomic(using=self.using):
			self.loaddata(fixture_labels)
		# ...
This suggest that the transaction was just forgotten in the implementation of deserialize_db_from_string.
It should be possible to write a deterministic test for this bug because the order in which serialize_db_to_string serializes models depends on the app registry, and the app registry uses OrderedDict to store apps and models in a deterministic order.


## 提示信息

I've run into a problem related to this one (just reported as #31051), so I ended up looking into this problem as well. The original report still seems accurate to me, with the proposed solution valid. I've been working on a fix and (most of the work), testcase for this problem. I'll do some more testing and provide a proper PR for this issue and #31051 soon. The testcase is not ideal yet (testing the testing framework is tricky), but I'll expand on that in the PR. Furthermore, I noticed that loaddata does not just wrap everything in a transaction, it also explicitly disables constraint checks inside the transaction: with connection.constraint_checks_disabled(): self.objs_with_deferred_fields = [] for fixture_label in fixture_labels: self.load_label(fixture_label) for obj in self.objs_with_deferred_fields: obj.save_deferred_fields(using=self.using) # Since we disabled constraint checks, we must manually check for # any invalid keys that might have been added table_names = [model._meta.db_table for model in self.models] try: connection.check_constraints(table_names=table_names) except Exception as e: e.args = ("Problem installing fixtures: %s" % e,) raise I had a closer look at how this works (since I understood that a transaction already implicitly disables constraint checks) and it turns out that MySQL/InnoDB is an exception and does *not* defer constraint checks to the end of the transaction, but instead needs extra handling (so constraint_checks_disabled() is a no-op on most database backends). See #3615.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_circular_reference (backends.base.test_creation.TestDeserializeDbFromString)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
