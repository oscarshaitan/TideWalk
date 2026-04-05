/**
 * Browser notification management for TideWalk.
 * Supports per-schedule notification timing:
 *   - evening_before: notify at 6 PM the day before
 *   - morning_of: notify at 7 AM the day of
 *   - hours_before: notify N hours before the low tide
 *   - custom_time: notify at a specific time the day before
 */
const Notifications = {
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
   * Determine if now is the right time to send a notification for a given
   * schedule + low tide event.
   */
  shouldNotifyNow(schedule, tideTime) {
    const now = new Date();
    const tide = new Date(tideTime);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    switch (schedule.notifyWhen) {
      case 'evening_before': {
        // Notify between 6:00-6:30 PM the day before
        const dayBefore = new Date(tide);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const sameDay = now.toDateString() === dayBefore.toDateString();
        return sameDay && nowMinutes >= 1080 && nowMinutes <= 1110; // 18:00-18:30
      }

      case 'morning_of': {
        // Notify between 7:00-7:30 AM the day of
        const sameDay = now.toDateString() === tide.toDateString();
        return sameDay && nowMinutes >= 420 && nowMinutes <= 450; // 7:00-7:30
      }

      case 'hours_before': {
        // Notify N hours before (with 30-min window)
        const hoursMs = (schedule.notifyHours || 3) * 60 * 60 * 1000;
        const notifyAt = tide.getTime() - hoursMs;
        const diff = now.getTime() - notifyAt;
        return diff >= 0 && diff <= 30 * 60 * 1000; // within 30-min window
      }

      case 'custom_time': {
        // Notify at custom time the day before
        const dayBefore = new Date(tide);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const sameDay = now.toDateString() === dayBefore.toDateString();
        const [h, m] = (schedule.notifyCustomTime || '20:00').split(':').map(Number);
        const target = h * 60 + m;
        return sameDay && nowMinutes >= target && nowMinutes <= target + 30;
      }

      default:
        return false;
    }
  },

  /**
   * Check upcoming tides across all schedules and notify as appropriate.
   */
  async checkAndNotify() {
    const station = Storage.getStation();
    const schedules = Storage.getSchedules();
    if (!station || schedules.length === 0) return;

    // Fetch predictions for today + tomorrow + day after
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
          if (this.shouldNotifyNow(schedule, tide.time)) {
            const timeStr = tide.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const dayStr = tide.time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

            await this.notify(
              `Low Tide Alert - ${schedule.name} 🌊`,
              `${station.name}: ${timeStr} on ${dayStr} (${tide.height.toFixed(1)} ft)`,
              `tidewalk-${schedule.id}-${tide.time.toISOString()}`
            );
          }
        }
      }
    } catch (err) {
      console.error('Notification check failed:', err);
    }
  },

  startPeriodicCheck() {
    // Check immediately
    this.checkAndNotify();

    // Re-check every 15 minutes (to catch time-based notification windows)
    setInterval(() => this.checkAndNotify(), 15 * 60 * 1000);

    // Sync schedules to service worker
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_CHECK',
        station: Storage.getStation(),
        schedules: Storage.getSchedules(),
      });
    }
  },
};
