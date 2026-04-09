# Python SDK Release Guide

## Prerequisites

```bash
pip install build twine
```

## Release Steps

### 1. Bump version

编辑 `eket_sdk/__init__.py`：

```python
__version__ = "1.0.1"  # 修改为新版本号
```

编辑 `setup.py`：

```python
setup(
    version="1.0.1",  # 与 __init__.py 保持一致
    ...
)
```

### 2. Commit version bump

```bash
git add eket_sdk/__init__.py setup.py
git commit -m "chore(sdk-python): bump version to 1.0.1"
```

### 3. Create git tag

```bash
git tag sdk-python-v1.0.1
git push origin sdk-python-v1.0.1
```

### 4. Build distribution

```bash
cd sdk/python
python3 -m build
# 生成 dist/eket_sdk-1.0.1.tar.gz 和 dist/eket_sdk-1.0.1-py3-none-any.whl
```

### 5. Upload to PyPI

```bash
# 测试环境（Test PyPI）
python3 -m twine upload --repository testpypi dist/*

# 正式环境（PyPI）
python3 -m twine upload dist/*
```

> 需要 PyPI token，配置在 `~/.pypirc` 或通过 `TWINE_PASSWORD` 环境变量传入。

### 6. Verify

```bash
pip install eket-sdk==1.0.1
python3 -c "import eket_sdk; print(eket_sdk.__version__)"
```

---

## Version Rules

参见 `../VERSIONING.md`。

---

## Credentials

PyPI token 存储在 CI secrets（`PYPI_API_TOKEN`），本地发布需在 `~/.pypirc` 配置：

```ini
[pypi]
username = __token__
password = pypi-xxxxxxxxxxxx
```
