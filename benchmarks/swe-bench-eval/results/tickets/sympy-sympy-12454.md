# sympy-sympy-12454

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: d3fcdb72bfcbb560eb45264ac1c03f359436edef
**创建时间**: 2017-03-29T20:40:49Z

## 问题描述

is_upper() raises IndexError for tall matrices
The function Matrix.is_upper raises an IndexError for a 4x2 matrix of zeros.
```
>>> sympy.zeros(4,2).is_upper
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "sympy/matrices/matrices.py", line 1112, in is_upper
    for i in range(1, self.rows)
  File "sympy/matrices/matrices.py", line 1113, in <genexpr>
    for j in range(i))
  File "sympy/matrices/dense.py", line 119, in __getitem__
    return self.extract(i, j)
  File "sympy/matrices/matrices.py", line 352, in extract
    colsList = [a2idx(k, self.cols) for k in colsList]
  File "sympy/matrices/matrices.py", line 5261, in a2idx
    raise IndexError("Index out of range: a[%s]" % (j,))
IndexError: Index out of range: a[2]
```
The code for is_upper() is
```
        return all(self[i, j].is_zero
                   for i in range(1, self.rows)
                   for j in range(i))
```
For a 4x2 matrix, is_upper iterates over the indices:
```
>>> A = sympy.zeros(4, 2)
>>> print tuple([i, j] for i in range(1, A.rows) for j in range(i))
([1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2])
```
The attempt to index the (3,2) entry appears to be the source of the error. 


## 提示信息

@twhunt , I would like to work on this issue

I don't have any special Sympy privileges, but feel free to work on it.
It's probably worth checking if is_lower() has a similar issue.


On Mar 29, 2017 12:02 PM, "Mohit Chandra" <notifications@github.com> wrote:

@twhunt <https://github.com/twhunt> , I would like to work on this issue

—
You are receiving this because you were mentioned.
Reply to this email directly, view it on GitHub
<https://github.com/sympy/sympy/issues/12452#issuecomment-290192503>, or mute
the thread
<https://github.com/notifications/unsubscribe-auth/AEi2SgHD7pnTn2d_B6spVitWbflkNGFmks5rqqrfgaJpZM4MtWZk>
.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_is_upper", "test_hessenberg"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
