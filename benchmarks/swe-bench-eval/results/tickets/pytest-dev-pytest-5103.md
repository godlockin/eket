# pytest-dev-pytest-5103

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 10ca84ffc56c2dd2d9dc4bd71b7b898e083500cd
**创建时间**: 2019-04-13T16:17:45Z

## 问题描述

Unroll the iterable for all/any calls to get better reports
Sometime I need to assert some predicate on all of an iterable, and for that the builtin functions `all`/`any` are great - but the failure messages aren't useful at all!
For example - the same test written in three ways:

- A generator expression
```sh                                                                                                                                                                                                                         
    def test_all_even():
        even_stevens = list(range(1,100,2))
>       assert all(is_even(number) for number in even_stevens)
E       assert False
E        +  where False = all(<generator object test_all_even.<locals>.<genexpr> at 0x101f82ed0>)
```
- A list comprehension
```sh
    def test_all_even():
        even_stevens = list(range(1,100,2))
>       assert all([is_even(number) for number in even_stevens])
E       assert False
E        +  where False = all([False, False, False, False, False, False, ...])
```
- A for loop
```sh
    def test_all_even():
        even_stevens = list(range(1,100,2))
        for number in even_stevens:
>           assert is_even(number)
E           assert False
E            +  where False = is_even(1)

test_all_any.py:7: AssertionError
```
The only one that gives a meaningful report is the for loop - but it's way more wordy, and `all` asserts don't translate to a for loop nicely (I'll have to write a `break` or a helper function - yuck)
I propose the assertion re-writer "unrolls" the iterator to the third form, and then uses the already existing reports.

- [x] Include a detailed description of the bug or suggestion
- [x] `pip list` of the virtual environment you are using
```
Package        Version
-------------- -------
atomicwrites   1.3.0  
attrs          19.1.0 
more-itertools 7.0.0  
pip            19.0.3 
pluggy         0.9.0  
py             1.8.0  
pytest         4.4.0  
setuptools     40.8.0 
six            1.12.0 
```
- [x] pytest and operating system versions
`platform darwin -- Python 3.7.3, pytest-4.4.0, py-1.8.0, pluggy-0.9.0`
- [x] Minimal example if possible



## 提示信息

Hello, I am new here and would be interested in working on this issue if that is possible.
@danielx123 
Sure!  But I don't think this is an easy issue, since it involved the assertion rewriting - but if you're familar with Python's AST and pytest's internals feel free to pick this up.
We also have a tag "easy" for issues that are probably easier for starting contributors: https://github.com/pytest-dev/pytest/issues?q=is%3Aopen+is%3Aissue+label%3A%22status%3A+easy%22
I was planning on starting a pr today, but probably won't be able to finish it until next week - @danielx123 maybe we could collaborate? 

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/test_assertrewrite.py::TestAssertionRewrite::test_unroll_expression"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
