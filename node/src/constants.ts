/**
 * EKET Framework - Constants
 *
 * Centralized constants for the framework to avoid magic numbers
 */

// ============================================================================
// Time Constants (milliseconds)
// ============================================================================

/** 1 second */
export const ONE_SECOND = 1000;

/** 2 seconds */
export const TWO_SECONDS = 2 * ONE_SECOND;

/** 1 minute */
export const ONE_MINUTE = 60 * ONE_SECOND;

/** 1 hour */
export const ONE_HOUR = 60 * ONE_MINUTE;

/** 1 day */
export const ONE_DAY = 24 * ONE_HOUR;

/** 5 seconds */
export const FIVE_SECONDS = 5 * ONE_SECOND;

/** 10 seconds */
export const TEN_SECONDS = 10 * ONE_SECOND;

/** 15 seconds */
export const FIFTEEN_SECONDS = 15 * ONE_SECOND;

/** 30 seconds */
export const THIRTY_SECONDS = 30 * ONE_SECOND;

/** 1 minute */
export const ONE_MINUTE_MS = ONE_MINUTE;

/** 5 minutes */
export const FIVE_MINUTES = 5 * ONE_MINUTE;

/** 15 minutes */
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE;

/** 30 minutes */
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

/** 1 hour */
export const ONE_HOUR_MS = ONE_HOUR;

/** 24 hours */
export const TWENTY_FOUR_HOURS = ONE_DAY;

// ============================================================================
// Circuit Breaker Defaults
// ============================================================================

/** Default failure threshold */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

/** Default success threshold for half-open state */
export const CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3;

/** Default timeout (30 seconds) */
export const CIRCUIT_BREAKER_TIMEOUT = THIRTY_SECONDS;

/** Default monitor timeout (1 minute) */
export const CIRCUIT_BREAKER_MONITOR_TIMEOUT = ONE_MINUTE;

// ============================================================================
// Retry Defaults
// ============================================================================

/** Default maximum retry attempts */
export const RETRY_MAX_ATTEMPTS = 3;

/** Default initial delay (1 second) */
export const RETRY_INITIAL_DELAY = ONE_SECOND;

/** Default maximum delay (30 seconds) */
export const RETRY_MAX_DELAY = THIRTY_SECONDS;

/** Default delay multiplier */
export const RETRY_DELAY_MULTIPLIER = 2;

// ============================================================================
// Cache Defaults
// ============================================================================

/** Default maximum cache size */
export const CACHE_MAX_SIZE = 1000;

/** Default TTL (5 minutes) */
export const CACHE_DEFAULT_TTL = FIVE_MINUTES;

/** Default lock TTL (5 seconds) */
export const CACHE_LOCK_TTL = FIVE_SECONDS;

/** Default lock acquisition timeout */
export const CACHE_LOCK_TIMEOUT = TEN_SECONDS;

// ============================================================================
// Connection Pool Defaults
// ============================================================================

/** Default pool size */
export const POOL_DEFAULT_SIZE = 10;

/** Default max idle time (5 minutes) */
export const POOL_MAX_IDLE_TIME = FIVE_MINUTES;

/** Default acquire timeout (30 seconds) */
export const POOL_ACQUIRE_TIMEOUT = THIRTY_SECONDS;

// ============================================================================
// Message Queue Defaults
// ============================================================================

/** File queue poll interval (5 seconds) */
export const MQ_POLL_INTERVAL_MS = FIVE_SECONDS;

/** Message max age (24 hours) */
export const MQ_MESSAGE_MAX_AGE = TWENTY_FOUR_HOURS;

/** Message archive after (1 hour) */
export const MQ_ARCHIVE_AFTER = ONE_HOUR;

// ============================================================================
// Heartbeat Defaults
// ============================================================================

/** Default heartbeat interval (10 seconds) */
export const HEARTBEAT_INTERVAL = TEN_SECONDS;

/** Default heartbeat timeout (30 seconds) */
export const HEARTBEAT_TIMEOUT = THIRTY_SECONDS;

// ============================================================================
// Master Election Defaults
// ============================================================================

/** Default election timeout (5 seconds) */
export const MASTER_ELECTION_TIMEOUT = FIVE_SECONDS;

/** Default declaration period (2 seconds) */
export const MASTER_DECLARATION_PERIOD = TWO_SECONDS;

/** Default lease time (30 seconds) */
export const MASTER_LEASE_TIME = THIRTY_SECONDS;

// ============================================================================
// Rate Limiter Defaults
// ============================================================================

/** Default window (15 minutes) */
export const RATE_LIMITER_DEFAULT_WINDOW = FIFTEEN_MINUTES;

/** Default max requests */
export const RATE_LIMITER_DEFAULT_MAX_REQUESTS = 100;

/** Cleanup interval maximum (1 minute) */
export const RATE_LIMITER_MAX_CLEANUP_INTERVAL = ONE_MINUTE;

// ============================================================================
// Skill Execution Defaults
// ============================================================================

/** Default skill execution timeout (60 seconds) */
export const SKILL_EXECUTION_TIMEOUT = ONE_MINUTE;

// ============================================================================
// File Operations Defaults
// ============================================================================

/** Processed IDs max size */
export const FILE_QUEUE_PROCESSED_MAX_SIZE = 10000;

/** File lock stale threshold (5 seconds) */
export const FILE_LOCK_STALE_THRESHOLD = FIVE_SECONDS;

// ============================================================================
// Alert Defaults
// ============================================================================

/** Alert cooldown period (5 minutes) */
export const ALERT_COOLDOWN = FIVE_MINUTES;

/** Alert lookback period (24 hours) */
export const ALERT_LOOKBACK = TWENTY_FOUR_HOURS;

// ============================================================================
// Validation Limits
// ============================================================================

/** Maximum IN clause values */
export const SQL_MAX_IN_VALUES = 10000;

/** Maximum query limit */
export const SQL_MAX_LIMIT = 10000;

/** Minimum query limit */
export const SQL_MIN_LIMIT = 1;

// ============================================================================
// Agent Pool Defaults
// ============================================================================

/** Default health check interval (10 seconds) */
export const AGENT_POOL_HEALTH_CHECK_INTERVAL = TEN_SECONDS;

/** Default heartbeat timeout (30 seconds) */
export const AGENT_POOL_HEARTBEAT_TIMEOUT = THIRTY_SECONDS;

/** 2 seconds for declaration period */
export const AGENT_POOL_DECLARATION_PERIOD = TWO_SECONDS;

// ============================================================================
// WebSocket Defaults
// ============================================================================

/** WebSocket ping interval (30 seconds) */
export const WS_PING_INTERVAL = THIRTY_SECONDS;

/** Normal closure code */
export const WS_NORMAL_CLOSURE = 1000;

/** Server error code */
export const WS_SERVER_ERROR = 5000;

// ============================================================================
// Scalability Defaults (Phase 10)
// ============================================================================

// ----------------------------------------------------------------------------
// Redis Cluster Defaults
// ----------------------------------------------------------------------------

/** Default cluster slots refresh timeout */
export const CLUSTER_SLOTS_REFRESH_TIMEOUT = 5000;

/** Default cluster retry delay on fail */
export const CLUSTER_RETRY_DELAY = 100;

// ----------------------------------------------------------------------------
// Consistent Hash Defaults
// ----------------------------------------------------------------------------

/** Default number of virtual nodes for consistent hashing */
export const CONSISTENT_HASH_REPLICAS = 150;

/** Default hash function for consistent hashing */
export const CONSISTENT_HASH_FUNCTION: 'sha1' = 'sha1';

// ----------------------------------------------------------------------------
// Message Queue Sharding Defaults
// ----------------------------------------------------------------------------

/** Default number of shards for message queue */
export const MQ_DEFAULT_SHARD_COUNT = 16;

// ----------------------------------------------------------------------------
// Batch Heartbeat Defaults
// ----------------------------------------------------------------------------

/** Default batch size for heartbeat updates */
export const BATCH_HEARTBEAT_SIZE = 100;

/** Default flush interval for batch heartbeat (1 second) */
export const BATCH_HEARTBEAT_FLUSH_INTERVAL = ONE_SECOND;

// ----------------------------------------------------------------------------
// Distributed Round Robin Defaults
// ----------------------------------------------------------------------------

/** Default TTL for round robin counter (1 hour) */
export const ROUND_ROBIN_TTL = ONE_HOUR / ONE_SECOND;

/** Default key prefix for round robin counters */
export const ROUND_ROBIN_KEY_PREFIX = 'eket:roundrobin:';
