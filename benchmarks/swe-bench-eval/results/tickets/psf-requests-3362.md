# psf-requests-3362

**来源**: SWE-bench Lite
**仓库**: psf/requests
**Base Commit**: 36453b95b13079296776d11b09cab2567ea3e703
**创建时间**: 2016-06-24T13:31:31Z

## 问题描述

Uncertain about content/text vs iter_content(decode_unicode=True/False)
When requesting an application/json document, I'm seeing `next(r.iter_content(16*1024, decode_unicode=True))` returning bytes, whereas `r.text` returns unicode. My understanding was that both should return a unicode object. In essence, I thought "iter_content" was equivalent to "iter_text" when decode_unicode was True. Have I misunderstood something? I can provide an example if needed.

For reference, I'm using python 3.5.1 and requests 2.10.0.

Thanks!



## 提示信息

what does (your response object).encoding return?

There's at least one key difference: `decode_unicode=True` doesn't fall back to `apparent_encoding`, which means it'll never autodetect the encoding. This means if `response.encoding` is None it is a no-op: in fact, it's a no-op that yields bytes.

That behaviour seems genuinely bad to me, so I think we should consider it a bug. I'd rather we had the same logic as in `text` for this.

`r.encoding` returns `None`.

On a related note, `iter_text` might be clearer/more consistent than `iter_content(decode_unicode=True)` if there's room for change in the APIs future (and `iter_content_lines` and `iter_text_lines` I guess), assuming you don't see that as bloat.

@mikepelley The API is presently frozen so I don't think we'll be adding those three methods. Besides, `iter_text` likely wouldn't provide much extra value outside of calling `iter_content(decode_unicode=True)`.


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_requests.py::TestRequests::test_response_decode_unicode"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
