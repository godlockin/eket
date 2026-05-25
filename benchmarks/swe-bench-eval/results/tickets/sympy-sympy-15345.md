# sympy-sympy-15345

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 9ef28fba5b4d6d0168237c9c005a550e6dc27d81
**创建时间**: 2018-10-05T06:00:31Z

## 问题描述

mathematica_code gives wrong output with Max
If I run the code

```
x = symbols('x')
mathematica_code(Max(x,2))
```

then I would expect the output `'Max[x,2]'` which is valid Mathematica code but instead I get `'Max(2, x)'` which is not valid Mathematica code.


## 提示信息

Hi, I'm new (to the project and development in general, but I'm a long time Mathematica user) and have been looking into this problem.

The `mathematica.py` file goes thru a table of known functions (of which neither Mathematica `Max` or `Min` functions are in) that are specified with lowercase capitalization, so it might be that doing `mathematica_code(Max(x,2))` is just yielding the unevaluated expression of `mathematica_code`. But there is a problem when I do `mathematica_code(max(x,2))` I get an error occurring in the Relational class in `core/relational.py`

Still checking it out, though.
`max` (lowercase `m`) is the Python builtin which tries to compare the items directly and give a result. Since `x` and `2` cannot be compared, you get an error. `Max` is the SymPy version that can return unevaluated results. 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Function"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
