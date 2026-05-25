# sympy-sympy-21612

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: b4777fdcef467b7132c055f8ac2c9a5059e6a145
**创建时间**: 2021-06-14T04:31:24Z

## 问题描述

Latex parsing of fractions yields wrong expression due to missing brackets
Problematic latex expression: `"\\frac{\\frac{a^3+b}{c}}{\\frac{1}{c^2}}"`

is parsed to: `((a**3 + b)/c)/1/(c**2)`.

Expected is: `((a**3 + b)/c)/(1/(c**2))`. 

The missing brackets in the denominator result in a wrong expression.

## Tested on

- 1.8
- 1.6.2

## Reproduce:

```
root@d31ef1c26093:/# python3
Python 3.6.9 (default, Jan 26 2021, 15:33:00)
[GCC 8.4.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> from sympy.parsing.latex import parse_latex
>>> parse_latex("\\frac{\\frac{a^3+b}{c}}{\\frac{1}{c^2}}")
((a**3 + b)/c)/1/(c**2)




## 提示信息

This can be further simplified and fails with 

````python
>>> parse_latex("\\frac{a}{\\frac{1}{b}}")
a/1/b
````
but works with a slighty different expression correctly (although the double brackets are not necessary):

````python
>>> parse_latex("\\frac{a}{\\frac{b}{c}}")
a/((b/c))
````
> This can be further simplified and fails with

This is a printing, not a parsing error. If you look at the args of the result they are `(a, 1/(1/b))`
This can be fixed with 
```diff
diff --git a/sympy/printing/str.py b/sympy/printing/str.py
index c3fdcdd435..3e4b7d1b19 100644
--- a/sympy/printing/str.py
+++ b/sympy/printing/str.py
@@ -333,7 +333,7 @@ def apow(i):
                     b.append(apow(item))
                 else:
                     if (len(item.args[0].args) != 1 and
-                            isinstance(item.base, Mul)):
+                            isinstance(item.base, (Mul, Pow))):
                         # To avoid situations like #14160
                         pow_paren.append(item)
                     b.append(item.base)
diff --git a/sympy/printing/tests/test_str.py b/sympy/printing/tests/test_str.py
index 690b1a8bbf..68c7d63769 100644
--- a/sympy/printing/tests/test_str.py
+++ b/sympy/printing/tests/test_str.py
@@ -252,6 +252,8 @@ def test_Mul():
     # For issue 14160
     assert str(Mul(-2, x, Pow(Mul(y,y,evaluate=False), -1, evaluate=False),
                                                 evaluate=False)) == '-2*x/(y*y)'
+    # issue 21537
+    assert str(Mul(x, Pow(1/y, -1, evaluate=False), evaluate=False)) == 'x/(1/y)'
 
 
     class CustomClass1(Expr):
```
@smichr That's great, thank you for the quick fix! This works fine here now with all the test cases.

I did not even consider that this is connected to printing and took the expression at face value. 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Mul"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
