# sympy-sympy-14308

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: fb536869fb7aa28b2695ad7a3b70949926b291c4
**创建时间**: 2018-02-22T16:54:06Z

## 问题描述

vectors break pretty printing
```py
In [1]: from sympy.vector import *

In [2]: e = CoordSysCartesian('e')

In [3]: (x/y)**t*e.j
Out[3]:
⎛   t⎞ e_j
⎜⎛x⎞ e_j ⎟
⎜⎜─⎟ ⎟
⎝⎝y⎠ ⎠
```

Also, when it does print correctly, the baseline is wrong (it should be centered). 


## 提示信息

Hi @asmeurer . I would like to work on this issue . Could you help me with the same ? 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_12675", "test_pretty_print_unicode"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
