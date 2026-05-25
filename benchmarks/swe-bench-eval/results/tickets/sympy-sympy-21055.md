# sympy-sympy-21055

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 748ce73479ee2cd5c861431091001cc18943c735
**创建时间**: 2021-03-07T21:08:36Z

## 问题描述

`refine()` does not understand how to simplify complex arguments
Just learned about the refine-function, which would come in handy frequently for me.  But
`refine()` does not recognize that argument functions simplify for real numbers.

```
>>> from sympy import *                                                     
>>> var('a,x')                                                              
>>> J = Integral(sin(x)*exp(-a*x),(x,0,oo))                                     
>>> J.doit()
	Piecewise((1/(a**2 + 1), 2*Abs(arg(a)) < pi), (Integral(exp(-a*x)*sin(x), (x, 0, oo)), True))
>>> refine(J.doit(),Q.positive(a))                                                 
        Piecewise((1/(a**2 + 1), 2*Abs(arg(a)) < pi), (Integral(exp(-a*x)*sin(x), (x, 0, oo)), True))
>>> refine(abs(a),Q.positive(a))                                            
	a
>>> refine(arg(a),Q.positive(a))                                            
	arg(a)
```
I cann't find any open issues identifying this.  Easy to fix, though.




## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_arg"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
