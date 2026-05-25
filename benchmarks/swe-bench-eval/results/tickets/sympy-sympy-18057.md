# sympy-sympy-18057

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 62000f37b8821573ba00280524ffb4ac4a380875
**创建时间**: 2019-12-17T03:57:50Z

## 问题描述

Sympy incorrectly attempts to eval reprs in its __eq__ method
Passing strings produced by unknown objects into eval is **very bad**. It is especially surprising for an equality check to trigger that kind of behavior. This should be fixed ASAP.

Repro code:

```
import sympy
class C:
    def __repr__(self):
        return 'x.y'
_ = sympy.Symbol('x') == C()
```

Results in:

```
E   AttributeError: 'Symbol' object has no attribute 'y'
```

On the line:

```
    expr = eval(
        code, global_dict, local_dict)  # take local objects in preference
```

Where code is:

```
Symbol ('x' ).y
```

Full trace:

```
FAILED                   [100%]
        class C:
            def __repr__(self):
                return 'x.y'
    
>       _ = sympy.Symbol('x') == C()

_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
sympy/core/expr.py:124: in __eq__
    other = sympify(other)
sympy/core/sympify.py:385: in sympify
    expr = parse_expr(a, local_dict=locals, transformations=transformations, evaluate=evaluate)
sympy/parsing/sympy_parser.py:1011: in parse_expr
    return eval_expr(code, local_dict, global_dict)
sympy/parsing/sympy_parser.py:906: in eval_expr
    code, global_dict, local_dict)  # take local objects in preference
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

>   ???
E   AttributeError: 'Symbol' object has no attribute 'y'

<string>:1: AttributeError
```

Related issue: an unknown object whose repr is `x` will incorrectly compare as equal to a sympy symbol x:

```
    class C:
        def __repr__(self):
            return 'x'

    assert sympy.Symbol('x') != C()  # fails
```


## 提示信息

See also #12524
Safe flag or no, == should call _sympify since an expression shouldn't equal a string. 

I also think we should deprecate the string fallback in sympify. It has led to serious performance issues in the past and clearly has security issues as well. 
Actually, it looks like we also have

```
>>> x == 'x'
True
```

which is a major regression since 1.4. 

I bisected it to 73caef3991ca5c4c6a0a2c16cc8853cf212db531. 

The bug in the issue doesn't exist in 1.4 either. So we could consider doing a 1.5.1 release fixing this. 
The thing is, I could have swore this behavior was tested. But I don't see anything in the test changes from https://github.com/sympy/sympy/pull/16924 about string comparisons. 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_var"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
