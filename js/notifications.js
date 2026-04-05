/**
 * Browser notification management for TideWalk.
 * Uses Notification API + Service Worker for persistent notifications.
 */
const Notifications = {
  /**
   * Check if notifications are supported and get current permission status.
   */
  getStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default', 'granted', 'denied'
  },

  /**
   * Request notification permission.
   */
  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    return result;
  },

  /**
   * Register the service worker.
   */
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      return reg;
    } catch (err) {
      // Try relative path for GitHub Pages subdirectory hosting
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        return reg;
      } catch (err2) {
        console.error('SW registration failed:', err2);
        return null;
      }
    }
  },

  /**
   * Show a notification via Service Worker (persistent) or fallback to Notification API.
   */
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
   * Check tomorrow's tides and notify if there's a matching low tide.
   * Called from the app periodically and from the service worker.
   */
  async checkAndNotify() {
    const station = Storage.getStation();
    const schedule = Storage.getSchedule();
    if (!station || schedule.days.length === 0) return;

    try {
      const lowTides = await Tides.getTomorrowLowTides(station.id, schedule);
      if (lowTides.length > 0) {
        const tideList = lowTides.map(t => {
          const timeStr = t.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${timeStr} (${t.height.toFixed(1)} ft)`;
        }).join(', ');

        await this.notify(
          'Low Tide Tomorrow! 🌊',
          `${station.name}: ${tideList}`,
          `tidewalk-${new Date().toDateString()}`
        );
      }
    } catch (err) {
      console.error('Notification check failed:', err);
    }
  },

  /**
   * Schedule daily check. Runs every time the app is opened and sets up
   * periodic checks via the service worker messaging.
   */
  startPeriodicCheck() {
    // Check immediately
    this.checkAndNotify();

    // Also send message to service worker to schedule background checks
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_CHECK',
        station: Storage.getStation(),
        schedule: Storage.getSchedule(),
      });
    }
  },
};
