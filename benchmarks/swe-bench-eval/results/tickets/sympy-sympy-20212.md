# sympy-sympy-20212

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: a106f4782a9dbe7f8fd16030f15401d977e03ae9
**创建时间**: 2020-10-06T11:34:13Z

## 问题描述

0**-oo produces 0, the documentation says it should produce zoo
Using SymPy 1.5.1, evaluate `0**-oo` produces `0`.

The documentation for the Pow class states that it should return `ComplexInfinity`, aka `zoo`

| expr | value | reason |
| :-- | :-- | :--|
| `0**-oo` | `zoo` | This is not strictly true, as 0**oo may be oscillating between positive and negative values or rotating in the complex plane. It is convenient, however, when the base is positive.|



## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_zero"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
