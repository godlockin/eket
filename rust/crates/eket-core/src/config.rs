use config::{Config as ConfigLib, Environment, File};
use serde::Deserialize;

/// 对应 TS: AppConfig / app-config.ts
#[derive(Debug, Deserialize, Clone)]
pub struct EketConfig {
    pub redis: RedisConfig,
    pub sqlite: SqliteConfig,
    pub log_level: String,
    pub instance_id: Option<String>,
    pub api_port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub db: u8,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SqliteConfig {
    pub path: String,
}

impl Default for EketConfig {
    fn default() -> Self {
        Self {
            redis: RedisConfig {
                host: "localhost".into(),
                port: 6379,
                password: None,
                db: 0,
            },
            sqlite: SqliteConfig {
                path: dirs::home_dir()
                    .map(|h| h.join(".eket/data/sqlite/eket.db").to_string_lossy().into_owned())
                    .unwrap_or_else(|| "~/.eket/data/sqlite/eket.db".to_string()),
            },
            log_level: "info".into(),
            instance_id: None,
            api_port: 9877,
        }
    }
}

impl EketConfig {
    /// Load config from env vars (EKET_*) with sensible defaults.
    /// 对应 TS: loadConfig() in app-config.ts
    pub fn load() -> crate::EketResult<Self> {
        let cfg = ConfigLib::builder()
            // Defaults
            .set_default("redis.host", "localhost")?
            .set_default("redis.port", 6379)?
            .set_default("redis.db", 0)?
            .set_default("sqlite.path",
                dirs::home_dir()
                    .map(|h| h.join(".eket/data/sqlite/eket.db").to_string_lossy().into_owned())
                    .unwrap_or_else(|| "~/.eket/data/sqlite/eket.db".to_string())
            )?
            .set_default("log_level", "info")?
            .set_default("api_port", 9877)?
            // Optional file
            .add_source(File::with_name(".eket/config/eket").required(false))
            // Env overrides: EKET_REDIS_HOST, EKET_LOG_LEVEL, etc.
            .add_source(
                Environment::with_prefix("EKET")
                    .separator("_")
                    .try_parsing(true),
            )
            .build()?;

        Ok(cfg.try_deserialize()?)
    }
}
