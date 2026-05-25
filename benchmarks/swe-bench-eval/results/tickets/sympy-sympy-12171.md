# sympy-sympy-12171

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: ca6ef27272be31c9dc3753ede9232c39df9a75d8
**创建时间**: 2017-02-13T18:20:56Z

## 问题描述

matematica code printer does not handle floats and derivatives correctly
In its current state the mathematica code printer does not handle Derivative(func(vars), deriver) 
e.g. Derivative(f(t), t) yields Derivative(f(t), t) instead of D[f[t],t]

Also floats with exponents are not handled correctly e.g. 1.0e-4 is not converted to 1.0*^-4

This has an easy fix by adding the following lines to MCodePrinter:


def _print_Derivative(self, expr):
        return "D[%s]" % (self.stringify(expr.args, ", "))

def _print_Float(self, expr):
        res =str(expr)
        return res.replace('e','*^') 





## 提示信息

I would like to work on this issue
So, should I add the lines in printing/mathematica.py ?
I've tested the above code by adding these methods to a class derived from MCodePrinter and I was able to export an ODE system straight to NDSolve in Mathematica.

So I guess simply adding them to MCodePrinter in in printing/mathematica.py would fix the issue

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Derivative"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
