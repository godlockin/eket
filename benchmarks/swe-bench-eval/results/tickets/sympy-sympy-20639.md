# sympy-sympy-20639

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: eb926a1d0c1158bf43f01eaf673dc84416b5ebb1
**创建时间**: 2020-12-21T07:42:53Z

## 问题描述

inaccurate rendering of pi**(1/E)
This claims to be version 1.5.dev; I just merged from the project master, so I hope this is current.  I didn't notice this bug among others in printing.pretty.

```
In [52]: pi**(1/E)                                                               
Out[52]: 
-1___
╲╱ π 

```
LaTeX and str not fooled:
```
In [53]: print(latex(pi**(1/E)))                                                 
\pi^{e^{-1}}

In [54]: str(pi**(1/E))                                                          
Out[54]: 'pi**exp(-1)'
```



## 提示信息

I can confirm this bug on master. Looks like it's been there a while
https://github.com/sympy/sympy/blob/2d700c4b3c0871a26741456787b0555eed9d5546/sympy/printing/pretty/pretty.py#L1814

`1/E` is `exp(-1)` which has totally different arg structure than something like `1/pi`:

```
>>> (1/E).args
(-1,)
>>> (1/pi).args
(pi, -1)
```
@ethankward nice!  Also, the use of `str` there isn't correct:
```
>>> pprint(7**(1/(pi)))                                                                                                                                                          
pi___
╲╱ 7 

>>> pprint(pi**(1/(pi)))                                                                                                                                                        
pi___
╲╱ π 

>>> pprint(pi**(1/(EulerGamma)))                                                                                                                                                
EulerGamma___
        ╲╱ π 
```
(`pi` and `EulerGamma` were not pretty printed)
I guess str is used because it's hard to put 2-D stuff in the corner of the radical like that. But I think it would be better to recursively call the pretty printer, and if it is multiline, or maybe even if it is a more complicated expression than just a single number or symbol name, then print it without the radical like

```
  1
  ─
  e
π
```

or

```
 ⎛ -1⎞
 ⎝e  ⎠
π

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_6285", "test_issue_17616"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
