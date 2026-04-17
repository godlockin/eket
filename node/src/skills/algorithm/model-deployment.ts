/**
 * EKET Framework - Algorithm Skill: Model Deployment
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ModelDeploymentInput {
  /** 模型名称 */
  modelName: string;
  /** 推理框架（pytorch/tensorflow/sklearn 等） */
  framework?: string;
  /** 目标部署环境（cpu/gpu/edge） */
  targetEnv?: string;
}

export interface ModelDeploymentOutput {
  /** 7 步部署流程 */
  steps: string[];
  /** 关键工具列表 */
  tools: string[];
  /** Checkpoints */
  checkpoints: string[];
  /** Canary 发布计划 */
  canaryPlan: string[];
  /** 输出路径 */
  outputPath: string;
}

export const modelDeploymentSkill: Skill<ModelDeploymentInput, ModelDeploymentOutput> = {
  name: 'algorithm/model-deployment',
  description: '将训练好的模型部署为生产服务 — ONNX导出、服务化、A/B测试',
  category: SkillCategory.DATA,
  tags: ['algorithm', 'ml', 'deployment', 'onnx', 'serving', 'canary', 'monitoring'],
  version: '1.0.0',

  async execute(input: SkillInput<ModelDeploymentInput>): Promise<SkillOutput<ModelDeploymentOutput>> {
    const start = Date.now();
    const {
      modelName,
      framework = 'pytorch',
      targetEnv = 'cpu',
    } = input.data as ModelDeploymentInput;
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 模型导出：将 ${modelName} 导出为标准格式 — PyTorch → ONNX（torch.onnx.export，opset=17）或 TorchScript；TF → SavedModel；sklearn → ONNX-ML（skl2onnx）；导出时固定版本号（${modelName}-v1.0.0-${date}），用 onnxruntime 验证导出结果与原模型输出误差 < 1e-5`,
      `[Step 2] 性能优化：评估优化收益 — ${targetEnv === 'gpu' ? 'FP16 量化（TensorRT / torch.amp），预期提速 2-3x，精度损失 <0.5%；' : 'INT8 动态量化（onnxruntime quantization），预期体积减半，延迟降低 30%；'}模型剪枝（非结构化 L1 pruning，稀疏度 30-50%）；知识蒸馏（teacher-student，当压缩比 >4x 时启用）；所有优化版本必须通过 accuracy regression test（精度退化 <1%）`,
      `[Step 3] 服务化：用 FastAPI 包装推理接口（/predict，POST，含 request_id 字段）；${targetEnv === 'gpu' ? 'Triton Inference Server（dynamic batching，max_batch_size=32，preferred_batch_size=[8,16]）；' : 'BentoML（自动生成 Runner，支持 adaptive batching）；'}接口规范：输入 schema 用 Pydantic 强类型定义，输出含 prediction + confidence + latency_ms；健康检查端点 /health 和 /metrics`,
      `[Step 4] 容器化：多阶段 Docker 构建 — builder 阶段安装依赖，runtime 阶段 slim 镜像；${targetEnv === 'gpu' ? 'base image: nvidia/cuda:12.1-runtime-ubuntu22.04；' : 'base image: python:3.11-slim；'}非 root 用户运行；镜像大小目标 <2GB（GPU）/ <500MB（CPU）；CI 中构建镜像并运行集成测试后 push 到 registry；版本标签与模型版本对齐`,
      `[Step 5] Shadow Mode 测试：新模型（${modelName}-v1.0.0）与现有生产模型并行运行，请求复制到新模型但响应不返回用户；收集 48h 数据对比：预测分布差异（KL divergence < 0.1）、边缘 case 处理差异、异常输入响应；Shadow 期间错误率 >1% 则阻塞发布；结果报告必须由 >2 人 review 后方可进入 Canary`,
      `[Step 6] Canary 发布：分阶段切流 — 5%（24h 观察）→ 20%（24h）→ 50%（24h）→ 100%；每阶段验证 SLO：P99 延迟 <200ms，错误率 <0.1%，预测质量指标（A/B test p-value <0.05）；自动回滚触发条件：错误率连续 5min >0.5% 或 P99 延迟 >500ms；使用 Argo Rollouts / Flagger 实现自动化切流`,
      `[Step 7] 生产监控：推理延迟（P50/P95/P99，按模型版本分维度）；输入分布漂移（PSI > 0.25 告警，> 0.5 触发 retraining pipeline）；预测置信度分布（低置信度比例 >10% 需 review）；模型版本流量分布（用于 A/B 分析）；数据存入 Prometheus + Grafana，告警接入 PagerDuty`,
    ];

    const tools: string[] = [
      'ONNX + onnxruntime (model export & cross-platform inference)',
      'FastAPI + Pydantic (inference API)',
      targetEnv === 'gpu' ? 'Triton Inference Server (GPU batching)' : 'BentoML (adaptive batching)',
      'Docker (multi-stage build, containerization)',
      'Argo Rollouts / Flagger (canary deployment automation)',
      'Evidently AI (data drift detection)',
      'Prometheus + Grafana (inference monitoring)',
    ];

    const checkpoints: string[] = [
      '⚠️  禁止无 shadow mode 直接上线：所有新模型必须经过 48h shadow 测试',
      '⚠️  回滚方案必须就位且经过演练后才能开始 canary 发布',
      '✅  模型导出后必须数值精度验证（与原模型误差 < 1e-5）',
      '✅  容器镜像必须以非 root 用户运行',
      '✅  每个 canary 阶段必须满足 SLO 后手动确认进入下一阶段',
    ];

    const canaryPlan: string[] = [
      `5%  → 24h 观察 → 验证 SLO → 手动确认 → 继续`,
      `20% → 24h 观察 → 验证 SLO + A/B 显著性 → 手动确认 → 继续`,
      `50% → 24h 观察 → 验证 SLO + 业务指标 → 手动确认 → 继续`,
      `100% → 完成发布 → 保留旧版本 7 天用于快速回滚`,
    ];

    return {
      success: true,
      data: {
        steps,
        tools,
        checkpoints,
        canaryPlan,
        outputPath: `confluence/memory/algo-model-deploy-${modelName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`Model deployment workflow generated for: ${modelName} (framework: ${framework}, target: ${targetEnv})`],
    };
  },

  validateInput(input: unknown): boolean {
    return (
      typeof input === 'object' &&
      input !== null &&
      'data' in input &&
      typeof (input as Record<string, unknown>).data === 'object'
    );
  },
};

export default modelDeploymentSkill;
