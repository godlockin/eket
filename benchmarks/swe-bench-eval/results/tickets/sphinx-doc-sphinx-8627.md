# sphinx-doc-sphinx-8627

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 332d80ba8433aea41c3709fa52737ede4405072b
**创建时间**: 2020-12-31T05:21:06Z

## 问题描述

autodoc isn't able to resolve struct.Struct type annotations
**Describe the bug**
If `struct.Struct` is declared in any type annotations, I get `class reference target not found: Struct`

**To Reproduce**
Simple `index.rst`
```
Hello World
===========

code docs
=========

.. automodule:: helloworld.helloworld
```

Simple `helloworld.py`
```
import struct
import pathlib

def consume_struct(_: struct.Struct) -> None:
    pass

def make_struct() -> struct.Struct:
    mystruct = struct.Struct('HH')
    return mystruct

def make_path() -> pathlib.Path:
    return pathlib.Path()
```

Command line:
```
python3 -m sphinx -b html docs/ doc-out -nvWT
```

**Expected behavior**
If you comment out the 2 functions that have `Struct` type annotations, you'll see that `pathlib.Path` resolves fine and shows up in the resulting documentation. I'd expect that `Struct` would also resolve correctly.

**Your project**
n/a

**Screenshots**
n/a

**Environment info**
- OS: Ubuntu 18.04, 20.04
- Python version: 3.8.2
- Sphinx version: 3.2.1
- Sphinx extensions:  'sphinx.ext.autodoc',
              'sphinx.ext.autosectionlabel',
              'sphinx.ext.intersphinx',
              'sphinx.ext.doctest',
              'sphinx.ext.todo'
- Extra tools: 

**Additional context**


- [e.g. URL or Ticket]




## 提示信息

Unfortunately, the `struct.Struct` class does not have the correct module-info. So it is difficult to support.
```
Python 3.8.2 (default, Mar  2 2020, 00:44:41)
[Clang 11.0.0 (clang-1100.0.33.17)] on darwin
Type "help", "copyright", "credits" or "license" for more information.
>>> import struct
>>> struct.Struct.__module__
'builtins'
```

Note: In python3.9, it returns the correct module-info. But it answers the internal module name: `_struct`.
```
Python 3.9.1 (default, Dec 18 2020, 00:18:40)
[Clang 11.0.3 (clang-1103.0.32.59)] on darwin
Type "help", "copyright", "credits" or "license" for more information.
>>> import struct
>>> struct.Struct.__module__
'_struct'
```

So it would better to use `autodoc_type_aliases` to correct it forcedly.
```
# helloworld.py
from __future__ import annotations  # important!
from struct import Struct

def consume_struct(_: Struct) -> None:
    pass
```
```
# conf.py
autodoc_type_aliases = {
    'Struct': 'struct.Struct',
}
```

Then, it working fine.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_util_typing.py::test_restify", "tests/test_util_typing.py::test_stringify"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
