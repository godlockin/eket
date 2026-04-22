/// Agent Pool — 对应 TS: agent-pool.ts
///
/// 管理可用 Agent 实例资源池
/// - 按角色维护 Agent 列表
/// - 负载均衡（轮询 + 最小负载）
/// - 健康检查 + 自动剔除离线 Agent（heartbeat TTL）
/// - tokio actor 模式：所有状态封装在 Arc<RwLock<>>

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Idle,
    Busy,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstance {
    pub id: String,
    pub role: String,
    pub skills: Vec<String>,
    pub status: AgentStatus,
    /// Current number of active tasks
    pub current_load: u32,
    /// Maximum concurrent tasks allowed
    pub max_load: u32,
    #[serde(skip)]
    pub last_heartbeat: Option<Instant>,
}

impl AgentInstance {
    pub fn available_slots(&self) -> u32 {
        self.max_load.saturating_sub(self.current_load)
    }

    pub fn utilization(&self) -> f32 {
        if self.max_load == 0 { 1.0 } else { self.current_load as f32 / self.max_load as f32 }
    }
}

#[derive(Debug, Clone)]
pub struct TaskAssignmentResult {
    pub success: bool,
    pub agent_id: Option<String>,
    pub agent_role: Option<String>,
    pub error: Option<String>,
}

impl TaskAssignmentResult {
    pub fn ok(agent_id: String, role: String) -> Self {
        Self { success: true, agent_id: Some(agent_id), agent_role: Some(role), error: None }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self { success: false, agent_id: None, agent_role: None, error: Some(msg.into()) }
    }
}

// ─── AgentPool ────────────────────────────────────────────────────────────────

/// Heartbeat TTL — agents not updated within this window are marked offline
const HEARTBEAT_TTL: Duration = Duration::from_secs(60);

/// Per-role round-robin index
type RrIndex = HashMap<String, usize>;

pub struct AgentPool {
    agents: Arc<RwLock<HashMap<String, AgentInstance>>>,
    #[allow(dead_code)]
    rr_index: Arc<RwLock<RrIndex>>,
    /// Health check interval
    health_interval: Duration,
}

impl AgentPool {
    pub fn new() -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            rr_index: Arc::new(RwLock::new(HashMap::new())),
            health_interval: Duration::from_secs(30),
        }
    }

    /// Register or update an agent
    pub async fn register(&self, agent: AgentInstance) {
        let id = agent.id.clone();
        let role = agent.role.clone();
        self.agents.write().await.insert(id.clone(), agent);
        info!("[AgentPool] registered agent {} (role={})", id, role);
    }

    /// Update heartbeat for an agent (called periodically by each slaver)
    pub async fn heartbeat(&self, agent_id: &str) {
        let mut agents = self.agents.write().await;
        if let Some(a) = agents.get_mut(agent_id) {
            a.last_heartbeat = Some(Instant::now());
            if a.status == AgentStatus::Offline {
                a.status = AgentStatus::Idle;
                info!("[AgentPool] {} came back online", agent_id);
            }
        }
    }

    /// Update agent load when it starts/completes a task
    pub async fn update_load(&self, agent_id: &str, delta: i32) {
        let mut agents = self.agents.write().await;
        if let Some(a) = agents.get_mut(agent_id) {
            let new_load = (a.current_load as i32 + delta).max(0) as u32;
            a.current_load = new_load.min(a.max_load);
            a.status = if a.current_load == 0 { AgentStatus::Idle } else { AgentStatus::Busy };
        }
    }

    /// Assign a task to the best available agent for a given role.
    /// Strategy: prefer lowest utilization, then round-robin as tiebreak.
    pub async fn assign_task(&self, role: &str, required_skills: &[&str]) -> TaskAssignmentResult {
        let agents = self.agents.read().await;

        let mut candidates: Vec<&AgentInstance> = agents
            .values()
            .filter(|a| {
                a.role == role
                    && a.status != AgentStatus::Offline
                    && a.available_slots() > 0
                    && required_skills.iter().all(|s| {
                        let s_lower = s.to_lowercase();
                        a.skills.iter().any(|sk| sk.to_lowercase() == s_lower)
                    })
            })
            .collect();

        if candidates.is_empty() {
            return TaskAssignmentResult::err(format!(
                "No available agents for role={role} skills={required_skills:?}"
            ));
        }

        // Sort by utilization ASC, then ID for stability
        candidates.sort_by(|a, b| {
            a.utilization()
                .partial_cmp(&b.utilization())
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.id.cmp(&b.id))
        });

        let winner = candidates[0];
        debug!("[AgentPool] assigned role={role} to {}", winner.id);
        TaskAssignmentResult::ok(winner.id.clone(), winner.role.clone())
    }

    /// Run health check: mark agents with stale heartbeats as offline
    pub async fn health_check(&self) {
        let mut agents = self.agents.write().await;
        for agent in agents.values_mut() {
            if let Some(last) = agent.last_heartbeat {
                if last.elapsed() > HEARTBEAT_TTL && agent.status != AgentStatus::Offline {
                    agent.status = AgentStatus::Offline;
                    warn!("[AgentPool] {} marked offline (heartbeat stale)", agent.id);
                }
            }
        }
    }

    /// Spawn background health checker task
    pub fn start_health_checker(self: &Arc<Self>) {
        let pool = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(pool.health_interval);
            loop {
                interval.tick().await;
                pool.health_check().await;
            }
        });
    }

    /// List all agents (snapshot)
    pub async fn list(&self) -> Vec<AgentInstance> {
        self.agents.read().await.values().cloned().collect()
    }

    /// Count agents by status
    pub async fn stats(&self) -> (usize, usize, usize) {
        let agents = self.agents.read().await;
        let idle = agents.values().filter(|a| a.status == AgentStatus::Idle).count();
        let busy = agents.values().filter(|a| a.status == AgentStatus::Busy).count();
        let offline = agents.values().filter(|a| a.status == AgentStatus::Offline).count();
        (idle, busy, offline)
    }
}

impl Default for AgentPool {
    fn default() -> Self { Self::new() }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_agent(id: &str, role: &str, load: u32, max: u32) -> AgentInstance {
        AgentInstance {
            id: id.to_string(),
            role: role.to_string(),
            skills: vec!["rust".to_string()],
            status: AgentStatus::Idle,
            current_load: load,
            max_load: max,
            last_heartbeat: Some(Instant::now()),
        }
    }

    #[tokio::test]
    async fn assign_to_least_loaded() {
        let pool = AgentPool::new();
        pool.register(make_agent("a1", "backend", 3, 5)).await; // 60%
        pool.register(make_agent("a2", "backend", 1, 5)).await; // 20% ← winner

        let result = pool.assign_task("backend", &[]).await;
        assert!(result.success);
        assert_eq!(result.agent_id.as_deref(), Some("a2"));
    }

    #[tokio::test]
    async fn no_agents_returns_error() {
        let pool = AgentPool::new();
        let result = pool.assign_task("frontend", &[]).await;
        assert!(!result.success);
    }

    #[tokio::test]
    async fn offline_agents_excluded() {
        let pool = AgentPool::new();
        let mut agent = make_agent("a1", "backend", 0, 5);
        agent.status = AgentStatus::Offline;
        pool.register(agent).await;

        let result = pool.assign_task("backend", &[]).await;
        assert!(!result.success);
    }

    #[tokio::test]
    async fn full_agents_excluded() {
        let pool = AgentPool::new();
        pool.register(make_agent("a1", "backend", 5, 5)).await; // 100% — no slots

        let result = pool.assign_task("backend", &[]).await;
        assert!(!result.success);
    }

    #[tokio::test]
    async fn skill_filter_works() {
        let pool = AgentPool::new();
        let mut agent_no_skill = make_agent("a1", "backend", 0, 5);
        agent_no_skill.skills = vec!["python".to_string()];
        pool.register(agent_no_skill).await;

        let mut agent_with_skill = make_agent("a2", "backend", 0, 5);
        agent_with_skill.skills = vec!["rust".to_string()];
        pool.register(agent_with_skill).await;

        let result = pool.assign_task("backend", &["rust"]).await;
        assert!(result.success);
        assert_eq!(result.agent_id.as_deref(), Some("a2"));
    }

    #[tokio::test]
    async fn heartbeat_revives_offline_agent() {
        let pool = AgentPool::new();
        let mut agent = make_agent("a1", "backend", 0, 5);
        agent.status = AgentStatus::Offline;
        agent.last_heartbeat = None;
        pool.register(agent).await;

        pool.heartbeat("a1").await;

        let agents = pool.list().await;
        assert_eq!(agents[0].status, AgentStatus::Idle);
    }

    #[tokio::test]
    async fn health_check_marks_stale_offline() {
        let pool = AgentPool::new();
        let mut agent = make_agent("a1", "backend", 0, 5);
        // Set heartbeat way in the past
        agent.last_heartbeat = Some(Instant::now() - Duration::from_secs(120));
        pool.register(agent).await;

        pool.health_check().await;

        let agents = pool.list().await;
        assert_eq!(agents[0].status, AgentStatus::Offline);
    }

    #[tokio::test]
    async fn update_load_tracks_correctly() {
        let pool = AgentPool::new();
        pool.register(make_agent("a1", "backend", 0, 5)).await;

        pool.update_load("a1", 2).await;
        let agents = pool.list().await;
        assert_eq!(agents[0].current_load, 2);
        assert_eq!(agents[0].status, AgentStatus::Busy);

        pool.update_load("a1", -2).await;
        let agents = pool.list().await;
        assert_eq!(agents[0].current_load, 0);
        assert_eq!(agents[0].status, AgentStatus::Idle);
    }
}
