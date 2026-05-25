# pydata-xarray-3364

**来源**: SWE-bench Lite
**仓库**: pydata/xarray
**Base Commit**: 863e49066ca4d61c9adfe62aca3bf21b90e1af8c
**创建时间**: 2019-10-01T21:15:54Z

## 问题描述

Ignore missing variables when concatenating datasets?
Several users (@raj-kesavan, @richardotis, now myself) have wondered about how to concatenate xray Datasets with different variables.

With the current `xray.concat`, you need to awkwardly create dummy variables filled with `NaN` in datasets that don't have them (or drop mismatched variables entirely). Neither of these are great options -- `concat` should have an option (the default?) to take care of this for the user.

This would also be more consistent with `pd.concat`, which takes a more relaxed approach to matching dataframes with different variables (it does an outer join).



## 提示信息

Closing as stale, please reopen if still relevant

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["xarray/tests/test_combine.py::TestAutoCombineOldAPI::test_auto_combine_with_new_variables", "xarray/tests/test_concat.py::TestConcatDataset::test_concat_merge_variables_present_in_some_datasets"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
