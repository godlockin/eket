# matplotlib-matplotlib-24265

**来源**: SWE-bench Lite
**仓库**: matplotlib/matplotlib
**Base Commit**: e148998d9bed9d1b53a91587ad48f9bb43c7737f
**创建时间**: 2022-10-25T02:03:19Z

## 问题描述

[Bug]: Setting matplotlib.pyplot.style.library['seaborn-colorblind'] result in key error on matplotlib v3.6.1
### Bug summary

I have code that executes:
```
import matplotlib.pyplot as plt
the_rc = plt.style.library["seaborn-colorblind"]
```

Using version 3.4.3 of matplotlib, this works fine. I recently installed my code on a machine with matplotlib version 3.6.1 and upon importing my code, this generated a key error for line `the_rc = plt.style.library["seaborn-colorblind"]` saying "seaborn-colorblind" was a bad key.

### Code for reproduction

```python
import matplotlib.pyplot as plt
the_rc = plt.style.library["seaborn-colorblind"]
```


### Actual outcome

Traceback (most recent call last):
KeyError: 'seaborn-colorblind'

### Expected outcome

seaborn-colorblind should be set as the matplotlib library style and I should be able to continue plotting with that style.

### Additional information

- Bug occurs with matplotlib version 3.6.1
- Bug does not occur with matplotlib version 3.4.3
- Tested on MacOSX and Ubuntu (same behavior on both)

### Operating system

OS/X

### Matplotlib Version

3.6.1

### Matplotlib Backend

MacOSX

### Python version

3.9.7

### Jupyter version

_No response_

### Installation

pip


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["lib/matplotlib/tests/test_style.py::test_deprecated_seaborn_styles"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
