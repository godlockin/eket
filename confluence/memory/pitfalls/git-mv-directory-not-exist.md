# git mv 目标目录不存在时报错

**症状**：  
执行 `git mv src/old-path dst/new-path/file.md` 时报错：  
`fatal: destination 'dst/new-path/file.md' is not a directory`  
或文件移动后 git 未追踪

**根因**：  
`git mv` 要求目标目录已存在于工作树。即使目录在 git 历史中存在，  
若本地尚未创建该目录，命令同样失败。

**解法**：  
```bash
# 先创建目录
mkdir -p dst/new-path/
# 再执行 git mv
git mv src/old-path/file.md dst/new-path/file.md
```

或使用 `mv` + `git add/rm` 两步替代：  
```bash
mkdir -p dst/new-path/
mv src/old-path/file.md dst/new-path/
git rm src/old-path/file.md
git add dst/new-path/file.md
```

**来源**：TASK-090（文件迁移任务）
