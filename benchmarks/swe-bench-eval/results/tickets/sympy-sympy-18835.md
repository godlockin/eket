# sympy-sympy-18835

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: 516fa83e69caf1e68306cfc912a13f36c434d51c
**创建时间**: 2020-03-11T23:39:56Z

## 问题描述

uniq modifies list argument
When you iterate over a dictionary or set and try to modify it while doing so you get an error from Python:
```python
>>> multiset('THISTLE')
{'T': 2, 'H': 1, 'I': 1, 'S': 1, 'L': 1, 'E': 1}
>>> for i in _:
...   _.pop(i)
...
2
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
RuntimeError: dictionary changed size during iteration
```
It would be good to do the same thing from within `uniq` because the output will silently be wrong if you modify a passed list:
```python
>>> f=list('THISTLE')
>>> for i in uniq(f):
...   f.remove(i)
...   i
...
'T'
'I'
'L'
```
I think this would entail recording the size at the start and then checking the size and raising a similar RuntimeError if the size changes.


## 提示信息

I'm not sure there is a need to handle this case. Users should know not to mutate something while iterating over it.
With regards to the above discussion, I believe it would indeed be helpful if modifying a passed list to ``uniq`` raises an error while iterating over it, because it does not immediately follow that ``uniq(f)`` would get updated if ``f`` gets updated, as the user might think something like ``uniq`` stores a copy of ``f``, computes the list of unique elements in it, and returns that list. The user may not know, that yield is being used internally instead of return.

I have a doubt regarding the implementation of ``uniq``:
[https://github.com/sympy/sympy/blob/5bfe93281866f0841b36a429f4090c04a0e81d21/sympy/utilities/iterables.py#L2109-L2124](url)
Here, if the first argument, ``seq`` in ``uniq`` does not have a ``__getitem__`` method, and a TypeError is raised somehow, then we call the ``uniq`` function again on ``seq`` with the updated ``result``, won't that yield ALL of the elements of ``seq`` again, even those which have already been _yielded_? 
So mainly what I wanted to point out was, that if we're assuming that the given ``seq`` is iterable (which we must, since we pass it on to the ``enumerate`` function), by definition, ``seq`` must have either ``__getitem__`` or ``__iter__``, both of which can be used to iterate over the **remaining elements** if the TypeError is raised. 
Also, I'm unable to understand the role of ``result`` in all of this, kindly explain.

So should I work on the error handling bit in this function?

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_uniq"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
