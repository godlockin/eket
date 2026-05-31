//! SagaExecutor — compensating transaction pattern for multi-step execution.
//! Failed steps trigger reverse-order compensation of all previously completed steps.
//! Compensation failures are recorded but never re-thrown.

use async_trait::async_trait;

#[async_trait]
pub trait SagaStep<S: Send + Sync + Clone>: Send + Sync {
    fn name(&self) -> &str;
    async fn forward(&self, state: S) -> Result<S, Box<dyn std::error::Error + Send + Sync>>;
    async fn compensate(&self, state: &S) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}

#[derive(Debug)]
pub struct CompensationError {
    pub step: String,
    pub error: String,
}

#[derive(Debug)]
pub struct SagaResult<S> {
    pub success: bool,
    pub state: S,
    pub completed_steps: Vec<String>,
    pub failed_step: Option<String>,
    pub error: Option<String>,
    pub compensation_errors: Vec<CompensationError>,
}

pub struct SagaExecutor<S: Send + Sync + Clone> {
    steps: Vec<Box<dyn SagaStep<S>>>,
}

impl<S: Send + Sync + Clone + 'static> SagaExecutor<S> {
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    pub fn add_step(mut self, step: impl SagaStep<S> + 'static) -> Self {
        self.steps.push(Box::new(step));
        self
    }

    pub async fn execute(self, initial_state: S) -> SagaResult<S> {
        let mut state = initial_state;
        let mut completed: Vec<&str> = Vec::new();
        let mut compensation_errors: Vec<CompensationError> = Vec::new();

        for step in &self.steps {
            match step.forward(state.clone()).await {
                Ok(new_state) => {
                    state = new_state;
                    completed.push(step.name());
                }
                Err(err) => {
                    let failed_step = step.name().to_string();
                    let error_msg = err.to_string();

                    // Rollback completed steps in reverse order
                    for done_name in completed.iter().rev() {
                        // Find the step by name
                        if let Some(done_step) = self.steps.iter().find(|s| s.name() == *done_name)
                        {
                            if let Err(comp_err) = done_step.compensate(&state).await {
                                compensation_errors.push(CompensationError {
                                    step: done_name.to_string(),
                                    error: comp_err.to_string(),
                                });
                            }
                        }
                    }

                    return SagaResult {
                        success: false,
                        state,
                        completed_steps: completed.iter().map(|s| s.to_string()).collect(),
                        failed_step: Some(failed_step),
                        error: Some(error_msg),
                        compensation_errors,
                    };
                }
            }
        }

        SagaResult {
            success: true,
            state,
            completed_steps: completed.iter().map(|s| s.to_string()).collect(),
            failed_step: None,
            error: None,
            compensation_errors: Vec::new(),
        }
    }
}

impl<S: Send + Sync + Clone + 'static> Default for SagaExecutor<S> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    // --- helpers ---

    struct AddStep {
        name: String,
        delta: i32,
    }

    #[async_trait]
    impl SagaStep<i32> for AddStep {
        fn name(&self) -> &str {
            &self.name
        }
        async fn forward(
            &self,
            state: i32,
        ) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
            Ok(state + self.delta)
        }
        async fn compensate(
            &self,
            _state: &i32,
        ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            Ok(())
        }
    }

    struct FailStep {
        name: String,
    }

    #[async_trait]
    impl SagaStep<i32> for FailStep {
        fn name(&self) -> &str {
            &self.name
        }
        async fn forward(
            &self,
            _state: i32,
        ) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
            Err("step failed".into())
        }
        async fn compensate(
            &self,
            _state: &i32,
        ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            Ok(())
        }
    }

    struct TrackingStep {
        name: String,
        delta: i32,
        compensated: Arc<Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl SagaStep<i32> for TrackingStep {
        fn name(&self) -> &str {
            &self.name
        }
        async fn forward(
            &self,
            state: i32,
        ) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
            Ok(state + self.delta)
        }
        async fn compensate(
            &self,
            _state: &i32,
        ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            self.compensated.lock().unwrap().push(self.name.clone());
            Ok(())
        }
    }

    struct FailCompensateStep {
        name: String,
    }

    #[async_trait]
    impl SagaStep<i32> for FailCompensateStep {
        fn name(&self) -> &str {
            &self.name
        }
        async fn forward(
            &self,
            state: i32,
        ) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
            Ok(state + 1)
        }
        async fn compensate(
            &self,
            _state: &i32,
        ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            Err("compensation failed".into())
        }
    }

    // --- tests ---

    #[tokio::test]
    async fn all_steps_succeed() {
        let result = SagaExecutor::new()
            .add_step(AddStep {
                name: "step1".into(),
                delta: 10,
            })
            .add_step(AddStep {
                name: "step2".into(),
                delta: 5,
            })
            .add_step(AddStep {
                name: "step3".into(),
                delta: 3,
            })
            .execute(0)
            .await;

        assert!(result.success);
        assert_eq!(result.state, 18);
        assert_eq!(result.completed_steps, vec!["step1", "step2", "step3"]);
        assert!(result.failed_step.is_none());
        assert!(result.compensation_errors.is_empty());
    }

    #[tokio::test]
    async fn middle_step_fails_rolls_back() {
        let compensated = Arc::new(Mutex::new(Vec::<String>::new()));
        let c1 = compensated.clone();
        let c2 = compensated.clone();

        struct TrackFail {
            name: String,
            compensated: Arc<Mutex<Vec<String>>>,
        }
        #[async_trait]
        impl SagaStep<i32> for TrackFail {
            fn name(&self) -> &str {
                &self.name
            }
            async fn forward(
                &self,
                _state: i32,
            ) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
                Err("fail".into())
            }
            async fn compensate(
                &self,
                _state: &i32,
            ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
                self.compensated.lock().unwrap().push(self.name.clone());
                Ok(())
            }
        }

        let result = SagaExecutor::new()
            .add_step(TrackingStep {
                name: "s1".into(),
                delta: 1,
                compensated: c1,
            })
            .add_step(TrackingStep {
                name: "s2".into(),
                delta: 2,
                compensated: c2,
            })
            .add_step(TrackFail {
                name: "s3".into(),
                compensated: compensated.clone(),
            })
            .execute(0)
            .await;

        assert!(!result.success);
        assert_eq!(result.failed_step.as_deref(), Some("s3"));
        assert_eq!(result.completed_steps, vec!["s1", "s2"]);
        assert!(result.compensation_errors.is_empty());

        // Compensated in reverse order: s2 then s1
        let order = compensated.lock().unwrap().clone();
        assert_eq!(order, vec!["s2", "s1"]);
    }

    #[tokio::test]
    async fn compensation_itself_fails() {
        let result = SagaExecutor::new()
            .add_step(FailCompensateStep {
                name: "ok-step".into(),
            })
            .add_step(FailStep {
                name: "bad-step".into(),
            })
            .execute(0)
            .await;

        assert!(!result.success);
        assert_eq!(result.failed_step.as_deref(), Some("bad-step"));
        assert_eq!(result.compensation_errors.len(), 1);
        assert_eq!(result.compensation_errors[0].step, "ok-step");
        assert!(result.compensation_errors[0]
            .error
            .contains("compensation failed"));
    }

    #[tokio::test]
    async fn empty_steps_succeeds() {
        let result = SagaExecutor::<i32>::new().execute(42).await;

        assert!(result.success);
        assert_eq!(result.state, 42);
        assert!(result.completed_steps.is_empty());
        assert!(result.compensation_errors.is_empty());
    }

    #[tokio::test]
    async fn single_step_success() {
        let result = SagaExecutor::new()
            .add_step(AddStep {
                name: "only".into(),
                delta: 7,
            })
            .execute(1)
            .await;

        assert!(result.success);
        assert_eq!(result.state, 8);
        assert_eq!(result.completed_steps, vec!["only"]);
    }

    #[tokio::test]
    async fn single_step_failure() {
        let result = SagaExecutor::new()
            .add_step(FailStep {
                name: "solo-fail".into(),
            })
            .execute(0)
            .await;

        assert!(!result.success);
        assert_eq!(result.failed_step.as_deref(), Some("solo-fail"));
        assert!(result.completed_steps.is_empty());
        assert!(result.compensation_errors.is_empty());
    }
}
