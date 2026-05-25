# matplotlib-matplotlib-23987

**来源**: SWE-bench Lite
**仓库**: matplotlib/matplotlib
**Base Commit**: e98d8d085e8f53ec0467422b326f7738a2dd695e
**创建时间**: 2022-09-22T21:39:02Z

## 问题描述

[Bug]: Constrained layout UserWarning even when False
### Bug summary

When using layout settings such as `plt.subplots_adjust` or `bbox_inches='tight`, a UserWarning is produced due to incompatibility with constrained_layout, even if constrained_layout = False. This was not the case in previous versions.

### Code for reproduction

```python
import matplotlib.pyplot as plt
import numpy as np
a = np.linspace(0,2*np.pi,100)
b = np.sin(a)
c = np.cos(a)
fig,ax = plt.subplots(1,2,figsize=(8,2),constrained_layout=False)
ax[0].plot(a,b)
ax[1].plot(a,c)
plt.subplots_adjust(wspace=0)
```


### Actual outcome

The plot works fine but the warning is generated

`/var/folders/ss/pfgdfm2x7_s4cyw2v0b_t7q80000gn/T/ipykernel_76923/4170965423.py:7: UserWarning: This figure was using a layout engine that is incompatible with subplots_adjust and/or tight_layout; not calling subplots_adjust.
  plt.subplots_adjust(wspace=0)`

### Expected outcome

no warning

### Additional information

Warning disappears when constrained_layout=False is removed

### Operating system

OS/X

### Matplotlib Version

3.6.0

### Matplotlib Backend

_No response_

### Python version

_No response_

### Jupyter version

_No response_

### Installation

conda


## 提示信息

Yup, that is indeed a bug https://github.com/matplotlib/matplotlib/blob/e98d8d085e8f53ec0467422b326f7738a2dd695e/lib/matplotlib/figure.py#L2428-L2431 

PR on the way.
@VanWieren Did you mean to close this?  We normally keep bugs open until the PR to fix it is actually merged.
> @VanWieren Did you mean to close this? We normally keep bugs open until the PR to fix it is actually merged.

oh oops, I did not know that. Will reopen

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["lib/matplotlib/tests/test_constrainedlayout.py::test_set_constrained_layout[False-False]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
