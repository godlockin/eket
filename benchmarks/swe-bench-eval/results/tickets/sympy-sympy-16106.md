# sympy-sympy-16106

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 0e987498b00167fdd4a08a41c852a97cb70ce8f2
**创建时间**: 2019-02-28T17:21:46Z

## 问题描述

mathml printer for IndexedBase required
Writing an `Indexed` object to MathML fails with a `TypeError` exception: `TypeError: 'Indexed' object is not iterable`:

```
In [340]: sympy.__version__
Out[340]: '1.0.1.dev'

In [341]: from sympy.abc import (a, b)

In [342]: sympy.printing.mathml(sympy.IndexedBase(a)[b])
---------------------------------------------------------------------------
TypeError                                 Traceback (most recent call last)
<ipython-input-342-b32e493b70d3> in <module>()
----> 1 sympy.printing.mathml(sympy.IndexedBase(a)[b])

/dev/shm/gerrit/venv/stable-3.5/lib/python3.5/site-packages/sympy/printing/mathml.py in mathml(expr, **settings)
    442 def mathml(expr, **settings):
    443     """Returns the MathML representation of expr"""
--> 444     return MathMLPrinter(settings).doprint(expr)
    445 
    446 

/dev/shm/gerrit/venv/stable-3.5/lib/python3.5/site-packages/sympy/printing/mathml.py in doprint(self, expr)
     36         Prints the expression as MathML.
     37         """
---> 38         mathML = Printer._print(self, expr)
     39         unistr = mathML.toxml()
     40         xmlbstr = unistr.encode('ascii', 'xmlcharrefreplace')

/dev/shm/gerrit/venv/stable-3.5/lib/python3.5/site-packages/sympy/printing/printer.py in _print(self, expr, *args, **kwargs)
    255                 printmethod = '_print_' + cls.__name__
    256                 if hasattr(self, printmethod):
--> 257                     return getattr(self, printmethod)(expr, *args, **kwargs)
    258             # Unknown object, fall back to the emptyPrinter.
    259             return self.emptyPrinter(expr)

/dev/shm/gerrit/venv/stable-3.5/lib/python3.5/site-packages/sympy/printing/mathml.py in _print_Basic(self, e)
    356     def _print_Basic(self, e):
    357         x = self.dom.createElement(self.mathml_tag(e))
--> 358         for arg in e:
    359             x.appendChild(self._print(arg))
    360         return x

TypeError: 'Indexed' object is not iterable
```

It also fails for more complex expressions where at least one element is Indexed.


## 提示信息

Now it returns
```
'<indexed><indexedbase><ci>a</ci></indexedbase><ci>b</ci></indexed>'
```
for content printer and 
```
'<mrow><mi>indexed</mi><mfenced><mrow><mi>indexedbase</mi><mfenced><mi>a</mi></mfenced></mrow><mi>b</mi></mfenced></mrow>'
```
for presentation printer.

Probably not correct as it seems like it falls back to the printer for `Basic`.

Hence, a method `_print_IndexedBase` is required. Could be good to look at the LaTeX version to see how subscripts etc are handled.
Hi, can I take up this issue if it still needs fixing?
@pragyanmehrotra It is still needed so please go ahead!
@oscargus Sure I'll start working on it right ahead! However, Idk what exactly needs to be done so if you could point out how the output should look like and do I have to implement a new function or edit a current function it'd be a great help, Thanks.
```
from sympy import IndexedBase
a, b = symbols('a b')
IndexedBase(a)[b]
```
which renders as
![image](https://user-images.githubusercontent.com/8114497/53299790-abec5c80-383f-11e9-82c4-6dd3424f37a7.png)

Meaning that the presentation MathML output should be something like
`<msub><mi>a<mi><mi>b<mi></msub>`

Have a look at #16036 for some good resources.

Basically you need to do something like:
```
m = self.dom.createElement('msub')
m.appendChild(self._print(Whatever holds a))
m.appendChild(self._print(Whatever holds b))
```
in a function called `_print_IndexedBase`.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_print_IndexedBase"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
