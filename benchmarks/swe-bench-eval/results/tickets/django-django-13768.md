# django-django-13768

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 965d2d95c630939b53eb60d9c169f5dfc77ee0c6
**创建时间**: 2020-12-12T07:34:48Z

## 问题描述

Log exceptions handled in Signal.send_robust()
Description
	
As pointed out by ​Haki Benita on Twitter, by default Signal.send_robust() doesn't have any log messages for exceptions raised in receivers. Since Django logs exceptions in other similar situations, such as missing template variables, I think it would be worth adding a logger.exception() call in the except clause of send_robust() . Users would then see such exceptions in their error handling tools, e.g. Sentry, and be able to figure out what action to take from there. Ultimately any *expected* exception should be caught with a try in the receiver function.


## 提示信息

I would like to work on this issue. PS. i am new to this django. so any advice would be appreciated

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_send_robust_fail (dispatch.tests.DispatcherTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
