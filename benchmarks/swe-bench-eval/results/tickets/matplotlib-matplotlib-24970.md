# matplotlib-matplotlib-24970

**来源**: SWE-bench Lite
**仓库**: matplotlib/matplotlib
**Base Commit**: a3011dfd1aaa2487cce8aa7369475533133ef777
**创建时间**: 2023-01-13T14:23:39Z

## 问题描述

[Bug]: NumPy 1.24 deprecation warnings
### Bug summary

Starting NumPy 1.24 I observe several deprecation warnings.


### Code for reproduction

```python
import matplotlib.pyplot as plt
import numpy as np

plt.get_cmap()(np.empty((0, ), dtype=np.uint8))
```


### Actual outcome

```
/usr/lib/python3.10/site-packages/matplotlib/colors.py:730: DeprecationWarning: NumPy will stop allowing conversion of out-of-bound Python integers to integer arrays.  The conversion of 257 to uint8 will fail in the future.
For the old behavior, usually:
    np.array(value).astype(dtype)`
will give the desired result (the cast overflows).
  xa[xa > self.N - 1] = self._i_over
/usr/lib/python3.10/site-packages/matplotlib/colors.py:731: DeprecationWarning: NumPy will stop allowing conversion of out-of-bound Python integers to integer arrays.  The conversion of 256 to uint8 will fail in the future.
For the old behavior, usually:
    np.array(value).astype(dtype)`
will give the desired result (the cast overflows).
  xa[xa < 0] = self._i_under
/usr/lib/python3.10/site-packages/matplotlib/colors.py:732: DeprecationWarning: NumPy will stop allowing conversion of out-of-bound Python integers to integer arrays.  The conversion of 258 to uint8 will fail in the future.
For the old behavior, usually:
    np.array(value).astype(dtype)`
will give the desired result (the cast overflows).
  xa[mask_bad] = self._i_bad
```

### Expected outcome

No warnings.

### Additional information

_No response_

### Operating system

ArchLinux

### Matplotlib Version

3.6.2

### Matplotlib Backend

QtAgg

### Python version

Python 3.10.9

### Jupyter version

_No response_

### Installation

Linux package manager


## 提示信息

Thanks for the report! Unfortunately I can't reproduce this. What version of numpy are you using when the warning appears?
Sorry, forgot to mention that you need to enable the warnings during normal execution, e.g., `python -W always <file>.py`. In my case, the warnings are issued during `pytest` run which seems to activate these warnings by default.

As for the NumPy version, I'm running
```console
$ python -c 'import numpy; print(numpy.__version__)'
1.24.0
```
Thanks, I can now reproduce 😄 
The problem is that there are three more values, that are by default out of range in this case, to note specific cases:
https://github.com/matplotlib/matplotlib/blob/8d2329ad89120410d7ef04faddba2c51db743b06/lib/matplotlib/colors.py#L673-L675
(N = 256 by default)

These are then assigned to out-of-range and masked/bad values here:
https://github.com/matplotlib/matplotlib/blob/8d2329ad89120410d7ef04faddba2c51db743b06/lib/matplotlib/colors.py#L730-L732
which now raises a deprecation warning.

I think that one way forward would be to check the type of `xa` for int/uint and in that case take modulo the maximum value for `self._i_over` etc. This is basically what happens now anyway, but we need to do it explicitly rather than relying on numpy doing it. (I cannot really see how this makes sense from a color perspective, but we will at least keep the current behavior.)
I think this is exposing a real bug that we need to promote the input data to be bigger than uint8.  What we are doing here is buildin a lookup up table, the first N entries are for for values into the actually color map and then the next 3 entries are the special cases for over/under/bad so `xa` needs to be big enough to hold `self.N + 2` as values.
I don't know if this is a bigger bug or not, but I would like us to have fixed any deprecation warnings from dependencies before 3.7 is out (or if necessary a quick 3.7.1.)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["lib/matplotlib/tests/test_colors.py::test_index_dtype[uint8]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
