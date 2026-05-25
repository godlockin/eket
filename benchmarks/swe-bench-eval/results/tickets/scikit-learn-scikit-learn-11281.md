# scikit-learn-scikit-learn-11281

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 4143356c3c51831300789e4fdf795d83716dbab6
**创建时间**: 2018-06-15T17:15:25Z

## 问题描述

Should mixture models have a clusterer-compatible interface
Mixture models are currently a bit different. They are basically clusterers, except they are probabilistic, and are applied to inductive problems unlike many clusterers. But they are unlike clusterers in API:
* they have an `n_components` parameter, with identical purpose to `n_clusters`
* they do not store the `labels_` of the training data
* they do not have a `fit_predict` method

And they are almost entirely documented separately.

Should we make the MMs more like clusterers?


## 提示信息

In my opinion, yes.

I wanted to compare K-Means, GMM and HDBSCAN and was very disappointed that GMM does not have a `fit_predict` method. The HDBSCAN examples use `fit_predict`, so I was expecting GMM to have the same interface.
I think we should add ``fit_predict`` at least. I wouldn't rename ``n_components``.
I would like to work on this!
@Eight1911 go for it. It is probably relatively simple but maybe not entirely trivial.
@Eight1911 Mind if I take a look at this?
@Eight1911 Do you mind if I jump in as well?

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/mixture/tests/test_bayesian_mixture.py::test_bayesian_mixture_fit_predict", "sklearn/mixture/tests/test_gaussian_mixture.py::test_gaussian_mixture_fit_predict"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
