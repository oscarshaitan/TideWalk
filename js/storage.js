/**
 * LocalStorage management for TideWalk.
 * Stores: selected station, walking schedules (multiple), notification preferences.
 */
const Storage = {
  KEYS: {
    STATION: 'tidewalk_station',
    SCHEDULES: 'tidewalk_schedules',
    NOTIFICATIONS: 'tidewalk_notifications',
  },

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

  getNotificationPref() {
    return localStorage.getItem(this.KEYS.NOTIFICATIONS) === 'true';
  },

  setNotificationPref(enabled) {
    localStorage.setItem(this.KEYS.NOTIFICATIONS, String(enabled));
  },
};
