# pytest-dev-pytest-7168

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 4787fd64a4ca0dba5528b5651bddd254102fe9f3
**创建时间**: 2020-05-05T22:23:38Z

## 问题描述

INTERNALERROR when exception in __repr__
Minimal code to reproduce the issue: 
```python
class SomeClass:
    def __getattribute__(self, attr):
        raise
    def __repr__(self):
        raise
def test():
    SomeClass().attr
```
Session traceback:
```
============================= test session starts ==============================
platform darwin -- Python 3.8.1, pytest-5.4.1, py-1.8.1, pluggy-0.13.1 -- /usr/local/opt/python@3.8/bin/python3.8
cachedir: .pytest_cache
rootdir: ******
plugins: asyncio-0.10.0, mock-3.0.0, cov-2.8.1
collecting ... collected 1 item

test_pytest.py::test 
INTERNALERROR> Traceback (most recent call last):
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/main.py", line 191, in wrap_session
INTERNALERROR>     session.exitstatus = doit(config, session) or 0
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/main.py", line 247, in _main
INTERNALERROR>     config.hook.pytest_runtestloop(session=session)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/hooks.py", line 286, in __call__
INTERNALERROR>     return self._hookexec(self, self.get_hookimpls(), kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 93, in _hookexec
INTERNALERROR>     return self._inner_hookexec(hook, methods, kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 84, in <lambda>
INTERNALERROR>     self._inner_hookexec = lambda hook, methods, kwargs: hook.multicall(
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 208, in _multicall
INTERNALERROR>     return outcome.get_result()
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 80, in get_result
INTERNALERROR>     raise ex[1].with_traceback(ex[2])
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 187, in _multicall
INTERNALERROR>     res = hook_impl.function(*args)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/main.py", line 272, in pytest_runtestloop
INTERNALERROR>     item.config.hook.pytest_runtest_protocol(item=item, nextitem=nextitem)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/hooks.py", line 286, in __call__
INTERNALERROR>     return self._hookexec(self, self.get_hookimpls(), kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 93, in _hookexec
INTERNALERROR>     return self._inner_hookexec(hook, methods, kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 84, in <lambda>
INTERNALERROR>     self._inner_hookexec = lambda hook, methods, kwargs: hook.multicall(
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 208, in _multicall
INTERNALERROR>     return outcome.get_result()
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 80, in get_result
INTERNALERROR>     raise ex[1].with_traceback(ex[2])
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 187, in _multicall
INTERNALERROR>     res = hook_impl.function(*args)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/runner.py", line 85, in pytest_runtest_protocol
INTERNALERROR>     runtestprotocol(item, nextitem=nextitem)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/runner.py", line 100, in runtestprotocol
INTERNALERROR>     reports.append(call_and_report(item, "call", log))
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/runner.py", line 188, in call_and_report
INTERNALERROR>     report = hook.pytest_runtest_makereport(item=item, call=call)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/hooks.py", line 286, in __call__
INTERNALERROR>     return self._hookexec(self, self.get_hookimpls(), kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 93, in _hookexec
INTERNALERROR>     return self._inner_hookexec(hook, methods, kwargs)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/manager.py", line 84, in <lambda>
INTERNALERROR>     self._inner_hookexec = lambda hook, methods, kwargs: hook.multicall(
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 203, in _multicall
INTERNALERROR>     gen.send(outcome)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/skipping.py", line 129, in pytest_runtest_makereport
INTERNALERROR>     rep = outcome.get_result()
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 80, in get_result
INTERNALERROR>     raise ex[1].with_traceback(ex[2])
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/pluggy/callers.py", line 187, in _multicall
INTERNALERROR>     res = hook_impl.function(*args)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/runner.py", line 260, in pytest_runtest_makereport
INTERNALERROR>     return TestReport.from_item_and_call(item, call)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/reports.py", line 294, in from_item_and_call
INTERNALERROR>     longrepr = item.repr_failure(excinfo)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/python.py", line 1513, in repr_failure
INTERNALERROR>     return self._repr_failure_py(excinfo, style=style)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/nodes.py", line 355, in _repr_failure_py
INTERNALERROR>     return excinfo.getrepr(
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_code/code.py", line 634, in getrepr
INTERNALERROR>     return fmt.repr_excinfo(self)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_code/code.py", line 879, in repr_excinfo
INTERNALERROR>     reprtraceback = self.repr_traceback(excinfo_)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_code/code.py", line 823, in repr_traceback
INTERNALERROR>     reprentry = self.repr_traceback_entry(entry, einfo)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_code/code.py", line 784, in repr_traceback_entry
INTERNALERROR>     reprargs = self.repr_args(entry) if not short else None
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_code/code.py", line 693, in repr_args
INTERNALERROR>     args.append((argname, saferepr(argvalue)))
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 82, in saferepr
INTERNALERROR>     return SafeRepr(maxsize).repr(obj)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 51, in repr
INTERNALERROR>     s = _format_repr_exception(exc, x)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 23, in _format_repr_exception
INTERNALERROR>     exc_info, obj.__class__.__name__, id(obj)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 47, in repr
INTERNALERROR>     s = super().repr(x)
INTERNALERROR>   File "/usr/local/Cellar/python@3.8/3.8.1/Frameworks/Python.framework/Versions/3.8/lib/python3.8/reprlib.py", line 52, in repr
INTERNALERROR>     return self.repr1(x, self.maxlevel)
INTERNALERROR>   File "/usr/local/Cellar/python@3.8/3.8.1/Frameworks/Python.framework/Versions/3.8/lib/python3.8/reprlib.py", line 62, in repr1
INTERNALERROR>     return self.repr_instance(x, level)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 60, in repr_instance
INTERNALERROR>     s = _format_repr_exception(exc, x)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 23, in _format_repr_exception
INTERNALERROR>     exc_info, obj.__class__.__name__, id(obj)
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 56, in repr_instance
INTERNALERROR>     s = repr(x)
INTERNALERROR>   File "/Users/stiflou/Documents/projets/apischema/tests/test_pytest.py", line 6, in __repr__
INTERNALERROR>     raise
INTERNALERROR> RuntimeError: No active exception to reraise

============================ no tests ran in 0.09s ============================
```


## 提示信息

This only happens when both `__repr__` and `__getattribute__` are broken, which is a very odd scenario.
```
class SomeClass:
    def __getattribute__(self, attr):
        raise Exception()

    def bad_method(self):
        raise Exception()

def test():
    SomeClass().bad_method()

```

```
============================================================================================== test session starts ===============================================================================================
platform linux -- Python 3.7.7, pytest-5.4.1.dev154+gbe6849644, py-1.8.1, pluggy-0.13.1
rootdir: /home/k/pytest, inifile: tox.ini
plugins: asyncio-0.11.0, hypothesis-5.10.4
collected 1 item                                                                                                                                                                                                 

test_internal.py F                                                                                                                                                                                         [100%]

==================================================================================================== FAILURES ====================================================================================================
______________________________________________________________________________________________________ test ______________________________________________________________________________________________________

    def test():
>       SomeClass().bad_method()

test_internal.py:12: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <test_internal.SomeClass object at 0x7fa550a8f6d0>, attr = 'bad_method'

    def __getattribute__(self, attr):
>       raise Exception()
E       Exception

test_internal.py:6: Exception
============================================================================================ short test summary info =============================================================================================
FAILED test_internal.py::test - Exception
=============================================================================================== 1 failed in 0.07s ================================================================================================
```

```
class SomeClass:
    def __repr__(self):
        raise Exception()

    def bad_method(self):
        raise Exception()

def test():
    SomeClass().bad_method()

```


```
============================================================================================== test session starts ===============================================================================================
platform linux -- Python 3.7.7, pytest-5.4.1.dev154+gbe6849644, py-1.8.1, pluggy-0.13.1
rootdir: /home/k/pytest, inifile: tox.ini
plugins: asyncio-0.11.0, hypothesis-5.10.4
collected 1 item                                                                                                                                                                                                 

test_internal.py F                                                                                                                                                                                         [100%]

==================================================================================================== FAILURES ====================================================================================================
______________________________________________________________________________________________________ test ______________________________________________________________________________________________________

    def test():
>       SomeClass().bad_method()

test_internal.py:9: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <[Exception() raised in repr()] SomeClass object at 0x7f0fd38ac910>

    def bad_method(self):
>       raise Exception()
E       Exception

test_internal.py:6: Exception
============================================================================================ short test summary info =============================================================================================
FAILED test_internal.py::test - Exception
=============================================================================================== 1 failed in 0.07s ================================================================================================
```
> This only happens when both `__repr__` and `__getattribute__` are broken, which is a very odd scenario.

Indeed, I admit that's a very odd scenario (I've faced it when working on some black magic mocking stuff). However, I've opened this issue because I haven't dived into pytest code and maybe it will be understood better by someone who could see in it a more important underlying issue.
The problem is most likely here:

```
INTERNALERROR>   File "/usr/local/lib/python3.8/site-packages/_pytest/_io/saferepr.py", line 23, in _format_repr_exception
INTERNALERROR>     exc_info, obj.__class__.__name__, id(obj)
```

specifically, `obj.__class__` raises, but this isn't expected or handled by `saferepr`. Changing this to `type(obj).__name__` should work.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/io/test_saferepr.py::test_simple_repr", "testing/io/test_saferepr.py::test_maxsize", "testing/io/test_saferepr.py::test_maxsize_error_on_instance", "testing/io/test_saferepr.py::test_exceptions", "testing/io/test_saferepr.py::test_baseexception", "testing/io/test_saferepr.py::test_buggy_builtin_repr", "testing/io/test_saferepr.py::test_big_repr", "testing/io/test_saferepr.py::test_repr_on_newstyle", "testing/io/test_saferepr.py::test_unicode", "testing/io/test_saferepr.py::test_pformat_dispatch", "testing/io/test_saferepr.py::test_broken_getattribute"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
