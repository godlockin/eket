# TASK-182: 修复文件锁resign()不删文件——crash后永久卡死

**状态**: done

**优先级**: P0
**类型**: Bug
**模块**: eket-core / election.rs:293
**来源**: 红队质疑 Linus+JeffDean

## 问题描述

`resign()` 只 abort 了后台 renewer task，**没有删除** `.eket/master/lock` 文件。进程crash后文件永久残留，后续所有实例文件选举失败，集群卡死。

测试 `resign_releases_lock` 手动删除文件才能让第二个实例赢——掩盖了bug。

## 验收标准

- [ ] `resign()` 末尾加 `tokio::fs::remove_file(&self.lock_path).await.ok()`
- [ ] 文件锁内写入 `{instance_id}\n{pid}\n{expires_at}` 三行格式
- [ ] 选举前读取锁文件：若 pid 进程已不存在（`/proc/{pid}` 或 kill(pid, 0)）则强制覆盖
- [ ] 加文件锁 TTL：写入时记录 expires_at（now + 90s），选举前检查是否过期
- [ ] 单元测试：resign后文件不存在；模拟crash（残留文件+进程不存在）后新实例能赢
- [ ] 删除测试中手动删文件的hack
