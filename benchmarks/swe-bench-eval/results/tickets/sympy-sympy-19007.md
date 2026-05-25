# sympy-sympy-19007

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: f9e030b57623bebdc2efa7f297c1b5ede08fcebf
**创建时间**: 2020-03-29T13:47:11Z

## 问题描述

Wrong matrix element fetched from BlockMatrix
Given this code:
```
from sympy import *
n, i = symbols('n, i', integer=True)
A = MatrixSymbol('A', 1, 1)
B = MatrixSymbol('B', n, 1)
C = BlockMatrix([[A], [B]])
print('C is')
pprint(C)
print('C[i, 0] is')
pprint(C[i, 0])
```
I get this output:
```
C is
⎡A⎤
⎢ ⎥
⎣B⎦
C[i, 0] is
(A)[i, 0]
```
`(A)[i, 0]` is the wrong here. `C[i, 0]` should not be simplified as that element may come from either `A` or `B`.


## 提示信息

I was aware of the problem that the coordinates were loosely handled even if the matrix had symbolic dimensions
I also think that `C[3, 0]` should be undefined because there is no guarantee that n is sufficiently large to contain elements.
`C[3, 0]` should just stay unevaluated, since it might be valid (I assume that's what you mean by 'undefined'). It should be possible to handle some cases properly, for example `C[n, 0]` should return `B[n - 1, 0]`.

If I get some time I might have a go at it, seems to be a nice first PR.

**EDIT:** Sorry that's not even true. If `n` is zero, then `C[n, 0]` is not `B[n - 1, 0]`.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_block_index_symbolic", "test_block_index_symbolic_nonzero", "test_block_index_large"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
