import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface LlmEvaluationInput {
  modelName: string;
  useCase?: string;
  evaluationScope?: string;
}

export interface LlmEvaluationOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const llmEvaluationSkill: Skill<LlmEvaluationInput, LlmEvaluationOutput> = {
  name: 'llm-evaluation',
  category: SkillCategory.ANALYSIS,
  description: 'Systematic LLM evaluation framework: benchmark selection, RAGAS metrics, human eval, regression testing, and monitoring dashboard.',
  version: '1.0.0',
  async execute(input: SkillInput<LlmEvaluationInput>): Promise<SkillOutput<LlmEvaluationOutput>> {
    const data = input as unknown as LlmEvaluationInput;
    const start = Date.now();
    const model = data.modelName || 'target model';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Benchmark Selection',
            description: 'Choose evaluation benchmarks that align with the model\'s intended use cases and capability requirements.',
            actions: [
              'Select general benchmarks: MMLU, HellaSwag, ARC-C for reasoning',
              'Add task-specific benchmarks matching production use cases',
              'Include safety benchmarks: TruthfulQA, BBQ for bias assessment',
              'Define custom golden dataset from real production queries',
              'Document benchmark rationale and target performance thresholds',
            ],
          },
          {
            step: 2,
            title: 'RAGAS Metrics for RAG Quality',
            description: 'Apply RAGAS framework to measure faithfulness, relevance, and completeness for retrieval-augmented systems.',
            actions: [
              'Measure faithfulness: fraction of claims in answer supported by context',
              'Measure answer relevancy: semantic similarity of answer to question',
              'Measure context recall: coverage of ground truth by retrieved context',
              'Measure context precision: signal-to-noise ratio of retrieved chunks',
              'Set minimum thresholds: faithfulness >0.85, answer relevancy >0.80',
            ],
          },
          {
            step: 3,
            title: 'Human Evaluation Protocol',
            description: 'Design and execute structured human evaluation to capture quality dimensions automated metrics miss.',
            actions: [
              'Recruit 3+ evaluators with domain expertise for inter-rater reliability',
              'Define rating rubric: accuracy, coherence, completeness, tone (1-5 scale)',
              'Use pairwise comparison (model A vs B) to reduce rater fatigue',
              'Calculate Krippendorff\'s alpha for inter-annotator agreement (target >0.7)',
              'Aggregate ratings and compute confidence intervals for significance',
            ],
          },
          {
            step: 4,
            title: 'Regression Testing Suite',
            description: 'Build automated regression tests to detect capability degradation on model updates.',
            actions: [
              'Maintain golden test set of 500+ prompt-expected_output pairs',
              'Run regression suite on every model version or prompt change',
              'Alert on >5% degradation in any benchmark category',
              'Track performance trends over time in version-tagged database',
              'Implement canary evaluation: test new model on 1% production traffic',
            ],
          },
          {
            step: 5,
            title: 'Monitoring Dashboard',
            description: 'Build a production monitoring dashboard to track LLM quality and cost metrics continuously.',
            actions: [
              'Track real-time metrics: latency P50/P95, token usage, error rates',
              'Sample 1-5% of production outputs for automated quality scoring',
              'Monitor hallucination proxy signals: user thumbs-down, follow-up queries',
              'Set up PagerDuty alerts for quality metric drops >10% vs 7-day baseline',
              'Produce weekly quality digest report for ML and product stakeholders',
            ],
          },
        ],
        summary: `LLM evaluation framework for ${model} established: 5-step process from benchmark selection through production monitoring ensures continuous quality assurance.`,
      },
      duration: Date.now() - start,
    };
  },
};
