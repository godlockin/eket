# matplotlib-matplotlib-23913

**来源**: SWE-bench Lite
**仓库**: matplotlib/matplotlib
**Base Commit**: 5c4595267ccd3daf78f5fd05693b7ecbcd575c1e
**创建时间**: 2022-09-16T21:51:24Z

## 问题描述

legend draggable as keyword
<!--To help us understand and resolve your issue, please fill out the form to the best of your ability.-->
<!--You can feel free to delete the sections that do not apply.-->

### Feature request

**There is not keyword to make legend draggable at creation**

<!--A short 1-2 sentences that succinctly describes the bug-->

Is there a code reason why one can not add a "draggable=True" keyword to the __init__ function for Legend?  This would be more handy than having to call it after legend creation.  And, naively, it would seem simple to do.  But maybe there is a reason why it would not work?


## 提示信息

This seems like a reasonable request, you're welcome to submit a PR :-)  Note that the same comment applies to annotations.
I would also deprecate `draggable()` in favor of the more classic `set_draggable()`, `get_draggable()` (and thus, in the long-term future, `.draggable` could become a property).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["lib/matplotlib/tests/test_legend.py::test_legend_draggable[True]", "lib/matplotlib/tests/test_legend.py::test_legend_draggable[False]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
