# sympy-sympy-11897

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: e2918c1205c47345eb73c9be68b14c0f15fdeb17
**创建时间**: 2016-12-03T14:40:51Z

## 问题描述

LaTeX printer inconsistent with pretty printer
The LaTeX printer should always give the same output as the pretty printer, unless better output is possible from LaTeX. In some cases it is inconsistent. For instance:

``` py
In [9]: var('x', positive=True)
Out[9]: x

In [10]: latex(exp(-x)*log(x))
Out[10]: '\\frac{1}{e^{x}} \\log{\\left (x \\right )}'

In [11]: pprint(exp(-x)*log(x))
 -x
ℯ  ⋅log(x)
```

(I also don't think the assumptions should affect printing). 

``` py
In [14]: var('x y')
Out[14]: (x, y)

In [15]: latex(1/(x + y)/2)
Out[15]: '\\frac{1}{2 x + 2 y}'

In [16]: pprint(1/(x + y)/2)
    1
─────────
2⋅(x + y)
```



## 提示信息

In each of these cases, the pprint output is better. I think in general the pretty printer is better tuned than the LaTeX printer, so if they disagree, the pprint output is likely the better one. 

I want to fix this issue. How should I start?

Each of the expressions is a Mul, so look at LatexPrinter._print_Mul and compare it to PrettyPrinter._print_Mul. 

@asmeurer In general what you want is that the output of both should be compared and if the LaTeX printer produces an output different from PrettyPrinter then Pretty Printer's output should be shown in the console. Right ? (A bit confused and posting a comment to clear my doubt)

It shouldn't change the printer type. They should just both produce the same form of the expression. 

@asmeurer Thanks for the clarification. 

Another example:

```
In [7]: var("sigma mu")
Out[7]: (σ, μ)

In [8]: (exp(-(x - mu)**2/sigma**2))
Out[8]:
          2
 -(-μ + x)
 ───────────
       2
      σ
ℯ

In [9]: latex(exp(-(x - mu)**2/sigma**2))
Out[9]: 'e^{- \\frac{1}{\\sigma^{2}} \\left(- \\mu + x\\right)^{2}}'
```

Another one (no parentheses around the piecewise):

```
In [38]: FiniteSet(6**(S(1)/3)*x**(S(1)/3)*Piecewise(((-1)**(S(2)/3), 3*x/4 < 0), (1, True)))
Out[38]:
⎧            ⎛⎧    2/3      3⋅x    ⎞⎫
⎪3 ___ 3 ___ ⎜⎪(-1)     for ─── < 0⎟⎪
⎨╲╱ 6 ⋅╲╱ x ⋅⎜⎨              4     ⎟⎬
⎪            ⎜⎪                    ⎟⎪
⎩            ⎝⎩   1      otherwise ⎠⎭

In [39]: latex(FiniteSet(6**(S(1)/3)*x**(S(1)/3)*Piecewise(((-1)**(S(2)/3), 3*x/4 < 0), (1, True))))
Out[39]: '\\left\\{\\sqrt[3]{6} \\sqrt[3]{x} \\begin{cases} \\left(-1\\right)^{\\frac{2}{3}} & \\text{for}\\: \\frac{3 x}{4} < 0 \\\\1 & \\text{otherwise} \\end{cases}\\right\\}'
```

Some of these were fixed in https://github.com/sympy/sympy/pull/11298

```
In [39]: latex(FiniteSet(6**(S(1)/3)*x**(S(1)/3)*Piecewise(((-1)**(S(2)/3), 3*x/4 < 0), (1, True))))
Out[39]: '\\left\\{\\sqrt[3]{6} \\sqrt[3]{x} \\begin{cases} \\left(-1\\right)^{\\frac{2}{3}} & \\text{for}\\: \\frac{3 x}{4} < 0 \\\\1 & \\text{otherwise} \\end{cases}\\right\\}'
```

This error is caused since there is no closing parentheses included in the printing piecewise functions. Will it be fine to add closing parentheses in Piecewise functions?

The piecewise should print like it does for the Unicode pretty printer. 


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_latex_Piecewise"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
