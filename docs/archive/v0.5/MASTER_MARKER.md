# EKET Master 标记文件

此文件由 Master 实例在初始化三仓库时自动创建，用于声明：
1. 该仓库已由 Master 实例初始化
2. Slaver 实例检测到此时可进入执行模式

## 文件格式

```yaml
initialized_by: master    # 初始化者
initialized_at: <timestamp>  # 初始化时间
master_instance: true     # Master 实例标记
```

## 检测逻辑

当 `/eket-start` 脚本检测到任意仓库中存在 `.eket_master_marker` 文件时：
- 实例角色自动设置为 **Slaver**
- Slaver 实例会询问用户选择角色类型（产品经理/前端/后端等）

## 位置

- `confluence/.eket_master_marker`
- `jira/.eket_master_marker`
- `code_repo/.eket_master_marker` 或 `src/.eket_master_marker`
