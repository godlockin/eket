# sphinx-doc-sphinx-7975

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 4ec6cbe341fd84468c448e20082c778043bbea4b
**创建时间**: 2020-07-18T06:39:32Z

## 问题描述

Two sections called Symbols in index
When using index entries with the following leading characters: _@_, _£_, and _←_ I get two sections called _Symbols_ in the HTML output, the first containing all _@_ entries before ”normal” words and the second containing _£_ and _←_ entries after the ”normal” words.  Both have the same anchor in HTML so the links at the top of the index page contain two _Symbols_ links, one before the letters and one after, but both lead to the first section.



## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_environment_indexentries.py::test_create_single_index"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
