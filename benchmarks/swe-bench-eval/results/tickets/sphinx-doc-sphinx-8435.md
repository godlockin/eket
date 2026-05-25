# sphinx-doc-sphinx-8435

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 5d8d6275a54f2c5fb72b82383b5712c22d337634
**创建时间**: 2020-11-15T17:12:24Z

## 问题描述

autodoc_type_aliases does not effect to variables and attributes
**Describe the bug**
autodoc_type_aliases does not effect to variables and attributes

**To Reproduce**

```
# example.py
from __future__ import annotations


#: blah blah blah
var: String


class MyString:
    "mystring"

    #: blah blah blah
    var: String
```
```
# index.rst
.. automodule:: example
   :members:
   :undoc-members:
```
```
# conf.py
autodoc_type_aliases = {
    'String': 'example.MyString'
}
```

**Expected behavior**
`autodoc_type_aliases` should be applied to `example.var` and `example.MyString.var`.

**Your project**
N/A

**Screenshots**
N/A

**Environment info**
- OS: Mac
- Python version: 3.9.0
- Sphinx version: HEAD of 3.x branch
- Sphinx extensions: sphinx.ext.autodoc
- Extra tools: Nothing

**Additional context**
N/A


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_ext_autodoc_configs.py::test_autodoc_type_aliases"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
