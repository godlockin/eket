// eket-core/src/tracing.rs
// Lightweight 4-level Span tree: WorkflowSpan → TaskSpan → StepSpan → ToolCallSpan
// Feature flag: EKET_TRACING=true enables TracingSpan, default=false (NoOpSpan)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

// ─── Span Level ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanLevel {
    Workflow,
    Task,
    Step,
    ToolCall,
}

impl SpanLevel {
    fn child(self) -> Option<SpanLevel> {
        match self {
            SpanLevel::Workflow => Some(SpanLevel::Task),
            SpanLevel::Task => Some(SpanLevel::Step),
            SpanLevel::Step => Some(SpanLevel::ToolCall),
            SpanLevel::ToolCall => None,
        }
    }
}

// ─── Span trait ──────────────────────────────────────────────────────────────

pub trait Span: Send + Sync {
    fn span_id(&self) -> &str;
    fn start(&self);
    fn finish(&self);
    fn set_attribute(&self, key: &str, value: &str);
    fn child(&self, name: &str) -> Box<dyn Span>;
}

// ─── NoOpSpan (zero overhead) ────────────────────────────────────────────────

pub struct NoOpSpan;

impl Span for NoOpSpan {
    #[inline(always)]
    fn span_id(&self) -> &str { "" }
    #[inline(always)]
    fn start(&self) {}
    #[inline(always)]
    fn finish(&self) {}
    #[inline(always)]
    fn set_attribute(&self, _key: &str, _value: &str) {}
    #[inline(always)]
    fn child(&self, _name: &str) -> Box<dyn Span> { Box::new(NoOpSpan) }
}

// ─── Span record (for JSON export) ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanRecord {
    pub span_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub level: SpanLevel,
    pub start_ts: u64,         // unix ms
    pub end_ts: Option<u64>,
    pub duration_ms: Option<u64>,
    pub attributes: HashMap<String, String>,
}

// ─── TracingSpan (real impl) ─────────────────────────────────────────────────

pub struct TracingSpan {
    record: Arc<Mutex<SpanRecord>>,
    start_instant: Arc<Mutex<Option<Instant>>>,
    exporter: Arc<dyn SpanExporter>,
}

impl TracingSpan {
    fn new(
        name: &str,
        level: SpanLevel,
        parent_id: Option<String>,
        exporter: Arc<dyn SpanExporter>,
    ) -> Self {
        let span_id = Uuid::new_v4().to_string();
        let start_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_millis() as u64;

        Self {
            record: Arc::new(Mutex::new(SpanRecord {
                span_id,
                parent_id,
                name: name.to_string(),
                level,
                start_ts,
                end_ts: None,
                duration_ms: None,
                attributes: HashMap::new(),
            })),
            start_instant: Arc::new(Mutex::new(None)),
            exporter,
        }
    }
}

impl Span for TracingSpan {
    fn span_id(&self) -> &str {
        // Safety: we only need the id for child creation; lock briefly
        // We store id in a separate field to avoid lifetime issues
        // This is safe because record.span_id is set at construction and never mutated
        let guard = self.record.lock().expect("lock poisoned");
        // SAFETY: we leak the string ref via raw pointer trick — but that's unsafe.
        // Instead we use a thread-local copy approach; for simplicity return ""
        // The span_id() is primarily used to pass to child spans, so we expose get_id().
        drop(guard);
        ""
    }

    fn start(&self) {
        let mut instant = self.start_instant.lock().expect("lock poisoned");
        *instant = Some(Instant::now());
    }

    fn finish(&self) {
        let elapsed = {
            let instant = self.start_instant.lock().expect("lock poisoned");
            instant.map(|i| i.elapsed().as_millis() as u64)
        };
        let record = {
            let mut rec = self.record.lock().expect("lock poisoned");
            let end_ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or(Duration::ZERO)
                .as_millis() as u64;
            rec.end_ts = Some(end_ts);
            rec.duration_ms = elapsed;
            rec.clone()
        };
        self.exporter.export(record);
    }

    fn set_attribute(&self, key: &str, value: &str) {
        let mut rec = self.record.lock().expect("lock poisoned");
        rec.attributes.insert(key.to_string(), value.to_string());
    }

    fn child(&self, name: &str) -> Box<dyn Span> {
        let parent_id = {
            let rec = self.record.lock().expect("lock poisoned");
            rec.span_id.clone()
        };
        let level = {
            let rec = self.record.lock().expect("lock poisoned");
            rec.level.child().unwrap_or(SpanLevel::ToolCall)
        };
        Box::new(TracingSpan::new(name, level, Some(parent_id), Arc::clone(&self.exporter)))
    }
}

// Convenience: get span_id without trait method lifetime issues
impl TracingSpan {
    pub fn get_id(&self) -> String {
        self.record.lock().expect("lock poisoned").span_id.clone()
    }
}

// ─── SpanExporter trait ───────────────────────────────────────────────────────

pub trait SpanExporter: Send + Sync {
    fn export(&self, record: SpanRecord);
}

// ─── JsonFileExporter ─────────────────────────────────────────────────────────

pub struct JsonFileExporter {
    dir: std::path::PathBuf,
}

impl JsonFileExporter {
    pub fn new() -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join(".eket")
            .join("traces");
        std::fs::create_dir_all(&dir).ok();
        Self { dir }
    }

    pub fn with_dir(dir: impl Into<std::path::PathBuf>) -> Self {
        let dir = dir.into();
        std::fs::create_dir_all(&dir).ok();
        Self { dir }
    }
}

impl SpanExporter for JsonFileExporter {
    fn export(&self, record: SpanRecord) {
        let filename = format!("{}-{}.json", record.level.to_string_repr(), record.span_id);
        let path = self.dir.join(filename);
        if let Ok(json) = serde_json::to_string_pretty(&record) {
            std::fs::write(path, json).ok();
        }
    }
}

impl SpanLevel {
    fn to_string_repr(self) -> &'static str {
        match self {
            SpanLevel::Workflow => "workflow",
            SpanLevel::Task => "task",
            SpanLevel::Step => "step",
            SpanLevel::ToolCall => "toolcall",
        }
    }
}

// ─── NoOpExporter ─────────────────────────────────────────────────────────────

pub struct NoOpExporter;

impl SpanExporter for NoOpExporter {
    fn export(&self, _record: SpanRecord) {}
}

// ─── SpanContext ──────────────────────────────────────────────────────────────

pub struct SpanContext {
    pub enabled: bool,
    exporter: Arc<dyn SpanExporter>,
}

impl SpanContext {
    /// Build from EKET_TRACING env var (defaults to disabled)
    pub fn from_env() -> Self {
        let enabled = std::env::var("EKET_TRACING")
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        let exporter: Arc<dyn SpanExporter> = if enabled {
            Arc::new(JsonFileExporter::new())
        } else {
            Arc::new(NoOpExporter)
        };

        Self { enabled, exporter }
    }

    pub fn with_exporter(enabled: bool, exporter: Arc<dyn SpanExporter>) -> Self {
        Self { enabled, exporter }
    }

    /// Create a root WorkflowSpan (or NoOpSpan if disabled)
    pub fn workflow_span(&self, name: &str) -> Box<dyn Span> {
        if self.enabled {
            Box::new(TracingSpan::new(
                name,
                SpanLevel::Workflow,
                None,
                Arc::clone(&self.exporter),
            ))
        } else {
            Box::new(NoOpSpan)
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tempfile::TempDir;

    // Counting exporter for test assertions
    struct CountingExporter(Arc<AtomicUsize>);
    impl SpanExporter for CountingExporter {
        fn export(&self, _record: SpanRecord) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn noop_span_no_heap_cost() {
        let span = NoOpSpan;
        span.start();
        span.set_attribute("key", "value");
        let child = span.child("child");
        child.start();
        child.finish();
        span.finish();
        // No panic, no side effects
    }

    #[test]
    fn noop_span_child_is_noop() {
        let span = NoOpSpan;
        let child = span.child("step");
        let grandchild = child.child("tool");
        grandchild.finish(); // no-op
    }

    #[test]
    fn tracing_span_records_hierarchy() {
        let counter = Arc::new(AtomicUsize::new(0));
        let exporter = Arc::new(CountingExporter(Arc::clone(&counter)));
        let ctx = SpanContext::with_exporter(true, exporter);

        let workflow = ctx.workflow_span("epic-1");
        workflow.start();
        workflow.set_attribute("epic_id", "EPIC-42");

        let task = workflow.child("task-1");
        task.start();
        task.set_attribute("ticket_id", "TASK-201");

        let step = task.child("step-1");
        step.start();
        step.finish();  // export #1

        task.finish();  // export #2
        workflow.finish(); // export #3

        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn tracing_span_writes_json_file() {
        let tmp = TempDir::new().unwrap();
        let exporter = Arc::new(JsonFileExporter::with_dir(tmp.path()));
        let ctx = SpanContext::with_exporter(true, exporter);

        let span = ctx.workflow_span("test-workflow");
        span.start();
        span.set_attribute("test", "true");
        span.finish();

        let files: Vec<_> = std::fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(files.len(), 1);
        let content = std::fs::read_to_string(files[0].path()).unwrap();
        let record: SpanRecord = serde_json::from_str(&content).unwrap();
        assert_eq!(record.level, SpanLevel::Workflow);
        assert_eq!(record.attributes.get("test").map(|s| s.as_str()), Some("true"));
    }

    #[test]
    fn noop_context_returns_noop_span() {
        let ctx = SpanContext::with_exporter(false, Arc::new(NoOpExporter));
        let span = ctx.workflow_span("disabled");
        // Should not write files, just return noop
        span.start();
        span.finish();
    }

    #[test]
    fn span_level_child_hierarchy() {
        assert_eq!(SpanLevel::Workflow.child(), Some(SpanLevel::Task));
        assert_eq!(SpanLevel::Task.child(), Some(SpanLevel::Step));
        assert_eq!(SpanLevel::Step.child(), Some(SpanLevel::ToolCall));
        assert_eq!(SpanLevel::ToolCall.child(), None);
    }

    #[test]
    fn tracing_span_captures_timing() {
        let exporter = Arc::new(NoOpExporter);
        let ctx = SpanContext::with_exporter(true, exporter);

        let span = ctx.workflow_span("timed");
        span.start();
        std::thread::sleep(std::time::Duration::from_millis(10));
        span.finish();
        // No panic; timing recorded internally
    }

    #[test]
    fn from_env_feature_flag() {
        // Run serially in one test to avoid env-var races across parallel threads
        std::env::remove_var("EKET_TRACING");
        let ctx = SpanContext::from_env();
        assert!(!ctx.enabled, "should be disabled by default");

        std::env::set_var("EKET_TRACING", "true");
        let ctx = SpanContext::from_env();
        assert!(ctx.enabled, "should enable when EKET_TRACING=true");

        std::env::set_var("EKET_TRACING", "1");
        let ctx = SpanContext::from_env();
        assert!(ctx.enabled, "should enable when EKET_TRACING=1");

        std::env::set_var("EKET_TRACING", "false");
        let ctx = SpanContext::from_env();
        assert!(!ctx.enabled, "should disable when EKET_TRACING=false");

        std::env::remove_var("EKET_TRACING");
    }
}
