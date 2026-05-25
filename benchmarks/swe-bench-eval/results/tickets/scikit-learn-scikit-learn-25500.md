# scikit-learn-scikit-learn-25500

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: 4db04923a754b6a2defa1b172f55d492b85d165e
**创建时间**: 2023-01-27T19:49:28Z

## 问题描述

CalibratedClassifierCV doesn't work with `set_config(transform_output="pandas")`
### Describe the bug

CalibratedClassifierCV with isotonic regression doesn't work when we previously set `set_config(transform_output="pandas")`.
The IsotonicRegression seems to return a dataframe, which is a problem for `_CalibratedClassifier`  in `predict_proba` where it tries to put the dataframe in a numpy array row `proba[:, class_idx] = calibrator.predict(this_pred)`.

### Steps/Code to Reproduce

```python
import numpy as np
from sklearn import set_config
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import SGDClassifier

set_config(transform_output="pandas")
model = CalibratedClassifierCV(SGDClassifier(), method='isotonic')
model.fit(np.arange(90).reshape(30, -1), np.arange(30) % 2)
model.predict(np.arange(90).reshape(30, -1))
```

### Expected Results

It should not crash.

### Actual Results

```
../core/model_trainer.py:306: in train_model
    cv_predictions = cross_val_predict(pipeline,
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/model_selection/_validation.py:968: in cross_val_predict
    predictions = parallel(
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/parallel.py:1085: in __call__
    if self.dispatch_one_batch(iterator):
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/parallel.py:901: in dispatch_one_batch
    self._dispatch(tasks)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/parallel.py:819: in _dispatch
    job = self._backend.apply_async(batch, callback=cb)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/_parallel_backends.py:208: in apply_async
    result = ImmediateResult(func)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/_parallel_backends.py:597: in __init__
    self.results = batch()
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/parallel.py:288: in __call__
    return [func(*args, **kwargs)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/joblib/parallel.py:288: in <listcomp>
    return [func(*args, **kwargs)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/utils/fixes.py:117: in __call__
    return self.function(*args, **kwargs)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/model_selection/_validation.py:1052: in _fit_and_predict
    predictions = func(X_test)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/pipeline.py:548: in predict_proba
    return self.steps[-1][1].predict_proba(Xt, **predict_proba_params)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/calibration.py:477: in predict_proba
    proba = calibrated_classifier.predict_proba(X)
../../../../.anaconda3/envs/strategy-training/lib/python3.9/site-packages/sklearn/calibration.py:764: in predict_proba
    proba[:, class_idx] = calibrator.predict(this_pred)
E   ValueError: could not broadcast input array from shape (20,1) into shape (20,)
```

### Versions

```shell
System:
    python: 3.9.15 (main, Nov 24 2022, 14:31:59)  [GCC 11.2.0]
executable: /home/philippe/.anaconda3/envs/strategy-training/bin/python
   machine: Linux-5.15.0-57-generic-x86_64-with-glibc2.31

Python dependencies:
      sklearn: 1.2.0
          pip: 22.2.2
   setuptools: 62.3.2
        numpy: 1.23.5
        scipy: 1.9.3
       Cython: None
       pandas: 1.4.1
   matplotlib: 3.6.3
       joblib: 1.2.0
threadpoolctl: 3.1.0

Built with OpenMP: True

threadpoolctl info:
       user_api: openmp
   internal_api: openmp
         prefix: libgomp
       filepath: /home/philippe/.anaconda3/envs/strategy-training/lib/python3.9/site-packages/scikit_learn.libs/libgomp-a34b3233.so.1.0.0
        version: None
    num_threads: 12

       user_api: blas
   internal_api: openblas
         prefix: libopenblas
       filepath: /home/philippe/.anaconda3/envs/strategy-training/lib/python3.9/site-packages/numpy.libs/libopenblas64_p-r0-742d56dc.3.20.so
        version: 0.3.20
threading_layer: pthreads
   architecture: Haswell
    num_threads: 12

       user_api: blas
   internal_api: openblas
         prefix: libopenblas
       filepath: /home/philippe/.anaconda3/envs/strategy-training/lib/python3.9/site-packages/scipy.libs/libopenblasp-r0-41284840.3.18.so
        version: 0.3.18
threading_layer: pthreads
   architecture: Haswell
    num_threads: 12
```



## 提示信息

I can reproduce it. We need to investigate but I would expect the inner estimator not being able to handle some dataframe because we expected NumPy arrays before.
This could be a bit like https://github.com/scikit-learn/scikit-learn/pull/25370 where things get confused when pandas output is configured. I think the solution is different (TSNE's PCA is truely "internal only") but it seems like there might be something more general to investigate/think about related to pandas output and nested estimators.
There is something quite smelly regarding the interaction between `IsotonicRegression` and pandas output:

<img width="1079" alt="image" src="https://user-images.githubusercontent.com/7454015/215147695-8aa08b83-705b-47a4-ab7c-43acb222098f.png">

It seems that we output a pandas Series when calling `predict` which is something that we don't do for any other estimator. `IsotonicRegression` is already quite special since it accepts a single feature. I need to investigate more to understand why we wrap the output of the `predict` method.
OK the reason is that `IsotonicRegression().predict(X)` call `IsotonicRegression().transform(X)` ;)
I don't know if we should have:

```python
def predict(self, T):
    with config_context(transform_output="default"):
        return self.transform(T)
```

or

```python
def predict(self, T):
    return np.array(self.transform(T), copy=False).squeeze()
```
Another solution would be to have a private `_transform` function called by both `transform` and `predict`. In this way, the `predict` call will not call the wrapper that is around the public `transform` method. I think this is even cleaner than the previous code.
/take

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/tests/test_isotonic.py::test_isotonic_regression_output_predict"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
