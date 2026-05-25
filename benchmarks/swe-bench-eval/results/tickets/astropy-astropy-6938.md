# astropy-astropy-6938

**来源**: SWE-bench Lite
**仓库**: astropy/astropy
**Base Commit**: c76af9ed6bb89bfba45b9f5bc1e635188278e2fa
**创建时间**: 2017-12-07T00:01:14Z

## 问题描述

Possible bug in io.fits related to D exponents
I came across the following code in ``fitsrec.py``:

```python
        # Replace exponent separator in floating point numbers
        if 'D' in format:
            output_field.replace(encode_ascii('E'), encode_ascii('D'))
```

I think this may be incorrect because as far as I can tell ``replace`` is not an in-place operation for ``chararray`` (it returns a copy). Commenting out this code doesn't cause any tests to fail so I think this code isn't being tested anyway.


## 提示信息

It is tested with `astropy/io/fits/tests/test_checksum.py:test_ascii_table_data` but indeed the operation is not inplace and it does not fail. Using 'D' is probably better, but since #5362 (I had vague memory about something like this ^^, see also #5353) anyway 'D' and 'E' are read as double, so I think there is not difference on Astropy side.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["astropy/io/fits/tests/test_checksum.py::TestChecksumFunctions::test_ascii_table_data", "astropy/io/fits/tests/test_table.py::TestTableFunctions::test_ascii_table"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
