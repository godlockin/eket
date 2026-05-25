# sympy-sympy-15609

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 15f56f3b0006d2ed2c29bde3c43e91618012c849
**创建时间**: 2018-12-09T12:27:08Z

## 问题描述

Indexed matrix-expression LaTeX printer is not compilable
```python
i, j, k = symbols("i j k")
M = MatrixSymbol("M", k, k)
N = MatrixSymbol("N", k, k)
latex((M*N)[i, j])
```

The LaTeX string produced by the last command is:
```
\sum_{i_{1}=0}^{k - 1} M_{i, _i_1} N_{_i_1, j}
```
LaTeX complains about a double subscript `_`. This expression won't render in MathJax either.


## 提示信息

Related to https://github.com/sympy/sympy/issues/15059
It's pretty simple to solve, `_print_MatrixElement` of `LatexPrinter` is not calling `self._print` on the indices.
I'd like to work on this. When adding a test, should I expand `test_MatrixElement_printing` or add `test_issue_15595` just for this issue? Or both?
The correct one should be `\sum_{i_{1}=0}^{k - 1} M_{i, i_1} N_{i_1, j}`.
Is that right?
Tests can be put everywhere. I'd prefer to have them next to the other ones.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_MatrixElement_printing"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
