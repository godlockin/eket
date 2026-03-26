/**
 * EKET Monitor Dashboard Application
 * Phase 5.1 - Web UI 监控面板
 *
 * 原生 JavaScript 实现，自动刷新（每 5 秒轮询）
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  REFRESH_INTERVAL: 5000, // 5 秒
  API_BASE: '',
  STALE_HEARTBEAT_MS: 30000, // 30 秒无心跳视为过期
};

// ============================================================================
// State
// ============================================================================

let state = {
  lastUpdated: null,
  refreshTimer: null,
  isRefreshing: false,
  systemStatus: null,
  instances: [],
  tasks: [],
  stats: null,
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch dashboard data from API
 */
async function fetchDashboardData() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/dashboard`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }
    return result.data;
  } catch (error) {
    console.error('[Dashboard] Failed to fetch dashboard data:', error);
    throw error;
  }
}

/**
 * Fetch system status
 */
async function fetchSystemStatus() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/status`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('[Dashboard] Failed to fetch system status:', error);
    return null;
  }
}

/**
 * Fetch instances
 */
async function fetchInstances() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/instances`);
    const result = await response.json();
    return result.success ? result.data.instances : [];
  } catch (error) {
    console.error('[Dashboard] Failed to fetch instances:', error);
    return [];
  }
}

/**
 * Fetch stats
 */
async function fetchStats() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/stats`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('[Dashboard] Failed to fetch stats:', error);
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format time ago
 */
function timeAgo(timestamp) {
  if (!timestamp) return '--';

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return '刚刚';
  if (diff < 60000) return Math.floor(diff / 1000) + 's 前';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm 前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h 前';
  return Math.floor(diff / 86400000) + 'd 前';
}

/**
 * Format timestamp to locale time
 */
function formatTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Translate task status to Chinese
 */
function translateTaskStatus(status) {
  const translations = {
    in_progress: '进行中',
    pending: '等待中',
    completed: '已完成',
    review: '审查中',
    assigned: '已分配',
    accepted: '已接受',
    failed: '失败',
  };
  return translations[status] || status;
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Update system status panel
 */
function renderSystemStatus(status) {
  const statusBadge = document.getElementById('system-status');
  const degradationLevel = document.getElementById('degradation-level');
  const redisStatus = document.getElementById('redis-status');
  const sqliteStatus = document.getElementById('sqlite-status');
  const mqStatus = document.getElementById('mq-status');

  if (!status) {
    statusBadge.textContent = 'Unknown';
    statusBadge.className = 'status-badge status-unknown';
    degradationLevel.textContent = '--';
    redisStatus.className = 'status-indicator unknown';
    redisStatus.textContent = '○';
    sqliteStatus.className = 'status-indicator unknown';
    sqliteStatus.textContent = '○';
    mqStatus.className = 'status-indicator unknown';
    mqStatus.textContent = '○';
    return;
  }

  // Update header status badge
  statusBadge.textContent = status.description;
  statusBadge.className = 'status-badge status-level-' + status.level;

  // Update degradation level
  degradationLevel.textContent = 'Level ' + status.level;

  // Update Redis status
  redisStatus.textContent = status.redisConnected ? '●' : '○';
  redisStatus.className = 'status-indicator ' + (status.redisConnected ? 'on' : 'off');

  // Update SQLite status
  sqliteStatus.textContent = status.sqliteConnected ? '●' : '○';
  sqliteStatus.className = 'status-indicator ' + (status.sqliteConnected ? 'on' : 'off');

  // Update Message Queue status
  mqStatus.textContent = status.messageQueueConnected ? '●' : '○';
  mqStatus.className = 'status-indicator ' + (status.messageQueueConnected ? 'on' : 'off');
}

/**
 * Update stats panel
 */
function renderStats(stats) {
  if (!stats) {
    document.getElementById('stat-total-instances').textContent = '0';
    document.getElementById('stat-active-instances').textContent = '0';
    document.getElementById('stat-idle-instances').textContent = '0';
    document.getElementById('stat-offline-instances').textContent = '0';
    document.getElementById('stat-total-tasks').textContent = '0';
    document.getElementById('stat-in-progress-tasks').textContent = '0';
    document.getElementById('stat-success-rate').textContent = '--';
    return;
  }

  document.getElementById('stat-total-instances').textContent = stats.totalInstances;
  document.getElementById('stat-active-instances').textContent = stats.activeInstances;
  document.getElementById('stat-idle-instances').textContent = stats.idleInstances;
  document.getElementById('stat-offline-instances').textContent = stats.offlineInstances;
  document.getElementById('stat-total-tasks').textContent = stats.totalTasks;
  document.getElementById('stat-in-progress-tasks').textContent = stats.inProgressTasks;
  document.getElementById('stat-success-rate').textContent = stats.successRate + '%';
}

/**
 * Update instances table
 */
function renderInstances(instances) {
  const tbody = document.getElementById('instances-table-body');
  const instanceCount = document.getElementById('instance-count');

  instanceCount.textContent = instances.length;

  if (instances.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7" class="empty-message">暂无 Instances</td></tr>';
    return;
  }

  const rows = instances.map(function(instance) {
    const isStale = instance.lastHeartbeat && (Date.now() - instance.lastHeartbeat) > CONFIG.STALE_HEARTBEAT_MS;
    const statusClass = instance.status || 'offline';
    const typeClass = instance.type || 'ai';
    const statusText = statusClass === 'idle' ? '空闲' : statusClass === 'busy' ? '忙碌' : '离线';

    let skillsHtml = '';
    if (instance.skills && instance.skills.length > 0) {
      const visibleSkills = instance.skills.slice(0, 3);
      const extraCount = instance.skills.length - 3;
      skillsHtml = '<div class="instance-skills">';
      for (let i = 0; i < visibleSkills.length; i++) {
        skillsHtml += '<span class="skill-tag">' + escapeHtml(visibleSkills[i]) + '</span>';
      }
      if (extraCount > 0) {
        skillsHtml += '<span class="skill-tag">+' + extraCount + '</span>';
      }
      skillsHtml += '</div>';
    }

    return '<tr>' +
      '<td class="instance-id">' + escapeHtml(instance.id) + '</td>' +
      '<td>' +
        '<span class="instance-role">' + escapeHtml(instance.agent_type) + '</span>' +
        skillsHtml +
      '</td>' +
      '<td><span class="instance-type-badge ' + typeClass + '">' + (typeClass === 'human' ? '人类' : 'AI') + '</span></td>' +
      '<td>' +
        '<span class="instance-status">' +
          '<span class="instance-status-dot ' + statusClass + '"></span>' +
          statusText +
        '</span>' +
      '</td>' +
      '<td>' + (instance.currentTaskId ? escapeHtml(instance.currentTaskId) : '-') + '</td>' +
      '<td>' + (instance.currentLoad || 0) + '</td>' +
      '<td>' +
        '<span class="heartbeat-time ' + (isStale ? 'stale' : '') + '">' +
          formatTime(instance.lastHeartbeat) +
          ' (' + timeAgo(instance.lastHeartbeat) + ')' +
        '</span>' +
      '</td>' +
    '</tr>';
  });

  tbody.innerHTML = rows.join('');
}

/**
 * Update tasks list
 */
function renderTasks(tasks) {
  const tasksList = document.getElementById('tasks-list');
  const taskCount = document.getElementById('task-count');

  taskCount.textContent = tasks.length;

  if (tasks.length === 0) {
    tasksList.innerHTML = '<div class="empty-message">暂无活跃任务</div>';
    return;
  }

  const taskItems = tasks.map(function(task) {
    return '<div class="task-item priority-' + task.priority + '">' +
      '<span class="task-id">' + escapeHtml(task.id) + '</span>' +
      '<span class="task-title">' + escapeHtml(task.title) + '</span>' +
      '<span class="task-assignee">' + (task.assignee ? escapeHtml(task.assignee) : '-') + '</span>' +
      '<span class="task-status ' + task.status + '">' + translateTaskStatus(task.status) + '</span>' +
    '</div>';
  });

  tasksList.innerHTML = taskItems.join('');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update last updated time
 */
function updateLastUpdated() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('last-updated').textContent = '最后更新：' + timeStr;
}

// ============================================================================
// Main Refresh Function
// ============================================================================

/**
 * Refresh all dashboard data
 */
async function refreshDashboard() {
  if (state.isRefreshing) {
    console.log('[Dashboard] Already refreshing, skipping...');
    return;
  }

  state.isRefreshing = true;
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('spinning');

  try {
    const dashboardData = await fetchDashboardData();

    // Update state
    state.systemStatus = dashboardData.systemStatus;
    state.instances = dashboardData.instances;
    state.tasks = dashboardData.tasks;
    state.stats = dashboardData.stats;
    state.lastUpdated = Date.now();

    // Render all panels
    renderSystemStatus(state.systemStatus);
    renderStats(state.stats);
    renderInstances(state.instances);
    renderTasks(state.tasks);
    updateLastUpdated();

    console.log('[Dashboard] Refreshed successfully');
  } catch (error) {
    console.error('[Dashboard] Refresh failed:', error);
    renderSystemStatus(null);
  } finally {
    state.isRefreshing = false;
    refreshBtn.classList.remove('spinning');
  }
}

/**
 * Start auto refresh
 */
function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  state.refreshTimer = setInterval(refreshDashboard, CONFIG.REFRESH_INTERVAL);
  console.log('[Dashboard] Auto refresh started (interval: ' + CONFIG.REFRESH_INTERVAL + 'ms)');
}

/**
 * Stop auto refresh
 */
function stopAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    console.log('[Dashboard] Auto refresh stopped');
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', function() {
    refreshDashboard();
  });

  // Page visibility change (pause refresh when tab is hidden)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
      refreshDashboard();
    }
  });

  // Initial refresh on load
  window.addEventListener('load', function() {
    refreshDashboard();
    startAutoRefresh();
  });
}

// ============================================================================
// Initialize
// ============================================================================

/**
 * Initialize dashboard
 */
function init() {
  console.log('[Dashboard] Initializing...');
  setupEventListeners();
  console.log('[Dashboard] Initialized');
}

// Start the application
init();
