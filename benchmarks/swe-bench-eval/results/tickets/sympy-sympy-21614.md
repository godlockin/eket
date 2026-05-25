# sympy-sympy-21614

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: b4777fdcef467b7132c055f8ac2c9a5059e6a145
**创建时间**: 2021-06-14T07:56:59Z

## 问题描述

Wrong Derivative kind attribute
I'm playing around with the `kind` attribute.

The following is correct:

```
from sympy import Integral, Derivative
from sympy import MatrixSymbol
from sympy.abc import x
A = MatrixSymbol('A', 2, 2)
i = Integral(A, x)
i.kind
# MatrixKind(NumberKind)
```

This one is wrong:
```
d = Derivative(A, x)
d.kind
# UndefinedKind
```


## 提示信息

As I dig deeper into this issue, the problem is much larger than `Derivative`. As a matter of facts, all functions should be able to deal with `kind`. At the moment:

```
from sympy import MatrixSymbol
A = MatrixSymbol('A', 2, 2)
sin(A).kind
# UndefinedKind
```
The kind attribute is new and is not fully implemented or used across the codebase.

For `sin` and other functions I don't think that we should allow the ordinary `sin` function to be used for the Matrix sin. There should be a separate `MatrixSin` function for that.

For Derivative the handler for kind just needs to be added.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Derivative_kind"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
