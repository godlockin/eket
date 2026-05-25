# sympy-sympy-11870

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 5c2e1f96a7ff562d4a778f4ca9ffc9c81557197e
**创建时间**: 2016-11-17T21:36:03Z

## 问题描述

simplifying exponential -> trig identities
```
f = 1 / 2 * (-I*exp(I*k) + I*exp(-I*k))
trigsimp(f)
```

Ideally, this would yield `sin(k)`. Is there a way to do this?

As a corollary, it would be awesome if 

```
f = 1 / 2 / k* (-I*exp(I*k) + I*exp(-I*k))
trigsimp(f)
```

could yield `sinc(k)`. Thank you for your consideration!


## 提示信息

rewrite can be used:

```
>>> f = S(1) / 2 * (-I*exp(I*k) + I*exp(-I*k))
>>> f.rewrite(sin).simplify()
sin(k)
```

Thank you for that suggestion!

> On Nov 17, 2016, at 01:06, Kalevi Suominen notifications@github.com wrote:
> 
> rewrite can be used:
> 
> > > > f = S(1) / 2 \* (-I_exp(I_k) + I_exp(-I_k))
> > > > f.rewrite(sin).simplify()
> > > > sin(k)
> 
> —
> You are receiving this because you authored the thread.
> Reply to this email directly, view it on GitHub, or mute the thread.

Too bad this doesn't work as expected:

```
ω = sym.symbols('ω', real=True)
k = sym.symbols('k', real=True)
f = 1 / 2 / π * sym.exp(sym.I * ω * k)
F = sym.integrate(f, (ω, -π, π))
F.rewrite(sym.sinc).simplify()
```

It does not produce the desired sinc function in the equation.

It seems that rewrite for sinc has not been implemented.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_sinc"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
