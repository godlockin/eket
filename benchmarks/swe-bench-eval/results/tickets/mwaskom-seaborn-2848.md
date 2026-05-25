# mwaskom-seaborn-2848

**来源**: SWE-bench Lite
**仓库**: mwaskom/seaborn
**Base Commit**: 94621cef29f80282436d73e8d2c0aa76dab81273
**创建时间**: 2022-06-11T18:21:32Z

## 问题描述

pairplot fails with hue_order not containing all hue values in seaborn 0.11.1
In seaborn < 0.11, one could plot only a subset of the values in the hue column, by passing a hue_order list containing only the desired values. Points with hue values not in the list were simply not plotted.
```python
iris = sns.load_dataset("iris")`
# The hue column contains three different species; here we want to plot two
sns.pairplot(iris, hue="species", hue_order=["setosa", "versicolor"])
```

This no longer works in 0.11.1. Passing a hue_order list that does not contain some of the values in the hue column raises a long, ugly error traceback. The first exception arises in seaborn/_core.py:
```
TypeError: ufunc 'isnan' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''
```
seaborn version: 0.11.1
matplotlib version: 3.3.2
matplotlib backends: MacOSX, Agg or jupyter notebook inline.

## 提示信息

The following workarounds seem to work:
```
g.map(sns.scatterplot, hue=iris["species"], hue_order=iris["species"].unique())
```
or
```
g.map(lambda x, y, **kwargs: sns.scatterplot(x=x, y=y, hue=iris["species"]))
```
> ```
> g.map(sns.scatterplot, hue=iris["species"], hue_order=iris["species"].unique())
> ```

The workaround fixes the problem for me.
Thank you very much!

@mwaskom Should I close the Issue or leave it open until the bug is fixed?
That's a good workaround, but it's still a bug. The problem is that `PairGrid` now lets `hue` at the grid-level delegate to the axes-level functions if they have `hue` in their signature. But it's not properly handling the case where `hue` is *not* set for the grid, but *is* specified for one mapped function. @jhncls's workaround suggests the fix.

An easier workaround would have been to set `PairGrid(..., hue="species")` and then pass `.map(..., hue=None)` where you don't want to separate by species. But `regplot` is the one axis-level function that does not yet handle hue-mapping internally, so it doesn't work for this specific case. It would have if you wanted a single bivariate density over hue-mapped scatterplot points (i.e. [this example](http://seaborn.pydata.org/introduction.html#classes-and-functions-for-making-complex-graphics) or something similar.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_relational.py::TestScatterPlotter::test_hue_order"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
