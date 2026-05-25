# sympy-sympy-13146

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: b678d8103e48fdb1af335dbf0080b3d5366f2d17
**创建时间**: 2017-08-18T05:51:45Z

## 问题描述

Exponent doesn't fully simplify
Say I have code like this:

```
import sympy
from sympy import *
x=Symbol('x')
expr1 = S(1)/2*x**2.5
expr2 = S(1)*x**(S(5)/2)/2
res = expr1-expr2
res= simplify(res.evalf(5))
print res
```

The output is
`-0.5*x**2.5 + 0.5*x**2.5`
How do I simplify it to 0?



## 提示信息

A strange bug. The floating point numbers appear to be identical:

```
In [30]: expr2.evalf(5).args[1].args[1]._mpf_
Out[30]: (0, 5, -1, 3)

In [31]: expr1.evalf(5).args[1].args[1]._mpf_
Out[31]: (0, 5, -1, 3)

In [32]: expr1.evalf(5).args[0]._mpf_
Out[32]: (0, 1, -1, 1)

In [33]: expr2.evalf(5).args[0]._mpf_
Out[33]: (0, 1, -1, 1)
```

It also works if you use the default precision:

```
In [27]: expr1.evalf() - expr2.evalf()
Out[27]: 0

In [28]: (expr1 - expr2).evalf()
Out[28]: 0
```


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_evalf_bugs"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
