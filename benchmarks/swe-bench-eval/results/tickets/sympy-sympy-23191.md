# sympy-sympy-23191

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: fa9b4b140ec0eaf75a62c1111131626ef0f6f524
**创建时间**: 2022-03-01T17:22:06Z

## 问题描述

display bug while using pretty_print with sympy.vector object in the terminal
The following code jumbles some of the outputs in the terminal, essentially by inserting the unit vector in the middle -
```python
from sympy import *
from sympy.vector import CoordSys3D, Del

init_printing()

delop = Del()
CC_ = CoordSys3D("C")
x,    y,    z    = CC_.x, CC_.y, CC_.z
xhat, yhat, zhat = CC_.i, CC_.j, CC_.k

t = symbols("t")
ten = symbols("10", positive=True)
eps, mu = 4*pi*ten**(-11), ten**(-5)

Bx = 2 * ten**(-4) * cos(ten**5 * t) * sin(ten**(-3) * y)
vecB = Bx * xhat
vecE = (1/eps) * Integral(delop.cross(vecB/mu).doit(), t)

pprint(vecB)
print()
pprint(vecE)
print()
pprint(vecE.doit())
```

Output:
```python
⎛     ⎛y_C⎞    ⎛  5  ⎞⎞    
⎜2⋅sin⎜───⎟ i_C⋅cos⎝10 ⋅t⎠⎟
⎜     ⎜  3⎟           ⎟    
⎜     ⎝10 ⎠           ⎟    
⎜─────────────────────⎟    
⎜           4         ⎟    
⎝         10          ⎠    

⎛     ⌠                           ⎞    
⎜     ⎮       ⎛y_C⎞    ⎛  5  ⎞    ⎟ k_C
⎜     ⎮ -2⋅cos⎜───⎟⋅cos⎝10 ⋅t⎠    ⎟    
⎜     ⎮       ⎜  3⎟               ⎟    
⎜  11 ⎮       ⎝10 ⎠               ⎟    
⎜10  ⋅⎮ ─────────────────────── dt⎟    
⎜     ⎮             2             ⎟    
⎜     ⎮           10              ⎟    
⎜     ⌡                           ⎟    
⎜─────────────────────────────────⎟    
⎝               4⋅π               ⎠    

⎛   4    ⎛  5  ⎞    ⎛y_C⎞ ⎞    
⎜-10 ⋅sin⎝10 ⋅t⎠⋅cos⎜───⎟ k_C ⎟
⎜                   ⎜  3⎟ ⎟    
⎜                   ⎝10 ⎠ ⎟    
⎜─────────────────────────⎟    
⎝           2⋅π           ⎠    ```


## 提示信息

You can control print order as described [here](https://stackoverflow.com/a/58541713/1089161).
The default order should not break the multiline bracket of pretty print. Please see the output in constant width mode or paste it in a text editor. The second output is fine while the right bracket is broken in the other two.
I can verify that this seems to be an issue specific to pretty print. The Latex renderer outputs what you want. This should be fixable. Here is an image of the output for your vectors from the latex rendered in Jupyter.
![image](https://user-images.githubusercontent.com/1231317/153658279-1cf4d387-2101-4cb3-b182-131ed3cbe1b8.png)

Admittedly the small outer parenthesis are not stylistically great, but the ordering is what you expect.
The LaTeX printer ought to be using \left and \right for parentheses. 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_23058"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
