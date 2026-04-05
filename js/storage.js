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

  // --- Station ---
  getStation() {
    const data = localStorage.getItem(this.KEYS.STATION);
    return data ? JSON.parse(data) : null;
  },

  setStation(station) {
    localStorage.setItem(this.KEYS.STATION, JSON.stringify(station));
  },

  clearStation() {
    localStorage.removeItem(this.KEYS.STATION);
  },

  // --- Provider ---
  getProvider() {
    return localStorage.getItem(this.KEYS.PROVIDER) || 'noaa';
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

  // --- API Usage Tracking ---
  MONTHLY_LIMIT: 10000,
  WARNING_THRESHOLD: 1000,

  _getUsageKey() {
    const now = new Date();
    return `tidewalk_usage_${now.getFullYear()}_${now.getMonth()}`;
  },

  getUsage() {
    const data = localStorage.getItem(this._getUsageKey());
    return data ? parseInt(data, 10) : 0;
  },

  incrementUsage() {
    const key = this._getUsageKey();
    const count = this.getUsage() + 1;
    localStorage.setItem(key, String(count));
    return count;
  },

  getRemaining() {
    return Math.max(0, this.MONTHLY_LIMIT - this.getUsage());
  },

  isOverLimit() {
    return this.getUsage() >= this.MONTHLY_LIMIT;
  },

  isNearLimit() {
    return this.getRemaining() <= this.WARNING_THRESHOLD && this.getRemaining() > 0;
  },

  // --- Notification prefs ---
  getNotificationPref() {
    return localStorage.getItem(this.KEYS.NOTIFICATIONS) === 'true';
  },

  setNotificationPref(enabled) {
    localStorage.setItem(this.KEYS.NOTIFICATIONS, String(enabled));
  },
};
