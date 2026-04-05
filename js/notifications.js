/**
 * Browser notification management for TideWalk.
 * Computes exact notification times and sets timers — no polling.
 * Provider-aware: works with both NOAA and Admiralty.
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

  async scheduleAll() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];

    const station = Storage.getStation();
    const schedules = Storage.getSchedules();
    if (!station || schedules.length === 0) return;

    const provider = station.provider || Storage.getProvider();

    // Smart check: use Tides.checkTomorrow — only fetches if tomorrow
    // matches a schedule, uses cache, so at most 1 API call.
    try {
      const tomorrowTides = await Tides.checkTomorrow(station.id, schedules, provider);

      for (const tide of tomorrowTides) {
        const schedule = tide.schedule;
        if (!schedule) continue;

        const notifyAt = this.getNotifyTime(schedule, tide.time);
        if (!notifyAt) continue;

        const delay = notifyAt.getTime() - Date.now();
        const unit = tide.unit || 'ft';
        const timerId = setTimeout(() => {
          const timeStr = tide.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const dayStr = tide.time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

          this.notify(
            `Low Tide Alert - ${schedule.name}`,
            `${station.name}: ${timeStr} on ${dayStr} (${tide.height.toFixed(1)} ${unit})`,
            `tidewalk-${schedule.id}-${tide.time.toISOString()}`
          );
        }, delay);

        this._timers.push(timerId);
      }
    } catch (err) {
      console.error('Failed to schedule notifications:', err);
    }

    // Sync to service worker
    this._syncSW(station, schedules, provider);
  },

  _syncSW(station, schedules, provider) {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_NOTIFICATIONS',
        station,
        schedules,
        provider,
        apiKey: provider === 'admiralty' ? Storage.getApiKey('admiralty') : null,
      });
    }
  },
};
