/**
 * EKET Monitor Dashboard Application
 * Phase 5.1 - Web UI 监控面板
 *
 * 原生 JavaScript 实现，自动刷新（每 5 秒轮询），支持国际化
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  REFRESH_INTERVAL: 5000, // 5 秒
  API_BASE: '',
  STALE_HEARTBEAT_MS: 30000, // 30 秒无心跳视为过期
  SUPPORTED_LOCALES: ['en-US', 'zh-CN'],
  DEFAULT_LOCALE: 'zh-CN',
  STORAGE_KEY: 'eket_dashboard_locale',
};

// ============================================================================
// i18n State
// ============================================================================

let i18nState = {
  currentLocale: CONFIG.DEFAULT_LOCALE,
  translations: {},
  loaded: false,
};

// ============================================================================
// i18n Functions
// ============================================================================

/**
 * Detect locale from storage or browser
 */
function detectLocale() {
  // 1. Check localStorage
  const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
  if (stored && CONFIG.SUPPORTED_LOCALES.includes(stored)) {
    return stored;
  }

  // 2. Check browser language
  const browserLang = navigator.language || navigator.userLanguage;
  if (browserLang.includes('zh')) {
    return 'zh-CN';
  }
  if (browserLang.includes('en')) {
    return 'en-US';
  }

  // 3. Default
  return CONFIG.DEFAULT_LOCALE;
}

/**
 * Inline translations (replaces /locales/ fetch - path does not exist on server)
 */
const INLINE_TRANSLATIONS = {
  'zh-CN': {
    'dashboard_title': 'EKET 系统监控面板',
    'system_status': '系统状态',
    'statistics': '统计数据',
    'instances': '实例列表',
    'tasks': '任务列表',
    'refresh': '刷新',
    'last_updated': '最后更新',
    'total_instances': '总实例数',
    'active_instances': '活跃',
    'idle_instances': '空闲',
    'offline_instances': '离线',
    'total_tasks': '总任务数',
    'in_progress_tasks': '进行中',
    'success_rate': '成功率',
    'degradation_level': '降级级别',
    'redis_status': 'Redis 状态',
    'sqlite_status': 'SQLite 状态',
    'mq_status': '消息队列',
    'just_now': '刚刚',
    'seconds_ago': ' 秒前',
    'minutes_ago': ' 分钟前',
    'hours_ago': ' 小时前',
    'days_ago': ' 天前',
    'status_in_progress': '进行中',
    'status_pending': '等待中',
    'status_completed': '已完成',
    'status_review': '审核中',
    'status_assigned': '已分配',
    'status_accepted': '已接受',
    'status_failed': '失败',
    'status_idle': '空闲',
    'status_busy': '忙碌',
    'status_offline': '离线',
    'unknown': '未知',
    'level': '级别',
    'connected': '已连接',
    'disconnected': '未连接',
    'no_instances': '暂无实例',
    'no_tasks': '暂无任务',
    'task_status': '状态',
    'type_human': '人类',
    'type_ai': 'AI',
    'instance_id': '实例 ID',
    'instance_role': '角色',
    'instance_type': '类型',
    'instance_status': '状态',
    'current_task': '当前任务',
    'current_load': '负载',
    'last_heartbeat': '最后心跳',
  },
  'en-US': {
    'dashboard_title': 'EKET Monitor Dashboard',
    'system_status': 'System Status',
    'statistics': 'Statistics',
    'instances': 'Instances',
    'tasks': 'Tasks',
    'refresh': 'Refresh',
    'last_updated': 'Last Updated',
    'total_instances': 'Total Instances',
    'active_instances': 'Active',
    'idle_instances': 'Idle',
    'offline_instances': 'Offline',
    'total_tasks': 'Total Tasks',
    'in_progress_tasks': 'In Progress',
    'success_rate': 'Success Rate',
    'degradation_level': 'Degradation Level',
    'redis_status': 'Redis Status',
    'sqlite_status': 'SQLite Status',
    'mq_status': 'Message Queue',
    'just_now': 'just now',
    'seconds_ago': 's ago',
    'minutes_ago': 'm ago',
    'hours_ago': 'h ago',
    'days_ago': 'd ago',
    'status_in_progress': 'In Progress',
    'status_pending': 'Pending',
    'status_completed': 'Completed',
    'status_review': 'In Review',
    'status_assigned': 'Assigned',
    'status_accepted': 'Accepted',
    'status_failed': 'Failed',
    'status_idle': 'Idle',
    'status_busy': 'Busy',
    'status_offline': 'Offline',
    'unknown': 'Unknown',
    'level': 'Level',
    'connected': 'Connected',
    'disconnected': 'Disconnected',
    'no_instances': 'No instances found',
    'no_tasks': 'No tasks found',
    'task_status': 'Status',
    'type_human': 'Human',
    'type_ai': 'AI',
    'instance_id': 'Instance ID',
    'instance_role': 'Role',
    'instance_type': 'Type',
    'instance_status': 'Status',
    'current_task': 'Current Task',
    'current_load': 'Load',
    'last_heartbeat': 'Last Heartbeat',
  },
};

/**
 * Load translations for locale (inline, no network request)
 */
async function loadTranslations(locale) {
  const translations = INLINE_TRANSLATIONS[locale] || INLINE_TRANSLATIONS[CONFIG.DEFAULT_LOCALE] || {};
  console.log('[i18n] Loaded inline translations for locale:', locale);
  return translations;
}

/**
 * Initialize i18n
 */
async function initI18n() {
  i18nState.currentLocale = detectLocale();
  i18nState.translations = await loadTranslations(i18nState.currentLocale);
  i18nState.loaded = true;

  // Update language selector
  const selector = document.getElementById('language-selector');
  if (selector) {
    selector.value = i18nState.currentLocale;
  }

  // Update HTML lang attribute
  document.documentElement.lang = i18nState.currentLocale;

  console.log('[i18n] Initialized with locale:', i18nState.currentLocale);
}

/**
 * Translate key
 */
function t(key, params = {}) {
  if (!i18nState.loaded) {
    return key;
  }

  let value = i18nState.translations[key];
  if (!value) {
    // Fallback to key
    console.warn('[i18n] Missing translation:', key);
    return key;
  }

  // Replace placeholders {{param}}
  Object.keys(params).forEach(param => {
    value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), String(params[param]));
  });

  return value;
}

/**
 * Change locale
 */
async function changeLocale(locale) {
  if (!CONFIG.SUPPORTED_LOCALES.includes(locale)) {
    console.error('[i18n] Unsupported locale:', locale);
    return;
  }

  i18nState.currentLocale = locale;
  localStorage.setItem(CONFIG.STORAGE_KEY, locale);
  i18nState.translations = await loadTranslations(locale);

  // Update HTML lang attribute
  document.documentElement.lang = locale;

  // Re-render all UI
  renderAllUI();

  console.log('[i18n] Locale changed to:', locale);
}

/**
 * Render all UI with current locale
 */
function renderAllUI() {
  // Update static text elements
  updateStaticTexts();

  // Re-render dynamic content
  if (state.systemStatus) renderSystemStatus(state.systemStatus);
  if (state.stats) renderStats(state.stats);
  if (state.instances.length > 0) renderInstances(state.instances);
  if (state.tasks.length > 0) renderTasks(state.tasks);
  updateLastUpdated();
}

/**
 * Update static text elements
 */
function updateStaticTexts() {
  // Header
  const title = document.querySelector('h1');
  if (title) title.textContent = t('dashboard_title');

  // System status panel
  const systemStatusTitle = document.querySelector('.system-status-panel h2');
  if (systemStatusTitle) systemStatusTitle.textContent = t('system_status');

  // Stats panel
  const statsTitle = document.querySelector('.stats-panel h2');
  if (statsTitle) statsTitle.textContent = t('statistics');

  // Instances panel
  const instancesPanel = document.querySelector('.instances-panel h2');
  if (instancesPanel) {
    const count = document.getElementById('instance-count');
    instancesPanel.textContent = `${t('instances')} (${count ? count.textContent : '0'})`;
  }

  // Tasks panel
  const tasksPanel = document.querySelector('.tasks-panel h2');
  if (tasksPanel) {
    const count = document.getElementById('task-count');
    tasksPanel.textContent = `${t('tasks')} (${count ? count.textContent : '0'})`;
  }

  // Update table headers
  const ths = document.querySelectorAll('.instances-panel thead th');
  const headerKeys = ['instance_id', 'instance_role', 'instance_type', 'instance_status', 'current_task', 'current_load', 'last_heartbeat'];
  ths.forEach((th, i) => {
    if (headerKeys[i]) {
      th.textContent = t(headerKeys[i]);
    }
  });

  // Update button text
  const refreshText = document.querySelector('.refresh-text');
  if (refreshText) refreshText.textContent = t('refresh');

  // Update last updated label
  updateLastUpdated();

  // Update stats labels
  const statLabels = {
    'stat-total-instances': t('total_instances'),
    'stat-active-instances': t('active_instances'),
    'stat-idle-instances': t('idle_instances'),
    'stat-offline-instances': t('offline_instances'),
    'stat-total-tasks': t('total_tasks'),
    'stat-in-progress-tasks': t('in_progress_tasks'),
    'stat-success-rate': t('success_rate'),
  };

  Object.keys(statLabels).forEach(id => {
    const labelEl = document.querySelector(`#${id}`);
    if (labelEl && labelEl.previousElementSibling) {
      labelEl.previousElementSibling.textContent = statLabels[id];
    }
  });

  // Update status labels
  const statusLabels = {
    'degradation-level-label': t('degradation_level'),
    'redis-label': t('redis_status'),
    'sqlite-label': t('sqlite_status'),
    'mq-label': t('mq_status'),
  };

  Object.keys(statusLabels).forEach(key => {
    const label = document.querySelector(`[data-i18n="${key}"]`);
    if (label) label.textContent = statusLabels[key];
  });
}

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
// Accessibility - Live Announcer
// ============================================================================

/**
 * Announce message to screen readers via aria-live region
 */
function announce(message) {
  const announcer = document.getElementById('live-announcer');
  if (announcer) {
    announcer.textContent = '';
    // Small delay to ensure screen readers pick up the change
    setTimeout(function() {
      announcer.textContent = message;
    }, 100);
  }
}

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
 * Format time ago (uses current locale)
 */
function timeAgo(timestamp) {
  if (!timestamp) return '--';

  const now = Date.now();
  const diff = now - timestamp;

  const justNow = t('just_now');
  const secondsAgo = t('seconds_ago');
  const minutesAgo = t('minutes_ago');
  const hoursAgo = t('hours_ago');
  const daysAgo = t('days_ago');

  if (diff < 1000) return justNow;
  if (diff < 60000) return Math.floor(diff / 1000) + secondsAgo;
  if (diff < 3600000) return Math.floor(diff / 60000) + minutesAgo;
  if (diff < 86400000) return Math.floor(diff / 3600000) + hoursAgo;
  return Math.floor(diff / 86400000) + daysAgo;
}

/**
 * Format timestamp to locale time
 */
function formatTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return date.toLocaleTimeString(i18nState.currentLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Translate task status (uses i18n)
 */
function translateTaskStatus(status) {
  const translationMap = {
    in_progress: t('status_in_progress'),
    pending: t('status_pending'),
    completed: t('status_completed'),
    review: t('status_review'),
    assigned: t('status_assigned'),
    accepted: t('status_accepted'),
    failed: t('status_failed'),
  };
  return translationMap[status] || status;
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
    statusBadge.textContent = t('unknown');
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

  // Announce status change to screen readers
  const levelText = t('level') + ' ' + status.level;
  const redisText = status.redisConnected ? t('connected') : t('disconnected');
  const sqliteText = status.sqliteConnected ? t('connected') : t('disconnected');
  const mqText = status.messageQueueConnected ? t('connected') : t('disconnected');
  announce(t('system_status') + ': ' + levelText + ', Redis ' + redisText + ', SQLite ' + sqliteText + ', ' + t('mq_status') + ' ' + mqText);

  // Update degradation level
  degradationLevel.textContent = levelText;

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
  const instancePanelTitle = document.querySelector('.instances-panel h2');

  instanceCount.textContent = instances.length;

  // Update panel title with count
  if (instancePanelTitle) {
    instancePanelTitle.textContent = `${t('instances')} (${instances.length})`;
  }

  if (instances.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7" class="empty-message">' + t('no_instances') + '</td></tr>';
    return;
  }

  const rows = instances.map(function(instance) {
    const isStale = instance.lastHeartbeat && (Date.now() - instance.lastHeartbeat) > CONFIG.STALE_HEARTBEAT_MS;
    const statusClass = instance.status || 'offline';
    const typeClass = instance.type || 'ai';
    const statusText = statusClass === 'idle' ? t('status_idle') : statusClass === 'busy' ? t('status_busy') : t('status_offline');

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
      '<td><span class="instance-type-badge ' + typeClass + '">' + (typeClass === 'human' ? t('type_human') : t('type_ai')) + '</span></td>' +
      '<td>' +
        '<span class="instance-status">' +
          '<span class="instance-status-dot ' + statusClass + '" aria-hidden="true"></span>' +
          '<span class="sr-only">' + statusText + '</span>' +
          '<span aria-hidden="true">' + statusText + '</span>' +
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
  const tasksPanelTitle = document.querySelector('.tasks-panel h2');

  taskCount.textContent = tasks.length;

  // Update panel title with count
  if (tasksPanelTitle) {
    tasksPanelTitle.textContent = `${t('tasks')} (${tasks.length})`;
  }

  if (tasks.length === 0) {
    tasksList.innerHTML = '<div class="empty-message">' + t('no_tasks') + '</div>';
    return;
  }

  const taskItems = tasks.map(function(task) {
    const statusText = translateTaskStatus(task.status);
    return '<div class="task-item priority-' + task.priority + '" role="listitem">' +
      '<span class="task-id">' + escapeHtml(task.id) + '</span>' +
      '<span class="task-title">' + escapeHtml(task.title) + '</span>' +
      '<span class="task-assignee">' + (task.assignee ? escapeHtml(task.assignee) : '-') + '</span>' +
      '<span class="task-status ' + task.status + '">' +
        '<span class="sr-only">' + t('task_status') + ': </span>' +
        '<span aria-hidden="true">' + statusText + '</span>' +
      '</span>' +
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
  const timeStr = now.toLocaleTimeString(i18nState.currentLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('last-updated').textContent = t('last_updated') + ': ' + timeStr;
}

/**
 * Announce refresh complete to screen readers
 */
function announceRefreshComplete() {
  announce(t('last_updated') + ' ' + new Date().toLocaleTimeString(i18nState.currentLocale));
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

    // Announce refresh complete to screen readers (only on manual refresh)
    if (!state.refreshTimer) {
      announceRefreshComplete();
    }
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

  // Language selector
  const languageSelector = document.getElementById('language-selector');
  if (languageSelector) {
    languageSelector.addEventListener('change', function(event) {
      const locale = event.target.value;
      changeLocale(locale);
    });
  }

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
    // Initialize i18n first
    initI18n().then(function() {
      refreshDashboard();
      startAutoRefresh();
    });
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
  // i18n is initialized in setupEventListeners on window.load
  setupEventListeners();
  console.log('[Dashboard] Initialized');
}
