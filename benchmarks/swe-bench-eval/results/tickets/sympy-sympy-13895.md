# sympy-sympy-13895

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 4da0b64558e9551a11a99bccc63557ba34f50c58
**创建时间**: 2018-01-11T19:43:54Z

## 问题描述

(-x/4 - S(1)/12)**x - 1 simplifies to an inequivalent expression
    >>> from sympy import *
    >>> x = Symbol('x')
    >>> e = (-x/4 - S(1)/12)**x - 1
    >>> e
    (-x/4 - 1/12)**x - 1
    >>> f = simplify(e)
    >>> f
    12**(-x)*(-12**x + (-3*x - 1)**x)
    >>> a = S(9)/5
    >>> simplify(e.subs(x,a))
    -1 - 32*15**(1/5)*2**(2/5)/225
    >>> simplify(f.subs(x,a))
    -1 - 32*(-1)**(4/5)*60**(1/5)/225
    >>> N(e.subs(x,a))
    -1.32255049319339
    >>> N(f.subs(x,a))
    -0.739051169462523 - 0.189590423018741*I




## 提示信息

The expressions really are equivalent, `simplify` is not to blame.  SymPy is inconsistent when raising negative numbers to the power of 9/5 (and probably other rational powers). 
```
>>> (-S(1))**(S(9)/5)
-(-1)**(4/5)                  #  complex number as a result 
>>> (-S(4))**(S(9)/5)
-8*2**(3/5)                  # the result is real
```
In a way, both are reasonable. The computation starts by writing 9/5 as 1 + 4/5. Then we get the base factored out, and are left with `(-1)**(4/5)` or `(-4)**(4/5)`. Somehow, the first is left alone while in the second, noticing that 4 is a square, SymPy does further manipulations, ending up by raising (-4) to the power of 4 and thus canceling the minus sign. So we get the second result.  

Can it be accepted that the expression is multi-valued and which of the possible values is chosen is arbitrary? But one perhaps would like more consistency on this.
OK, "inequivalent" was the wrong word. But is it reasonable to expect sympy to try to keep the same complex root choice through simplification?
Yes, I think there should be consistency there.  The issue is at the level of SymPy taking in an object like (-1)**(S(4)/5) and parsing it into an expression tree. The trees are formed in significantly different ways for different exponents: 
```
>>> for k in range(1, 5):
...     srepr((-4)**(S(k)/5))
'Pow(Integer(-4), Rational(1, 5))'    #  complex
'Pow(Integer(-4), Rational(2, 5))'    # complex 
'Mul(Integer(2), Pow(Integer(-2), Rational(1, 5)))'   # complex, factoring out 2 is okay
'Mul(Integer(2), Pow(Integer(2), Rational(3, 5)))'    # real, where did the minus sign go? 
```

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_powers_Integer", "test_issue_13890"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
