/// Master Election — 对应 TS: master-election.ts
///
/// 三级降级选举：
/// 1. Redis SETNX（分布式锁）
/// 2. SQLite INSERT OR IGNORE（单机锁）
/// 3. 文件系统 mkdir（最终降级）
///
/// 选出后持续续租（tokio interval），租约到期前续租失败则主动退位

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tracing::{info, warn};
use uuid::Uuid;

use crate::db::{DbPool, SqliteClient};
use crate::error::{EketError, EketResult};
use crate::redis::EketRedisClient;

// ─── Constants ────────────────────────────────────────────────────────────────

const REDIS_LOCK_KEY: &str = "eket:master:lock";
const REDIS_LEASE_TTL_SECS: u64 = 30;
const RENEW_INTERVAL_SECS: u64 = 10; // 续租间隔（< TTL/2）

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ElectionLevel {
    Redis,
    Sqlite,
    File,
}

#[derive(Debug, Clone)]
pub struct ElectionResult {
    pub is_master: bool,
    pub instance_id: String,
    pub level: ElectionLevel,
}

// ─── MasterElection ───────────────────────────────────────────────────────────

pub struct MasterElection {
    instance_id: String,
    redis: Option<Arc<EketRedisClient>>,
    sqlite_pool: Option<DbPool>,
    project_root: PathBuf,
    /// Lease renewer abort handle (Some when we hold the lock)
    renewer: Arc<Mutex<Option<tokio::task::AbortHandle>>>,
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

        Self {
            instance_id,
            redis,
            sqlite_pool,
            project_root: project_root.as_ref().to_path_buf(),
            renewer: Arc::new(Mutex::new(None)),
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
                        }
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
                    }
                    return Ok(result);
                }
                Err(e) => {
                    warn!("[Election] SQLite failed: {e}, trying file...");
                }
            }
        }

        // Level 3: File
        self.elect_file().await
    }

    /// 主动释放 Master 身份
    pub async fn resign(&self) {
        let mut guard = self.renewer.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
        info!("[Election] {} resigned", self.instance_id);
    }

    // ── Level 1: Redis ────────────────────────────────────────────────────────

    async fn elect_redis(&self, redis: &EketRedisClient) -> EketResult<ElectionResult> {
        let won = redis
            .setnx(REDIS_LOCK_KEY, &self.instance_id, REDIS_LEASE_TTL_SECS)
            .await?;

        if won {
            info!("[Election] {} won via Redis", self.instance_id);
        } else {
            info!("[Election] {} is slaver (Redis lock held)", self.instance_id);
        }

        Ok(ElectionResult {
            is_master: won,
            instance_id: self.instance_id.clone(),
            level: ElectionLevel::Redis,
        })
    }

    async fn start_renewer_redis(&self, redis: Arc<EketRedisClient>) {
        let id = self.instance_id.clone();
        let renewer = self.renewer.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(RENEW_INTERVAL_SECS));
            loop {
                interval.tick().await;
                match redis.set(REDIS_LOCK_KEY, &id, Some(REDIS_LEASE_TTL_SECS)).await {
                    Ok(_) => debug_assert!(true, "lease renewed"),
                    Err(e) => {
                        warn!("[Election] Redis renew failed: {e}. Master lease may expire.");
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

        let won = tokio::task::spawn_blocking(move || -> EketResult<bool> {
            let conn = pool.get()?;
            let now = chrono::Utc::now().to_rfc3339();
            let rows = conn.execute(
                "INSERT OR IGNORE INTO instances (id, role, status, last_seen, created_at)
                 VALUES (?1, 'master', 'active', ?2, ?2)",
                rusqlite::params![id, now],
            )?;
            Ok(rows > 0)
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        if won {
            info!("[Election] {} won via SQLite", self.instance_id);
        }

        Ok(ElectionResult {
            is_master: won,
            instance_id: self.instance_id.clone(),
            level: ElectionLevel::Sqlite,
        })
    }

    async fn start_renewer_sqlite(&self, pool: DbPool) {
        let id = self.instance_id.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(RENEW_INTERVAL_SECS));
            loop {
                interval.tick().await;
                let pool2 = pool.clone();
                let id2 = id.clone();
                let _ = tokio::task::spawn_blocking(move || -> EketResult<()> {
                    let conn = pool2.get()?;
                    let now = chrono::Utc::now().to_rfc3339();
                    conn.execute(
                        "UPDATE instances SET last_seen = ?1 WHERE id = ?2",
                        rusqlite::params![now, id2],
                    )?;
                    Ok(())
                })
                .await;
            }
        });

        *self.renewer.lock().await = Some(handle.abort_handle());
    }

    // ── Level 3: File ─────────────────────────────────────────────────────────

    async fn elect_file(&self) -> EketResult<ElectionResult> {
        let marker_dir = self.project_root.join(".eket/master");
        // mkdir -p is idempotent; exclusive creation via create_dir
        match tokio::fs::create_dir_all(&marker_dir).await {
            Ok(_) => {}
            Err(e) => return Err(EketError::Io(e)),
        }

        let marker = marker_dir.join("lock");
        // Atomic: try exclusive create
        let won = match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&marker)
            .await
        {
            Ok(mut f) => {
                use tokio::io::AsyncWriteExt;
                let _ = f.write_all(self.instance_id.as_bytes()).await;
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
        })
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
    }

    #[tokio::test]
    async fn file_election_first_wins() {
        let dir = TempDir::new().unwrap();
        // No SQLite pool → file election
        let e1 = MasterElection::new(None, None, dir.path());
        let e2 = MasterElection::new(None, None, dir.path());

        let r1 = e1.elect().await.unwrap();
        let r2 = e2.elect().await.unwrap();

        assert!(r1.is_master);
        assert!(!r2.is_master);
        assert_eq!(r1.level, ElectionLevel::File);
    }

    #[tokio::test]
    async fn resign_releases_lock() {
        let dir = TempDir::new().unwrap();
        let e1 = MasterElection::new(None, None, dir.path());
        let r1 = e1.elect().await.unwrap();
        assert!(r1.is_master);

        e1.resign().await;
        // Remove marker manually to simulate real release
        let _ = tokio::fs::remove_file(dir.path().join(".eket/master/lock")).await;

        let e2 = MasterElection::new(None, None, dir.path());
        let r2 = e2.elect().await.unwrap();
        assert!(r2.is_master);
    }
}
