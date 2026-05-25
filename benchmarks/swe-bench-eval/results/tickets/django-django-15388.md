# django-django-15388

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: c5cd8783825b5f6384417dac5f3889b4210b7d08
**创建时间**: 2022-02-02T17:09:51Z

## 问题描述

Dev Server fails to restart after adding BASE_DIR to TEMPLATES[0]['DIRS'] in settings
Description
	
Repro steps:
$ pip install -U django
$ django-admin startproject <name>
Open settings.py, copy the BASE_DIR variable from line 16 and paste it into the empty DIRS list on line 57
$ ./manage.py runserver
Back in your IDE, save a file and watch the dev server *NOT* restart.
Back in settings.py, remove BASE_DIR from the templates DIRS list. Manually CTRL-C your dev server (as it won't restart on its own when you save), restart the dev server. Now return to your settings.py file, re-save it, and notice the development server once again detects changes and restarts.
This bug prevents the dev server from restarting no matter where you make changes - it is not just scoped to edits to settings.py.


## 提示信息

I don't think this is a bug, really. Adding BASE_DIR to the list of template directories causes the entire project directory to be marked as a template directory, and Django does not watch for changes in template directories by design.
I think I encountered this recently while making examples for #33461, though I didn't get fully to the bottom of what was going on. Django does not watch for changes in template directories by design. It does, via the template_changed signal listener, which from my brief poking around when I saw it, is I believe the one which prevented trigger_reload from executing. But that mostly led to my realising I don't know what function is responsible for reloading for python files, rather than template/i18n files, so I moved on. I would tentatively accept this, personally.
Replying to Keryn Knight: Django does not watch for changes in template directories by design. It does, via the template_changed signal listener My bad, I meant that Django does not watch for changes in template directories to reload the server. The template_changed signal listener returns True if the change occurs in a file located in a designated template directory, which causes notify_file_changed to not trigger the reload. AFAIK from browsing the code, for a python file (or actually any file not in a template directory), the template_changed signal listener returns None, which causes notify_file_changed to trigger the reload, right? So could we fix this by checking if the changed file is a python file inside the template_changed signal listener, regardless of whether it is in a template directory? def template_changed(sender, file_path, **kwargs): if file_path.suffix == '.py': return # Now check if the file was a template file This seems to work on a test project, but I have not checked for side effects, although I don't think there should be any.
I would tentatively accept this, personally. 😀 I was thinking I'd tentatively wontfix, as not worth the complication — but let's accept for review and see what the consensus is. Hrushikesh, would you like to prepare a PR based on your suggestion? Thanks!

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_non_template_changed_in_template_directory (template_tests.test_autoreloader.TemplateReloadTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
