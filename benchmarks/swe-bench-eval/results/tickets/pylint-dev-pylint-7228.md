# pylint-dev-pylint-7228

**来源**: SWE-bench Lite
**仓库**: pylint-dev/pylint
**Base Commit**: d597f252915ddcaaa15ccdfcb35670152cb83587
**创建时间**: 2022-07-25T17:19:11Z

## 问题描述

rxg include '\p{Han}' will throw error
### Bug description

config rxg in pylintrc with \p{Han} will throw err

### Configuration
.pylintrc:

```ini
function-rgx=[\p{Han}a-z_][\p{Han}a-z0-9_]{2,30}$
```

### Command used

```shell
pylint
```


### Pylint output

```shell
(venvtest) tsung-hande-MacBook-Pro:robot_is_comming tsung-han$ pylint
Traceback (most recent call last):
  File "/Users/tsung-han/PycharmProjects/robot_is_comming/venvtest/bin/pylint", line 8, in <module>
    sys.exit(run_pylint())
  File "/Users/tsung-han/PycharmProjects/robot_is_comming/venvtest/lib/python3.9/site-packages/pylint/__init__.py", line 25, in run_pylint
    PylintRun(argv or sys.argv[1:])
  File "/Users/tsung-han/PycharmProjects/robot_is_comming/venvtest/lib/python3.9/site-packages/pylint/lint/run.py", line 161, in __init__
    args = _config_initialization(
  File "/Users/tsung-han/PycharmProjects/robot_is_comming/venvtest/lib/python3.9/site-packages/pylint/config/config_initialization.py", line 57, in _config_initialization
    linter._parse_configuration_file(config_args)
  File "/Users/tsung-han/PycharmProjects/robot_is_comming/venvtest/lib/python3.9/site-packages/pylint/config/arguments_manager.py", line 244, in _parse_configuration_file
    self.config, parsed_args = self._arg_parser.parse_known_args(
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 1858, in parse_known_args
    namespace, args = self._parse_known_args(args, namespace)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 2067, in _parse_known_args
    start_index = consume_optional(start_index)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 2007, in consume_optional
    take_action(action, args, option_string)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 1919, in take_action
    argument_values = self._get_values(action, argument_strings)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 2450, in _get_values
    value = self._get_value(action, arg_string)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/argparse.py", line 2483, in _get_value
    result = type_func(arg_string)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/re.py", line 252, in compile
    return _compile(pattern, flags)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/re.py", line 304, in _compile
    p = sre_compile.compile(pattern, flags)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/sre_compile.py", line 788, in compile
    p = sre_parse.parse(p, flags)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/sre_parse.py", line 955, in parse
    p = _parse_sub(source, state, flags & SRE_FLAG_VERBOSE, 0)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/sre_parse.py", line 444, in _parse_sub
    itemsappend(_parse(source, state, verbose, nested + 1,
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/sre_parse.py", line 555, in _parse
    code1 = _class_escape(source, this)
  File "/usr/local/Cellar/python@3.9/3.9.13_1/Frameworks/Python.framework/Versions/3.9/lib/python3.9/sre_parse.py", line 350, in _class_escape
    raise source.error('bad escape %s' % escape, len(escape))
re.error: bad escape \p at position 1
```

### Expected behavior

not throw error

### Pylint version

```shell
pylint 2.14.4
astroid 2.11.7
Python 3.9.13 (main, May 24 2022, 21:28:44) 
[Clang 13.0.0 (clang-1300.0.29.30)]
```


### OS / Environment

macOS 11.6.7



## 提示信息

This doesn't seem like it is a `pylint` issue?

`re.compile("[\p{Han}a-z_]")` also raises normally. `\p` also isn't documented: https://docs.python.org/3/howto/regex.html
Is this a supported character?
I think this could be improved! Similar to the helpful output when passing an unrecognized option to Pylint, we could give a friendly output indicating that the regex pattern is invalid without the traceback; happy to put a MR together if you agree.
Thanks @mbyrnepr2 I did not even realize it was a crash that we had to fix before your comment.
@mbyrnepr2 I think in the above stacktrace on line 1858 makes the most sense.

We need to decide though if we continue to run the program. I think it makes sense to still quit. If we catch regex errors there and pass we will also "allow" ignore path regexes that don't work. I don't think we should do that.

Imo, incorrect regexes are a little different from other "incorrect" options, since there is little risk that they are valid on other interpreters or versions such as old messages etc. Therefore, I'd prefer to (cleanly) exit.
Indeed @DanielNoord I think we are on the same page regarding this point; I would also exit instead of passing if the regex is invalid. That line you mention, we can basically try/except on re.error and exit printing the details of the pattern which is invalid.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/config/test_config.py::test_regex_error", "tests/config/test_config.py::test_csv_regex_error"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
