# matplotlib-matplotlib-18869

**来源**: SWE-bench Lite
**仓库**: matplotlib/matplotlib
**Base Commit**: b7d05919865fc0c37a0164cf467d5d5513bd0ede
**创建时间**: 2020-11-01T23:18:42Z

## 问题描述

Add easily comparable version info to toplevel
<!--
Welcome! Thanks for thinking of a way to improve Matplotlib.


Before creating a new feature request please search the issues for relevant feature requests.
-->

### Problem

Currently matplotlib only exposes `__version__`.  For quick version checks, exposing either a `version_info` tuple (which can be compared with other tuples) or a `LooseVersion` instance (which can be properly compared with other strings) would be a small usability improvement.

(In practice I guess boring string comparisons will work just fine until we hit mpl 3.10 or 4.10 which is unlikely to happen soon, but that feels quite dirty :))
<!--
Provide a clear and concise description of the problem this feature will solve. 

For example:
* I'm always frustrated when [...] because [...]
* I would like it if [...] happened when I [...] because [...]
* Here is a sample image of what I am asking for [...]
-->

### Proposed Solution

I guess I slightly prefer `LooseVersion`, but exposing just a `version_info` tuple is much more common in other packages (and perhaps simpler to understand).  The hardest(?) part is probably just bikeshedding this point :-)
<!-- Provide a clear and concise description of a way to accomplish what you want. For example:

* Add an option so that when [...]  [...] will happen
 -->

### Additional context and prior art

`version_info` is a pretty common thing (citation needed).
<!-- Add any other context or screenshots about the feature request here. You can also include links to examples of other programs that have something similar to your request. For example:

* Another project [...] solved this by [...]
-->



## 提示信息

It seems that `__version_info__` is the way to go.

### Prior art
- There's no official specification for version tuples. [PEP 396 - Module Version Numbers](https://www.python.org/dev/peps/pep-0396/) only defines the string `__version__`.

- Many projects don't bother with version tuples.

- When they do, `__version_info__` seems to be a common thing:
  - [Stackoverflow discussion](https://stackoverflow.com/a/466694)
  - [PySide2](https://doc.qt.io/qtforpython-5.12/pysideversion.html#printing-project-and-qt-version) uses it.

- Python itself has the string [sys.version](https://docs.python.org/3/library/sys.html#sys.version) and the (named)tuple [sys.version_info](https://docs.python.org/3/library/sys.html#sys.version_info). In analogy to that `__version_info__` next to `__version__` makes sense for packages.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["lib/matplotlib/tests/test_matplotlib.py::test_parse_to_version_info[3.5.0-version_tuple0]", "lib/matplotlib/tests/test_matplotlib.py::test_parse_to_version_info[3.5.0rc2-version_tuple1]", "lib/matplotlib/tests/test_matplotlib.py::test_parse_to_version_info[3.5.0.dev820+g6768ef8c4c-version_tuple2]", "lib/matplotlib/tests/test_matplotlib.py::test_parse_to_version_info[3.5.0.post820+g6768ef8c4c-version_tuple3]"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
