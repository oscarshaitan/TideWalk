/**
 * LocalStorage management for TideWalk.
 * Stores: selected station, walking schedule, notification preferences.
 */
const Storage = {
  KEYS: {
    STATION: 'tidewalk_station',
    SCHEDULE: 'tidewalk_schedule',
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

  getSchedule() {
    const data = localStorage.getItem(this.KEYS.SCHEDULE);
    return data ? JSON.parse(data) : {
      days: [],
      timeStart: '06:00',
      timeEnd: '20:00',
      tideThreshold: 1.0,
    };
  },

  setSchedule(schedule) {
    localStorage.setItem(this.KEYS.SCHEDULE, JSON.stringify(schedule));
  },

  getNotificationPref() {
    return localStorage.getItem(this.KEYS.NOTIFICATIONS) === 'true';
  },

  setNotificationPref(enabled) {
    localStorage.setItem(this.KEYS.NOTIFICATIONS, String(enabled));
  },
};
