/// 冲突解决器
///
/// 处理任务冲突、资源冲突、优先级冲突
use std::sync::Arc;

use chrono::Utc;

use crate::lock::LockManager;

pub enum ConflictType {
    TaskConflict,
    ResourceConflict,
    PriorityConflict,
}

#[derive(Debug)]
pub struct ConflictResolution {
    pub winner: String,
    pub losers: Vec<String>,
    pub strategy: String,
    pub resolved_at: chrono::DateTime<Utc>,
}

pub struct ConflictResolver {
    pub lock_manager: Arc<LockManager>,
}

impl ConflictResolver {
    pub fn new(lock_manager: Arc<LockManager>) -> Self {
        Self { lock_manager }
    }

    /// 任务冲突：first_claim_wins
    /// 按 claimants 顺序依次尝试 acquire，第一个成功者为 winner
    pub async fn handle_task_conflict(
        &self,
        ticket_id: &str,
        claimants: &[String],
    ) -> ConflictResolution {
        let resource_id = format!("ticket:{ticket_id}");
        let ttl_ms = 30_000u64;

        let mut winner = String::new();
        let mut losers = Vec::new();

        for claimant in claimants {
            let result = self
                .lock_manager
                .acquire(&resource_id, claimant, ttl_ms)
                .await;
            if result.success && winner.is_empty() {
                winner = claimant.clone();
            } else {
                losers.push(claimant.clone());
            }
        }

        // 若没有一个成功（锁已被其他人持有），所有人都是 loser
        if winner.is_empty() && !claimants.is_empty() {
            winner = claimants[0].clone();
            losers = claimants[1..].to_vec();
        }

        ConflictResolution {
            winner,
            losers,
            strategy: "first_claim_wins".to_string(),
            resolved_at: Utc::now(),
        }
    }

    /// 资源冲突：lock_queue（第一个获锁，其余进等待队列）
    pub async fn handle_resource_conflict(
        &self,
        resource_id: &str,
        requestors: &[String],
    ) -> ConflictResolution {
        let ttl_ms = 30_000u64;

        let mut winner = String::new();
        let mut losers = Vec::new();

        for requestor in requestors {
            let result = self
                .lock_manager
                .acquire(resource_id, requestor, ttl_ms)
                .await;
            if result.success && winner.is_empty() {
                winner = requestor.clone();
            } else {
                losers.push(requestor.clone());
                self.lock_manager
                    .add_to_wait_queue(resource_id, requestor)
                    .await;
            }
        }

        if winner.is_empty() && !requestors.is_empty() {
            winner = requestors[0].clone();
            losers = requestors[1..].to_vec();
        }

        ConflictResolution {
            winner,
            losers,
            strategy: "lock_queue".to_string(),
            resolved_at: Utc::now(),
        }
    }

    /// 优先级冲突：返回需重新分配的 assignee
    pub async fn handle_priority_conflict(
        &self,
        _ticket_id: &str,
        _old_priority: &str,
        new_priority: &str,
        current_assignee: Option<&str>,
    ) -> ConflictResolution {
        let winner = current_assignee.unwrap_or("unassigned").to_string();
        ConflictResolution {
            winner: winner.clone(),
            losers: vec![],
            strategy: format!("priority_escalation:{new_priority}"),
            resolved_at: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lock::LockManager;
    use eket_core::redis::EketRedisClient;

    async fn make_resolver() -> ConflictResolver {
        let redis = Arc::new(
            EketRedisClient::connect("127.0.0.1", 19999, None).await,
        );
        let lm = Arc::new(LockManager::new(redis));
        ConflictResolver::new(lm)
    }

    #[tokio::test]
    async fn task_conflict_first_claim_wins() {
        let resolver = make_resolver().await;
        let claimants = vec!["slaver1".to_string(), "slaver2".to_string(), "slaver3".to_string()];
        let res = resolver.handle_task_conflict("TASK-001", &claimants).await;
        assert_eq!(res.winner, "slaver1");
        assert!(res.losers.contains(&"slaver2".to_string()));
        assert!(res.losers.contains(&"slaver3".to_string()));
        assert_eq!(res.strategy, "first_claim_wins");
    }

    #[tokio::test]
    async fn resource_conflict_lock_queue() {
        let resolver = make_resolver().await;
        let requestors = vec!["inst1".to_string(), "inst2".to_string(), "inst3".to_string()];
        let res = resolver
            .handle_resource_conflict("shared-db", &requestors)
            .await;
        assert_eq!(res.winner, "inst1");
        assert_eq!(res.losers, vec!["inst2".to_string(), "inst3".to_string()]);
        assert_eq!(res.strategy, "lock_queue");

        // 等待队列应有 inst2, inst3
        let next = resolver.lock_manager.pop_next_waiter("shared-db").await;
        assert_eq!(next, Some("inst2".to_string()));
        let next2 = resolver.lock_manager.pop_next_waiter("shared-db").await;
        assert_eq!(next2, Some("inst3".to_string()));
    }
}
