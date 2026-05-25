# scikit-learn-scikit-learn-13497

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 26f690961a52946dd2f53bf0fdd4264b2ae5be90
**创建时间**: 2019-03-23T14:28:08Z

## 问题描述

Comparing string to array in _estimate_mi
In ``_estimate_mi`` there is ``discrete_features == 'auto'`` but discrete features can be an array of indices or a boolean mask.
This will error in future versions of numpy.
Also this means we never test this function with discrete features != 'auto', it seems?


## 提示信息

I'll take this
@hermidalc go for it :)
i'm not sure ,but i think user will change the default value if it seem to be array or boolean mask....bcz auto is  default value it is not fixed.
I haven't understood, @punkstar25 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/feature_selection/tests/test_mutual_info.py::test_mutual_info_options"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
