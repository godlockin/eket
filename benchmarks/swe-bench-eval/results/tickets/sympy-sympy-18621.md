# sympy-sympy-18621

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: b17ef6effe278d5b861d65896cc53442a6370d8f
**创建时间**: 2020-02-10T05:36:30Z

## 问题描述

BlockDiagMatrix with one element cannot be converted to regular Matrix
Creating a BlockDiagMatrix with one Matrix element will raise if trying to convert it back to a regular Matrix:

```python
M = sympy.Matrix([[1, 2], [3, 4]])
D = sympy.BlockDiagMatrix(M)
B = sympy.Matrix(D)
```

```
Traceback (most recent call last):

  File "<ipython-input-37-5b65c1f8f23e>", line 3, in <module>
    B = sympy.Matrix(D)

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/dense.py", line 430, in __new__
    return cls._new(*args, **kwargs)

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/dense.py", line 442, in _new
    rows, cols, flat_list = cls._handle_creation_inputs(*args, **kwargs)

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/matrices.py", line 2528, in _handle_creation_inputs
    return args[0].rows, args[0].cols, args[0].as_explicit()._mat

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/expressions/matexpr.py", line 340, in as_explicit
    for i in range(self.rows)])

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/expressions/matexpr.py", line 340, in <listcomp>
    for i in range(self.rows)])

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/expressions/matexpr.py", line 339, in <listcomp>
    for j in range(self.cols)]

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/expressions/matexpr.py", line 289, in __getitem__
    return self._entry(i, j)

  File "/home/rikard/.local/lib/python3.7/site-packages/sympy/matrices/expressions/blockmatrix.py", line 248, in _entry
    return self.blocks[row_block, col_block][i, j]

TypeError: 'One' object is not subscriptable
```

Instead having two elements will work as expected:

```python
M = sympy.Matrix([[1, 2], [3, 4]])
D = sympy.BlockDiagMatrix(M, M)
B = sympy.Matrix(D)
```

```
Matrix([
[1, 2, 0, 0],
[3, 4, 0, 0],
[0, 0, 1, 2],
[0, 0, 3, 4]])
```
This issue exists for sympy 1.5.1 but not for sympy 1.4


## 提示信息

```diff
diff --git a/sympy/matrices/expressions/blockmatrix.py b/sympy/matrices/expressions/blockmatrix.py
index 11aebbc59f..b821c42845 100644
--- a/sympy/matrices/expressions/blockmatrix.py
+++ b/sympy/matrices/expressions/blockmatrix.py
@@ -301,7 +301,7 @@ def blocks(self):
         data = [[mats[i] if i == j else ZeroMatrix(mats[i].rows, mats[j].cols)
                         for j in range(len(mats))]
                         for i in range(len(mats))]
-        return ImmutableDenseMatrix(data)
+        return ImmutableDenseMatrix(data, evaluate=False)

     @property
     def shape(self):
```

Okay, someone should do the workaround and add some tests about the issue.
i will submit a pr today.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_18618"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
