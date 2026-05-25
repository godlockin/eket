# scikit-learn-scikit-learn-11040

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 96a02f3934952d486589dddd3f00b40d5a5ab5f2
**创建时间**: 2018-04-28T07:18:33Z

## 问题描述

Missing parameter validation in Neighbors estimator for float n_neighbors
```python
from sklearn.neighbors import NearestNeighbors
from sklearn.datasets import make_blobs
X, y = make_blobs()
neighbors = NearestNeighbors(n_neighbors=3.)
neighbors.fit(X)
neighbors.kneighbors(X)
```
```
~/checkout/scikit-learn/sklearn/neighbors/binary_tree.pxi in sklearn.neighbors.kd_tree.NeighborsHeap.__init__()

TypeError: 'float' object cannot be interpreted as an integer
```
This should be caught earlier and a more helpful error message should be raised (or we could be lenient and cast to integer, but I think a better error might be better).

We need to make sure that 
```python
neighbors.kneighbors(X, n_neighbors=3.)
```
also works.


## 提示信息

Hello, I would like to take this as my first issue. 
Thank you.
@amueller 
I added a simple check for float inputs for  n_neighbors in order to throw ValueError if that's the case.
@urvang96 Did say he was working on it first @Alfo5123  ..

@amueller I think there is a lot of other estimators and Python functions in general where dtype isn't explicitely checked and wrong dtype just raises an exception later on.

Take for instance,
```py
import numpy as np

x = np.array([1])
np.sum(x, axis=1.)
```
which produces,
```py
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "lib/python3.6/site-packages/numpy/core/fromnumeric.py", line 1882, in sum
    out=out, **kwargs)
  File "lib/python3.6/site-packages/numpy/core/_methods.py", line 32, in _sum
    return umr_sum(a, axis, dtype, out, keepdims)
TypeError: 'float' object cannot be interpreted as an integer
```
so pretty much the same exception as in the original post, with no indications of what is wrong exactly. Here it's straightforward because we only provided one parameter, but the same is true for more complex constructions. 

So I'm not sure that starting to enforce int/float dtype of parameters, estimator by estimator is a solution here. In general don't think there is a need to do more parameter validation than what is done e.g. in numpy or pandas. If we want to do it, some generic type validation based on annotaitons (e.g. https://github.com/agronholm/typeguard) might be easier but also require more maintenance time and probably harder to implement while Python 2.7 is supported. 

pandas also doesn't enforce it explicitely BTW,
```python
pd.DataFrame([{'a': 1, 'b': 2}]).sum(axis=0.)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "lib/python3.6/site-packages/pandas/core/generic.py", line 7295, in stat_func
    numeric_only=numeric_only, min_count=min_count)
  File "lib/python3.6/site-packages/pandas/core/frame.py", line 5695, in _reduce
    axis = self._get_axis_number(axis)
  File "lib/python3.6/site-packages/pandas/core/generic.py", line 357, in _get_axis_number
    .format(axis, type(self)))
ValueError: No axis named 0.0 for object type <class 'pandas.core.frame.DataFrame'>
```
@Alfo5123 I claimed the issue first and I was working on it. This is not how the community works.
@urvang96 Yes, I understand, my bad. Sorry for the inconvenient.  I won't continue on it. 
@Alfo5123  Thank You. Are to going to close the existing PR?

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/neighbors/tests/test_neighbors.py::test_n_neighbors_datatype"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
