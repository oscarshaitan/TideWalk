/**
 * TideWalk Service Worker
 * Sets exact timers for notifications — no polling.
 * Supports NOAA and UK Admiralty providers.
 */

const CACHE_NAME = 'tidewalk-v3';
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

// --- Notification scheduling ---
let pendingTimers = [];

self.addEventListener('message', (event) => {
  if (event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    scheduleNotifications(
      event.data.station,
      event.data.schedules,
      event.data.provider,
      event.data.apiKey
    );
  }
});

async function scheduleNotifications(station, schedules, provider, apiKey) {
  pendingTimers.forEach(id => clearTimeout(id));
  pendingTimers = [];

  if (!station || !schedules || schedules.length === 0) return;

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 2);

  try {
    const predictions = await fetchPredictions(station.id, now, endDate, provider, apiKey);

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
        const notifyAt = getNotifyTime(schedule, tide.time);
        if (!notifyAt) continue;

        const delay = notifyAt.getTime() - Date.now();
        const unit = tide.unit || 'ft';
        const timerId = setTimeout(() => {
          const h = tide.time.getHours();
          const m = String(tide.time.getMinutes()).padStart(2, '0');
          const ampm = h >= 12 ? 'PM' : 'AM';
          const hour = h % 12 || 12;
          const dayStr = tide.time.toLocaleDateString('en-US', {
            weekday: 'long', month: 'short', day: 'numeric',
          });

          self.registration.showNotification(
            `Low Tide Alert - ${schedule.name || 'My Walk'}`,
            {
              body: `${station.name}: ${hour}:${m} ${ampm} on ${dayStr} (${tide.height.toFixed(1)} ${unit})`,
              tag: `tidewalk-${schedule.id}-${tide.time.toISOString()}`,
              icon: 'favicon.svg',
              vibrate: [200, 100, 200],
            }
          );
        }, delay);

        pendingTimers.push(timerId);
      }
    }
  } catch (err) {
    console.error('SW schedule failed:', err);
  }
}

// --- Fetch predictions (provider-aware) ---

async function fetchPredictions(stationId, beginDate, endDate, provider, apiKey) {
  if (provider === 'admiralty') {
    return fetchAdmiraltyPredictions(stationId, beginDate, endDate, apiKey);
  }
  return fetchNoaaPredictions(stationId, beginDate, endDate);
}

async function fetchNoaaPredictions(stationId, beginDate, endDate) {
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const params = new URLSearchParams({
    begin_date: fmt(beginDate),
    end_date: fmt(endDate),
    station: stationId,
    product: 'predictions',
    datum: 'MLLW',
    units: 'english',
    time_zone: 'lst_ldt',
    format: 'json',
    interval: 'hilo',
  });

  const res = await fetch(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.predictions) return [];

  return data.predictions.map(p => ({
    time: new Date(p.t.replace(' ', 'T')),
    height: parseFloat(p.v),
    type: p.type,
    unit: 'ft',
  }));
}

async function fetchAdmiraltyPredictions(stationId, beginDate, endDate, apiKey) {
  if (!apiKey) return [];

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const duration = Math.min(Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1), 7);

  const res = await fetch(
    `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/${stationId}/TidalEvents?duration=${duration}`,
    { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
  );
  if (!res.ok) return [];
  const data = await res.json();

  return data
    .map(e => ({
      // Admiralty times are GMT — append Z so Date parses as UTC
      time: new Date(e.DateTime.endsWith('Z') ? e.DateTime : e.DateTime + 'Z'),
      height: e.Height,
      type: e.EventType === 'HighWater' ? 'H' : 'L',
      unit: 'm',
    }))
    .filter(p => p.time >= beginDate && p.time <= endDate);
}

// --- Notify time calculator ---

function getNotifyTime(schedule, tideTime) {
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
}
