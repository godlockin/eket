/**
 * EKET Framework - Algorithm Skill: Feature Engineering
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface FeatureEngineeringInput {
  /** 数据集/项目名称 */
  datasetName: string;
  /** 任务类型（classification/regression/ranking 等） */
  taskType?: string;
  /** 是否启用 Feature Store 集成 */
  featureStore?: boolean;
}

export interface FeatureEngineeringOutput {
  /** 7 步特征工程流程 */
  steps: string[];
  /** 关键工具列表 */
  tools: string[];
  /** Checkpoints */
  checkpoints: string[];
  /** 输出路径 */
  outputPath: string;
}

export const featureEngineeringSkill: Skill<FeatureEngineeringInput, FeatureEngineeringOutput> = {
  name: 'algorithm/feature-engineering',
  description: 'ML 特征工程 — 特征选择、特征重要性分析、特征泄露检测',
  category: SkillCategory.DATA,
  tags: ['algorithm', 'ml', 'feature', 'engineering', 'leakage', 'selection'],
  version: '1.0.0',

  async execute(input: SkillInput<FeatureEngineeringInput>): Promise<SkillOutput<FeatureEngineeringOutput>> {
    const start = Date.now();
    const {
      datasetName,
      taskType = 'classification',
      featureStore = false,
    } = input.data as FeatureEngineeringInput;
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 原始特征探索：统计 missing value 比例（>50% 考虑删除），分析特征分布（偏态/多峰/离群），识别数据类型（数值/类别/时序/文本），记录数据集 ${datasetName} 的特征元信息到 feature catalog`,
      `[Step 2] 特征清洗：按缺失率选择策略 — 低缺失(<5%) 用均值/中位数/众数填充；中等缺失(5-30%) 用 KNN 插补或 Iterative Imputer；高缺失(>30%) 添加 is_missing 二值特征 + 填充；时序数据用 forward fill；禁止用训练集统计量污染验证集`,
      `[Step 3] 特征变换：对右偏分布使用 log1p/Box-Cox transform；对数值特征按任务选择 StandardScaler（线性模型）或 MinMaxScaler（神经网络）或 RobustScaler（有离群值）；类别特征：低基数用 OneHot，高基数用 Target Encoding（需 K-fold 防泄露）`,
      `[Step 4] 特征构造：交叉特征（数值 × 数值、数值 / 数值）；${taskType === 'regression' || taskType === 'classification' ? '多项式特征（degree ≤ 2，避免维度爆炸）；' : ''}时序数据构造滞后特征（lag-1/lag-7/lag-30）、滑动窗口统计（mean/std/min/max）；聚合特征（groupby 关键维度的统计量）；所有构造特征在训练集上 fit，验证集 transform only`,
      `[Step 5] ⚠️ 特征泄露检测（零容忍）：时间泄露检查 — 确认时序特征的 look-ahead window 不超出预测点；目标泄露检查 — 计算每个特征与 label 的相关性，>0.99 的特征标记为可疑，逐一排查数据链路；数据集污染检查 — 验证 train/val/test 划分在特征构造前完成；运行 leave-one-out 验证：去掉该特征后性能骤降 >20% 需重点审查；所有泄露风险记录到 feature_leakage_report.md`,
      `[Step 6] 特征选择：Filter 方法 — 用 mutual_info_classif/chi2 过滤低相关特征（threshold=0.01），删除相关性 >0.95 的冗余特征对；Wrapper 方法 — RFE with CV 选出最优特征子集；Embedded 方法 — L1 正则化（Lasso/LogisticRegression）自动清零无效特征，LightGBM/XGBoost feature_importance（gain）排序；最终特征集三方法取交集，保留稳定特征`,
      `[Step 7] 特征存储：${featureStore ? 'Feast/Hopsworks Feature Store 注册特征定义，指定 online/offline store，设置特征版本 v1.0；' : '将特征 pipeline 序列化（joblib）并版本化（git tag + DVC）；'}记录特征血缘（原始字段 → 变换逻辑 → 输出特征名），生成 feature_schema.yaml，CI 中加入特征一致性检查（schema validation）`,
    ];

    const tools: string[] = [
      'scikit-learn (preprocessing, feature_selection, pipeline)',
      'pandas + numpy (feature construction, aggregation)',
      'SHAP (feature importance, interaction values)',
      'category_encoders (target encoding, WOE encoding)',
      featureStore ? 'Feast / Hopsworks (feature store integration)' : 'joblib (pipeline serialization)',
      'scipy (Box-Cox, statistical tests)',
      'missingno (missing value visualization)',
    ];

    const checkpoints: string[] = [
      '⚠️  特征泄露零容忍：训练集/验证集划分必须在特征构造前完成',
      '⚠️  Target Encoding 必须使用 K-fold 方式，禁止全量 fit 后 transform 训练集',
      '✅  特征 pipeline 必须序列化并版本化，禁止手动特征工程进生产',
      '✅  feature_leakage_report.md 必须在 PR 中提交审查',
      '✅  验证集性能必须在特征选择后重新评估（防止 selection bias）',
    ];

    return {
      success: true,
      data: {
        steps,
        tools,
        checkpoints,
        outputPath: `confluence/memory/algo-feature-eng-${datasetName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`Feature engineering workflow generated for dataset: ${datasetName} (task: ${taskType})`],
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

export default featureEngineeringSkill;
