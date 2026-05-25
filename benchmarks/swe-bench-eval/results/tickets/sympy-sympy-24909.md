# sympy-sympy-24909

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: d3b4158dea271485e3daa11bf82e69b8dab348ce
**创建时间**: 2023-03-13T14:24:25Z

## 问题描述

Bug with milli prefix
What happened:
```
In [1]: from sympy.physics.units import milli, W
In [2]: milli*W == 1
Out[2]: True
In [3]: W*milli
Out[3]: watt*Prefix(milli, m, -3, 10)
```
What I expected to happen: milli*W should evaluate to milli watts / mW

`milli*W` or more generally `milli` times some unit evaluates to the number 1. I have tried this with Watts and Volts, I'm not sure what other cases this happens. I'm using sympy version 1.11.1-1 on Arch Linux with Python 3.10.9. If you cannot reproduce I would be happy to be of any assitance.


## 提示信息

I get a 1 for all of the following (and some are redundant like "V" and "volt"):
```python
W, joule, ohm, newton, volt, V, v, volts, henrys, pa, kilogram, ohms, kilograms, Pa, weber, tesla, Wb, H, wb, newtons, kilometers, webers, pascals, kilometer, watt, T, km, kg, joules, pascal, watts, J, henry, kilo, teslas
```
Plus it's only milli.
```
In [65]: for p in PREFIXES:
    ...:     print(p, PREFIXES[p]*W)
    ...:
Y 1000000000000000000000000*watt
Z 1000000000000000000000*watt
E 1000000000000000000*watt
P 1000000000000000*watt
T 1000000000000*watt
G 1000000000*watt
M 1000000*watt
k 1000*watt
h 100*watt
da 10*watt
d watt/10
c watt/100
m 1
mu watt/1000000
n watt/1000000000
p watt/1000000000000
f watt/1000000000000000
a watt/1000000000000000000
z watt/1000000000000000000000
y watt/1000000000000000000000000
```
Dear team,

I am excited to contribute to this project and offer my skills. Please let me support the team's efforts and collaborate effectively. Looking forward to working with you all.
@Sourabh5768  Thanks for showing interest, you don't need to ask for a contribution If you know how to fix an issue, you can just make a pull request to fix it.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_prefix_operations"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
