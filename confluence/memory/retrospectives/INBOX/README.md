# Retrospectives INBOX

每次 PR merge 到 main 后，`post-merge-broadcast.yml` 会把 retro stub 提交到 `retro-inbox` 分支（非保护分支），再开 PR 指向 `retro-inbox`。

## 新流程（TASK-060）

```
PR merge → main
  └→ post-merge-broadcast.yml
       ├→ 生成 stub 到 confluence/memory/retrospectives/INBOX/
       └→ 开 PR: retro/auto-prN → retro-inbox
            └→ auto-merge（retro-inbox 无 required checks，可直接合并）
```

**retro-inbox → main 合并节奏**：每周人工或定时 job 发起一次，把 `retro-inbox` 合入 `main`，保持主干同步。

## 为何改用 retro-inbox？

- `main` 为保护分支，GITHUB_TOKEN bot PR 的 required checks 永远 "expected"，auto-merge 永远失败
- `retro-inbox` 无保护，bot PR 可立即 auto-merge，链路畅通

## Slaver/Master 处理流程

1. 启动时 `eket-start.sh` 读最新 3 个 stub（从 `retro-inbox` 拉取），打印到屏幕。
2. ticket 责任人在 24h 内把 stub 升级成完整 retro，移动到 `confluence/memory/retrospectives/<YYYY>/`。
3. 通用经验同步沉淀到 `confluence/memory/RULE-RETENTION-LESSONS.md` 或 `BORROWED-WISDOM.md`。

stub 命名: `<MERGE-TS>-<PR>-<TICKET>.md`
