# sphinx-doc-sphinx-8713

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 3ed7590ed411bd93b26098faab4f23619cdb2267
**创建时间**: 2021-01-20T14:24:12Z

## 问题描述

napoleon_use_param should also affect "other parameters" section
Subject: napoleon_use_param should also affect "other parameters" section

### Problem
Currently, napoleon always renders the Other parameters section as if napoleon_use_param was False, see source
```
    def _parse_other_parameters_section(self, section):
        # type: (unicode) -> List[unicode]
        return self._format_fields(_('Other Parameters'), self._consume_fields())

    def _parse_parameters_section(self, section):
        # type: (unicode) -> List[unicode]
        fields = self._consume_fields()
        if self._config.napoleon_use_param:
            return self._format_docutils_params(fields)
        else:
            return self._format_fields(_('Parameters'), fields)
```
whereas it would make sense that this section should follow the same formatting rules as the Parameters section.

#### Procedure to reproduce the problem
```
In [5]: print(str(sphinx.ext.napoleon.NumpyDocstring("""\ 
   ...: Parameters 
   ...: ---------- 
   ...: x : int 
   ...:  
   ...: Other parameters 
   ...: ---------------- 
   ...: y: float 
   ...: """)))                                                                                                                                                                                      
:param x:
:type x: int

:Other Parameters: **y** (*float*)
```

Note the difference in rendering.

#### Error logs / results
See above.

#### Expected results
```
:param x:
:type x: int

:Other Parameters:  // Or some other kind of heading.
:param: y
:type y: float
```

Alternatively another separate config value could be introduced, but that seems a bit overkill.

### Reproducible project / your project
N/A

### Environment info
- OS: Linux
- Python version: 3.7
- Sphinx version: 1.8.1



## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_ext_napoleon_docstring.py::NumpyDocstringTest::test_parameters_with_class_reference"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
