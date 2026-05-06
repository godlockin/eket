/// Master Election — 对应 TS: master-election.ts
///
/// 三级降级选举：
/// 1. Redis SETNX（分布式锁）
/// 2. SQLite INSERT OR IGNORE（单机锁）
/// 3. 文件系统 mkdir（最终降级）
///
/// 选出后持续续租（tokio interval），租约到期前续租失败则主动退位
///
/// TASK-191: 降级后恢复升级
///   - ElectionResult 携带 level + epoch
///   - 赢得 Redis 时 INCR eket:master:epoch
///   - 非 Redis master 每 60s 尝试升级到 Redis
///   - 升级成功广播 MasterChanged 到 eket:master:changed
///
/// TASK-223: SQLite master renewal loop
///   - start_renewer_sqlite 用 oneshot channel 实现 stop 信号
///   - resign() 发送 stop 信号，停止续约 loop
///   - 续约失败时 warn + break（resign）
///
/// TASK-235: pub/sub events
///   - Redis master 当选时 publish {"event":"elected",...} 到 eket:master:changed
///   - resign() 时 publish {"event":"resigned",...}
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

#[cfg(unix)]
use libc;

use tokio::sync::{Mutex, Semaphore};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::{EketError, EketResult};
use crate::pubsub::RedisPubSub;
use crate::redis::EketRedisClient;

/// TASK-181: Lua CAS script for Redis renewal.
/// Only extends TTL if the key's current value matches our instance_id.
/// Returns 1 on success, 0 if lost the lock (another master took over).
const REDIS_RENEW_LUA: &str = r#"
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
else
    return 0
end
"#;

// ─── Constants ────────────────────────────────────────────────────────────────

const REDIS_LOCK_KEY: &str = "eket:master:lock";
const REDIS_EPOCH_KEY: &str = "eket:master:epoch";
const REDIS_LEASE_TTL_SECS: u64 = 30;
const RENEW_INTERVAL_SECS: u64 = 15; // TTL/2 — ensures renewal before expiry
const MAX_RENEW_FAILURES: u32 = 3; // resign after 3 consecutive failures → prevent split brain
/// How often a non-Redis master polls to upgrade to Redis
const UPGRADE_CHECK_INTERVAL_SECS: u64 = 60;
/// Redis pub/sub channel for master-changed notifications
const MASTER_CHANGED_CHANNEL: &str = "eket:master:changed";
/// Cap concurrent spawn_blocking SQLite calls to avoid exhausting the r2d2 pool (max_size=8)
const SQLITE_ELECTION_CONCURRENCY: usize = 4;
/// TASK-182: File lock TTL (seconds). Lock is stale if expired AND the holding PID is dead.
const FILE_LOCK_TTL_SECS: u64 = 90;

/// Global semaphore to throttle concurrent SQLite spawn_blocking election calls
static SQLITE_SEM: std::sync::OnceLock<Arc<Semaphore>> = std::sync::OnceLock::new();

fn sqlite_semaphore() -> Arc<Semaphore> {
    SQLITE_SEM
        .get_or_init(|| Arc::new(Semaphore::new(SQLITE_ELECTION_CONCURRENCY)))
        .clone()
}

// ─── Types ────────────────────────────────────────────────────────────────────

/// Ordered by authority: File < Sqlite < Redis (derived Ord uses declaration order)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ElectionLevel {
    File,
    Sqlite,
    Redis,
}

#[derive(Debug, Clone)]
pub struct ElectionResult {
    pub is_master: bool,
    pub instance_id: String,
    pub level: ElectionLevel,
    /// Monotonically increasing epoch (Redis INCR); 0 when Redis unavailable
    pub epoch: u64,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Update master_lock expires_at for the SQLite master renewal.
/// Extends the lock TTL to prevent expiry while the master is alive.
pub(crate) async fn update_heartbeat(pool: &DbPool, master_id: &str) -> EketResult<()> {
    let pool = pool.clone();
    let id = master_id.to_string();
    if let Ok(permit) = sqlite_semaphore().acquire_owned().await {
        tokio::task::spawn_blocking(move || -> EketResult<()> {
            let _guard = permit;
            let conn = pool.get()?;
            let new_expires = (chrono::Utc::now()
                + chrono::Duration::seconds(REDIS_LEASE_TTL_SECS as i64 * 2))
            .to_rfc3339();
            conn.execute(
                "UPDATE master_lock SET expires_at = ?1 WHERE singleton = 1 AND master_id = ?2",
                rusqlite::params![new_expires, id],
            )?;
            Ok(())
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))?
    } else {
        Err(EketError::Other("SQLite semaphore closed".to_string()))
    }
}

/// TASK-182: Check if PID in lock file is still alive.
/// On Linux/macOS: try `kill(pid, 0)` equivalent via `/proc/{pid}` or signal(0).
/// Returns true if process is alive, false if dead (stale lock).
fn pid_is_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill(pid, 0) — no signal sent; just checks liveness
        let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
        result == 0
    }
    #[cfg(not(unix))]
    {
        // Windows: check process existence via OpenProcess
        // For now, treat as alive (conservative)
        let _ = pid;
        true
    }
}

pub struct MasterElection {
    instance_id: String,
    redis: Option<Arc<EketRedisClient>>,
    sqlite_pool: Option<DbPool>,
    project_root: PathBuf,
    /// Lease renewer abort handle (Some when we hold the lock)
    renewer: Arc<Mutex<Option<tokio::task::AbortHandle>>>,
    /// Upgrade poller handle (non-Redis masters poll for Redis availability)
    upgrade_handle: Arc<Mutex<Option<tokio::task::AbortHandle>>>,
    /// TASK-223: Oneshot sender to stop the SQLite renewal loop on resign
    sqlite_stop_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// TASK-230: Oneshot sender to stop the File renewal loop on resign
    file_stop_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// TASK-235: Optional pub/sub for broadcasting election events (best-effort)
    pubsub: Option<Arc<RedisPubSub>>,
}

impl MasterElection {
    pub fn new(
        redis: Option<Arc<EketRedisClient>>,
        sqlite_pool: Option<DbPool>,
        project_root: impl AsRef<Path>,
    ) -> Self {
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "unknown".to_string());
        let pid = std::process::id();
        let rand = Uuid::new_v4().to_string()[..8].to_string();
        let instance_id = format!("instance_{hostname}_{pid}_{rand}");

        // TASK-235: Build pubsub facade if Redis is configured
        let pubsub = redis.as_ref().map(|r| Arc::new(RedisPubSub::new(r.clone())));

        Self {
            instance_id,
            redis,
            sqlite_pool,
            project_root: project_root.as_ref().to_path_buf(),
            renewer: Arc::new(Mutex::new(None)),
            upgrade_handle: Arc::new(Mutex::new(None)),
            sqlite_stop_tx: Arc::new(Mutex::new(None)),
            file_stop_tx: Arc::new(Mutex::new(None)),
            pubsub,
        }
    }

    pub fn instance_id(&self) -> &str {
        &self.instance_id
    }

    /// 参与选举，返回结果。
    /// 对应 TS: MasterElection.elect()
    pub async fn elect(&self) -> EketResult<ElectionResult> {
        info!("[Election] {} starting...", self.instance_id);

        // Level 1: Redis
        if let Some(redis) = &self.redis {
            if redis.is_available() {
                match self.elect_redis(redis).await {
                    Ok(result) => {
                        if result.is_master {
                            self.start_renewer_redis(redis.clone()).await;
                            return Ok(result);
                        }
                        // Another instance holds Redis lock → this instance is a slaver at Redis level.
                        // Return immediately: Redis is authoritative when available.
                        return Ok(result);
                    }
                    Err(e) => {
                        warn!("[Election] Redis failed: {e}, trying SQLite...");
                    }
                }
            }
        }

        // Level 2: SQLite
        if let Some(pool) = &self.sqlite_pool {
            match self.elect_sqlite(pool).await {
                Ok(result) => {
                    if result.is_master {
                        self.start_renewer_sqlite(pool.clone()).await;
                        // Start upgrade poller to recover to Redis when it comes back
                        self.start_upgrade_poller().await;
                    }
                    return Ok(result);
                }
                Err(e) => {
                    warn!("[Election] SQLite failed: {e}, trying file...");
                }
            }
        }

        // Level 3: File
        let result = self.elect_file().await?;
        if result.is_master {
            self.start_renewer_file().await;
            // Start upgrade poller to recover to Redis/SQLite when available
            self.start_upgrade_poller().await;
        }
        Ok(result)
    }

    /// 主动释放 Master 身份
    pub async fn resign(&self) {
        // Abort upgrade poller first
        let mut ug = self.upgrade_handle.lock().await;
        if let Some(handle) = ug.take() {
            handle.abort();
        }
        drop(ug);

        // TASK-223: Stop SQLite renewal loop via oneshot signal
        let mut stop_guard = self.sqlite_stop_tx.lock().await;
        if let Some(tx) = stop_guard.take() {
            let _ = tx.send(());
        }
        drop(stop_guard);

        // TASK-230: Stop File renewal loop
        let mut file_stop = self.file_stop_tx.lock().await;
        if let Some(tx) = file_stop.take() {
            let _ = tx.send(());
        }
        drop(file_stop);

        let mut guard = self.renewer.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
        drop(guard);

        // Delete the file lock so other instances can win
        let lock_path = self.project_root.join(".eket/state/master.lock");
        tokio::fs::remove_file(&lock_path).await.ok();
        info!("[Election] {} resigned", self.instance_id);

        // TASK-235: Publish resigned event (best-effort, silent on failure)
        if let Some(ps) = &self.pubsub {
            let ts = chrono::Utc::now().to_rfc3339();
            let event = format!(
                r#"{{"event":"resigned","master_id":"{}","timestamp":"{}"}}"#,
                self.instance_id, ts
            );
            let _ = ps.publish(MASTER_CHANGED_CHANNEL, &event).await;
        }
    }

    // ── Level 1: Redis ────────────────────────────────────────────────────────

    async fn elect_redis(&self, redis: &EketRedisClient) -> EketResult<ElectionResult> {
        let won = redis
            .setnx(REDIS_LOCK_KEY, &self.instance_id, REDIS_LEASE_TTL_SECS)
            .await?;

        let epoch = if won {
            info!("[Election] {} won via Redis", self.instance_id);
            // Atomic increment: each new Redis-master gets a unique, increasing epoch.
            // Existing instances see epoch bump → know a new master exists.
            redis.incr(REDIS_EPOCH_KEY).await.unwrap_or(0)
        } else {
            info!("[Election] {} is slaver (Redis lock held)", self.instance_id);
            0
        };

        // TASK-235: Publish elected event (best-effort, silent on failure)
        if won {
            if let Some(ps) = &self.pubsub {
                let ts = chrono::Utc::now().to_rfc3339();
                let event = format!(
                    r#"{{"event":"elected","master_id":"{}","epoch":{},"timestamp":"{}"}}"#,
                    self.instance_id, epoch, ts
                );
                let _ = ps.publish(MASTER_CHANGED_CHANNEL, &event).await;
            }
        }

        Ok(ElectionResult {
            is_master: won,
            instance_id: self.instance_id.clone(),
            level: ElectionLevel::Redis,
            epoch,
        })
    }

    async fn start_renewer_redis(&self, redis: Arc<EketRedisClient>) {
        let id = self.instance_id.clone();
        let renewer = self.renewer.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(RENEW_INTERVAL_SECS));
            let mut consecutive_failures: u32 = 0;
            loop {
                interval.tick().await;
                // TASK-181: Lua CAS — only renew if we still hold the lock
                let result = redis
                    .eval_lua(
                        REDIS_RENEW_LUA,
                        vec![REDIS_LOCK_KEY.to_string()],
                        vec![id.clone(), REDIS_LEASE_TTL_SECS.to_string()],
                    )
                    .await;
                match result {
                    Ok(1) => {
                        consecutive_failures = 0;
                        tracing::debug!("[Election] Redis lease renewed for {id}");
                    }
                    Ok(0) => {
                        // Another master took our lock — resign immediately
                        warn!("[Election] {id} lost Redis lock (CAS mismatch), resigning");
                        let mut guard = renewer.lock().await;
                        guard.take();
                        break;
                    }
                    Ok(n) => {
                        warn!("[Election] Unexpected Lua return {n} for {id}");
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        warn!(
                            "[Election] Redis renew failed ({consecutive_failures}/{MAX_RENEW_FAILURES}): {e}"
                        );
                        if consecutive_failures >= MAX_RENEW_FAILURES {
                            warn!("[Election] {id} resigning: too many renew failures → prevent split brain");
                            let mut guard = renewer.lock().await;
                            guard.take();
                            break;
                        }
                    }
                }
            }
        });

        *self.renewer.lock().await = Some(handle.abort_handle());
    }

    // ── Level 2: SQLite ───────────────────────────────────────────────────────

    async fn elect_sqlite(&self, pool: &DbPool) -> EketResult<ElectionResult> {
        let pool = pool.clone();
        let id = self.instance_id.clone();
        // Acquire semaphore permit to avoid pool exhaustion under high concurrency
        let _permit = sqlite_semaphore()
            .acquire_owned()
            .await
            .map_err(|e| EketError::Other(format!("Semaphore closed: {e}")))?;

        let won = tokio::task::spawn_blocking(move || -> EketResult<bool> {
            let _guard = _permit; // hold permit until spawn_blocking finishes
            let conn = pool.get()?;
            let now = chrono::Utc::now().to_rfc3339();
            // TASK-180: Use master_lock singleton table.
            // CHECK(singleton=1) + INSERT OR IGNORE ensures only one master exists.
            // First INSERT wins (rows=1); all subsequent are ignored (rows=0).
            let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(REDIS_LEASE_TTL_SECS as i64 * 2)).to_rfc3339();
            let rows = conn.execute(
                "INSERT OR IGNORE INTO master_lock (singleton, master_id, acquired_at, expires_at)
                 VALUES (1, ?1, ?2, ?3)",
                rusqlite::params![id, now, expires_at],
            )?;
            Ok(rows > 0)
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        if won {
            info!("[Election] {} won via SQLite (master_lock)", self.instance_id);
        }

        Ok(ElectionResult {
            is_master: won,
            instance_id: self.instance_id.clone(),
            level: ElectionLevel::Sqlite,
            epoch: 0,
        })
    }

    /// TASK-223: SQLite renewal loop with oneshot stop signal + failure resign.
    async fn start_renewer_sqlite(&self, pool: DbPool) {
        let id = self.instance_id.clone();
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

        // Store stop sender so resign() can signal the loop
        *self.sqlite_stop_tx.lock().await = Some(stop_tx);

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(RENEW_INTERVAL_SECS));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        match update_heartbeat(&pool, &id).await {
                            Ok(_) => {
                                debug!("[election] sqlite master heartbeat renewed for {id}");
                            }
                            Err(e) => {
                                warn!("[election] sqlite master renewal failed, resigning: {e}");
                                break;
                            }
                        }
                    }
                    _ = &mut stop_rx => {
                        debug!("[election] sqlite renewal loop stopped by resign signal for {id}");
                        break;
                    }
                }
            }
        });

        *self.renewer.lock().await = Some(handle.abort_handle());
    }

    // ── Level 3: File ─────────────────────────────────────────────────────────

    async fn elect_file(&self) -> EketResult<ElectionResult> {
        let marker_dir = self.project_root.join(".eket/state");
        match tokio::fs::create_dir_all(&marker_dir).await {
            Ok(_) => {}
            Err(e) => return Err(EketError::Io(e)),
        }

        let marker = marker_dir.join("master.lock");
        let pid = std::process::id();
        let expires_at = chrono::Utc::now().timestamp() + FILE_LOCK_TTL_SECS as i64;
        // TASK-182: Lock file content: "{pid}:{instance_id}:{expires_at_unix}"
        let lock_content = format!("{pid}:{instance_id}:{expires_at}", instance_id = self.instance_id);

        // TASK-182: Check for stale lock before attempting exclusive create.
        // If lock file exists but PID is dead or TTL expired → remove it.
        if marker.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&marker).await {
                let mut stale = false;
                let parts: Vec<&str> = content.trim().splitn(3, ':').collect();
                if parts.len() >= 2 {
                    let lock_pid: u32 = parts[0].parse().unwrap_or(0);
                    let lock_expires: i64 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                    let now_unix = chrono::Utc::now().timestamp();
                    if lock_expires > 0 && now_unix > lock_expires {
                        stale = true; // TTL expired
                        warn!("[Election] File lock expired (pid={lock_pid}), removing stale lock");
                    } else if !pid_is_alive(lock_pid) {
                        stale = true; // Process dead
                        warn!("[Election] File lock holder pid={lock_pid} is dead, removing stale lock");
                    }
                }
                if stale {
                    tokio::fs::remove_file(&marker).await.ok();
                }
            }
        }

        // Atomic exclusive create
        let won = match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&marker)
            .await
        {
            Ok(mut f) => {
                use tokio::io::AsyncWriteExt;
                let _ = f.write_all(lock_content.as_bytes()).await;
                true
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => false,
            Err(e) => return Err(EketError::Io(e)),
        };

        if won {
            info!("[Election] {} won via file system", self.instance_id);
        }

        Ok(ElectionResult {
            is_master: won,
            instance_id: self.instance_id.clone(),
            level: ElectionLevel::File,
            epoch: 0,
        })
    }

    /// TASK-230: File-level renewal loop.
    async fn start_renewer_file(&self) {
        let id = self.instance_id.clone();
        let lock_path = self.project_root.join(".eket/state/master.lock");
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

        *self.file_stop_tx.lock().await = Some(stop_tx);

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(RENEW_INTERVAL_SECS));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let pid = std::process::id();
                        let expires = chrono::Utc::now().timestamp() + FILE_LOCK_TTL_SECS as i64;
                        let content = format!("{pid}:{id}:{expires}");
                        if let Err(e) = tokio::fs::write(&lock_path, content.as_bytes()).await {
                            warn!("[election] file master renewal failed: {e}");
                            break;
                        }
                        debug!("[election] file master lock renewed for {id}");
                    }
                    _ = &mut stop_rx => {
                        debug!("[election] file renewal loop stopped for {id}");
                        break;
                    }
                }
            }
        });

        *self.renewer.lock().await = Some(handle.abort_handle());
    }

    // ── Upgrade Polling ───────────────────────────────────────────────────────

    /// Start background poller: when Redis comes back, attempt to upgrade from SQLite/File.
    /// On success: INCR epoch, publish MasterChanged to eket:master:changed, abort old renewer.
    ///
    /// Called by elect() after winning a non-Redis (SQLite or File) election.
    pub async fn start_upgrade_poller(&self) {
        let redis = match self.redis.clone() {
            Some(r) => r,
            None => return, // no Redis configured → nothing to upgrade to
        };

        let id = self.instance_id.clone();
        let renewer = self.renewer.clone();
        let upgrade_handle_ref = self.upgrade_handle.clone();

        let handle = tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_secs(UPGRADE_CHECK_INTERVAL_SECS));
            loop {
                interval.tick().await;

                if !redis.is_available() {
                    continue;
                }

                // Attempt Redis election
                let won = redis
                    .setnx(REDIS_LOCK_KEY, &id, REDIS_LEASE_TTL_SECS)
                    .await
                    .unwrap_or(false);

                if won {
                    let epoch = redis.incr(REDIS_EPOCH_KEY).await.unwrap_or(0);
                    info!(
                        "[Election] {} upgraded to Redis (epoch={epoch}), broadcasting MasterChanged",
                        id
                    );

                    // Broadcast so other instances (still on lower level) notice a new Redis master
                    let event =
                        format!(r#"{{"instance_id":"{id}","level":"Redis","epoch":{epoch}}}"#);
                    let _ = redis.publish(MASTER_CHANGED_CHANNEL, &event).await;

                    // Abort the old SQLite/File renewer — the upgraded instance's caller
                    // should start a Redis renewer (e.g. via start_renewer_redis).
                    let mut rn = renewer.lock().await;
                    if let Some(h) = rn.take() {
                        h.abort();
                    }

                    // Abort self (upgrade poller no longer needed)
                    let mut ug = upgrade_handle_ref.lock().await;
                    ug.take();
                    break;
                }
            }
        });

        *self.upgrade_handle.lock().await = Some(handle.abort_handle());
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::create_pool;
    use tempfile::TempDir;

    fn make_election(dir: &Path) -> MasterElection {
        let pool = create_pool(":memory:").unwrap();
        MasterElection::new(None, Some(pool), dir)
    }

    #[tokio::test]
    async fn sqlite_first_instance_wins() {
        let dir = TempDir::new().unwrap();
        let e1 = make_election(dir.path());
        let result = e1.elect().await.unwrap();
        assert!(result.is_master);
        assert_eq!(result.level, ElectionLevel::Sqlite);
        assert_eq!(result.epoch, 0);
    }

    #[tokio::test]
    async fn file_election_first_wins() {
        let dir = TempDir::new().unwrap();
        let e1 = MasterElection::new(None, None, dir.path());
        let e2 = MasterElection::new(None, None, dir.path());

        let r1 = e1.elect().await.unwrap();
        let r2 = e2.elect().await.unwrap();

        assert!(r1.is_master);
        assert!(!r2.is_master);
        assert_eq!(r1.level, ElectionLevel::File);
        assert_eq!(r1.epoch, 0);
    }

    #[tokio::test]
    async fn resign_releases_lock() {
        let dir = TempDir::new().unwrap();
        let e1 = MasterElection::new(None, None, dir.path());
        let r1 = e1.elect().await.unwrap();
        assert!(r1.is_master);

        e1.resign().await;

        let e2 = MasterElection::new(None, None, dir.path());
        let r2 = e2.elect().await.unwrap();
        assert!(r2.is_master);
    }

    #[tokio::test]
    async fn only_one_master_concurrent_file() {
        let dir = TempDir::new().unwrap();
        let mut handles = vec![];
        for _ in 0..10 {
            let p = dir.path().to_path_buf();
            handles.push(tokio::spawn(async move {
                let e = MasterElection::new(None, None, p);
                e.elect().await.unwrap()
            }));
        }
        let results: Vec<_> = futures::future::join_all(handles)
            .await
            .into_iter()
            .map(|r| r.unwrap())
            .collect();
        let masters: Vec<_> = results.iter().filter(|r| r.is_master).collect();
        assert_eq!(masters.len(), 1, "exactly one master expected");
    }

    #[tokio::test]
    async fn sqlite_election_uses_unique_role_key() {
        let dir = TempDir::new().unwrap();
        let e1 = make_election(dir.path());
        let r1 = e1.elect().await.unwrap();
        assert!(r1.is_master);
        assert_eq!(r1.level, ElectionLevel::Sqlite);

        let pool2 = create_pool(":memory:").unwrap();
        let e2 = MasterElection::new(None, Some(pool2), dir.path());
        let r2 = e2.elect().await.unwrap();
        assert_eq!(r2.level, ElectionLevel::Sqlite);
    }

    #[tokio::test]
    async fn instance_id_is_unique() {
        let dir = TempDir::new().unwrap();
        let e1 = make_election(dir.path());
        let e2 = make_election(dir.path());
        assert_ne!(e1.instance_id(), e2.instance_id());
    }

    #[tokio::test]
    async fn election_level_ordering() {
        assert!(ElectionLevel::File < ElectionLevel::Sqlite);
        assert!(ElectionLevel::Sqlite < ElectionLevel::Redis);
        assert!(ElectionLevel::File < ElectionLevel::Redis);
    }

    #[tokio::test]
    async fn file_result_has_zero_epoch() {
        let dir = TempDir::new().unwrap();
        let e = MasterElection::new(None, None, dir.path());
        let r = e.elect().await.unwrap();
        assert_eq!(r.epoch, 0);
    }

    #[tokio::test]
    async fn sqlite_master_renewal() {
        let dir = TempDir::new().unwrap();
        let pool = create_pool(":memory:").unwrap();
        let e = MasterElection::new(None, Some(pool.clone()), dir.path());
        let result = e.elect().await.unwrap();
        assert!(result.is_master);

        let initial_expires: String = {
            let conn = pool.get().unwrap();
            conn.query_row(
                "SELECT expires_at FROM master_lock WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };

        tokio::time::sleep(Duration::from_millis(10)).await;
        update_heartbeat(&pool, e.instance_id()).await.unwrap();

        let updated_expires: String = {
            let conn = pool.get().unwrap();
            conn.query_row(
                "SELECT expires_at FROM master_lock WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };

        assert_ne!(
            initial_expires, updated_expires,
            "heartbeat should update expires_at in master_lock"
        );

        e.resign().await;
    }

    #[tokio::test]
    async fn sqlite_master_resign_stops_renewal() {
        let dir = TempDir::new().unwrap();
        let pool = create_pool(":memory:").unwrap();
        let e = MasterElection::new(None, Some(pool.clone()), dir.path());
        let result = e.elect().await.unwrap();
        assert!(result.is_master);

        assert!(e.renewer.lock().await.is_some());
        assert!(e.sqlite_stop_tx.lock().await.is_some());

        e.resign().await;

        assert!(e.renewer.lock().await.is_none());
        assert!(e.sqlite_stop_tx.lock().await.is_none());
    }

    /// TASK-235: resign() with no Redis pubsub configured should not panic
    #[tokio::test]
    async fn resign_without_redis_no_panic() {
        let dir = TempDir::new().unwrap();
        let e = MasterElection::new(None, None, dir.path());
        let r = e.elect().await.unwrap();
        assert!(r.is_master);
        e.resign().await; // pubsub is None — must not panic
    }
}
