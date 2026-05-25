# sympy-sympy-24152

**来源**: SWE-bench Lite
**仓库**: sympy/sympy
**Base Commit**: b9af885473ad7e34b5b0826cb424dd26d8934670
**创建时间**: 2022-10-21T13:47:03Z

## 问题描述

Bug in expand of TensorProduct + Workaround + Fix
### Error description
The expansion of a TensorProduct object stops incomplete if summands in the tensor product factors have (scalar) factors, e.g.
```
from sympy import *
from sympy.physics.quantum import *
U = Operator('U')
V = Operator('V')
P = TensorProduct(2*U - V, U + V)
print(P) 
# (2*U - V)x(U + V)
print(P.expand(tensorproduct=True)) 
#result: 2*Ux(U + V) - Vx(U + V) #expansion has missed 2nd tensor factor and is incomplete
```
This is clearly not the expected behaviour. It also effects other functions that rely on .expand(tensorproduct=True), as e.g. qapply() .

### Work around
Repeat .expand(tensorproduct=True) as may times as there are tensor factors, resp. until the expanded term does no longer change. This is however only reasonable in interactive session and not in algorithms.

### Code Fix
.expand relies on the method TensorProduct._eval_expand_tensorproduct(). The issue arises from an inprecise check in TensorProduct._eval_expand_tensorproduct() whether a recursive call is required; it fails when the creation of a TensorProduct object returns commutative (scalar) factors up front: in that case the constructor returns a Mul(c_factors, TensorProduct(..)).
I thus propose the following  code fix in TensorProduct._eval_expand_tensorproduct() in quantum/tensorproduct.py.  I have marked the four lines to be added / modified:
```
    def _eval_expand_tensorproduct(self, **hints):
                ...
                for aa in args[i].args:
                    tp = TensorProduct(*args[:i] + (aa,) + args[i + 1:])
                    c_part, nc_part = tp.args_cnc() #added
                    if len(nc_part)==1 and isinstance(nc_part[0], TensorProduct): #modified
                        nc_part = (nc_part[0]._eval_expand_tensorproduct(), ) #modified
                    add_args.append(Mul(*c_part)*Mul(*nc_part)) #modified
                break
                ...
```
The fix splits of commutative (scalar) factors from the tp returned. The TensorProduct object will be the one nc factor in nc_part (see TensorProduct.__new__ constructor), if any. Note that the constructor will return 0 if a tensor factor is 0, so there is no guarantee that tp contains a TensorProduct object (e.g. TensorProduct(U-U, U+V).





## 提示信息

Can you make a pull request with this fix?
Will do. I haven't worked with git before, so bear with me.

But as I'm currently digging into some of the quantum package and have more and larger patches in the pipeline, it seems worth the effort to get git set up on my side. So watch out :-)

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_tensor_product_expand"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending
