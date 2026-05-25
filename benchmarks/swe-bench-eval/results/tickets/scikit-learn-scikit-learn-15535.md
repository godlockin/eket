# scikit-learn-scikit-learn-15535

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 70b0ddea992c01df1a41588fa9e2d130fb6b13f8
**创建时间**: 2019-11-05T02:09:55Z

## 问题描述

regression in input validation of clustering metrics
```python
from sklearn.metrics.cluster import mutual_info_score
import numpy as np

x = np.random.choice(['a', 'b'], size=20).astype(object)
mutual_info_score(x, x)
```
ValueError: could not convert string to float: 'b'

while
```python
x = np.random.choice(['a', 'b'], size=20)
mutual_info_score(x, x)
```
works with a warning?

this worked in 0.21.1 without a warning (as I think it should)


Edit by @ogrisel: I removed the `.astype(object)` in the second code snippet.


## 提示信息

broke in #10830 ping @glemaitre 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[adjusted_mutual_info_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[adjusted_rand_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[completeness_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[homogeneity_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[mutual_info_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[normalized_mutual_info_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[v_measure_score]", "sklearn/metrics/cluster/tests/test_common.py::test_format_invariance[fowlkes_mallows_score]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
