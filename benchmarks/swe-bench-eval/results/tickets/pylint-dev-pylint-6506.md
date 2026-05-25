# pylint-dev-pylint-6506

**来源**: SWE-bench Lite
**仓库**: pylint-dev/pylint
**Base Commit**: 0a4204fd7555cfedd43f43017c94d24ef48244a5
**创建时间**: 2022-05-05T13:01:41Z

## 问题描述

Traceback printed for unrecognized option
### Bug description

A traceback is printed when an unrecognized option is passed to pylint.

### Configuration

_No response_

### Command used

```shell
pylint -Q
```


### Pylint output

```shell
************* Module Command line
Command line:1:0: E0015: Unrecognized option found: Q (unrecognized-option)
Traceback (most recent call last):
  File "/Users/markbyrne/venv310/bin/pylint", line 33, in <module>
    sys.exit(load_entry_point('pylint', 'console_scripts', 'pylint')())
  File "/Users/markbyrne/programming/pylint/pylint/__init__.py", line 24, in run_pylint
    PylintRun(argv or sys.argv[1:])
  File "/Users/markbyrne/programming/pylint/pylint/lint/run.py", line 135, in __init__
    args = _config_initialization(
  File "/Users/markbyrne/programming/pylint/pylint/config/config_initialization.py", line 85, in _config_initialization
    raise _UnrecognizedOptionError(options=unrecognized_options)
pylint.config.exceptions._UnrecognizedOptionError
```


### Expected behavior

The top part of the current output is handy:
`Command line:1:0: E0015: Unrecognized option found: Q (unrecognized-option)`

The traceback I don't think is expected & not user-friendly.
A usage tip, for example:
```python
mypy -Q
usage: mypy [-h] [-v] [-V] [more options; see below]
            [-m MODULE] [-p PACKAGE] [-c PROGRAM_TEXT] [files ...]
mypy: error: unrecognized arguments: -Q
```

### Pylint version

```shell
pylint 2.14.0-dev0
astroid 2.11.3
Python 3.10.0b2 (v3.10.0b2:317314165a, May 31 2021, 10:02:22) [Clang 12.0.5 (clang-1205.0.22.9)]
```


### OS / Environment

_No response_

### Additional dependencies

_No response_


## 提示信息

@Pierre-Sassoulas Agreed that this is a blocker for `2.14` but not necessarily for the beta. This is just a "nice-to-have".

Thanks @mbyrnepr2 for reporting though!
👍 the blocker are for the final release only. We could add a 'beta-blocker' label, that would be very humorous !

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/config/test_config.py::test_unknown_option_name", "tests/config/test_config.py::test_unknown_short_option_name"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
