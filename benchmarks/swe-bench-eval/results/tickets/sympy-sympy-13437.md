# sympy-sympy-13437

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 674afc619d7f5c519b6a5393a8b0532a131e57e0
**创建时间**: 2017-10-12T18:21:19Z

## 问题描述

bell(n).limit(n, oo) should be oo rather than bell(oo)
`bell(n).limit(n,oo)` should take the value infinity, but the current output is `bell(oo)`. As the Bell numbers represent the number of partitions of a set, it seems natural that `bell(oo)` should be able to be evaluated rather than be returned unevaluated. This issue is also in line with the recent fixes to the corresponding limit for the Fibonacci numbers and Lucas numbers.

```
from sympy import *
n = symbols('n')
bell(n).limit(n,oo)

Output:
bell(oo)
```

I'm new to Sympy, so I'd appreciate the opportunity to fix this bug myself if that's alright.



## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_bell"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
