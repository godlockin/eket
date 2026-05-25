# pytest-dev-pytest-11143

**来源**: SWE-bench Lite
**仓库**: pytest-dev/pytest
**Base Commit**: 6995257cf470d2143ad1683824962de4071c0eb7
**创建时间**: 2023-06-26T06:44:43Z

## 问题描述

Rewrite fails when first expression of file is a number and mistaken as docstring 
<!--
Thanks for submitting an issue!

Quick check-list while reporting bugs:
-->

- [x] a detailed description of the bug or problem you are having
- [x] output of `pip list` from the virtual environment you are using
- [x] pytest and operating system versions
- [x] minimal example if possible
```
Installing collected packages: zipp, six, PyYAML, python-dateutil, MarkupSafe, importlib-metadata, watchdog, tomli, soupsieve, pyyaml-env-tag, pycparser, pluggy, packaging, mergedeep, Markdown, jinja2, iniconfig, ghp-import, exceptiongroup, click, websockets, urllib3, tqdm, smmap, pytest, pyee, mkdocs, lxml, importlib-resources, idna, cssselect, charset-normalizer, cffi, certifi, beautifulsoup4, attrs, appdirs, w3lib, typing-extensions, texttable, requests, pyzstd, pytest-metadata, pyquery, pyppmd, pyppeteer, pynacl, pymdown-extensions, pycryptodomex, pybcj, pyasn1, py, psutil, parse, multivolumefile, mkdocs-autorefs, inflate64, gitdb, fake-useragent, cryptography, comtypes, bs4, brotli, bcrypt, allure-python-commons, xlwt, xlrd, rsa, requests-html, pywinauto, python-i18n, python-dotenv, pytest-rerunfailures, pytest-html, pytest-check, PySocks, py7zr, paramiko, mkdocstrings, loguru, GitPython, ftputil, crcmod, chardet, brotlicffi, allure-pytest
Successfully installed GitPython-3.1.31 Markdown-3.3.7 MarkupSafe-2.1.3 PySocks-1.7.1 PyYAML-6.0 allure-pytest-2.13.2 allure-python-commons-2.13.2 appdirs-1.4.4 attrs-23.1.0 bcrypt-4.0.1 beautifulsoup4-4.12.2 brotli-1.0.9 brotlicffi-1.0.9.2 bs4-0.0.1 certifi-2023.5.7 cffi-1.15.1 chardet-5.1.0 charset-normalizer-3.1.0 click-8.1.3 comtypes-1.2.0 crcmod-1.7 cryptography-41.0.1 cssselect-1.2.0 exceptiongroup-1.1.1 fake-useragent-1.1.3 ftputil-5.0.4 ghp-import-2.1.0 gitdb-4.0.10 idna-3.4 importlib-metadata-6.7.0 importlib-resources-5.12.0 inflate64-0.3.1 iniconfig-2.0.0 jinja2-3.1.2 loguru-0.7.0 lxml-4.9.2 mergedeep-1.3.4 mkdocs-1.4.3 mkdocs-autorefs-0.4.1 mkdocstrings-0.22.0 multivolumefile-0.2.3 packaging-23.1 paramiko-3.2.0 parse-1.19.1 pluggy-1.2.0 psutil-5.9.5 py-1.11.0 py7zr-0.20.5 pyasn1-0.5.0 pybcj-1.0.1 pycparser-2.21 pycryptodomex-3.18.0 pyee-8.2.2 pymdown-extensions-10.0.1 pynacl-1.5.0 pyppeteer-1.0.2 pyppmd-1.0.0 pyquery-2.0.0 pytest-7.4.0 pytest-check-2.1.5 pytest-html-3.2.0 pytest-metadata-3.0.0 pytest-rerunfailures-11.1.2 python-dateutil-2.8.2 python-dotenv-1.0.0 python-i18n-0.3.9 pywinauto-0.6.6 pyyaml-env-tag-0.1 pyzstd-0.15.9 requests-2.31.0 requests-html-0.10.0 rsa-4.9 six-1.16.0 smmap-5.0.0 soupsieve-2.4.1 texttable-1.6.7 tomli-2.0.1 tqdm-4.65.0 typing-extensions-4.6.3 urllib3-1.26.16 w3lib-2.1.1 watchdog-3.0.0 websockets-10.4 xlrd-2.0.1 xlwt-1.3.0 zipp-3.15.0
```
use `pytest -k xxx`， report an error：`TypeError: argument of type 'int' is not iterable`

it seems a error in collecting testcase
```
==================================== ERRORS ====================================
_ ERROR collecting testcases/基线/代理策略/SOCKS二级代理迭代二/在线用户/在线用户更新/上线用户/test_socks_user_011.py _
/usr/local/lib/python3.8/site-packages/_pytest/runner.py:341: in from_call
    result: Optional[TResult] = func()
/usr/local/lib/python3.8/site-packages/_pytest/runner.py:372: in <lambda>
    call = CallInfo.from_call(lambda: list(collector.collect()), "collect")
/usr/local/lib/python3.8/site-packages/_pytest/python.py:531: in collect
    self._inject_setup_module_fixture()
/usr/local/lib/python3.8/site-packages/_pytest/python.py:545: in _inject_setup_module_fixture
    self.obj, ("setUpModule", "setup_module")
/usr/local/lib/python3.8/site-packages/_pytest/python.py:310: in obj
    self._obj = obj = self._getobj()
/usr/local/lib/python3.8/site-packages/_pytest/python.py:528: in _getobj
    return self._importtestmodule()
/usr/local/lib/python3.8/site-packages/_pytest/python.py:617: in _importtestmodule
    mod = import_path(self.path, mode=importmode, root=self.config.rootpath)
/usr/local/lib/python3.8/site-packages/_pytest/pathlib.py:565: in import_path
    importlib.import_module(module_name)
/usr/local/lib/python3.8/importlib/__init__.py:127: in import_module
    return _bootstrap._gcd_import(name[level:], package, level)
<frozen importlib._bootstrap>:1014: in _gcd_import
    ???
<frozen importlib._bootstrap>:991: in _find_and_load
    ???
<frozen importlib._bootstrap>:975: in _find_and_load_unlocked
    ???
<frozen importlib._bootstrap>:671: in _load_unlocked
    ???
/usr/local/lib/python3.8/site-packages/_pytest/assertion/rewrite.py:169: in exec_module
    source_stat, co = _rewrite_test(fn, self.config)
/usr/local/lib/python3.8/site-packages/_pytest/assertion/rewrite.py:352: in _rewrite_test
    rewrite_asserts(tree, source, strfn, config)
/usr/local/lib/python3.8/site-packages/_pytest/assertion/rewrite.py:413: in rewrite_asserts
    AssertionRewriter(module_path, config, source).run(mod)
/usr/local/lib/python3.8/site-packages/_pytest/assertion/rewrite.py:695: in run
    if self.is_rewrite_disabled(doc):
/usr/local/lib/python3.8/site-packages/_pytest/assertion/rewrite.py:760: in is_rewrite_disabled
    return "PYTEST_DONT_REWRITE" in docstring
E   TypeError: argument of type 'int' is not iterable
```


## 提示信息

more details are needed - based on the exception, the docstring is a integer, that seems completely wrong
I run it pass lasttime in 2023-6-20 17:07:23. it run in docker and install newest pytest before run testcase everytime . maybe some commit cause it recently. 
I run it can pass in 7.2.0 a few minutes ago.

`pytest ini`
```
[pytest]
log_cli = false
log_cli_level = debug
log_cli_format = %(asctime)s %(levelname)s %(message)s
log_cli_date_format = %Y-%m-%d %H:%M:%S

addopts = -v -s

filterwarnings =
    ignore::UserWarning

markers=
    case_id: mark test id to upload on tp
    case_level_bvt: testcase level bvt
    case_level_1: testcase level level 1
    case_level_2: testcase level level 2
    case_level_3: testcase level level 3
    case_status_pass: mark case as PASS
    case_status_fail: mark case as FAILED
    case_status_not_finish: mark case as CODEING
    case_status_not_run: mark case as FINISH
    case_not_run: mark case as DONT RUN
    run_env: mark run this case on which environment
 ```
    
`testcase:`
```
@pytest.fixture(autouse=True)
def default_setup_teardown():
    xxxx

@allure.feature("初始状态")
class TestDefauleName:
    @allure.title("上线一个域用户，用户名和组名正确")
    @pytest.mark.case_level_1
    @pytest.mark.case_id("tc_proxyheard_insert_011")
    def test_tc_proxyheard_insert_011(self):
        xxxx
        ```
thanks for the update

i took the liberty to edit your comments to use markdown code blocks for ease of reading

from the given information the problem is still unclear

please try running with `--assert=plain` for verification

the error indicates that the python ast parser somehow ends up with a integer as the docstring for `test_socks_user_011.py` the reason is still unclear based on the redacted information
I run with --assert=plain and it has passed

python3 -m pytest -k helloworld --assert=plain
```
testcases/smoke_testcase/test_helloworld.py::TestGuardProcess::test_hello_world 2023-06-25 08:54:17.659 | INFO     | NAC_AIO.testcases.smoke_testcase.test_helloworld:test_hello_world:15 - Great! Frame Work is working
PASSED
total: 1648
passed: 1
failed: 0
error: 0
pass_rate 100.00%

================================================================================= 1 passed, 1647 deselected in 12.28s =================================================================================
```
It seems to me that we have a potential bug in the ast transformer where's in case the first expression of a file is a integer, we mistake it as a docstring

Can you verify the first expression in the file that fails?
you are right this file first expression is a 0 . It can pass after I delete it 
thank you!
Minimal reproducer:

```python
0
```

(yes, just that, in a .py file)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["testing/test_assertrewrite.py::TestIssue11140::test_constant_not_picked_as_module_docstring"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
