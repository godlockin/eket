# django-django-11583

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 60dc957a825232fdda9138e2f8878b2ca407a7c9
**创建时间**: 2019-07-21T20:56:14Z

## 问题描述

Auto-reloading with StatReloader very intermittently throws "ValueError: embedded null byte".
Description
	
Raising this mainly so that it's tracked, as I have no idea how to reproduce it, nor why it's happening. It ultimately looks like a problem with Pathlib, which wasn't used prior to 2.2.
Stacktrace:
Traceback (most recent call last):
 File "manage.py" ...
	execute_from_command_line(sys.argv)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/__init__.py", line 381, in execute_from_command_line
	utility.execute()
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/__init__.py", line 375, in execute
	self.fetch_command(subcommand).run_from_argv(self.argv)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/base.py", line 323, in run_from_argv
	self.execute(*args, **cmd_options)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/commands/runserver.py", line 60, in execute
	super().execute(*args, **options)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/base.py", line 364, in execute
	output = self.handle(*args, **options)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/commands/runserver.py", line 95, in handle
	self.run(**options)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/core/management/commands/runserver.py", line 102, in run
	autoreload.run_with_reloader(self.inner_run, **options)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 577, in run_with_reloader
	start_django(reloader, main_func, *args, **kwargs)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 562, in start_django
	reloader.run(django_main_thread)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 280, in run
	self.run_loop()
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 286, in run_loop
	next(ticker)
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 326, in tick
	for filepath, mtime in self.snapshot_files():
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 342, in snapshot_files
	for file in self.watched_files():
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 241, in watched_files
	yield from iter_all_python_module_files()
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 103, in iter_all_python_module_files
	return iter_modules_and_files(modules, frozenset(_error_files))
 File "/Userz/kez/path/to/venv/lib/python3.6/site-packages/django/utils/autoreload.py", line 132, in iter_modules_and_files
	results.add(path.resolve().absolute())
 File "/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/pathlib.py", line 1120, in resolve
	s = self._flavour.resolve(self, strict=strict)
 File "/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/pathlib.py", line 346, in resolve
	return _resolve(base, str(path)) or sep
 File "/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/pathlib.py", line 330, in _resolve
	target = accessor.readlink(newpath)
 File "/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/pathlib.py", line 441, in readlink
	return os.readlink(path)
ValueError: embedded null byte
I did print(path) before os.readlink(path) in pathlib and ended up with:
/Users/kez
/Users/kez/.pyenv
/Users/kez/.pyenv/versions
/Users/kez/.pyenv/versions/3.6.2
/Users/kez/.pyenv/versions/3.6.2/lib
/Users/kez/.pyenv/versions/3.6.2/lib/python3.6
/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/asyncio
/Users/kez/.pyenv/versions/3.6.2/lib/python3.6/asyncio/selector_events.py
/Users
It always seems to be /Users which is last
It may have already printed /Users as part of another .resolve() multiple times (that is, the order is not deterministic, and it may have traversed beyond /Users successfully many times during startup.
I don't know where to begin looking for the rogue null byte, nor why it only exists sometimes.
Best guess I have is that there's a mountpoint in /Users to a samba share which may not have been connected to yet? I dunno.
I have no idea if it's fixable without removing the use of pathlib (which tbh I think should happen anyway, because it's slow) and reverting to using os.path.join and friends. 
I have no idea if it's fixed in a later Python version, but with no easy way to reproduce ... dunno how I'd check.
I have no idea if it's something specific to my system (pyenv, OSX 10.11, etc)


## 提示信息

Thanks for the report, however as you've admitted there is too many unknowns to accept this ticket. I don't believe that it is related with pathlib, maybe samba connection is unstable it's hard to tell.
I don't believe that it is related with pathlib Well ... it definitely is, you can see that from the stacktrace. The difference between 2.2 and 2.1 (and every version prior) for the purposes of this report is that AFAIK 2.2 is using pathlib.resolve() which deals with symlinks where under <2.2 I don't think the equivalent (os.path.realpath rather than os.path.abspath) was used. But yes, there's no path forward to fix the ticket as it stands, short of not using pathlib (or at least .resolve()).
Hey Keryn, Have you tried removing resolve() yourself, and did it fix the issue? I chose to use resolve() to try and work around a corner case with symlinks, and to generally just normalize the paths to prevent duplication. Also, regarding your comment above, you would need to use print(repr(path)), as I think the print machinery stops at the first null byte found (hence just /Users, which should never be monitored by itself). If you can provide me some more information I'm more than willing to look into this, or consider removing the resolve() call.
Replying to Tom Forbes: Hey Keryn, Have you tried removing resolve() yourself, and did it fix the issue? I chose to use resolve() to try and work around a corner case with symlinks, and to generally just normalize the paths to prevent duplication. Also, regarding your comment above, you would need to use print(repr(path)), as I think the print machinery stops at the first null byte found (hence just /Users, which should never be monitored by itself). If you can provide me some more information I'm more than willing to look into this, or consider removing the resolve() call. Hi Tom, I am also getting this error, see here for the stackoverflow question which I have attempted to answer: ​https://stackoverflow.com/questions/56406965/django-valueerror-embedded-null-byte/56685648#56685648 What is really odd is that it doesn't error every time and looks to error on a random file each time. I believe the issue is caused by having a venv within the top level directory but might be wrong. Bug is on all versions of django >= 2.2.0
Felix, I'm going to re-open this ticket if that's OK. While this is clearly something "funky" going on at a lower level than we handle, it used to work (at least, the error was swallowed). I think this is a fairly simple fix.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_path_with_embedded_null_bytes (utils_tests.test_autoreload.TestIterModulesAndFiles)", "test_paths_are_pathlib_instances (utils_tests.test_autoreload.TestIterModulesAndFiles)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
