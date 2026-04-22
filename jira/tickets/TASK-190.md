# TASK-190: Bearer token改constant_time_eq防timing attack

**优先级**: P1
**类型**: Security
**模块**: eket-server / auth.rs:43
**来源**: 红队质疑 JeffDean

## 问题描述

`t == expected` 字符串短路比较泄露token信息，内网timing attack可统计出token内容。

## 验收标准

- [ ] 添加 `constant_time_eq = "0.3"` 到 eket-server Cargo.toml
- [ ] 改为 `constant_time_eq::constant_time_eq(t.as_bytes(), expected.as_bytes())`
- [ ] 长度不等时也用constant时间比较（填充或统一返回false不短路）
- [ ] 单元测试：正确token通过；错误token拒绝
