# sphinx-doc-sphinx-10325

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 7bdc11e87c7d86dcc2a087eccb7a7c129a473415
**创建时间**: 2022-04-02T17:05:02Z

## 问题描述

inherited-members should support more than one class
**Is your feature request related to a problem? Please describe.**
I have two situations:
- A class inherits from multiple other classes. I want to document members from some of the base classes but ignore some of the base classes
- A module contains several class definitions that inherit from different classes that should all be ignored (e.g., classes that inherit from list or set or tuple). I want to ignore members from list, set, and tuple while documenting all other inherited members in classes in the module.

**Describe the solution you'd like**
The :inherited-members: option to automodule should accept a list of classes. If any of these classes are encountered as base classes when instantiating autoclass documentation, they should be ignored.

**Describe alternatives you've considered**
The alternative is to not use automodule, but instead manually enumerate several autoclass blocks for a module. This only addresses the second bullet in the problem description and not the first. It is also tedious for modules containing many class definitions.




## 提示信息

+1: Acceptable change.
>A class inherits from multiple other classes. I want to document members from some of the base classes but ignore some of the base classes

For example, there is a class that inherits multiple base classes:
```
class MyClass(Parent1, Parent2, Parent3, ...):
    pass
```
and

```
.. autoclass:: example.MyClass
   :inherited-members: Parent2
```

How should the new `:inherited-members:` work? Do you mean that the member of Parent2 are ignored and the Parent1's and Parent3's are documented? And how about the methods of the super classes of `Parent1`?

Note: The current behavior is ignoring Parent2, Parent3, and the super classes of them (including Parent1's also). In python words, the classes after `Parent2` in MRO list are all ignored.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_ext_autodoc_automodule.py::test_automodule_inherited_members"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
