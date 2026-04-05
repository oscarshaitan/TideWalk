/**
 * TideWalk Service Worker
 * Handles background tide checks and notifications.
 */

const CACHE_NAME = 'tidewalk-v1';
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

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Only cache same-origin requests and non-API requests
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
    scheduleTideCheck(event.data.station, event.data.schedule);
  }
});

// Periodic tide check logic
let checkInterval = null;

function scheduleTideCheck(station, schedule) {
  if (checkInterval) clearInterval(checkInterval);
  if (!station || !schedule || schedule.days.length === 0) return;

  // Check every 6 hours
  checkInterval = setInterval(() => {
    checkTidesAndNotify(station, schedule);
  }, 6 * 60 * 60 * 1000);

  // Also check now if it's evening (good time for tomorrow alerts)
  const hour = new Date().getHours();
  if (hour >= 18 || hour <= 6) {
    checkTidesAndNotify(station, schedule);
  }
}

async function checkTidesAndNotify(station, schedule) {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    };

    const params = new URLSearchParams({
      begin_date: formatDate(tomorrow),
      end_date: formatDate(dayAfter),
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

    const lowTides = data.predictions
      .map(p => ({
        time: new Date(p.t.replace(' ', 'T')),
        height: parseFloat(p.v),
        type: p.type,
      }))
      .filter(p => {
        if (p.type !== 'L') return false;
        if (p.height > schedule.tideThreshold) return false;
        const day = p.time.getDay();
        if (!schedule.days.includes(day)) return false;
        const timeStr = p.time.toTimeString().slice(0, 5);
        return timeStr >= schedule.timeStart && timeStr <= schedule.timeEnd;
      });

    if (lowTides.length > 0) {
      const tideList = lowTides.map(t => {
        const h = t.time.getHours();
        const m = String(t.time.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${m} ${ampm} (${t.height.toFixed(1)} ft)`;
      }).join(', ');

      self.registration.showNotification('Low Tide Tomorrow! 🌊', {
        body: `${station.name}: ${tideList}`,
        tag: `tidewalk-${tomorrow.toDateString()}`,
        icon: 'favicon.svg',
        vibrate: [200, 100, 200],
      });
    }
  } catch (err) {
    console.error('SW tide check failed:', err);
  }
}
