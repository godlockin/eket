# sympy-sympy-22005

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 2c83657ff1c62fc2761b639469fdac7f7561a72a
**创建时间**: 2021-09-02T13:05:27Z

## 问题描述

detection of infinite solution request
```python
>>> solve_poly_system((x - 1,), x, y)
Traceback (most recent call last):
...
NotImplementedError:
only zero-dimensional systems supported (finite number of solutions)
>>> solve_poly_system((y - 1,), x, y)  <--- this is not handled correctly
[(1,)]
```
```diff
diff --git a/sympy/solvers/polysys.py b/sympy/solvers/polysys.py
index b9809fd4e9..674322d4eb 100644
--- a/sympy/solvers/polysys.py
+++ b/sympy/solvers/polysys.py
@@ -240,7 +240,7 @@ def _solve_reduced_system(system, gens, entry=False):
 
         univariate = list(filter(_is_univariate, basis))
 
-        if len(univariate) == 1:
+        if len(univariate) == 1 and len(gens) == 1:
             f = univariate.pop()
         else:
             raise NotImplementedError(filldedent('''
diff --git a/sympy/solvers/tests/test_polysys.py b/sympy/solvers/tests/test_polysys.py
index 58419f8762..9e674a6fe6 100644
--- a/sympy/solvers/tests/test_polysys.py
+++ b/sympy/solvers/tests/test_polysys.py
@@ -48,6 +48,10 @@ def test_solve_poly_system():
     raises(NotImplementedError, lambda: solve_poly_system(
         [z, -2*x*y**2 + x + y**2*z, y**2*(-z - 4) + 2]))
     raises(PolynomialError, lambda: solve_poly_system([1/x], x))
+    raises(NotImplementedError, lambda: solve_poly_system(
+        Poly(x - 1, x, y), (x, y)))
+    raises(NotImplementedError, lambda: solve_poly_system(
+        Poly(y - 1, x, y), (x, y)))
 
 
 def test_solve_biquadratic():
```


## 提示信息

This is not a possible solution i feel , since some of the tests are failing and also weirdly `solve_poly_system([2*x - 3, y*Rational(3, 2) - 2*x, z - 5*y], x, y, z)`  is throwing a `NotImplementedError` .
Hmm. Well, they should yield similar results: an error or a solution. Looks like maybe a solution, then, should be returned? I am not sure. Maybe @jksuom would have some idea.
It seems that the number of polynomials in the Gröbner basis should be the same as the number of variables so there should be something like
```
    if len(basis) != len(gens):
        raise NotImplementedError(...)
> It seems that the number of polynomials in the Gröbner basis should be the same as the number of variables

This raises a `NotImplementedError` for `solve_poly_system([x*y - 2*y, 2*y**2 - x**2], x, y)` but which isn't the case since it has a solution.
It looks like the test could be `if len(basis) < len(gens)` though I'm not sure if the implementation can handle all cases where `len(basis) > len(gens)`.
Yes this works and now `solve_poly_system((y - 1,), x, y)` also returns `NotImplementedError` , I'll open a PR for this.
I'm not sure but all cases of `len(basis) > len(gens)` are being handled.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_solve_poly_system"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
