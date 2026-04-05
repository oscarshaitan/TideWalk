/**
 * LocalStorage management for TideWalk.
 * Stores: selected station, walking schedules, API keys, notification prefs.
 */
const Storage = {
  KEYS: {
    STATION: 'tidewalk_station',
    SCHEDULES: 'tidewalk_schedules',
    NOTIFICATIONS: 'tidewalk_notifications',
    PROVIDER: 'tidewalk_provider',
    API_KEYS: 'tidewalk_api_keys',
  },

  // --- Station (per provider) ---
  getStation(provider) {
    const p = provider || this.getProvider();
    const data = localStorage.getItem(`${this.KEYS.STATION}_${p}`);
    return data ? JSON.parse(data) : null;
  },

  setStation(station, provider) {
    const p = provider || this.getProvider();
    localStorage.setItem(`${this.KEYS.STATION}_${p}`, JSON.stringify(station));
  },

  clearStation(provider) {
    const p = provider || this.getProvider();
    localStorage.removeItem(`${this.KEYS.STATION}_${p}`);
  },

  // --- Provider ---
  getProvider() {
    return localStorage.getItem(this.KEYS.PROVIDER) || 'tidecheck';
  },

  setProvider(provider) {
    localStorage.setItem(this.KEYS.PROVIDER, provider);
  },

  // --- API Keys ---
  getApiKey(provider) {
    const keys = this._getApiKeys();
    return keys[provider] || '';
  },

  setApiKey(provider, key) {
    const keys = this._getApiKeys();
    keys[provider] = key;
    localStorage.setItem(this.KEYS.API_KEYS, JSON.stringify(keys));
  },

  _getApiKeys() {
    const data = localStorage.getItem(this.KEYS.API_KEYS);
    return data ? JSON.parse(data) : {};
  },

  // --- Schedules ---
  getSchedules() {
    const data = localStorage.getItem(this.KEYS.SCHEDULES);
    return data ? JSON.parse(data) : [];
  },

  setSchedules(schedules) {
    localStorage.setItem(this.KEYS.SCHEDULES, JSON.stringify(schedules));
  },

  addSchedule(schedule) {
    const schedules = this.getSchedules();
    schedule.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    schedules.push(schedule);
    this.setSchedules(schedules);
    return schedule;
  },

  updateSchedule(id, updates) {
    const schedules = this.getSchedules();
    const idx = schedules.findIndex(s => s.id === id);
    if (idx !== -1) {
      schedules[idx] = { ...schedules[idx], ...updates };
      this.setSchedules(schedules);
    }
  },

  removeSchedule(id) {
    const schedules = this.getSchedules().filter(s => s.id !== id);
    this.setSchedules(schedules);
  },

  // --- API Usage Tracking (per-provider) ---
  LIMITS: {
    admiralty: { monthly: 10000, warning: 1000 },
    stormglass: { daily: 10, warning: 2 },
    tidecheck: { daily: 50, warning: 10 },
    noaa: { monthly: Infinity, warning: 0 },
  },

  _getUsageKey(provider) {
    const p = provider || this.getProvider();
    const now = new Date();
    const limits = this.LIMITS[p];
    // Daily-limited providers reset daily, monthly ones reset monthly
    if (limits && limits.daily) {
      return `tidewalk_usage_${p}_${now.getFullYear()}_${now.getMonth()}_${now.getDate()}`;
    }
    return `tidewalk_usage_${p}_${now.getFullYear()}_${now.getMonth()}`;
  },

  getUsage(provider) {
    const data = localStorage.getItem(this._getUsageKey(provider));
    return data ? parseInt(data, 10) : 0;
  },

  incrementUsage(provider) {
    const key = this._getUsageKey(provider);
    const count = this.getUsage(provider) + 1;
    localStorage.setItem(key, String(count));
    return count;
  },

  getLimit(provider) {
    const p = provider || this.getProvider();
    const limits = this.LIMITS[p];
    if (!limits) return Infinity;
    return limits.daily || limits.monthly || Infinity;
  },

  getRemaining(provider) {
    return Math.max(0, this.getLimit(provider) - this.getUsage(provider));
  },

  isOverLimit(provider) {
    return this.getUsage(provider) >= this.getLimit(provider);
  },

  isNearLimit(provider) {
    const p = provider || this.getProvider();
    const limits = this.LIMITS[p];
    if (!limits) return false;
    const warn = limits.warning || 0;
    const remaining = this.getRemaining(p);
    return remaining <= warn && remaining > 0;
  },

  getLimitLabel(provider) {
    const p = provider || this.getProvider();
    const limits = this.LIMITS[p];
    if (!limits) return '';
    if (limits.daily) return `${this.getRemaining(p)}/${limits.daily} today`;
    if (limits.monthly && limits.monthly < Infinity) return `${this.getRemaining(p).toLocaleString()}/${limits.monthly.toLocaleString()} this month`;
    return '';
  },

  // --- Tide Cache ---
  getTideCache(stationId, dateKey) {
    const data = localStorage.getItem(`tidewalk_cache_${stationId}_${dateKey}`);
    return data ? JSON.parse(data) : null;
  },

  setTideCache(stationId, dateKey, predictions) {
    localStorage.setItem(`tidewalk_cache_${stationId}_${dateKey}`, JSON.stringify({
      fetched: Date.now(),
      predictions,
    }));
  },

  // --- Last daily check ---
  getLastDailyCheck() {
    return localStorage.getItem('tidewalk_last_daily_check') || '';
  },

  setLastDailyCheck(dateStr) {
    localStorage.setItem('tidewalk_last_daily_check', dateStr);
  },

  // --- Notification prefs ---
  getNotificationPref() {
    return localStorage.getItem(this.KEYS.NOTIFICATIONS) === 'true';
  },

  setNotificationPref(enabled) {
    localStorage.setItem(this.KEYS.NOTIFICATIONS, String(enabled));
  },
};
