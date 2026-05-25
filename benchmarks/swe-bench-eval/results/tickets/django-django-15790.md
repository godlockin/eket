# django-django-15790

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: c627226d05dd52aef59447dcfb29cec2c2b11b8a
**创建时间**: 2022-06-23T11:02:06Z

## 问题描述

check_for_template_tags_with_the_same_name with libraries in TEMPLATES
Description
	
I didn't explore this thoroughly, but I think there might be an issue with the check_for_template_tags_with_the_same_name when you add a template tag library into TEMPLATES['OPTIONS']['librairies'].
I'm getting an error like: 
(templates.E003) 'my_tags' is used for multiple template tag modules: 'someapp.templatetags.my_tags', 'someapp.templatetags.my_tags'


## 提示信息

Thanks for the report. It's a bug in the new system check (see 004b4620f6f4ad87261e149898940f2dcd5757ef and #32987).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_template_tags_same_library_in_installed_apps_libraries (check_framework.test_templates.CheckTemplateTagLibrariesWithSameName)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
