# pytest-dev-pytest-8906

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 69356d20cfee9a81972dcbf93d8caf9eabe113e8
**创建时间**: 2021-07-14T08:00:50Z

## 问题描述

Improve handling of skip for module level
This is potentially about updating docs, updating error messages or introducing a new API.

Consider the following scenario:

`pos_only.py` is using Python 3,8 syntax:
```python
def foo(a, /, b):
    return a + b
```

It should not be tested under Python 3.6 and 3.7.
This is a proper way to skip the test in Python older than 3.8:
```python
from pytest import raises, skip
import sys
if sys.version_info < (3, 8):
    skip(msg="Requires Python >= 3.8", allow_module_level=True)

# import must be after the module level skip:
from pos_only import *

def test_foo():
    assert foo(10, 20) == 30
    assert foo(10, b=20) == 30
    with raises(TypeError):
        assert foo(a=10, b=20)
```

My actual test involves parameterize and a 3.8 only class, so skipping the test itself is not sufficient because the 3.8 class was used in the parameterization.

A naive user will try to initially skip the module like:

```python
if sys.version_info < (3, 8):
    skip(msg="Requires Python >= 3.8")
```
This issues this error:

>Using pytest.skip outside of a test is not allowed. To decorate a test function, use the @pytest.mark.skip or @pytest.mark.skipif decorators instead, and to skip a module use `pytestmark = pytest.mark.{skip,skipif}.

The proposed solution `pytestmark = pytest.mark.{skip,skipif}`, does not work  in my case: pytest continues to process the file and fail when it hits the 3.8 syntax (when running with an older version of Python).

The correct solution, to use skip as a function is actively discouraged by the error message.

This area feels a bit unpolished.
A few ideas to improve:

1. Explain skip with  `allow_module_level` in the error message. this seems in conflict with the spirit of the message.
2. Create an alternative API to skip a module to make things easier: `skip_module("reason")`, which can call `_skip(msg=msg, allow_module_level=True)`.




## 提示信息

SyntaxErrors are thrown before execution, so how would the skip call stop the interpreter from parsing the 'incorrect' syntax?
unless we hook the interpreter that is.
A solution could be to ignore syntax errors based on some parameter
if needed we can extend this to have some functionality to evaluate conditions in which syntax errors should be ignored
please note what i suggest will not fix other compatibility issues, just syntax errors

> SyntaxErrors are thrown before execution, so how would the skip call stop the interpreter from parsing the 'incorrect' syntax?

The Python 3.8 code is included by an import. the idea is that the import should not happen if we are skipping the module.
```python
if sys.version_info < (3, 8):
    skip(msg="Requires Python >= 3.8", allow_module_level=True)

# import must be after the module level skip:
from pos_only import *
```
Hi @omry,

Thanks for raising this.

Definitely we should improve that message. 

> Explain skip with allow_module_level in the error message. this seems in conflict with the spirit of the message.

I'm 👍 on this. 2 is also good, but because `allow_module_level` already exists and is part of the public API, I don't think introducing a new API will really help, better to improve the docs of what we already have.

Perhaps improve the message to something like this:

```
Using pytest.skip outside of a test will skip the entire module, if that's your intention pass `allow_module_level=True`. 
If you want to skip a specific test or entire class, use the @pytest.mark.skip or @pytest.mark.skipif decorators.
```

I think we can drop the `pytestmark` remark from there, it is not skip-specific and passing `allow_module_level` already accomplishes the same.

Thanks @nicoddemus.

> Using pytest.skip outside of a test will skip the entire module, if that's your intention pass `allow_module_level=True`. 
If you want to skip a specific test or entire class, use the @pytest.mark.skip or @pytest.mark.skipif decorators.

This sounds clearer.
Can you give a bit of context of why the message is there in the first place?
It sounds like we should be able to automatically detect if this is skipping a test or skipping the entire module (based on the fact that we can issue the warning).

Maybe this is addressing some past confusion, or we want to push people toward `pytest.mark.skip[if]`, but if we can detect it automatically - we can also deprecate allow_module_level and make `skip()` do the right thing based on the context it's used in.
> Maybe this is addressing some past confusion

That's exactly it, people would use `@pytest.skip` instead of `@pytest.mark.skip` and skip the whole module:

https://github.com/pytest-dev/pytest/issues/2338#issuecomment-290324255

For that reason we don't really want to automatically detect things, but want users to explicitly pass that flag which proves they are not doing it by accident.

Original issue: https://github.com/pytest-dev/pytest/issues/607
Having looked at the links, I think the alternative API to skip a module is more appealing.
Here is a proposed end state:

1. pytest.skip_module is introduced, can be used to skip a module.
2. pytest.skip() is only legal inside of a test. If called outside of a test, an error message is issues.
Example:

> pytest.skip should only be used inside tests. To skip a module use pytest.skip_module. To completely skip a test function or a test class, use the @pytest.mark.skip or @pytest.mark.skipif decorators.

Getting to this end state would include deprecating allow_module_level first, directing people using pytest.skip(allow_module_level=True) to use pytest.skip_module().

I am also fine with just changing the message as you initially proposed but I feel this proposal will result in an healthier state.

-0.5 from my side - I think this is too minor to warrant another deprecation and change.
I agree it would be healthier, but -1 from me for the same reasons as @The-Compiler: we already had a deprecation/change period in order to introduce `allow_module_level`, having yet another one is frustrating/confusing to users, in comparison to the small gains.
Hi, I see that this is still open. If available, I'd like to take this up.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/test_skipping.py::test_module_level_skip_error"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
