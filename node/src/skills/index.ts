/**
 * EKET Framework - Skills System
 * Version: 0.9.3
 *
 * Skills 系统入口文件
 */

// ============================================================================
// Imports (used for re-export + pre-initialized registry)
// ============================================================================

import { SkillsRegistry, createSkillsRegistry } from './registry.js';

// algorithm
import { autoMLMonitorSkill } from './algorithm/automl-monitor.js';
import { dataLabelingSkill } from './algorithm/data-labeling.js';
import { experimentManagementSkill } from './algorithm/experiment-management.js';
import { featureEngineeringSkill } from './algorithm/feature-engineering.js';
import { hyperparameterOptimizationSkill } from './algorithm/hyperparameter-optimization.js';
import { modelDeploymentSkill } from './algorithm/model-deployment.js';
import { modelEvaluationSkill } from './algorithm/model-evaluation.js';
import { trainingPipelineSkill } from './algorithm/training-pipeline.js';
// analysis
import { competitiveAnalysisSkill } from './analysis/competitive-analysis.js';
import { feasibilityStudySkill } from './analysis/feasibility-study.js';
import { RequirementsAnalysisSkill } from './analysis/requirements-analysis.js';
import { stakeholderInterviewSkill } from './analysis/stakeholder-interview.js';
// data
import { analyticsQuerySkill } from './data/analytics-query.js';
import { DataPipelineSkill } from './data/data-pipeline.js';
import { dataQualityCheckSkill } from './data/data-quality-check.js';
import { etlDesignSkill } from './data/etl-design.js';
// design
import { apiDesignSkill } from './design/api-design.js';
import { databaseSchemaSkill } from './design/database-schema.js';
import { systemArchitectureSkill } from './design/system-architecture.js';
// development
import { codeReviewChecklistSkill } from './development/code-review-checklist.js';
import { FrontendDevelopmentSkill } from './development/frontend_development.js';
import { performanceOptimizationSkill } from './development/performance-optimization.js';
import { refactoringGuideSkill } from './development/refactoring-guide.js';
// devops
import { ciPipelineSkill } from './devops/ci-pipeline.js';
import { containerDeploySkill } from './devops/container-deploy.js';
import { DockerBuildSkill } from './devops/docker_build.js';
import { monitoringSetupSkill } from './devops/monitoring-setup.js';
// documentation
import { apiDocsSkill } from './documentation/api-docs.js';
import { architectureDocSkill } from './documentation/architecture-doc.js';
import { onboardingGuideSkill } from './documentation/onboarding-guide.js';
// hr
import { interviewGuideSkill } from './hr/interview-guide.js';
import { jdWritingSkill } from './hr/jd-writing.js';
import { onboardingPlanSkill } from './hr/onboarding-plan.js';
import { performanceReviewSkill as hrPerformanceReviewSkillInstance } from './hr/performance-review.js';
// implementation
import { configurationManagementSkill } from './implementation/configuration-management.js';
import { migrationGuideSkill } from './implementation/migration-guide.js';
import { ThirdPartyIntegrationSkill } from './implementation/third-party-integration.js';
import { vendorEvaluationSkill } from './implementation/vendor-evaluation.js';
// llm
import { fineTuningGuideSkill } from './llm/fine-tuning-guide.js';
import { llmEvaluationSkill } from './llm/llm-evaluation.js';
import { promptEngineeringSkill } from './llm/prompt-engineering.js';
import { ragPipelineSkill } from './llm/rag-pipeline.js';
// ops
import { capacityPlanningSkill } from './ops/capacity-planning.js';
import { IncidentRunbookSkill } from './ops/incident-runbook.js';
import { postmortemAnalysisSkill } from './ops/postmortem-analysis.js';
import { slaManagementSkill } from './ops/sla-management.js';
// planning
import { riskAssessmentSkill } from './planning/risk-assessment.js';
import { roadmapPrioritizationSkill } from './planning/roadmap-prioritization.js';
import { sprintPlanningSkill } from './planning/sprint-planning.js';
import { TicketBreakdownSkill } from './planning/ticket-breakdown.js';
// requirements
import { acceptanceCriteriaSkill } from './requirements/acceptance-criteria.js';
import { RequirementDecompositionSkill } from './requirements/requirement_decomposition.js';
import { useCaseWritingSkill } from './requirements/use-case-writing.js';
import { userStoryMappingSkill } from './requirements/user-story-mapping.js';
// review
import { codeSmellDetectionSkill } from './review/code-smell-detection.js';
import { performanceReviewSkill } from './review/performance-review.js';
import { PRReviewChecklistSkill } from './review/pr-review-checklist.js';
import { securityReviewSkill } from './review/security-review.js';
// security
import { DependencyAuditSkill } from './security/dependency-audit.js';
import { penetrationTestingSkill } from './security/penetration-testing.js';
import { secretScanningSkill } from './security/secret-scanning.js';
import { threatModelingSkill } from './security/threat-modeling.js';
// testing
import { e2eTestingSkill } from './testing/e2e-testing.js';
import { performanceTestingSkill } from './testing/performance-testing.js';
import { testStrategySkill } from './testing/test-strategy.js';
import { UnitTestSkill } from './testing/unit_test.js';
// ux
import { designSystemSkill } from './ux/design-system.js';
import { personaDesignSkill } from './ux/persona-design.js';
import { usabilityTestingSkill } from './ux/usability-testing.js';
import { userResearchSkill } from './ux/user-research.js';
import { wireframePrototypeSkill } from './ux/wireframe-prototype.js';

// ============================================================================
// Type exports
// ============================================================================
export type {
  Skill,
  SkillInput,
  SkillOutput,
  SkillCategory,
  SkillDefinition,
  SkillMetadata,
  SkillRegistry,
  SkillRegistryConfig,
  SkillLoaderConfig,
  LoadedSkill,
  SkillLoadResult,
  SkillExecutionContext,
  UnifiedSkillExecuteParams,
  UnifiedSkillExecuteResult,
  SkillInterceptor,
  SkillExecutionEvent,
  SkillEventListener,
} from './types.js';

// ============================================================================
// Infrastructure exports
// ============================================================================

// 注册表
export { SkillsRegistry, createSkillsRegistry } from './registry.js';

// 加载器
export { SkillLoader, createSkillLoader, loadSkillsFromDirectory, loadSkill } from './loader.js';

// 统一接口
export {
  UnifiedSkillInterface,
  createUnifiedSkillInterface,
  LoggingInterceptor,
  ValidationInterceptor,
  CachingInterceptor,
} from './unified-interface.js';

// ============================================================================
// Skill re-exports (backward-compat 4 original + all new)
// ============================================================================

// Requirements (backward compat)
export {
  RequirementDecompositionSkill,
  type RequirementDecompositionInput,
  type RequirementDecompositionOutput,
} from './requirements/requirement_decomposition.js';

// Development (backward compat)
export {
  FrontendDevelopmentSkill,
  type FrontendDevelopmentInput,
  type FrontendDevelopmentOutput,
  type PropDefinition,
} from './development/frontend_development.js';

// Testing (backward compat)
export {
  UnitTestSkill,
  type UnitTestInput,
  type UnitTestOutput,
  type TestCaseConfig,
  type MockConfig,
} from './testing/unit_test.js';

// DevOps (backward compat)
export {
  DockerBuildSkill,
  type DockerBuildInput,
  type DockerBuildOutput,
} from './devops/docker_build.js';

// Algorithm
export { autoMLMonitorSkill } from './algorithm/automl-monitor.js';
export type { AutoMLMonitorInput, AutoMLMonitorOutput } from './algorithm/automl-monitor.js';
export { dataLabelingSkill } from './algorithm/data-labeling.js';
export type { DataLabelingInput, DataLabelingOutput } from './algorithm/data-labeling.js';
export { experimentManagementSkill } from './algorithm/experiment-management.js';
export type { ExperimentManagementInput, ExperimentManagementOutput } from './algorithm/experiment-management.js';
export { featureEngineeringSkill } from './algorithm/feature-engineering.js';
export type { FeatureEngineeringInput, FeatureEngineeringOutput } from './algorithm/feature-engineering.js';
export { hyperparameterOptimizationSkill } from './algorithm/hyperparameter-optimization.js';
export type { HyperparameterOptimizationInput, HyperparameterOptimizationOutput } from './algorithm/hyperparameter-optimization.js';
export { modelDeploymentSkill } from './algorithm/model-deployment.js';
export type { ModelDeploymentInput, ModelDeploymentOutput } from './algorithm/model-deployment.js';
export { modelEvaluationSkill } from './algorithm/model-evaluation.js';
export type { ModelEvaluationInput, ModelEvaluationOutput } from './algorithm/model-evaluation.js';
export { trainingPipelineSkill } from './algorithm/training-pipeline.js';
export type { TrainingPipelineInput, TrainingPipelineOutput } from './algorithm/training-pipeline.js';

// Analysis
export { competitiveAnalysisSkill } from './analysis/competitive-analysis.js';
export type { CompetitiveAnalysisInput, CompetitiveAnalysisOutput } from './analysis/competitive-analysis.js';
export { feasibilityStudySkill } from './analysis/feasibility-study.js';
export type { FeasibilityStudyInput, FeasibilityStudyOutput } from './analysis/feasibility-study.js';
export { RequirementsAnalysisSkill } from './analysis/requirements-analysis.js';
export type { RequirementsAnalysisInput, RequirementsAnalysisOutput } from './analysis/requirements-analysis.js';
export { stakeholderInterviewSkill } from './analysis/stakeholder-interview.js';
export type { StakeholderInterviewInput, StakeholderInterviewOutput } from './analysis/stakeholder-interview.js';

// Data
export { analyticsQuerySkill } from './data/analytics-query.js';
export type { AnalyticsQueryInput, AnalyticsQueryOutput } from './data/analytics-query.js';
export { DataPipelineSkill } from './data/data-pipeline.js';
export type { DataPipelineInput, DataPipelineOutput } from './data/data-pipeline.js';
export { dataQualityCheckSkill } from './data/data-quality-check.js';
export type { DataQualityCheckInput, DataQualityCheckOutput } from './data/data-quality-check.js';
export { etlDesignSkill } from './data/etl-design.js';
export type { EtlDesignInput, EtlDesignOutput } from './data/etl-design.js';

// Design
export { apiDesignSkill } from './design/api-design.js';
export type { ApiDesignInput, ApiDesignOutput } from './design/api-design.js';
export { databaseSchemaSkill } from './design/database-schema.js';
export type { DatabaseSchemaInput, DatabaseSchemaOutput } from './design/database-schema.js';
export { systemArchitectureSkill } from './design/system-architecture.js';
export type { SystemArchitectureInput, SystemArchitectureOutput } from './design/system-architecture.js';

// Development (additional)
export { codeReviewChecklistSkill } from './development/code-review-checklist.js';
export type { CodeReviewChecklistInput, CodeReviewChecklistOutput } from './development/code-review-checklist.js';
export { performanceOptimizationSkill } from './development/performance-optimization.js';
export type { PerformanceOptimizationInput, PerformanceOptimizationOutput } from './development/performance-optimization.js';
export { refactoringGuideSkill } from './development/refactoring-guide.js';
export type { RefactoringGuideInput, RefactoringGuideOutput } from './development/refactoring-guide.js';

// DevOps (additional)
export { ciPipelineSkill } from './devops/ci-pipeline.js';
export type { CIPipelineInput, CIPipelineOutput } from './devops/ci-pipeline.js';
export { containerDeploySkill } from './devops/container-deploy.js';
export type { ContainerDeployInput, ContainerDeployOutput } from './devops/container-deploy.js';
export { monitoringSetupSkill } from './devops/monitoring-setup.js';
export type { MonitoringSetupInput, MonitoringSetupOutput } from './devops/monitoring-setup.js';

// Documentation
export { apiDocsSkill } from './documentation/api-docs.js';
export type { ApiDocsInput, ApiDocsOutput } from './documentation/api-docs.js';
export { architectureDocSkill } from './documentation/architecture-doc.js';
export type { ArchitectureDocInput, ArchitectureDocOutput } from './documentation/architecture-doc.js';
export { onboardingGuideSkill } from './documentation/onboarding-guide.js';
export type { OnboardingGuideInput, OnboardingGuideOutput } from './documentation/onboarding-guide.js';

// HR
export { interviewGuideSkill } from './hr/interview-guide.js';
export type { InterviewGuideInput, InterviewGuideOutput } from './hr/interview-guide.js';
export { jdWritingSkill } from './hr/jd-writing.js';
export type { JdWritingInput, JdWritingOutput } from './hr/jd-writing.js';
export { onboardingPlanSkill } from './hr/onboarding-plan.js';
export type { OnboardingPlanInput, OnboardingPlanOutput } from './hr/onboarding-plan.js';
// hr/performance-review conflicts with review/performance-review — aliased
export { performanceReviewSkill as hrPerformanceReviewSkill } from './hr/performance-review.js';

// Implementation
export { configurationManagementSkill } from './implementation/configuration-management.js';
export type { ConfigurationManagementInput, ConfigurationManagementOutput } from './implementation/configuration-management.js';
export { migrationGuideSkill } from './implementation/migration-guide.js';
export type { MigrationGuideInput, MigrationGuideOutput } from './implementation/migration-guide.js';
export { ThirdPartyIntegrationSkill } from './implementation/third-party-integration.js';
export type { ThirdPartyIntegrationInput, ThirdPartyIntegrationOutput } from './implementation/third-party-integration.js';
export { vendorEvaluationSkill } from './implementation/vendor-evaluation.js';
export type { VendorEvaluationInput, VendorEvaluationOutput } from './implementation/vendor-evaluation.js';

// LLM
export { fineTuningGuideSkill } from './llm/fine-tuning-guide.js';
export type { FineTuningGuideInput, FineTuningGuideOutput } from './llm/fine-tuning-guide.js';
export { llmEvaluationSkill } from './llm/llm-evaluation.js';
export type { LlmEvaluationInput, LlmEvaluationOutput } from './llm/llm-evaluation.js';
export { promptEngineeringSkill } from './llm/prompt-engineering.js';
export type { PromptEngineeringInput, PromptEngineeringOutput } from './llm/prompt-engineering.js';
export { ragPipelineSkill } from './llm/rag-pipeline.js';
export type { RagPipelineInput, RagPipelineOutput } from './llm/rag-pipeline.js';

// Ops
export { capacityPlanningSkill } from './ops/capacity-planning.js';
export type { CapacityPlanningInput, CapacityPlanningOutput } from './ops/capacity-planning.js';
export { IncidentRunbookSkill } from './ops/incident-runbook.js';
export type { IncidentRunbookInput, IncidentRunbookOutput } from './ops/incident-runbook.js';
export { postmortemAnalysisSkill } from './ops/postmortem-analysis.js';
export type { PostmortemAnalysisInput, PostmortemAnalysisOutput } from './ops/postmortem-analysis.js';
export { slaManagementSkill } from './ops/sla-management.js';
export type { SlaManagementInput, SlaManagementOutput } from './ops/sla-management.js';

// Planning
export { riskAssessmentSkill } from './planning/risk-assessment.js';
export type { RiskAssessmentInput, RiskAssessmentOutput } from './planning/risk-assessment.js';
export { roadmapPrioritizationSkill } from './planning/roadmap-prioritization.js';
export type { RoadmapPrioritizationInput, RoadmapPrioritizationOutput } from './planning/roadmap-prioritization.js';
export { sprintPlanningSkill } from './planning/sprint-planning.js';
export type { SprintPlanningInput, SprintPlanningOutput } from './planning/sprint-planning.js';
export { TicketBreakdownSkill } from './planning/ticket-breakdown.js';
export type { TicketBreakdownInput, TicketBreakdownOutput } from './planning/ticket-breakdown.js';

// Requirements (additional)
export { acceptanceCriteriaSkill } from './requirements/acceptance-criteria.js';
export type { AcceptanceCriteriaInput, AcceptanceCriteriaOutput } from './requirements/acceptance-criteria.js';
export { useCaseWritingSkill } from './requirements/use-case-writing.js';
export type { UseCaseWritingInput, UseCaseWritingOutput } from './requirements/use-case-writing.js';
export { userStoryMappingSkill } from './requirements/user-story-mapping.js';
export type { UserStoryMappingInput, UserStoryMappingOutput } from './requirements/user-story-mapping.js';

// Review
export { codeSmellDetectionSkill } from './review/code-smell-detection.js';
export type { CodeSmellDetectionInput, CodeSmellDetectionOutput } from './review/code-smell-detection.js';
export { performanceReviewSkill } from './review/performance-review.js';
export type { PerformanceReviewInput, PerformanceReviewOutput } from './review/performance-review.js';
export { PRReviewChecklistSkill } from './review/pr-review-checklist.js';
export type { PRReviewInput, PRReviewOutput } from './review/pr-review-checklist.js';
export { securityReviewSkill } from './review/security-review.js';
export type { SecurityReviewInput, SecurityReviewOutput } from './review/security-review.js';

// Security
export { DependencyAuditSkill } from './security/dependency-audit.js';
export type { DependencyAuditInput, DependencyAuditOutput } from './security/dependency-audit.js';
export { penetrationTestingSkill } from './security/penetration-testing.js';
export type { PenetrationTestingInput, PenetrationTestingOutput } from './security/penetration-testing.js';
export { secretScanningSkill } from './security/secret-scanning.js';
export type { SecretScanningInput, SecretScanningOutput } from './security/secret-scanning.js';
export { threatModelingSkill } from './security/threat-modeling.js';
export type { ThreatModelingInput, ThreatModelingOutput } from './security/threat-modeling.js';

// Testing (additional)
export { e2eTestingSkill } from './testing/e2e-testing.js';
export type { E2ETestingInput, E2ETestingOutput } from './testing/e2e-testing.js';
export { performanceTestingSkill } from './testing/performance-testing.js';
export type { PerformanceTestingInput, PerformanceTestingOutput } from './testing/performance-testing.js';
export { testStrategySkill } from './testing/test-strategy.js';
export type { TestStrategyInput, TestStrategyOutput } from './testing/test-strategy.js';

// UX
export { designSystemSkill } from './ux/design-system.js';
export { personaDesignSkill } from './ux/persona-design.js';
export { usabilityTestingSkill } from './ux/usability-testing.js';
export { userResearchSkill } from './ux/user-research.js';
export { wireframePrototypeSkill } from './ux/wireframe-prototype.js';

// ============================================================================
// Pre-initialized SkillRegistry with all built-in skills registered
// ============================================================================

/** Pre-initialized SkillRegistry with all built-in skills registered */
export const skillRegistry: SkillsRegistry = createSkillsRegistry({ allowOverwrite: false, enableLogging: false });

// Register all skills
[
  // algorithm
  autoMLMonitorSkill, dataLabelingSkill, experimentManagementSkill, featureEngineeringSkill,
  hyperparameterOptimizationSkill, modelDeploymentSkill, modelEvaluationSkill, trainingPipelineSkill,
  // analysis
  competitiveAnalysisSkill, feasibilityStudySkill, RequirementsAnalysisSkill, stakeholderInterviewSkill,
  // data
  analyticsQuerySkill, DataPipelineSkill, dataQualityCheckSkill, etlDesignSkill,
  // design
  apiDesignSkill, databaseSchemaSkill, systemArchitectureSkill,
  // development
  codeReviewChecklistSkill, FrontendDevelopmentSkill, performanceOptimizationSkill, refactoringGuideSkill,
  // devops
  ciPipelineSkill, containerDeploySkill, DockerBuildSkill, monitoringSetupSkill,
  // documentation
  apiDocsSkill, architectureDocSkill, onboardingGuideSkill,
  // hr
  interviewGuideSkill, jdWritingSkill, onboardingPlanSkill, hrPerformanceReviewSkillInstance,
  // implementation
  configurationManagementSkill, migrationGuideSkill, ThirdPartyIntegrationSkill, vendorEvaluationSkill,
  // llm
  fineTuningGuideSkill, llmEvaluationSkill, promptEngineeringSkill, ragPipelineSkill,
  // ops
  capacityPlanningSkill, IncidentRunbookSkill, postmortemAnalysisSkill, slaManagementSkill,
  // planning
  riskAssessmentSkill, roadmapPrioritizationSkill, sprintPlanningSkill, TicketBreakdownSkill,
  // requirements
  acceptanceCriteriaSkill, RequirementDecompositionSkill, useCaseWritingSkill, userStoryMappingSkill,
  // review
  codeSmellDetectionSkill, performanceReviewSkill, PRReviewChecklistSkill, securityReviewSkill,
  // security
  DependencyAuditSkill, penetrationTestingSkill, secretScanningSkill, threatModelingSkill,
  // testing
  e2eTestingSkill, performanceTestingSkill, testStrategySkill, UnitTestSkill,
  // ux
  designSystemSkill, personaDesignSkill, usabilityTestingSkill, userResearchSkill, wireframePrototypeSkill,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
].forEach((skill) => skillRegistry.register(skill as any));
