/**
 * TideWalk Service Worker
 * Handles background tide checks and notifications for multiple schedules.
 */

const CACHE_NAME = 'tidewalk-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/tides.js',
  './js/notifications.js',
  './js/app.js',
  './manifest.json',
  './favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data.type === 'SCHEDULE_CHECK') {
    scheduleTideCheck(event.data.station, event.data.schedules);
  }
});

let checkInterval = null;

function scheduleTideCheck(station, schedules) {
  if (checkInterval) clearInterval(checkInterval);
  if (!station || !schedules || schedules.length === 0) return;

  // Check every 15 minutes to catch notification windows
  checkInterval = setInterval(() => {
    checkTidesAndNotify(station, schedules);
  }, 15 * 60 * 1000);

  // Also check now
  checkTidesAndNotify(station, schedules);
}

async function checkTidesAndNotify(station, schedules) {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 2);

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  try {
    const params = new URLSearchParams({
      begin_date: formatDate(now),
      end_date: formatDate(endDate),
      station: station.id,
      product: 'predictions',
      datum: 'MLLW',
      units: 'english',
      time_zone: 'lst_ldt',
      format: 'json',
      interval: 'hilo',
    });

    const res = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.predictions) return;

    const predictions = data.predictions.map(p => ({
      time: new Date(p.t.replace(' ', 'T')),
      height: parseFloat(p.v),
      type: p.type,
    }));

    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const schedule of schedules) {
      if (!schedule.days || schedule.days.length === 0) continue;

      const lowTides = predictions.filter(p => {
        if (p.type !== 'L') return false;
        if (p.height > schedule.tideThreshold) return false;
        if (!schedule.days.includes(p.time.getDay())) return false;
        const timeStr = p.time.toTimeString().slice(0, 5);
        return timeStr >= schedule.timeStart && timeStr <= schedule.timeEnd;
      });

      for (const tide of lowTides) {
        if (shouldNotifyNow(schedule, tide.time, now, nowMinutes)) {
          const h = tide.time.getHours();
          const m = String(tide.time.getMinutes()).padStart(2, '0');
          const ampm = h >= 12 ? 'PM' : 'AM';
          const hour = h % 12 || 12;
          const dayOpts = { weekday: 'long', month: 'short', day: 'numeric' };
          const dayStr = tide.time.toLocaleDateString('en-US', dayOpts);

          self.registration.showNotification(`Low Tide Alert - ${schedule.name || 'My Walk'} 🌊`, {
            body: `${station.name}: ${hour}:${m} ${ampm} on ${dayStr} (${tide.height.toFixed(1)} ft)`,
            tag: `tidewalk-${schedule.id}-${tide.time.toISOString()}`,
            icon: 'favicon.svg',
            vibrate: [200, 100, 200],
          });
        }
      }
    }
  } catch (err) {
    console.error('SW tide check failed:', err);
  }
}

function shouldNotifyNow(schedule, tideTime, now, nowMinutes) {
  const tide = new Date(tideTime);

  switch (schedule.notifyWhen) {
    case 'evening_before': {
      const dayBefore = new Date(tide);
      dayBefore.setDate(dayBefore.getDate() - 1);
      return now.toDateString() === dayBefore.toDateString()
        && nowMinutes >= 1080 && nowMinutes <= 1110;
    }
    case 'morning_of': {
      return now.toDateString() === tide.toDateString()
        && nowMinutes >= 420 && nowMinutes <= 450;
    }
    case 'hours_before': {
      const hoursMs = (schedule.notifyHours || 3) * 60 * 60 * 1000;
      const notifyAt = tide.getTime() - hoursMs;
      const diff = now.getTime() - notifyAt;
      return diff >= 0 && diff <= 30 * 60 * 1000;
    }
    case 'custom_time': {
      const dayBefore = new Date(tide);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const [h, m] = (schedule.notifyCustomTime || '20:00').split(':').map(Number);
      const target = h * 60 + m;
      return now.toDateString() === dayBefore.toDateString()
        && nowMinutes >= target && nowMinutes <= target + 30;
    }
    default:
      return false;
  }
}
