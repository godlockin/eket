# sympy-sympy-15346

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 9ef28fba5b4d6d0168237c9c005a550e6dc27d81
**创建时间**: 2018-10-05T17:25:21Z

## 问题描述

can't simplify sin/cos with Rational?
latest cloned sympy, python 3 on windows
firstly, cos, sin with symbols can be simplified; rational number can be simplified
```python
from sympy import *

x, y = symbols('x, y', real=True)
r = sin(x)*sin(y) + cos(x)*cos(y)
print(r)
print(r.simplify())
print()

r = Rational(1, 50) - Rational(1, 25)
print(r)
print(r.simplify())
print()
```
says
```cmd
sin(x)*sin(y) + cos(x)*cos(y)
cos(x - y)

-1/50
-1/50
```

but
```python
t1 = Matrix([sin(Rational(1, 50)), cos(Rational(1, 50)), 0])
t2 = Matrix([sin(Rational(1, 25)), cos(Rational(1, 25)), 0])
r = t1.dot(t2)
print(r)
print(r.simplify())
print()

r = sin(Rational(1, 50))*sin(Rational(1, 25)) + cos(Rational(1, 50))*cos(Rational(1, 25))
print(r)
print(r.simplify())
print()

print(acos(r))
print(acos(r).simplify())
print()
```
says
```cmd
sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)
sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)

sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)
sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)

acos(sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25))
acos(sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25))
```




## 提示信息

some can be simplified
```python
from sympy import *

t1 = Matrix([sin(Rational(1, 50)), cos(Rational(1, 50)), 0])
t2 = Matrix([sin(Rational(2, 50)), cos(Rational(2, 50)), 0])
t3 = Matrix([sin(Rational(3, 50)), cos(Rational(3, 50)), 0])

r1 = t1.dot(t2)
print(r1)
print(r1.simplify())
print()

r2 = t2.dot(t3)
print(r2)
print(r2.simplify())
print()
```
says
```
sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)
sin(1/50)*sin(1/25) + cos(1/50)*cos(1/25)

sin(1/25)*sin(3/50) + cos(1/25)*cos(3/50)
cos(1/50)
```
Trigonometric simplifications are performed by `trigsimp`. It works by calling sequentially functions defined in the `fu` module. This particular simplification is carried out by `TR10i` which comes right after `TRmorrie` in the [list of methods](https://github.com/sympy/sympy/blob/master/sympy/simplify/trigsimp.py#L1131-L1164).

`TRmorrie` does a very special type of transformation:
 
    Returns cos(x)*cos(2*x)*...*cos(2**(k-1)*x) -> sin(2**k*x)/(2**k*sin(x))

In this example, it will transform the expression into a form that `TR10i` can no more recognize.
```
>>> from sympy.simplify.fu import TRmorrie
>>> x = S(1)/50
>>> e = sin(x)*sin(2*x) + cos(x)*cos(2*x)
>>> TRmorrie(e)
sin(1/50)*sin(1/25) + sin(2/25)/(4*sin(1/50))
```
I cannot think of any reason why `TRmorrie` should come before `TR10i`. This issue could probably be fixed by changing the order of these two functions.
So, if the user-input expression varies, there is no way to simplify the expression to a very simple formation, isn't it?
I think that this issue could be fixed by changing the order of `TRmorrie` and `TR10i`. (But, of course, there may be other issues in simplification that this will not resolve.)
That should be easy to fix, assuming it works. If it doesn't work then the actual fix may be more complicated. 
hi @retsyo is this issue still open, in that case i would i like to take up the issue
@llucifer97 
the latest cloned sympy still has this issue
hi @retsyo  i would like to work on this if it is not assigned . I will need some help and guidance though .
@FrackeR011, it looks like @llucifer97 (2 posts above yours) has already expressed an interest. You should ask them if they are still working on it
@llucifer97 are you working on this issue


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_15129_trigsimp_methods"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
