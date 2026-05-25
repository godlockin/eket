# scikit-learn-scikit-learn-10508

**来源**: SWE-bench Lite
**仓库**: scikit-learn/scikit-learn
**Base Commit**: c753b77ac49e72ebc0fe5e3c2369fe628f975017
**创建时间**: 2018-01-19T18:00:29Z

## 问题描述

LabelEncoder transform fails for empty lists (for certain inputs)
Python 3.6.3, scikit_learn 0.19.1

Depending on which datatypes were used to fit the LabelEncoder, transforming empty lists works or not. Expected behavior would be that empty arrays are returned in both cases.

```python
>>> from sklearn.preprocessing import LabelEncoder
>>> le = LabelEncoder()
>>> le.fit([1,2])
LabelEncoder()
>>> le.transform([])
array([], dtype=int64)
>>> le.fit(["a","b"])
LabelEncoder()
>>> le.transform([])
Traceback (most recent call last):
  File "[...]\Python36\lib\site-packages\numpy\core\fromnumeric.py", line 57, in _wrapfunc
    return getattr(obj, method)(*args, **kwds)
TypeError: Cannot cast array data from dtype('float64') to dtype('<U32') according to the rule 'safe'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "[...]\Python36\lib\site-packages\sklearn\preprocessing\label.py", line 134, in transform
    return np.searchsorted(self.classes_, y)
  File "[...]\Python36\lib\site-packages\numpy\core\fromnumeric.py", line 1075, in searchsorted
    return _wrapfunc(a, 'searchsorted', v, side=side, sorter=sorter)
  File "[...]\Python36\lib\site-packages\numpy\core\fromnumeric.py", line 67, in _wrapfunc
    return _wrapit(obj, method, *args, **kwds)
  File "[...]\Python36\lib\site-packages\numpy\core\fromnumeric.py", line 47, in _wrapit
    result = getattr(asarray(obj), method)(*args, **kwds)
TypeError: Cannot cast array data from dtype('float64') to dtype('<U32') according to the rule 'safe'
```


## 提示信息

`le.transform([])` will trigger an numpy array of `dtype=np.float64` and you fit something which was some string.

```python
from sklearn.preprocessing import LabelEncoder                                       
import numpy as np                                                                   
                                                                                     
le = LabelEncoder()                                                                  
X = np.array(["a", "b"])                                                             
le.fit(X)                                                                            
X_trans = le.transform(np.array([], dtype=X.dtype))
X_trans
array([], dtype=int64)
```
I would like to take it up. 
Hey @maykulkarni go ahead with PR. Sorry, please don't mind my referenced commit, I don't intend to send in a PR.

I would be happy to have a look over your PR once you send in (not that my review would matter much) :)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["sklearn/preprocessing/tests/test_label.py::test_label_encoder_errors", "sklearn/preprocessing/tests/test_label.py::test_label_encoder_empty_array"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
