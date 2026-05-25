# pytest-dev-pytest-5227

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 2051e30b9b596e944524ccb787ed20f9f5be93e3
**创建时间**: 2019-05-07T20:27:24Z

## 问题描述

Improve default logging format
Currently it is:

> DEFAULT_LOG_FORMAT = "%(filename)-25s %(lineno)4d %(levelname)-8s %(message)s"

I think `name` (module name) would be very useful here, instead of just the base filename.

(It might also be good to have the relative path there (maybe at the end), but it is usually still very long (but e.g. `$VIRTUAL_ENV` could be substituted therein))

Currently it would look like this:
```
utils.py                   114 DEBUG    (0.000) SELECT "app_url"."id", "app_url"."created", "app_url"."url" FROM "app_url" WHERE "app_url"."id" = 2; args=(2,)
multipart.py               604 DEBUG    Calling on_field_start with no data
```


Using `DEFAULT_LOG_FORMAT = "%(levelname)-8s %(name)s:%(filename)s:%(lineno)d %(message)s"` instead:

```
DEBUG    django.db.backends:utils.py:114 (0.000) SELECT "app_url"."id", "app_url"."created", "app_url"."url" FROM "app_url" WHERE "app_url"."id" = 2; args=(2,)
DEBUG    multipart.multipart:multipart.py:604 Calling on_field_start with no data
```


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/logging/test_reporting.py::test_log_cli_enabled_disabled[True]", "testing/logging/test_reporting.py::test_log_cli_default_level", "testing/logging/test_reporting.py::test_sections_single_new_line_after_test_outcome"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
