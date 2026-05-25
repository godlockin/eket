# pallets-flask-4992

**来源**: SWE-bench Lite
**仓库**: pallets/flask
**Base Commit**: 4c288bc97ea371817199908d0d9b12de9dae327e
**创建时间**: 2023-02-22T14:00:17Z

## 问题描述

Add a file mode parameter to flask.Config.from_file()
Python 3.11 introduced native TOML support with the `tomllib` package. This could work nicely with the `flask.Config.from_file()` method as an easy way to load TOML config files:

```python
app.config.from_file("config.toml", tomllib.load)
```

However, `tomllib.load()` takes an object readable in binary mode, while `flask.Config.from_file()` opens a file in text mode, resulting in this error:

```
TypeError: File must be opened in binary mode, e.g. use `open('foo.toml', 'rb')`
```

We can get around this with a more verbose expression, like loading from a file opened with the built-in `open()` function and passing the `dict` to `app.Config.from_mapping()`:

```python
# We have to repeat the path joining that from_file() does
with open(os.path.join(app.config.root_path, "config.toml"), "rb") as file:
    app.config.from_mapping(tomllib.load(file))
```

But adding a file mode parameter to `flask.Config.from_file()` would enable the use of a simpler expression. E.g.:

```python
app.config.from_file("config.toml", tomllib.load, mode="b")
```



## 提示信息

You can also use:

```python
app.config.from_file("config.toml", lambda f: tomllib.load(f.buffer))
```
Thanks - I was looking for another way to do it. I'm happy with that for now, although it's worth noting this about `io.TextIOBase.buffer` from the docs:

> This is not part of the [TextIOBase](https://docs.python.org/3/library/io.html#io.TextIOBase) API and may not exist in some implementations.
Oh, didn't mean for you to close this, that was just a shorter workaround. I think a `text=True` parameter would be better, easier to use `True` or `False` rather than mode strings. Some libraries, like `tomllib`, have _Opinions_ about whether text or bytes are correct for parsing files, and we can accommodate that.
can i work on this?
No need to ask to work on an issue. As long as the issue is not assigned to anyone and doesn't have have a linked open PR (both can be seen in the sidebar), anyone is welcome to work on any issue.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_config.py::test_config_from_file_toml"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
