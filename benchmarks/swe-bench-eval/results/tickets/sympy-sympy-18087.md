# sympy-sympy-18087

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 9da013ad0ddc3cd96fe505f2e47c63e372040916
**创建时间**: 2019-12-20T12:38:00Z

## 问题描述

Simplify of simple trig expression fails
trigsimp in various versions, including 1.5, incorrectly simplifies cos(x)+sqrt(sin(x)**2) as though it were cos(x)+sin(x) for general complex x. (Oddly it gets this right if x is real.)

Embarrassingly I found this by accident while writing sympy-based teaching material...



## 提示信息

I guess you mean this:
```julia
In [16]: cos(x) + sqrt(sin(x)**2)                                                                                                 
Out[16]: 
   _________         
  ╱    2             
╲╱  sin (x)  + cos(x)

In [17]: simplify(cos(x) + sqrt(sin(x)**2))                                                                                       
Out[17]: 
      ⎛    π⎞
√2⋅sin⎜x + ─⎟
      ⎝    4⎠
```
Which is incorrect if `sin(x)` is negative:
```julia
In [27]: (cos(x) + sqrt(sin(x)**2)).evalf(subs={x:-1})                                                                            
Out[27]: 1.38177329067604

In [28]: simplify(cos(x) + sqrt(sin(x)**2)).evalf(subs={x:-1})                                                                    
Out[28]: -0.301168678939757
```
For real x this works because the sqrt auto simplifies to abs before simplify is called:
```julia
In [18]: x = Symbol('x', real=True)                                                                                               

In [19]: simplify(cos(x) + sqrt(sin(x)**2))                                                                                       
Out[19]: cos(x) + │sin(x)│

In [20]: cos(x) + sqrt(sin(x)**2)                                                                                                 
Out[20]: cos(x) + │sin(x)│
```
Yes, that's the issue I mean.
`fu` and `trigsimp` return the same erroneous simplification. All three simplification functions end up in Fu's `TR10i()` and this is what it returns:
```
In [5]: from sympy.simplify.fu import *

In [6]: e = cos(x) + sqrt(sin(x)**2)

In [7]: TR10i(sqrt(sin(x)**2))
Out[7]: 
   _________
  ╱    2    
╲╱  sin (x) 

In [8]: TR10i(e)
Out[8]: 
      ⎛    π⎞
√2⋅sin⎜x + ─⎟
      ⎝    4⎠
```
The other `TR*` functions keep the `sqrt` around, it's only `TR10i` that mishandles it. (Or it's called with an expression outside its scope of application...)
I tracked down where the invalid simplification of `sqrt(x**2)` takes place or at least I think so:
`TR10i` calls `trig_split` (also in fu.py) where the line
https://github.com/sympy/sympy/blob/0d99c52566820e9a5bb72eaec575fce7c0df4782/sympy/simplify/fu.py#L1901
in essence applies `._as_expr()` to `Factors({sin(x)**2: S.Half})` which then returns `sin(x)`.

If I understand `Factors` (sympy.core.exprtools) correctly, its intent is to have an efficient internal representation of products and `.as_expr()` is supposed to reconstruct a standard expression from such a representation. But here's what it does to a general complex variable `x`:
```
In [21]: Factors(sqrt(x**2))
Out[21]: Factors({x**2: 1/2})
In [22]: _.as_expr()
Out[22]: x
```
It seems line 455 below
https://github.com/sympy/sympy/blob/0d99c52566820e9a5bb72eaec575fce7c0df4782/sympy/core/exprtools.py#L449-L458
unconditionally multiplies exponents if a power of a power is encountered. However this is not generally valid for non-integer exponents...

And line 457 does the same for other non-integer exponents:
```
In [23]: Factors((x**y)**z)
Out[23]: Factors({x**y: z})

In [24]: _.as_expr()
Out[24]:
 y⋅z
x
```

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Factors", "test_fu"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
