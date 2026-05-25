# sphinx-doc-sphinx-7686

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 752d3285d250bbaf673cff25e83f03f247502021
**创建时间**: 2020-05-17T14:09:10Z

## 问题描述

autosummary: The members variable for module template contains imported members
**Describe the bug**
autosummary: The members variable for module template contains imported members even if autosummary_imported_members is False.

**To Reproduce**

```
# _templates/autosummary/module.rst
{{ fullname | escape | underline }}

.. automodule:: {{ fullname }}

   .. autosummary::
   {% for item in members %}
      {{ item }}
   {%- endfor %}

```
```
# example.py
import os
```
```
# index.rst
.. autosummary::
   :toctree: generated

   example
```
```
# conf.py
autosummary_generate = True
autosummary_imported_members = False
```

As a result, I got following output:
```
# generated/example.rst
example
=======

.. automodule:: example

   .. autosummary::

      __builtins__
      __cached__
      __doc__
      __file__
      __loader__
      __name__
      __package__
      __spec__
      os
```

**Expected behavior**
The template variable `members` should not contain imported members when `autosummary_imported_members` is False.

**Your project**
No

**Screenshots**
No

**Environment info**
- OS: Mac
- Python version: 3.8.2
- Sphinx version: 3.1.0dev
- Sphinx extensions:  sphinx.ext.autosummary
- Extra tools: No

**Additional context**
No



## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_ext_autosummary.py::test_autosummary_generate_content_for_module", "tests/test_ext_autosummary.py::test_autosummary_generate_content_for_module_skipped"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
