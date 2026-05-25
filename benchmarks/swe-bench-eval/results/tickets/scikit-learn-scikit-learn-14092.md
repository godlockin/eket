# scikit-learn-scikit-learn-14092

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: df7dd8391148a873d157328a4f0328528a0c4ed9
**创建时间**: 2019-06-14T14:16:17Z

## 问题描述

NCA fails in GridSearch due to too strict parameter checks
NCA checks its parameters to have a specific type, which can easily fail in a GridSearch due to how param grid is made.

Here is an example:
```python
import numpy as np

from sklearn.pipeline import Pipeline
from sklearn.model_selection import GridSearchCV
from sklearn.neighbors import NeighborhoodComponentsAnalysis
from sklearn.neighbors import KNeighborsClassifier

X = np.random.random_sample((100, 10))
y = np.random.randint(2, size=100)

nca = NeighborhoodComponentsAnalysis()
knn = KNeighborsClassifier()

pipe = Pipeline([('nca', nca),
                 ('knn', knn)])
                
params = {'nca__tol': [0.1, 0.5, 1],
          'nca__n_components': np.arange(1, 10)}
          
gs = GridSearchCV(estimator=pipe, param_grid=params, error_score='raise')
gs.fit(X,y)
```

The issue is that for `tol`: 1 is not a float, and for  `n_components`: np.int64 is not int

Before proposing a fix for this specific situation, I'd like to have your general opinion about parameter checking.  
I like this idea of common parameter checking tool introduced with the NCA PR. What do you think about extending it across the code-base (or at least for new or recent estimators) ?

Currently parameter checking is not always done or often partially done, and is quite redundant. For instance, here is the input validation of lda:
```python
def _check_params(self):
        """Check model parameters."""
        if self.n_components <= 0:
            raise ValueError("Invalid 'n_components' parameter: %r"
                             % self.n_components)

        if self.total_samples <= 0:
            raise ValueError("Invalid 'total_samples' parameter: %r"
                             % self.total_samples)

        if self.learning_offset < 0:
            raise ValueError("Invalid 'learning_offset' parameter: %r"
                             % self.learning_offset)

        if self.learning_method not in ("batch", "online"):
            raise ValueError("Invalid 'learning_method' parameter: %r"
                             % self.learning_method)
```
most params aren't checked and for those who are there's a lot of duplicated code.

A propose to be upgrade the new tool to be able to check open/closed intervals (currently only closed) and list membership.

The api would be something like that:
```
check_param(param, name, valid_options)
```
where valid_options would be a dict of `type: constraint`. e.g for the `beta_loss` param of `NMF`, it can be either a float or a string in a list, which would give
```
valid_options = {numbers.Real: None,  # None for no constraint
                 str: ['frobenius', 'kullback-leibler', 'itakura-saito']}
```
Sometimes a parameter can only be positive or within a given interval, e.g. `l1_ratio` of `LogisticRegression` must be between 0 and 1, which would give
```
valid_options = {numbers.Real: Interval(0, 1, closed='both')}
```
positivity of e.g. `max_iter` would be `numbers.Integral: Interval(left=1)`.


## 提示信息

I have developed a framework, experimenting with parameter verification: https://github.com/thomasjpfan/skconfig (Don't expect the API to be stable)

Your idea of using a simple dict for union types is really nice!

Edit: I am currently trying out another idea. I'll update this issue when it becomes something presentable.
If I understood correctly your package is designed for a sklearn user, who has to implement its validator for each estimator, or did I get it wrong ?
I think we want to keep the param validation inside the estimators.

> Edit: I am currently trying out another idea. I'll update this issue when it becomes something presentable.

maybe you can pitch me and if you want I can give a hand :)
I would have loved to using the typing system to get this to work:

```py
def __init__(
    self,
    C: Annotated[float, Range('[0, Inf)')],
    ...)
```

but that would have to wait for [PEP 593](https://www.python.org/dev/peps/pep-0593/). In the end, I would want the validator to be a part of sklearn estimators. Using typing (as above) is a natural choice, since it keeps the parameter and its constraint physically close to each other.

If we can't use typing, these constraints can be place in a `_validate_parameters` method. This will be called at the beginning of fit to do parameter validation. Estimators that need more validation will overwrite the method, call `super()._validate_parameters` and do more validation. For example, `LogesticRegression`'s `penalty='l2'` only works for specify solvers. `skconfig` defines a framework for handling these situations, but I think it would be too hard to learn.
>  Using typing (as above) is a natural choice

I agree, and to go further it would be really nice to use them for the coverage to check that every possible type of a parameter is covered by tests

> If we can't use typing, these constraints can be place in a _validate_parameters method. 

This is already the case for a subset of the estimators (`_check_params` or `_validate_input`). But it's often incomplete.

> skconfig defines a framework for handling these situations, but I think it would be too hard to learn.

Your framework does way more than what I proposed. Maybe we can do this in 2 steps:
First, a simple single param check which only checks its type and if its value is acceptable in general (e.g. positive for a number of clusters). This will raise a standard error message
Then a more advanced check, depending on the data (e.g. number of clusters should be < n_samples) or consistency across params (e.g. solver + penalty). These checks require more elaborate error messages.

wdyt ?

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/neighbors/tests/test_nca.py::test_parameters_valid_types[n_components-value0]", "sklearn/neighbors/tests/test_nca.py::test_parameters_valid_types[max_iter-value1]", "sklearn/neighbors/tests/test_nca.py::test_parameters_valid_types[tol-value2]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
