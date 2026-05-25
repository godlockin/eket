# sympy-sympy-13471

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 3546ac7ed78e1780c1a76929864bb33330055740
**创建时间**: 2017-10-17T22:52:35Z

## 问题描述

Python 2->3 pickle fails with float-containing expressions
Dumping a pickled sympy expression containing a float in Python 2, then loading it in Python 3 generates an error.

Here is a minimum working example, verified with sympy git commit 3546ac7 (master at time of writing), Python 2.7 and Python 3.6:

```python
python2 -c 'import pickle; import sympy; x = sympy.symbols("x"); print pickle.dumps(x + 1.0, 2)' | python3 -c 'import pickle; import sys; print(pickle.loads(sys.stdin.buffer.read()))'
```

and the result:

```
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/Users/alex/git/VU/sympy/sympy/core/numbers.py", line 1045, in __new__
    num[1] = long(num[1], 16)
ValueError: invalid literal for int() with base 16: '1L'
```


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_Float_from_tuple"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
