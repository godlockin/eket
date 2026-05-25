# sympy-sympy-21171

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: aa22709cb7df2d7503803d4b2c0baa7aa21440b6
**创建时间**: 2021-03-26T07:48:35Z

## 问题描述

_print_SingularityFunction() got an unexpected keyword argument 'exp'
On a Jupyter Notebook cell, type the following:

```python
from sympy import *
from sympy.physics.continuum_mechanics import Beam
# Young's modulus
E = symbols("E")
# length of the beam
L = symbols("L")
# concentrated load at the end tip of the beam
F = symbols("F")
# square cross section
B, H = symbols("B, H")
I = B * H**3 / 12
# numerical values (material: steel)
d = {B: 1e-02, H: 1e-02, E: 210e09, L: 0.2, F: 100}

b2 = Beam(L, E, I)
b2.apply_load(-F, L / 2, -1)
b2.apply_support(0, "fixed")
R0, M0 = symbols("R_0, M_0")
b2.solve_for_reaction_loads(R0, M0)
```

Then:

```
b2.shear_force()
```

The following error appears:
```
---------------------------------------------------------------------------
TypeError                                 Traceback (most recent call last)
/usr/local/lib/python3.8/dist-packages/IPython/core/formatters.py in __call__(self, obj)
    343             method = get_real_method(obj, self.print_method)
    344             if method is not None:
--> 345                 return method()
    346             return None
    347         else:

/usr/local/lib/python3.8/dist-packages/sympy/interactive/printing.py in _print_latex_png(o)
    184         """
    185         if _can_print(o):
--> 186             s = latex(o, mode=latex_mode, **settings)
    187             if latex_mode == 'plain':
    188                 s = '$\\displaystyle %s$' % s

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in __call__(self, *args, **kwargs)
    371 
    372     def __call__(self, *args, **kwargs):
--> 373         return self.__wrapped__(*args, **kwargs)
    374 
    375     @property

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in latex(expr, **settings)
   2913 
   2914     """
-> 2915     return LatexPrinter(settings).doprint(expr)
   2916 
   2917 

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in doprint(self, expr)
    252 
    253     def doprint(self, expr):
--> 254         tex = Printer.doprint(self, expr)
    255 
    256         if self._settings['mode'] == 'plain':

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in doprint(self, expr)
    289     def doprint(self, expr):
    290         """Returns printer's representation for expr (as a string)"""
--> 291         return self._str(self._print(expr))
    292 
    293     def _print(self, expr, **kwargs):

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Add(self, expr, order)
    381             else:
    382                 tex += " + "
--> 383             term_tex = self._print(term)
    384             if self._needs_add_brackets(term):
    385                 term_tex = r"\left(%s\right)" % term_tex

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Mul(self, expr)
    565             # use the original expression here, since fraction() may have
    566             # altered it when producing numer and denom
--> 567             tex += convert(expr)
    568 
    569         else:

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in convert(expr)
    517                                isinstance(x.base, Quantity)))
    518 
--> 519                 return convert_args(args)
    520 
    521         def convert_args(args):

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in convert_args(args)
    523 
    524                 for i, term in enumerate(args):
--> 525                     term_tex = self._print(term)
    526 
    527                     if self._needs_mul_brackets(term, first=(i == 0),

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Add(self, expr, order)
    381             else:
    382                 tex += " + "
--> 383             term_tex = self._print(term)
    384             if self._needs_add_brackets(term):
    385                 term_tex = r"\left(%s\right)" % term_tex

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Mul(self, expr)
    569         else:
    570             snumer = convert(numer)
--> 571             sdenom = convert(denom)
    572             ldenom = len(sdenom.split())
    573             ratio = self._settings['long_frac_ratio']

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in convert(expr)
    505         def convert(expr):
    506             if not expr.is_Mul:
--> 507                 return str(self._print(expr))
    508             else:
    509                 if self.order not in ('old', 'none'):

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Add(self, expr, order)
    381             else:
    382                 tex += " + "
--> 383             term_tex = self._print(term)
    384             if self._needs_add_brackets(term):
    385                 term_tex = r"\left(%s\right)" % term_tex

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

/usr/local/lib/python3.8/dist-packages/sympy/printing/latex.py in _print_Pow(self, expr)
    649         else:
    650             if expr.base.is_Function:
--> 651                 return self._print(expr.base, exp=self._print(expr.exp))
    652             else:
    653                 tex = r"%s^{%s}"

/usr/local/lib/python3.8/dist-packages/sympy/printing/printer.py in _print(self, expr, **kwargs)
    327                 printmethod = '_print_' + cls.__name__
    328                 if hasattr(self, printmethod):
--> 329                     return getattr(self, printmethod)(expr, **kwargs)
    330             # Unknown object, fall back to the emptyPrinter.
    331             return self.emptyPrinter(expr)

TypeError: _print_SingularityFunction() got an unexpected keyword argument 'exp'
```


## 提示信息

Could you provide a fully working example? Copying and pasting your code leaves a number of non-defined variables. Thanks for the report.
@moorepants Sorry for that, I've just updated the code in the original post.
This is the string printed version from `b2..shear_force()`:

```
Out[5]: -F*SingularityFunction(x, L/2, 0) + (F*SingularityFunction(L, 0, -1)*SingularityFunction(L, L/2, 1)/(SingularityFunction(L, 0, -1)*SingularityFunction(L, 0, 1) - SingularityFunction(L, 0, 0)**2) - F*SingularityFunction(L, 0, 0)*SingularityFunction(L, L/2, 0)/(SingularityFunction(L, 0, -1)*SingularityFunction(L, 0, 1) - SingularityFunction(L, 0, 0)**2))*SingularityFunction(x, 0, 0) + (-F*SingularityFunction(L, 0, 0)*SingularityFunction(L, L/2, 1)/(SingularityFunction(L, 0, -1)*SingularityFunction(L, 0, 1) - SingularityFunction(L, 0, 0)**2) + F*SingularityFunction(L, 0, 1)*SingularityFunction(L, L/2, 0)/(SingularityFunction(L, 0, -1)*SingularityFunction(L, 0, 1) - SingularityFunction(L, 0, 0)**2))*SingularityFunction(x, 0, -1)
```
Yes works correctly if you print the string. It throws the error when you display the expression on a jupyter notebook with latex
It errors on this term: `SingularityFunction(L, 0, 0)**2`. For some reasons the latex printer fails on printing a singularity function raised to a power.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_latex_SingularityFunction"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
