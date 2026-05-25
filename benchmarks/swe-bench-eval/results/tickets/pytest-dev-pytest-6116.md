# pytest-dev-pytest-6116

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: e670ff76cbad80108bde9bab616b66771b8653cf
**创建时间**: 2019-11-01T20:05:53Z

## 问题描述

pytest --collect-only needs a one char shortcut command
I find myself needing to run `--collect-only` very often and that cli argument is a very long to type one. 

I do think that it would be great to allocate a character for it, not sure which one yet. Please use up/down thumbs to vote if you would find it useful or not and eventually proposing which char should be used. 

Clearly this is a change very easy to implement but first I want to see if others would find it useful or not.
pytest --collect-only needs a one char shortcut command
I find myself needing to run `--collect-only` very often and that cli argument is a very long to type one. 

I do think that it would be great to allocate a character for it, not sure which one yet. Please use up/down thumbs to vote if you would find it useful or not and eventually proposing which char should be used. 

Clearly this is a change very easy to implement but first I want to see if others would find it useful or not.


## 提示信息

Agreed, it's probably the option I use most which doesn't have a shortcut.

Both `-c` and `-o` are taken. I guess `-n` (as in "no action", compare `-n`/`--dry-run` for e.g. `git clean`) could work? 

Maybe `--co` (for either "**co**llect" or "**c**ollect **o**nly), similar to other two-character shortcuts we already have (`--sw`, `--lf`, `--ff`, `--nf`)?
I like `--co`, and it doesn't seem to be used by any plugins as far as I can search:

https://github.com/search?utf8=%E2%9C%93&q=--co+language%3APython+pytest+language%3APython+language%3APython&type=Code&ref=advsearch&l=Python&l=Python
> I find myself needing to run `--collect-only` very often and that cli argument is a very long to type one.

Just out of curiosity: Why?  (i.e. what's your use case?)

+0 for `--co`.

But in general you can easily also have an alias "alias pco='pytest --collect-only'" - (or "alias pco='p --collect-only" if you have a shortcut for pytest already.. :))
I routinely use `--collect-only` when I switch to a different development branch or start working on a different area of our code base. I think `--co` is fine.
Agreed, it's probably the option I use most which doesn't have a shortcut.

Both `-c` and `-o` are taken. I guess `-n` (as in "no action", compare `-n`/`--dry-run` for e.g. `git clean`) could work? 

Maybe `--co` (for either "**co**llect" or "**c**ollect **o**nly), similar to other two-character shortcuts we already have (`--sw`, `--lf`, `--ff`, `--nf`)?
I like `--co`, and it doesn't seem to be used by any plugins as far as I can search:

https://github.com/search?utf8=%E2%9C%93&q=--co+language%3APython+pytest+language%3APython+language%3APython&type=Code&ref=advsearch&l=Python&l=Python
> I find myself needing to run `--collect-only` very often and that cli argument is a very long to type one.

Just out of curiosity: Why?  (i.e. what's your use case?)

+0 for `--co`.

But in general you can easily also have an alias "alias pco='pytest --collect-only'" - (or "alias pco='p --collect-only" if you have a shortcut for pytest already.. :))
I routinely use `--collect-only` when I switch to a different development branch or start working on a different area of our code base. I think `--co` is fine.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/test_collection.py::TestCustomConftests::test_pytest_fs_collect_hooks_are_seen", "testing/test_collection.py::TestCustomConftests::test_pytest_collect_file_from_sister_dir"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
