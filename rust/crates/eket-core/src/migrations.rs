use rusqlite::{params, Connection, Result};
use tracing::info;

pub struct MigrationRunner<'a> {
    conn: &'a Connection,
}

impl<'a> MigrationRunner<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn run(&self) -> Result<()> {
        self.ensure_schema_version_table()?;
        let current = self.current_version()?;
        for migration in MIGRATIONS.iter().filter(|m| m.version > current) {
            self.apply(migration)?;
            info!(
                "Applied migration v{}: {}",
                migration.version, migration.name
            );
        }
        Ok(())
    }

    /// Dry-run: return pending migration (version, name) without applying them.
    pub fn pending(&self) -> Result<Vec<(i64, &'static str)>> {
        self.ensure_schema_version_table()?;
        let current = self.current_version()?;
        Ok(MIGRATIONS
            .iter()
            .filter(|m| m.version > current)
            .map(|m| (m.version, m.name))
            .collect())
    }

    pub fn current_version(&self) -> Result<i64> {
        let version: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }

    /// Returns list of (version, name) for all applied migrations
    pub fn status(&self) -> Result<Vec<(i64, String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT version, name, applied_at FROM schema_version ORDER BY version")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn ensure_schema_version_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version    INTEGER PRIMARY KEY,
                name       TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
    }

    fn apply(&self, m: &Migration) -> Result<()> {
        self.conn.execute_batch(m.up)?;
        self.conn.execute(
            "INSERT INTO schema_version (version, name) VALUES (?1, ?2)",
            params![m.version, m.name],
        )?;
        Ok(())
    }
}

struct Migration {
    version: i64,
    name: &'static str,
    up: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        up: include_str!("../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "task_source_timestamps",
        up: include_str!("../migrations/0002_task_source_timestamps.sql"),
    },
];
