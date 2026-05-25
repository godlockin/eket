# sympy-sympy-13177

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 662cfb818e865f580e18b59efbb3540c34232beb
**创建时间**: 2017-08-22T20:28:20Z

## 问题描述

Mod(x**2, x) is not (always) 0
When the base is not an integer, `x**2 % x` is not 0. The base is not tested to be an integer in Mod's eval logic:

```
if (p == q or p == -q or
        p.is_Pow and p.exp.is_Integer and p.base == q or
        p.is_integer and q == 1):
    return S.Zero
```

so

```
>>> Mod(x**2, x)
0
```
but
```
>>> x = S(1.5)
>>> Mod(x**2, x)
0.75
```


## 提示信息

Even if `p.base` is an integer, the exponent must also be positive.

```
if (p == q or p == -q or p.is_integer and q == 1 or
        p.base == q and q.is_integer and p.is_Pow and p.exp.is_Integer
        and p.exp.is_positive):
    return S.Zero
```

because

```
>>> 2**-2 % S(2)
1/4
```
I would like to work on this. 
One would need just a slight change in the order of the properties, 


            p.is_Pow and p.base == q and q.is_integer and p.exp.is_Integer
            and p.exp.is_positive):
            return S.Zero

instead of

        p.base == q and q.is_integer and p.is_Pow and p.exp.is_Integer
        and p.exp.is_positive):
        return S.Zero


otherwise one gets an Attribute error:'Symbol' object has no attribute 'base' from
>>> Mod(x**2, x).


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_mod", "test_mod_inverse"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
