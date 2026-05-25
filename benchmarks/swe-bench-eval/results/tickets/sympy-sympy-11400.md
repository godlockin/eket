# sympy-sympy-11400

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 8dcb12a6cf500e8738d6729ab954a261758f49ca
**创建时间**: 2016-07-15T21:40:49Z

## 问题描述

ccode(sinc(x)) doesn't work
```
In [30]: ccode(sinc(x))
Out[30]: '// Not supported in C:\n// sinc\nsinc(x)'
```

I don't think `math.h` has `sinc`, but it could print

```
In [38]: ccode(Piecewise((sin(theta)/theta, Ne(theta, 0)), (1, True)))
Out[38]: '((Ne(theta, 0)) ? (\n   sin(theta)/theta\n)\n: (\n   1\n))'
```



## 提示信息

@asmeurer I would like to fix this issue. Should I work upon  the codegen.py file ? If there's something else tell me how to start ?

The relevant file is sympy/printing/ccode.py

@asmeurer I am new here. I would like to work on this issue. Please tell me how to start?

Since there are two people asking, maybe one person can try #11286 which is very similar, maybe even easier.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_ccode_Relational", "test_ccode_sinc"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
