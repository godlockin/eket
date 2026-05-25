# psf-requests-863

**来源**: SWE-bench Lite
**仓库**: psf/requests
**Base Commit**: a0df2cbb10419037d11d04352b3175405ab52941
**创建时间**: 2012-09-20T15:48:00Z

## 问题描述

Allow lists in the dict values of the hooks argument
Currently the Request class has a .register_hook() method but it parses the dictionary it expects from it's hooks argument weirdly: the argument can only specify one hook function per hook.  If you pass in a list of hook functions per hook the code in Request.**init**() will wrap the list in a list which then fails when the hooks are consumed (since a list is not callable).  This is especially annoying since you can not use multiple hooks from a session.  The only way to get multiple hooks now is to create the request object without sending it, then call .register_hook() multiple times and then finally call .send().

This would all be much easier if Request.**init**() parsed the hooks parameter in a way that it accepts lists as it's values.



## 提示信息

If anyone OKs this feature request, I'd be happy to dig into it.

@sigmavirus24 :+1:

Just need to make sure that the current workflow also continues to work with this change.

Once @kennethreitz has time to review #833, I'll start working on this. I have a feeling opening a branch for this would cause a merge conflict if I were to have two Pull Requests that are ignorant of each other for the same file. Could be wrong though. Also, I'm in no rush since I'm fairly busy and I know @kennethreitz is more busy than I am with conferences and whatnot. Just wanted to keep @flub updated.

I'm going to start work on this Friday at the earliest.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_requests.py::RequestsTestSuite::test_POSTBIN_GET_POST_FILES_WITH_HEADERS", "tests/test_requests.py::RequestsTestSuite::test_nonurlencoded_postdata", "tests/test_requests.py::RequestsTestSuite::test_prefetch_redirect_bug", "tests/test_requests.py::RequestsTestSuite::test_urlencoded_post_data"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
