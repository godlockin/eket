# astropy-astropy-7746

**来源**: SWE-bench Lite
**仓库**: astropy/astropy
**Base Commit**: d5bd3f68bb6d5ce3a61bdce9883ee750d1afade5
**创建时间**: 2018-08-20T14:07:20Z

## 问题描述

Issue when passing empty lists/arrays to WCS transformations
The following should not fail but instead should return empty lists/arrays:

```
In [1]: from astropy.wcs import WCS

In [2]: wcs = WCS('2MASS_h.fits')

In [3]: wcs.wcs_pix2world([], [], 0)
---------------------------------------------------------------------------
InconsistentAxisTypesError                Traceback (most recent call last)
<ipython-input-3-e2cc0e97941a> in <module>()
----> 1 wcs.wcs_pix2world([], [], 0)

~/Dropbox/Code/Astropy/astropy/astropy/wcs/wcs.py in wcs_pix2world(self, *args, **kwargs)
   1352         return self._array_converter(
   1353             lambda xy, o: self.wcs.p2s(xy, o)['world'],
-> 1354             'output', *args, **kwargs)
   1355     wcs_pix2world.__doc__ = """
   1356         Transforms pixel coordinates to world coordinates by doing

~/Dropbox/Code/Astropy/astropy/astropy/wcs/wcs.py in _array_converter(self, func, sky, ra_dec_order, *args)
   1267                     "a 1-D array for each axis, followed by an origin.")
   1268 
-> 1269             return _return_list_of_arrays(axes, origin)
   1270 
   1271         raise TypeError(

~/Dropbox/Code/Astropy/astropy/astropy/wcs/wcs.py in _return_list_of_arrays(axes, origin)
   1223             if ra_dec_order and sky == 'input':
   1224                 xy = self._denormalize_sky(xy)
-> 1225             output = func(xy, origin)
   1226             if ra_dec_order and sky == 'output':
   1227                 output = self._normalize_sky(output)

~/Dropbox/Code/Astropy/astropy/astropy/wcs/wcs.py in <lambda>(xy, o)
   1351             raise ValueError("No basic WCS settings were created.")
   1352         return self._array_converter(
-> 1353             lambda xy, o: self.wcs.p2s(xy, o)['world'],
   1354             'output', *args, **kwargs)
   1355     wcs_pix2world.__doc__ = """

InconsistentAxisTypesError: ERROR 4 in wcsp2s() at line 2646 of file cextern/wcslib/C/wcs.c:
ncoord and/or nelem inconsistent with the wcsprm.
```


## 提示信息



## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["astropy/wcs/tests/test_wcs.py::test_zero_size_input"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
