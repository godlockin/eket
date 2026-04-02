/**
 * EKET Framework - Recommender Types
 * Phase 5.2 - Intelligent Task Recommendation System
 */

// ============================================================================
// Recommendation Types
// ============================================================================

/**
 * 推荐结果
 */
export interface Recommendation {
  instanceId: string;
  taskId: string;
  score: number;
  factors: {
    skillMatch: number; // 技能匹配度 (0-1)
    historicalPerformance: number; // 历史表现 (0-1)
    workloadBalance: number; // 负载平衡 (0-1)
    priorityBonus: number; // 优先级加成
  };
  reasons: string[]; // 推荐原因说明
}

/**
 * 推荐配置
 */
export interface RecommenderConfig {
  skillMatchWeight: number; // 技能匹配权重 (default: 0.4)
  performanceWeight: number; // 历史表现权重 (default: 0.3)
  workloadWeight: number; // 负载平衡权重 (default: 0.3)
  minRecommendations: number; // 最少推荐数 (default: 3)
  maxRecommendations: number; // 最多推荐数 (default: 10)
  minHistoryCount: number; // 计算表现所需的最小历史数 (default: 3)
  defaultPerformanceScore: number; // 无历史数据时的默认表现分 (default: 0.5)
}

/**
 * 默认推荐配置
 */
export const DEFAULT_RECOMMENDER_CONFIG: RecommenderConfig = {
  skillMatchWeight: 0.4,
  performanceWeight: 0.3,
  workloadWeight: 0.3,
  minRecommendations: 3,
  maxRecommendations: 10,
  minHistoryCount: 3,
  defaultPerformanceScore: 0.5,
};

// ============================================================================
// Task History Types
// ============================================================================

/**
 * 任务历史记录
 */
export interface TaskHistory {
  id?: number; // SQLite 自增 ID
  instanceId: string;
  taskId: string;
  title?: string;
  role: string;
  quality: number; // 1-5 评分
  duration: number; // 耗时（秒）
  exceededEstimate: boolean; // 是否超出预估时间
  completedAt: number; // 完成时间戳
  createdAt?: number; // 记录创建时间
}

/**
 * Instance 表现统计
 */
export interface InstancePerformance {
  instanceId: string;
  role: string;
  totalTasks: number;
  averageQuality: number; // 平均质量评分
  averageDuration: number; // 平均耗时（秒）
  onTimeRate: number; // 按时完成率 (0-1)
  compositeScore: number; // 综合表现分 (0-1)
}

// ============================================================================
// Skill Matching Types
// ============================================================================

/**
 * 技能匹配结果
 */
export interface SkillMatchResult {
  requiredSkills: string[];
  instanceSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  matchScore: number; // 匹配度 (0-1)
}

// ============================================================================
// Workload Types
// ============================================================================

/**
 * Instance 负载信息
 */
export interface InstanceWorkload {
  instanceId: string;
  currentLoad: number; // 当前任务数
  maxLoad: number; // 最大负载
  utilizationRate: number; // 利用率 (0-1)
  availableCapacity: number; // 可用容量 (0-1)
}

// ============================================================================
// Recommendation Request/Response
// ============================================================================

/**
 * 推荐请求参数
 */
export interface RecommendationRequest {
  instanceId?: string; // 指定 Instance ID（获取该 Instance 的推荐任务）
  taskId?: string; // 指定 Task ID（获取适合该 Task 的 Instance）
  limit?: number; // 限制返回数量
  includeDetails?: boolean; // 是否包含详细信息
}

/**
 * 推荐响应
 */
export interface RecommendationResponse {
  success: boolean;
  recommendations: Recommendation[];
  metadata: {
    totalCandidates: number;
    algorithmVersion: string;
    computedAt: number;
    config: RecommenderConfig;
  };
  error?: string;
}

// ============================================================================
// Algorithm Types
// ============================================================================

/**
 * 推荐算法版本
 */
export type RecommendationAlgorithm = 'weighted-score-v1';

/**
 * 算法参数
 */
export interface AlgorithmParams {
  skillMatchThreshold: number; // 技能匹配阈值
  performanceDecayFactor: number; // 表现衰减因子
  workloadPenaltyFactor: number; // 负载惩罚因子
}

export const DEFAULT_ALGORITHM_PARAMS: AlgorithmParams = {
  skillMatchThreshold: 0.3, // 至少 30% 技能匹配
  performanceDecayFactor: 0.95, // 每次任务表现衰减 5%
  workloadPenaltyFactor: 0.1, // 每个额外任务 10% 惩罚
};
