# sympy-sympy-15678

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 31c68eef3ffef39e2e792b0ec92cd92b7010eb2a
**创建时间**: 2018-12-20T18:11:56Z

## 问题描述

Some issues with idiff
idiff doesn't support Eq, and it also doesn't support f(x) instead of y. Both should be easy to correct.

```
>>> idiff(Eq(y*exp(y), x*exp(x)), y, x)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "./sympy/geometry/util.py", line 582, in idiff
    yp = solve(eq.diff(x), dydx)[0].subs(derivs)
IndexError: list index out of range
>>> idiff(f(x)*exp(f(x)) - x*exp(x), f(x), x)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "./sympy/geometry/util.py", line 574, in idiff
    raise ValueError("expecting x-dependent symbol(s) but got: %s" % y)
ValueError: expecting x-dependent symbol(s) but got: f(x)
>>> idiff(y*exp(y)- x*exp(x), y, x)
(x + 1)*exp(x - y)/(y + 1)
```


## 提示信息

Hi i am a beginner and i would like to work on this issue.
@krishna-akula are you still working on this?... I'd like to work on it too

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_idiff"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
