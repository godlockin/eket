# sphinx-doc-sphinx-10451

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 195e911f1dab04b8ddeacbe04b7d214aaf81bb0b
**创建时间**: 2022-05-15T11:49:39Z

## 问题描述

Fix duplicated *args and **kwargs with autodoc_typehints
Fix duplicated *args and **kwargs with autodoc_typehints

### Bugfix
- Bugfix

### Detail
Consider this
```python
class _ClassWithDocumentedInitAndStarArgs:
    """Class docstring."""

    def __init__(self, x: int, *args: int, **kwargs: int) -> None:
        """Init docstring.

        :param x: Some integer
        :param *args: Some integer
        :param **kwargs: Some integer
        """
```
when using the autodoc extension and the setting `autodoc_typehints = "description"`.

WIth sphinx 4.2.0, the current output is
```
Class docstring.

   Parameters:
      * **x** (*int*) --

      * **args** (*int*) --

      * **kwargs** (*int*) --

   Return type:
      None

   __init__(x, *args, **kwargs)

      Init docstring.

      Parameters:
         * **x** (*int*) -- Some integer

         * ***args** --

           Some integer

         * ****kwargs** --

           Some integer

         * **args** (*int*) --

         * **kwargs** (*int*) --

      Return type:
         None
```
where the *args and **kwargs are duplicated and incomplete.

The expected output is
```
  Class docstring.

   Parameters:
      * **x** (*int*) --

      * ***args** (*int*) --

      * ****kwargs** (*int*) --

   Return type:
      None

   __init__(x, *args, **kwargs)

      Init docstring.

      Parameters:
         * **x** (*int*) -- Some integer

         * ***args** (*int*) --

           Some integer

         * ****kwargs** (*int*) --

           Some integer

      Return type:
         None

```


## 提示信息

I noticed this docstring causes warnings because `*` and `**` are considered as mark-up symbols:

```
    def __init__(self, x: int, *args: int, **kwargs: int) -> None:
        """Init docstring.

        :param x: Some integer
        :param *args: Some integer
        :param **kwargs: Some integer
        """
```

Here are warnings:
```
/Users/tkomiya/work/tmp/doc/example.py:docstring of example.ClassWithDocumentedInitAndStarArgs:6: WARNING: Inline emphasis start-string without end-string.
/Users/tkomiya/work/tmp/doc/example.py:docstring of example.ClassWithDocumentedInitAndStarArgs:7: WARNING: Inline strong start-string without end-string.
```

It will work fine if we escape `*` character like the following. But it's not officially recommended way, I believe.

```
    def __init__(self, x: int, *args: int, **kwargs: int) -> None:
        """Init docstring.

        :param x: Some integer
        :param \*args: Some integer
        :param \*\*kwargs: Some integer
        """
```

I'm not sure this feature is really needed?
> I noticed this docstring causes warnings because `*` and `**` are considered as mark-up symbols:
> 
> ```
>     def __init__(self, x: int, *args: int, **kwargs: int) -> None:
>         """Init docstring.
> 
>         :param x: Some integer
>         :param *args: Some integer
>         :param **kwargs: Some integer
>         """
> ```
> 
> Here are warnings:
> 
> ```
> /Users/tkomiya/work/tmp/doc/example.py:docstring of example.ClassWithDocumentedInitAndStarArgs:6: WARNING: Inline emphasis start-string without end-string.
> /Users/tkomiya/work/tmp/doc/example.py:docstring of example.ClassWithDocumentedInitAndStarArgs:7: WARNING: Inline strong start-string without end-string.
> ```
> 
> It will work fine if we escape `*` character like the following. But it's not officially recommended way, I believe.
> 
> ```
>     def __init__(self, x: int, *args: int, **kwargs: int) -> None:
>         """Init docstring.
> 
>         :param x: Some integer
>         :param \*args: Some integer
>         :param \*\*kwargs: Some integer
>         """
> ```
> 
> I'm not sure this feature is really needed?

This is needed for the Numpy and Google docstring formats, which napoleon converts to `:param:`s.

Oh, I missed numpydoc format. Indeed, it recommends prepending stars.
https://numpydoc.readthedocs.io/en/latest/format.html#parameters

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_ext_napoleon_docstring.py::test_napoleon_and_autodoc_typehints_description_all", "tests/test_ext_napoleon_docstring.py::test_napoleon_and_autodoc_typehints_description_documented_params"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
