# scikit-learn-scikit-learn-25638

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 6adb209acd63825affc884abcd85381f148fb1b0
**创建时间**: 2023-02-17T22:17:50Z

## 问题描述

Support nullable pandas dtypes in `unique_labels`
### Describe the workflow you want to enable

I would like to be able to pass the nullable pandas dtypes ("Int64", "Float64", "boolean") into sklearn's `unique_labels` function. Because the dtypes become `object` dtype when converted to numpy arrays we get `ValueError: Mix type of y not allowed, got types {'binary', 'unknown'}`:

Repro with sklearn 1.2.1
```py 
    import pandas as pd
    import pytest
    from sklearn.utils.multiclass import unique_labels
    
    for dtype in ["Int64", "Float64", "boolean"]:
        y_true = pd.Series([1, 0, 0, 1, 0, 1, 1, 0, 1], dtype=dtype)
        y_predicted = pd.Series([0, 0, 1, 1, 0, 1, 1, 1, 1], dtype="int64")

        with pytest.raises(ValueError, match="Mix type of y not allowed, got types"):
            unique_labels(y_true, y_predicted)
```

### Describe your proposed solution

We should get the same behavior as when `int64`, `float64`, and `bool` dtypes are used, which is no error:  

```python
    import pandas as pd
    from sklearn.utils.multiclass import unique_labels
    
    for dtype in ["int64", "float64", "bool"]:
        y_true = pd.Series([1, 0, 0, 1, 0, 1, 1, 0, 1], dtype=dtype)
        y_predicted = pd.Series([0, 0, 1, 1, 0, 1, 1, 1, 1], dtype="int64")

        unique_labels(y_true, y_predicted)
```

### Describe alternatives you've considered, if relevant

Our current workaround is to convert the data to numpy arrays with the corresponding dtype that works prior to passing it into `unique_labels`.

### Additional context

_No response_


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/metrics/tests/test_classification.py::test_confusion_matrix_pandas_nullable[Int64]", "sklearn/metrics/tests/test_classification.py::test_confusion_matrix_pandas_nullable[Float64]", "sklearn/metrics/tests/test_classification.py::test_confusion_matrix_pandas_nullable[boolean]", "sklearn/preprocessing/tests/test_label.py::test_label_binarizer_pandas_nullable[Int64]", "sklearn/preprocessing/tests/test_label.py::test_label_binarizer_pandas_nullable[Float64]", "sklearn/preprocessing/tests/test_label.py::test_label_binarizer_pandas_nullable[boolean]", "sklearn/utils/tests/test_multiclass.py::test_type_of_target_pandas_nullable", "sklearn/utils/tests/test_multiclass.py::test_unique_labels_pandas_nullable[Int64]", "sklearn/utils/tests/test_multiclass.py::test_unique_labels_pandas_nullable[Float64]", "sklearn/utils/tests/test_multiclass.py::test_unique_labels_pandas_nullable[boolean]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
