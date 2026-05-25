# pylint-dev-pylint-7993

**来源**: SWE-bench Lite
**仓库**: pylint-dev/pylint
**Base Commit**: e90702074e68e20dc8e5df5013ee3ecf22139c3e
**创建时间**: 2022-12-27T18:20:50Z

## 问题描述

Using custom braces in message template does not work
### Bug description

Have any list of errors:

On pylint 1.7 w/ python3.6 - I am able to use this as my message template
```
$ pylint test.py --msg-template='{{ "Category": "{category}" }}'
No config file found, using default configuration
************* Module [redacted].test
{ "Category": "convention" }
{ "Category": "error" }
{ "Category": "error" }
{ "Category": "convention" }
{ "Category": "convention" }
{ "Category": "convention" }
{ "Category": "error" }
```

However, on Python3.9 with Pylint 2.12.2, I get the following:
```
$ pylint test.py --msg-template='{{ "Category": "{category}" }}'
[redacted]/site-packages/pylint/reporters/text.py:206: UserWarning: Don't recognize the argument '{ "Category"' in the --msg-template. Are you sure it is supported on the current version of pylint?
  warnings.warn(
************* Module [redacted].test
" }
" }
" }
" }
" }
" }
```

Is this intentional or a bug?

### Configuration

_No response_

### Command used

```shell
pylint test.py --msg-template='{{ "Category": "{category}" }}'
```


### Pylint output

```shell
[redacted]/site-packages/pylint/reporters/text.py:206: UserWarning: Don't recognize the argument '{ "Category"' in the --msg-template. Are you sure it is supported on the current version of pylint?
  warnings.warn(
************* Module [redacted].test
" }
" }
" }
" }
" }
" }
```


### Expected behavior

Expect the dictionary to print out with `"Category"` as the key.

### Pylint version

```shell
Affected Version:
pylint 2.12.2
astroid 2.9.2
Python 3.9.9+ (heads/3.9-dirty:a2295a4, Dec 21 2021, 22:32:52) 
[GCC 4.8.5 20150623 (Red Hat 4.8.5-44)]


Previously working version:
No config file found, using default configuration
pylint 1.7.4, 
astroid 1.6.6
Python 3.6.8 (default, Nov 16 2020, 16:55:22) 
[GCC 4.8.5 20150623 (Red Hat 4.8.5-44)]
```


### OS / Environment

_No response_

### Additional dependencies

_No response_


## 提示信息

Subsequently, there is also this behavior with the quotes
```
$ pylint test.py --msg-template='"Category": "{category}"'
************* Module test
Category": "convention
Category": "error
Category": "error
Category": "convention
Category": "convention
Category": "error

$ pylint test.py --msg-template='""Category": "{category}""'
************* Module test
"Category": "convention"
"Category": "error"
"Category": "error"
"Category": "convention"
"Category": "convention"
"Category": "error"
```
Commit that changed the behavior was probably this one: https://github.com/PyCQA/pylint/commit/7c3533ca48e69394391945de1563ef7f639cd27d#diff-76025f0bc82e83cb406321006fbca12c61a10821834a3164620fc17c978f9b7e

And I tested on 2.11.1 that it is working as intended on that version.
Thanks for digging into this !

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/reporters/unittest_reporting.py::test_template_option_with_header"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
