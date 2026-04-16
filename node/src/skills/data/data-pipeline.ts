/**
 * EKET Framework - Data Pipeline Skill
 * Version: 1.0.0
 *
 * 数据管道技能：数据源确认 → 清洗 → 转换 → 质量校验 → 落库 → 监控
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 数据管道输入
 */
export interface DataPipelineInput {
  /** 管道名称 */
  pipelineName: string;
  /** 数据源描述 */
  sourceDescription: string;
  /** 目标存储描述 */
  targetDescription: string;
  /** 数据格式 */
  dataFormat?: 'json' | 'csv' | 'parquet' | 'avro' | 'xml' | 'custom';
  /** 数据频率 */
  frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'on-demand';
}

/**
 * 数据管道输出
 */
export interface DataPipelineOutput {
  /** 执行步骤 */
  steps: Array<{
    index: number;
    title: string;
    description: string;
    checkPoints: string[];
    codeTemplate?: string;
  }>;
  /** 数据质量指标 */
  qualityMetrics: {
    rowCountCheck: string;
    completenessThreshold: string;
    valueRangeCheck: string;
    duplicateCheck: string;
  };
  /** 监控告警配置模板 */
  alertingTemplate: string;
}

/**
 * 数据管道 Skill 实例
 */
export const DataPipelineSkill: Skill<DataPipelineInput, DataPipelineOutput> = {
  name: 'data_pipeline',
  description: '数据管道构建：确认数据源 → 清洗 → 转换 → 质量校验 → 落库 → 监控告警',
  category: SkillCategory.DATA,
  tags: ['data', 'pipeline', 'etl', 'cleaning', 'validation', 'monitoring'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['pipelineName', 'sourceDescription', 'targetDescription'],
    properties: {
      pipelineName: { type: 'string', description: '管道名称' },
      sourceDescription: { type: 'string', description: '数据源描述' },
      targetDescription: { type: 'string', description: '目标存储描述' },
      dataFormat: { type: 'string', description: '数据格式' },
      frequency: { type: 'string', description: '数据频率' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'qualityMetrics', 'alertingTemplate'],
  },

  async execute(input: SkillInput<DataPipelineInput>): Promise<SkillOutput<DataPipelineOutput>> {
    const startTime = Date.now();
    const { pipelineName, dataFormat = 'json', frequency = 'daily' } = input.data;

    const steps = [
      {
        index: 1,
        title: '确认数据源（格式/频率/权限）',
        description:
          '在开始开发前，必须明确数据源的完整元信息，避免后期返工。',
        checkPoints: [
          `数据格式：${dataFormat}，确认 Schema 版本和字段列表`,
          `数据频率：${frequency}，确认时区和延迟 SLA`,
          '访问权限：获取必要凭证（API Key/DB 账号），存入 .env',
          '数据量级：评估峰值行数和数据体积，规划存储方案',
          '数据所有权：确认数据使用协议和隐私合规要求（GDPR/CCPA）',
          '数据源稳定性：SLA 是多少？历史宕机记录？',
        ],
        codeTemplate: `// 数据源连接验证
async function validateDataSource(): Promise<void> {
  const source = new DataSourceConnector({
    type: '${dataFormat}',
    endpoint: process.env.DATA_SOURCE_URL!,
    credentials: { apiKey: process.env.DATA_SOURCE_API_KEY! },
  });
  const sample = await source.fetchSample(10);
  console.log('Data source validated, sample rows:', sample.length);
}`,
      },
      {
        index: 2,
        title: '数据清洗（空值/异常值/去重策略）',
        description:
          '原始数据必然包含脏数据，清洗策略在上线前必须明确并文档化。',
        checkPoints: [
          '空值策略：必填字段空值 → 跳过/报错/填默认值（三选一，明确记录）',
          '异常值策略：数值超出业务范围 → 截断/跳过/人工标记',
          '去重策略：基于哪些字段去重？保留最新还是最早？',
          '编码问题：统一 UTF-8，处理特殊字符',
          '时间格式：统一 ISO 8601，处理时区转换',
          '清洗日志：记录每条跳过/修正的记录，便于追溯',
        ],
        codeTemplate: `// 数据清洗函数模板
function cleanRecord(raw: Record<string, unknown>): CleanRecord | null {
  // 必填字段检查
  if (!raw.id || !raw.timestamp) {
    logger.warn('Skipping record: missing required fields', { raw });
    return null;
  }
  return {
    id: String(raw.id),
    timestamp: new Date(String(raw.timestamp)).toISOString(),
    value: typeof raw.value === 'number' ? Math.min(Math.max(raw.value, 0), 1e9) : 0,
  };
}`,
      },
      {
        index: 3,
        title: '转换逻辑（字段映射/类型转换）',
        description:
          '将清洗后的数据转换为目标 Schema，字段映射关系文档化。',
        checkPoints: [
          '字段映射表：源字段 → 目标字段，一一对应',
          '类型转换：string → number/boolean/Date，处理转换失败',
          '计算字段：派生字段的计算逻辑文档化并加单测',
          '数据丰富：关联其他数据源补充字段时，处理关联失败的情况',
          '转换幂等性：相同输入产生相同输出（可重跑）',
        ],
        codeTemplate: `// 字段映射转换
function transformRecord(clean: CleanRecord): TargetRecord {
  return {
    // 直接映射
    entityId: clean.id,
    createdAt: clean.timestamp,
    // 计算字段
    normalizedValue: clean.value / 100,
    // 枚举转换
    status: mapStatus(clean.rawStatus),
  };
}`,
      },
      {
        index: 4,
        title: '数据质量校验（行数/字段完整率/值域检查）',
        description:
          '每次管道运行后执行数据质量检查，异常时阻断写入并告警。',
        checkPoints: [
          '行数校验：实际行数与预期行数偏差 < 5%（可配置阈值）',
          '字段完整率：关键字段 null 率 < 1%',
          '值域检查：数值字段在合理范围内（min/max）',
          '唯一性检查：主键字段无重复',
          '引用完整性：外键字段值存在于关联表',
          '时效性检查：数据时间戳在预期窗口内',
        ],
      },
      {
        index: 5,
        title: '落库/写入目标存储',
        description:
          '将通过质量校验的数据写入目标存储，确保写入原子性和幂等性。',
        checkPoints: [
          '事务性写入：批量写入在事务内，失败全量回滚',
          '幂等写入：使用 UPSERT 或唯一键去重，支持重跑',
          '批量写入：避免逐行写入，使用批量 INSERT（性能关键）',
          '写入确认：校验写入行数与预期一致',
          '分区策略：按时间/业务字段分区，便于查询和归档',
          '写入监控：记录写入耗时和 TPS',
        ],
        codeTemplate: `// 幂等批量写入
async function upsertBatch(records: TargetRecord[]): Promise<void> {
  const BATCH_SIZE = 1000;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db.transaction(async (trx) => {
      await trx('target_table').insert(batch)
        .onConflict('entity_id').merge();
    });
    logger.info(\`Upserted batch \${Math.floor(i / BATCH_SIZE) + 1}\`, { count: batch.length });
  }
}`,
      },
      {
        index: 6,
        title: '监控告警（数据延迟/质量异常）',
        description:
          '生产管道必须有完善的监控，确保数据问题第一时间被发现。',
        checkPoints: [
          '延迟告警：数据未在 SLA 时间内到达时触发',
          '质量告警：数据质量检查失败时触发（行数偏差、完整率下降）',
          '失败告警：管道运行异常退出时触发',
          '恢复通知：告警恢复时发送恢复通知',
          '仪表盘：关键指标可视化（行数趋势、延迟趋势、错误率）',
          '值班机制：告警路由到值班人员，有明确的响应 SLA',
        ],
      },
    ];

    const qualityMetrics = {
      rowCountCheck: '实际行数与期望行数偏差 ≤ 5%（或自定义阈值）',
      completenessThreshold: '关键字段（id/timestamp）完整率 = 100%；业务字段 ≥ 95%',
      valueRangeCheck: '数值字段在 [min, max] 范围内；枚举字段值在白名单内',
      duplicateCheck: '主键字段唯一性 100%；若允许重复则记录重复率',
    };

    const alertingTemplate = `# ${pipelineName} 监控告警配置

## 告警规则

| 规则名称 | 触发条件 | 严重度 | 通知渠道 |
|---------|---------|--------|---------|
| pipeline_delay | 数据延迟 > SLA * 1.5 | HIGH | PagerDuty |
| pipeline_failure | 管道运行失败 | CRITICAL | PagerDuty |
| row_count_anomaly | 行数偏差 > 5% | HIGH | Slack |
| quality_degradation | 完整率 < 95% | HIGH | Slack |
| no_data | 连续 2 个周期无数据 | CRITICAL | PagerDuty |

## 监控指标

- pipeline.run.duration_ms
- pipeline.rows.processed
- pipeline.rows.failed
- pipeline.quality.completeness_rate
- pipeline.last_success_timestamp
`;

    return {
      success: true,
      data: {
        steps,
        qualityMetrics,
        alertingTemplate,
      },
      duration: Date.now() - startTime,
      logs: [
        `[DataPipeline] 管道: ${pipelineName}`,
        `[DataPipeline] 数据源: ${input.data.sourceDescription}`,
        `[DataPipeline] 目标: ${input.data.targetDescription}`,
        `[DataPipeline] 频率: ${frequency}`,
        `[DataPipeline] 生成 ${steps.length} 步管道构建流程`,
      ],
    };
  },
};
