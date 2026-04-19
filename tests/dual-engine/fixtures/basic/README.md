# dual-engine fixture: basic

This directory is copied to a tmp work dir by `setup_fixture basic`.
`protocol/` is NOT in fixture — framework.sh symlinks the real one in.

Contents:
- `jira/tickets/FEAT-001.md`  — minimal ticket for state transition tests
- `.eket/state/.gitkeep`      — present so `find` picks up the dir
- `shared/message_queue/.gitkeep`
- `inbox/.gitkeep`
- `outbox/review_requests/.gitkeep`
