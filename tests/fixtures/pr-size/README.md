# pr-size fixtures

| 文件 | 用途 |
|------|------|
| `cases.json` | 4 个 mock-based 测试 case（net_lines + approval → expected exit） |
| `600-approved-pr-body.md` | 含合规 `Approved-Large-PR-By: master-001` trailer 的 PR body 样本 |

不使用真实 diff 文本：脚本只关心净行数与 PR body，用 `--mock-net-lines=N --mock-pr-body=FILE` 注入即可，无需 600+ 行 diff 文件。
