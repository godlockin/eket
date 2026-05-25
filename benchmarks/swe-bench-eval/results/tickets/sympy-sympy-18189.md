# sympy-sympy-18189

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 1923822ddf8265199dbd9ef9ce09641d3fd042b9
**创建时间**: 2019-12-31T15:45:24Z

## 问题描述

diophantine: incomplete results depending on syms order with permute=True
```
In [10]: diophantine(n**4 + m**4 - 2**4 - 3**4, syms=(m,n), permute=True)
Out[10]: {(-3, -2), (-3, 2), (-2, -3), (-2, 3), (2, -3), (2, 3), (3, -2), (3, 2)}

In [11]: diophantine(n**4 + m**4 - 2**4 - 3**4, syms=(n,m), permute=True)
Out[11]: {(3, 2)}
```

diophantine: incomplete results depending on syms order with permute=True
```
In [10]: diophantine(n**4 + m**4 - 2**4 - 3**4, syms=(m,n), permute=True)
Out[10]: {(-3, -2), (-3, 2), (-2, -3), (-2, 3), (2, -3), (2, 3), (3, -2), (3, 2)}

In [11]: diophantine(n**4 + m**4 - 2**4 - 3**4, syms=(n,m), permute=True)
Out[11]: {(3, 2)}
```



## 提示信息

```diff
diff --git a/sympy/solvers/diophantine.py b/sympy/solvers/diophantine.py
index 6092e35..b43f5c1 100644
--- a/sympy/solvers/diophantine.py
+++ b/sympy/solvers/diophantine.py
@@ -182,7 +182,7 @@ def diophantine(eq, param=symbols("t", integer=True), syms=None,
             if syms != var:
                 dict_sym_index = dict(zip(syms, range(len(syms))))
                 return {tuple([t[dict_sym_index[i]] for i in var])
-                            for t in diophantine(eq, param)}
+                            for t in diophantine(eq, param, permute=permute)}
         n, d = eq.as_numer_denom()
         if n.is_number:
             return set()
```
Based on a cursory glance at the code it seems that `permute=True` is lost when `diophantine` calls itself:
https://github.com/sympy/sympy/blob/d98abf000b189d4807c6f67307ebda47abb997f8/sympy/solvers/diophantine.py#L182-L185.
That should be easy to solve; I'll include a fix in my next PR (which is related).
Ah, ninja'd by @smichr :-)
```diff
diff --git a/sympy/solvers/diophantine.py b/sympy/solvers/diophantine.py
index 6092e35..b43f5c1 100644
--- a/sympy/solvers/diophantine.py
+++ b/sympy/solvers/diophantine.py
@@ -182,7 +182,7 @@ def diophantine(eq, param=symbols("t", integer=True), syms=None,
             if syms != var:
                 dict_sym_index = dict(zip(syms, range(len(syms))))
                 return {tuple([t[dict_sym_index[i]] for i in var])
-                            for t in diophantine(eq, param)}
+                            for t in diophantine(eq, param, permute=permute)}
         n, d = eq.as_numer_denom()
         if n.is_number:
             return set()
```
Based on a cursory glance at the code it seems that `permute=True` is lost when `diophantine` calls itself:
https://github.com/sympy/sympy/blob/d98abf000b189d4807c6f67307ebda47abb997f8/sympy/solvers/diophantine.py#L182-L185.
That should be easy to solve; I'll include a fix in my next PR (which is related).
Ah, ninja'd by @smichr :-)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_diophantine"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
