# django-django-15400

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 4c76ffc2d6c77c850b4bef8d9acc197d11c47937
**创建时间**: 2022-02-05T19:34:55Z

## 问题描述

SimpleLazyObject doesn't implement __radd__
Description
	
Technically, there's a whole bunch of magic methods it doesn't implement, compared to a complete proxy implementation, like that of wrapt.ObjectProxy, but __radd__ being missing is the one that's biting me at the moment.
As far as I can tell, the implementation can't just be
__radd__ = new_method_proxy(operator.radd)
because that doesn't exist, which is rubbish.
__radd__ = new_method_proxy(operator.attrgetter("__radd__"))
also won't work because types may not have that attr, and attrgetter doesn't supress the exception (correctly)
The minimal implementation I've found that works for me is:
	def __radd__(self, other):
		if self._wrapped is empty:
			self._setup()
		return other + self._wrapped


## 提示信息

Could you please give some sample code with your use case?
In a boiled-down nutshell: def lazy_consumer(): # something more complex, obviously. return [1, 3, 5] consumer = SimpleLazyObject(lazy_consumer) # inside third party code ... def some_func(param): third_party_code = [...] # then, through parameter passing, my value is provided to be used. # param is at this point, `consumer` third_party_code_plus_mine = third_party_code + param which ultimately yields: TypeError: unsupported operand type(s) for +: 'list' and 'SimpleLazyObject'
Seems okay, although I'm not an expert on the SimpleLazyObject class.
Replying to kezabelle: def lazy_consumer(): # something more complex, obviously. return [1, 3, 5] consumer = SimpleLazyObject(lazy_consumer) If you know what is the resulting type or possible resulting types of your expression, I think you better use django.utils.functional.lazy which will provide all the necessary methods.
Replying to kezabelle: As far as I can tell, the implementation can't just be __radd__ = new_method_proxy(operator.radd) because that doesn't exist, which is rubbish. __radd__ = new_method_proxy(operator.attrgetter("__radd__")) also won't work because types may not have that attr, and attrgetter doesn't supress the exception (correctly) Wouldn't the following code work? __add__ = new_method_proxy(operator.add) __radd__ = new_method_proxy(lambda a, b: operator.add(b, a)) I have tested this and it seems to work as excepted.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_add (utils_tests.test_lazyobject.SimpleLazyObjectTestCase)", "test_radd (utils_tests.test_lazyobject.SimpleLazyObjectTestCase)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
