import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface FineTuningGuideInput {
  taskType: string;
  baseModel?: string;
  dataSize?: string;
}

export interface FineTuningGuideOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const fineTuningGuideSkill: Skill<FineTuningGuideInput, FineTuningGuideOutput> = {
  name: 'fine-tuning-guide',
  category: SkillCategory.DATA,
  description: 'LLM fine-tuning guide covering data preparation, base model selection, PEFT/LoRA setup, training, evaluation, and deployment.',
  version: '1.0.0',
  async execute(input: SkillInput<FineTuningGuideInput>): Promise<SkillOutput<FineTuningGuideOutput>> {
    const data = input as unknown as FineTuningGuideInput;
    const start = Date.now();
    const task = data.taskType || 'target task';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Training Data Preparation',
            description: 'Curate, clean, and format high-quality training data in instruction-following format.',
            actions: [
              'Define data requirements: min 1000 examples for instruction tuning',
              'Format data as prompt-completion pairs (Alpaca/ShareGPT format)',
              'Clean data: remove duplicates, filter low-quality examples, balance classes',
              'Split into train/validation/test sets (80/10/10)',
              'Run data quality checks: length distribution, toxicity filtering, deduplication',
            ],
          },
          {
            step: 2,
            title: 'Base Model Selection',
            description: 'Choose an appropriate base model balancing capability, cost, and deployment constraints.',
            actions: [
              'Evaluate open-weight models: Llama 3, Mistral, Qwen2, Phi-3',
              'Assess task-relevance of base model pre-training distribution',
              'Consider model size vs hardware constraints (VRAM budget)',
              'Test base model zero-shot performance as baseline',
              'Verify license compatibility for intended deployment use case',
            ],
          },
          {
            step: 3,
            title: 'PEFT/LoRA Configuration',
            description: 'Configure parameter-efficient fine-tuning to minimize compute while maximizing adaptation quality.',
            actions: [
              'Set LoRA rank (r=16-64) and alpha (alpha=2*r rule of thumb)',
              'Target attention matrices: q_proj, v_proj, k_proj, o_proj',
              'Enable QLoRA: 4-bit quantization for GPU memory reduction',
              'Configure dropout (0.05-0.1) to prevent overfitting on small datasets',
              'Use gradient checkpointing to reduce memory footprint during training',
            ],
          },
          {
            step: 4,
            title: 'Training Execution',
            description: 'Execute fine-tuning with appropriate hyperparameters and robust monitoring.',
            actions: [
              'Set learning rate (1e-4 to 3e-4) with cosine decay schedule',
              'Configure batch size for GPU utilization >80% (use gradient accumulation)',
              'Train for 2-5 epochs, monitor validation loss for early stopping',
              'Log metrics to Weights & Biases: loss curves, gradient norms, learning rate',
              'Save checkpoints every 500 steps and evaluate on held-out validation set',
            ],
          },
          {
            step: 5,
            title: 'Model Evaluation',
            description: 'Comprehensively evaluate fine-tuned model on task-specific and general capability benchmarks.',
            actions: [
              'Evaluate on held-out test set with task-specific metrics (F1, BLEU, ROUGE)',
              'Run MT-Bench or MMLU to check for capability regression',
              'Compare against base model and GPT-4 baseline on representative prompts',
              'Conduct human evaluation on 100+ model outputs for quality assessment',
              'Test for safety regressions: toxicity, hallucination rate, refusal behavior',
            ],
          },
          {
            step: 6,
            title: 'Deployment & Serving',
            description: 'Merge adapter weights and deploy the fine-tuned model with optimized inference serving.',
            actions: [
              'Merge LoRA adapters into base model weights (merge_and_unload)',
              'Apply quantization for serving: GPTQ or AWQ for 4-bit inference',
              'Deploy via vLLM or TGI for high-throughput batched inference',
              'Set up A/B testing: route 10% traffic to fine-tuned model initially',
              'Monitor production metrics: latency, token throughput, error rate, and quality drift',
            ],
          },
        ],
        summary: `Fine-tuning guide for ${task} completed: 6-step process from data prep through production deployment ensures high-quality, efficient LLM adaptation.`,
      },
      duration: Date.now() - start,
    };
  },
};
