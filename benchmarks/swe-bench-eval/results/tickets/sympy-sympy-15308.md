# sympy-sympy-15308

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: fb59d703e6863ed803c98177b59197b5513332e9
**创建时间**: 2018-09-28T16:42:11Z

## 问题描述

LaTeX printing for Matrix Expression
```py
>>> A = MatrixSymbol("A", n, n)
>>> latex(trace(A**2))
'Trace(A**2)'
```

The bad part is not only is Trace not recognized, but whatever printer is being used doesn't fallback to the LaTeX printer for the inner expression (it should be `A^2`). 


## 提示信息

What is the correct way to print the trace? AFAIK there isn't one built in to Latex. One option is ```\mathrm{Tr}```. Or ```\operatorname{Tr}```.
What's the difference between the two. It looks like we use both in different parts of the latex printer. 
\operatorname puts a thin space after the operator.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_trace"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
