# django-django-16527

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: bd366ca2aeffa869b7dbc0b0aa01caea75e6dc31
**创建时间**: 2023-02-05T22:05:00Z

## 问题描述

"show_save_as_new" in admin can add without this permission
Description
	 
		(last modified by Mariusz Felisiak)
	 
At "django/contrib/admin/templatetags/admin_modify.py" file, line 102, I think you must put one more verification for this tag: "and has_add_permission", because "save_as_new" is a add modification.
I rewrite this for my project:
			"show_save_as_new": not is_popup
			and has_add_permission # This line that I put!!!
			and has_change_permission
			and change
			and save_as,


## 提示信息

Thanks for the report. It was previously reported in #5650 and #3817, and #3817 was closed but only with a fix for "Save and add another" (see 825f0beda804e48e9197fcf3b0d909f9f548aa47). I rewrite this for my project: "show_save_as_new": not is_popup and has_add_permission # This line that I put!!! and has_change_permission and change and save_as, Do we need to check both? Checking only has_add_permission should be enough.
Replying to Neesham: Yes, because "Save as New" is a save too (current object).
Oh, yes! Sorry and tanks ;-)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_submit_row_save_as_new_add_permission_required (admin_views.test_templatetags.AdminTemplateTagsTest.test_submit_row_save_as_new_add_permission_required)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
