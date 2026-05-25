# sympy-sympy-23262

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: fdc707f73a65a429935c01532cd3970d3355eab6
**创建时间**: 2022-03-21T07:17:35Z

## 问题描述

Python code printer not respecting tuple with one element
Hi,

Thanks for the recent updates in SymPy! I'm trying to update my code to use SymPy 1.10 but ran into an issue with the Python code printer. MWE:


```python
import inspect
from sympy import lambdify

inspect.getsource(lambdify([], tuple([1])))
```
SymPy 1.9 and under outputs:
```
'def _lambdifygenerated():\n    return (1,)\n'
```

But SymPy 1.10 gives

```
'def _lambdifygenerated():\n    return (1)\n'
```
Note the missing comma after `1` that causes an integer to be returned instead of a tuple. 

For tuples with two or more elements, the generated code is correct:
```python
inspect.getsource(lambdify([], tuple([1, 2])))
```
In SymPy  1.10 and under, outputs:

```
'def _lambdifygenerated():\n    return (1, 2)\n'
```
This result is expected.

Not sure if this is a regression. As this breaks my program which assumes the return type to always be a tuple, could you suggest a workaround from the code generation side? Thank you. 


## 提示信息

Bisected to 6ccd2b07ded5074941bb80b5967d60fa1593007a from #21993.

CC @bjodah 
As a work around for now, you can use the `Tuple` object from sympy. Note that it is constructed slightly differently from a python `tuple`, rather than giving a `list`, you give it multiple input arguments (or you can put a `*` in front of your list):
```python
>>> inspect.getsource(lambdify([], Tuple(*[1])))
def _lambdifygenerated():\n    return (1,)\n
>>> inspect.getsource(lambdify([], Tuple(1)))
def _lambdifygenerated():\n    return (1,)\n
```
Of course the problem should also be fixed. `lambdify` is in a bit of an awkward spot, it supports a lot of different input and output formats that make it practically impossible to keep any functionality that is not explicitly tested for whenever you make a change.



> As a work around for now, you can use the `Tuple` object from sympy. Note that it is constructed slightly differently from a python `tuple`, rather than giving a `list`, you give it multiple input arguments (or you can put a `*` in front of your list):

Thank you! This is tested to be working in SymPy 1.6-1.10. Consider this issue addressed for now. 

`lambdify` (or generally, the code generation) is an extremely useful tool. Are you aware of any roadmap or discussions on the refactoring of `lambdify` (or codegen)? I would like to contribute to it. 

I want to put out a 1.10.1 bugfix release. Should this be fixed?

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_issue_14941"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
