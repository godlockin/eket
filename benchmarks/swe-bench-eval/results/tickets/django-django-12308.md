# django-django-12308

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 2e0f04507b17362239ba49830d26fec504d46978
**创建时间**: 2020-01-12T04:21:15Z

## 问题描述

JSONField are not properly displayed in admin when they are readonly.
Description
	
JSONField values are displayed as dict when readonly in the admin.
For example, {"foo": "bar"} would be displayed as {'foo': 'bar'}, which is not valid JSON.
I believe the fix would be to add a special case in django.contrib.admin.utils.display_for_field to call the prepare_value of the JSONField (not calling json.dumps directly to take care of the InvalidJSONInput case).


## 提示信息

​PR
The proposed patch is problematic as the first version coupled contrib.postgres with .admin and the current one is based off the type name which is brittle and doesn't account for inheritance. It might be worth waiting for #12990 to land before proceeding here as the patch will be able to simply rely of django.db.models.JSONField instance checks from that point.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_json_display_for_field (admin_utils.tests.UtilsTests)", "test_label_for_field (admin_utils.tests.UtilsTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
