/**
 * Browser notification management for TideWalk.
 * Computes exact notification times and sets timers — no polling.
 */
const Notifications = {
  _timers: [],

  getStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return await Notification.requestPermission();
  },

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.register('/sw.js');
    } catch {
      try {
        return await navigator.serviceWorker.register('./sw.js');
      } catch (err) {
        console.error('SW registration failed:', err);
        return null;
      }
    }
  },

  async notify(title, body, tag) {
    if (this.getStatus() !== 'granted') return;

    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag: tag || 'tidewalk',
        icon: 'favicon.svg',
        badge: 'favicon.svg',
        vibrate: [200, 100, 200],
      });
    } else {
      new Notification(title, { body, tag: tag || 'tidewalk' });
    }
  },

  /**
   * For a given schedule and a low tide event, return the exact Date
   * when the notification should fire. Returns null if already past.
   */
  getNotifyTime(schedule, tideTime) {
    const tide = new Date(tideTime);
    let notifyAt;

    switch (schedule.notifyWhen) {
      case 'evening_before': {
        notifyAt = new Date(tide);
        notifyAt.setDate(notifyAt.getDate() - 1);
        notifyAt.setHours(18, 0, 0, 0);
        break;
      }
      case 'morning_of': {
        notifyAt = new Date(tide);
        notifyAt.setHours(7, 0, 0, 0);
        break;
      }
      case 'hours_before': {
        const ms = (schedule.notifyHours || 3) * 60 * 60 * 1000;
        notifyAt = new Date(tide.getTime() - ms);
        break;
      }
      case 'custom_time': {
        const [h, m] = (schedule.notifyCustomTime || '20:00').split(':').map(Number);
        notifyAt = new Date(tide);
        notifyAt.setDate(notifyAt.getDate() - 1);
        notifyAt.setHours(h, m, 0, 0);
        break;
      }
      default:
        return null;
    }

    return notifyAt.getTime() > Date.now() ? notifyAt : null;
  },

  /**
   * Clear all pending timers and schedule new ones for every
   * schedule × matching-low-tide combination in the next 2 days.
   */
  async scheduleAll() {
    // Clear existing timers
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];

    const station = Storage.getStation();
    const schedules = Storage.getSchedules();
    if (!station || schedules.length === 0) return;

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 2);

    try {
      for (const schedule of schedules) {
        if (schedule.days.length === 0) continue;

        const lowTides = await Tides.getLowTidesForSchedule(
          station.id, schedule, now, endDate
        );

        for (const tide of lowTides) {
          const notifyAt = this.getNotifyTime(schedule, tide.time);
          if (!notifyAt) continue;

          const delay = notifyAt.getTime() - Date.now();
          const timerId = setTimeout(() => {
            const timeStr = tide.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const dayStr = tide.time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

            this.notify(
              `Low Tide Alert - ${schedule.name} 🌊`,
              `${station.name}: ${timeStr} on ${dayStr} (${tide.height.toFixed(1)} ft)`,
              `tidewalk-${schedule.id}-${tide.time.toISOString()}`
            );
          }, delay);

          this._timers.push(timerId);
        }
      }
    } catch (err) {
      console.error('Failed to schedule notifications:', err);
    }

    // Sync to service worker for when the tab is closed
    this.syncServiceWorker();
  },

  syncServiceWorker() {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_NOTIFICATIONS',
        station: Storage.getStation(),
        schedules: Storage.getSchedules(),
      });
    }
  },

  /**
   * Called on app init and whenever schedules change.
   */
  startPeriodicCheck() {
    this.scheduleAll();
  },
};
