# Retrospectives INBOX

每次 PR merge 到 main 后，`post-merge-broadcast.yml` 会在此目录自动放一个 stub。
Slaver/Master 处理流程：

1. 启动时 `eket-start.sh` 会读最新 3 个 stub，打印到屏幕。
2. ticket 责任人在 24h 内把 stub 升级成完整 retro，移动到 `confluence/memory/retrospectives/<YYYY>/`。
3. 通用经验同步沉淀到 `confluence/memory/RULE-RETENTION-LESSONS.md` 或 `BORROWED-WISDOM.md`。

stub 命名: `<MERGE-TS>-<PR>-<TICKET>.md`
