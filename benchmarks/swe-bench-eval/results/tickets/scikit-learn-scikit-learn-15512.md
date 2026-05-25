# scikit-learn-scikit-learn-15512

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: b8a4da8baa1137f173e7035f104067c7d2ffde22
**创建时间**: 2019-11-02T22:28:57Z

## 问题描述

Return values of non converged affinity propagation clustering
The affinity propagation Documentation states: 
"When the algorithm does not converge, it returns an empty array as cluster_center_indices and -1 as label for each training sample."

Example:
```python
from sklearn.cluster import AffinityPropagation
import pandas as pd

data = pd.DataFrame([[1,0,0,0,0,0],[0,1,1,1,0,0],[0,0,1,0,0,1]])
af = AffinityPropagation(affinity='euclidean', verbose=True, copy=False, max_iter=2).fit(data)

print(af.cluster_centers_indices_)
print(af.labels_)

```
I would expect that the clustering here (which does not converge) prints first an empty List and then [-1,-1,-1], however, I get [2] as cluster center and [0,0,0] as cluster labels. 
The only way I currently know if the clustering fails is if I use the verbose option, however that is very unhandy. A hacky solution is to check if max_iter == n_iter_ but it could have converged exactly 15 iterations before max_iter (although unlikely).
I am not sure if this is intended behavior and the documentation is wrong?

For my use-case within a bigger script, I would prefer to get back -1 values or have a property to check if it has converged, as otherwise, a user might not be aware that the clustering never converged.


#### Versions
System:
    python: 3.6.7 | packaged by conda-forge | (default, Nov 21 2018, 02:32:25)  [GCC 4.8.2 20140120 (Red Hat 4.8.2-15)]
executable: /home/jenniferh/Programs/anaconda3/envs/TF_RDKit_1_19/bin/python
   machine: Linux-4.15.0-52-generic-x86_64-with-debian-stretch-sid
BLAS:
    macros: SCIPY_MKL_H=None, HAVE_CBLAS=None
  lib_dirs: /home/jenniferh/Programs/anaconda3/envs/TF_RDKit_1_19/lib
cblas_libs: mkl_rt, pthread
Python deps:
    pip: 18.1
   setuptools: 40.6.3
   sklearn: 0.20.3
   numpy: 1.15.4
   scipy: 1.2.0
   Cython: 0.29.2
   pandas: 0.23.4




## 提示信息

@JenniferHemmerich this affinity propagation code is not often updated. If you have time to improve its documentation and fix corner cases like the one you report please send us PR. I'll try to find the time to review the changes. thanks
Working on this for the wmlds scikit learn sprint (pair programming with @akeshavan)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/cluster/tests/test_affinity_propagation.py::test_affinity_propagation_non_convergence_regressiontest"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
