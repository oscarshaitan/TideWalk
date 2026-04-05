/**
 * Multi-provider Tide API integration.
 * Providers:
 *   - NOAA CO-OPS (US stations, free, no key)
 *   - UK Admiralty (UK stations, free Discovery tier, requires API key, needs CORS proxy)
 *   - Stormglass (global, 10 req/day free, CORS OK)
 *   - TideCheck (global, 50 req/day free, CORS OK)
 *
 * Smart caching: caches predictions per station+date to minimize API calls.
 * Daily check: one call at notification time, only if tomorrow matches a schedule.
 */
const Tides = {
  CORS_PROXY: 'https://corsproxy.io/?',

  providers: {
    noaa: {
      name: 'NOAA (US)',
      region: 'United States',
      requiresKey: false,
      freeLabel: 'Unlimited, free',
      baseUrl: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
      stationsUrl: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json',
    },
    admiralty: {
      name: 'UK Admiralty',
      region: 'United Kingdom',
      requiresKey: true,
      freeLabel: '10,000/month (free key)',
      baseUrl: 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1',
    },
    stormglass: {
      name: 'Stormglass',
      region: 'Global',
      requiresKey: true,
      freeLabel: '10 req/day (free key)',
      baseUrl: 'https://api.stormglass.io/v2',
    },
    tidecheck: {
      name: 'TideCheck',
      region: 'Global',
      requiresKey: true,
      freeLabel: '50 req/day (free key)',
      baseUrl: 'https://tidecheck.com/api',
    },
  },

  _stationsCache: {},

  _proxyUrl(url) {
    return this.CORS_PROXY + encodeURIComponent(url);
  },

  // ============================
  // STATION FETCHING
  // ============================

  async fetchStations(provider) {
    if (this._stationsCache[provider]) return this._stationsCache[provider];

    switch (provider) {
      case 'noaa': return this._fetchNoaaStations();
      case 'admiralty': return this._fetchAdmiraltyStations();
      case 'stormglass': return this._fetchStormglassStations();
      case 'tidecheck': return this._fetchTidecheckStations();
      default: return [];
    }
  },

  async _fetchNoaaStations() {
    const url = `${this.providers.noaa.stationsUrl}?type=tidepredictions&units=english`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch NOAA stations');
    const data = await res.json();
    this._stationsCache.noaa = data.stations.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state || '',
      lat: s.lat,
      lng: s.lng,
      provider: 'noaa',
    }));
    return this._stationsCache.noaa;
  },

  async _fetchAdmiraltyStations() {
    this._checkQuota('admiralty');
    const apiKey = Storage.getApiKey('admiralty');
    if (!apiKey) throw new Error('Admiralty API key required — add it in settings');

    const url = `${this.providers.admiralty.baseUrl}/Stations?subscription-key=${encodeURIComponent(apiKey)}`;
    const res = await this._fetchWithTimeout(this._proxyUrl(url));
    Storage.incrementUsage('admiralty');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid or expired Admiralty API key');
      if (res.status === 429) throw new Error('Admiralty rate limit reached');
      throw new Error(`Failed to fetch UK stations (${res.status})`);
    }
    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Unexpected response from Admiralty API');
    }
    this._stationsCache.admiralty = data.features.map(f => ({
      id: f.properties.Id,
      name: f.properties.Name,
      state: f.properties.Country || 'UK',
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      provider: 'admiralty',
    }));
    return this._stationsCache.admiralty;
  },

  // Stormglass uses lat/lng, no station list — we build a virtual list from known UK ports
  async _fetchStormglassStations() {
    // Stormglass is lat/lng based, no station endpoint.
    // Return a curated list of popular UK tide locations.
    this._stationsCache.stormglass = this._getUkStations('stormglass');
    return this._stationsCache.stormglass;
  },

  async _fetchTidecheckStations() {
    // TideCheck also works by lat/lng for nearby search.
    // Return a curated list + allow search by name.
    this._stationsCache.tidecheck = this._getUkStations('tidecheck');
    return this._stationsCache.tidecheck;
  },

  // Curated UK coastal stations for lat/lng-based providers
  _getUkStations(provider) {
    return [
      { id: 'ramsgate', name: 'Ramsgate', state: 'Kent', lat: 51.3289, lng: 1.4161, provider },
      { id: 'broadstairs', name: 'Broadstairs', state: 'Kent', lat: 51.3590, lng: 1.4390, provider },
      { id: 'margate', name: 'Margate', state: 'Kent', lat: 51.3886, lng: 1.3868, provider },
      { id: 'dover', name: 'Dover', state: 'Kent', lat: 51.1140, lng: 1.3220, provider },
      { id: 'folkestone', name: 'Folkestone', state: 'Kent', lat: 51.0754, lng: 1.1884, provider },
      { id: 'deal', name: 'Deal', state: 'Kent', lat: 51.2233, lng: 1.3986, provider },
      { id: 'whitstable', name: 'Whitstable', state: 'Kent', lat: 51.3608, lng: 1.0257, provider },
      { id: 'herne-bay', name: 'Herne Bay', state: 'Kent', lat: 51.3729, lng: 1.1271, provider },
      { id: 'hastings', name: 'Hastings', state: 'E. Sussex', lat: 50.8544, lng: 0.5788, provider },
      { id: 'brighton', name: 'Brighton', state: 'E. Sussex', lat: 50.8197, lng: -0.1367, provider },
      { id: 'southend', name: 'Southend-on-Sea', state: 'Essex', lat: 51.5365, lng: 0.7108, provider },
      { id: 'portsmouth', name: 'Portsmouth', state: 'Hampshire', lat: 50.7989, lng: -1.0912, provider },
      { id: 'southampton', name: 'Southampton', state: 'Hampshire', lat: 50.8983, lng: -1.3912, provider },
      { id: 'bournemouth', name: 'Bournemouth', state: 'Dorset', lat: 50.7167, lng: -1.8750, provider },
      { id: 'weymouth', name: 'Weymouth', state: 'Dorset', lat: 50.6100, lng: -2.4500, provider },
      { id: 'plymouth', name: 'Plymouth', state: 'Devon', lat: 50.3655, lng: -4.1427, provider },
      { id: 'newquay', name: 'Newquay', state: 'Cornwall', lat: 50.4167, lng: -5.0833, provider },
      { id: 'london-bridge', name: 'London Bridge', state: 'London', lat: 51.5074, lng: -0.0876, provider },
      { id: 'sheerness', name: 'Sheerness', state: 'Kent', lat: 51.4400, lng: 0.7500, provider },
      { id: 'scarborough', name: 'Scarborough', state: 'N. Yorkshire', lat: 54.2793, lng: -0.3973, provider },
      { id: 'whitby', name: 'Whitby', state: 'N. Yorkshire', lat: 54.4858, lng: -0.6131, provider },
      { id: 'liverpool', name: 'Liverpool', state: 'Merseyside', lat: 53.4084, lng: -2.9916, provider },
      { id: 'blackpool', name: 'Blackpool', state: 'Lancashire', lat: 53.8142, lng: -3.0553, provider },
      { id: 'newcastle', name: 'North Shields', state: 'Tyne & Wear', lat: 55.0077, lng: -1.4400, provider },
      { id: 'edinburgh', name: 'Leith (Edinburgh)', state: 'Scotland', lat: 55.9900, lng: -3.1700, provider },
      { id: 'aberdeen', name: 'Aberdeen', state: 'Scotland', lat: 57.1437, lng: -2.0805, provider },
      { id: 'cardiff', name: 'Cardiff', state: 'Wales', lat: 51.4500, lng: -3.1700, provider },
      { id: 'swansea', name: 'Swansea', state: 'Wales', lat: 51.6167, lng: -3.9500, provider },
      { id: 'belfast', name: 'Belfast', state: 'N. Ireland', lat: 54.6167, lng: -5.9167, provider },
    ];
  },

  // ============================
  // SEARCH
  // ============================

  async searchStations(query, provider) {
    const stations = await this.fetchStations(provider);
    const q = query.toLowerCase();
    return stations
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q) ||
        String(s.id).toLowerCase().includes(q)
      )
      .slice(0, 20);
  },

  async findNearest(lat, lng, provider) {
    const stations = await this.fetchStations(provider);
    let nearest = null;
    let minDist = Infinity;
    for (const s of stations) {
      const d = this._distance(lat, lng, s.lat, s.lng);
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    }
    return nearest;
  },

  // ============================
  // PREDICTIONS (with caching)
  // ============================

  async fetchPredictions(stationId, beginDate, endDate, provider) {
    // Check cache first
    const station = Storage.getStation();
    const dateKey = this._formatDateKey(beginDate) + '_' + this._formatDateKey(endDate);
    const cached = Storage.getTideCache(stationId, dateKey);
    if (cached && (Date.now() - cached.fetched) < 6 * 60 * 60 * 1000) {
      // Cache valid for 6 hours
      return cached.predictions.map(p => ({ ...p, time: new Date(p.time) }));
    }

    let predictions;
    switch (provider) {
      case 'noaa': predictions = await this._fetchNoaaPredictions(stationId, beginDate, endDate); break;
      case 'admiralty': predictions = await this._fetchAdmiraltyPredictions(stationId, beginDate, endDate); break;
      case 'stormglass': predictions = await this._fetchStormglassPredictions(stationId, beginDate, endDate); break;
      case 'tidecheck': predictions = await this._fetchTidecheckPredictions(stationId, beginDate, endDate); break;
      default: predictions = [];
    }

    // Cache the results
    Storage.setTideCache(stationId, dateKey, predictions);
    return predictions;
  },

  async _fetchNoaaPredictions(stationId, beginDate, endDate) {
    const params = new URLSearchParams({
      begin_date: this._formatDateNoaa(beginDate),
      end_date: this._formatDateNoaa(endDate),
      station: stationId,
      product: 'predictions',
      datum: 'MLLW',
      units: 'english',
      time_zone: 'lst_ldt',
      format: 'json',
      interval: 'hilo',
    });

    const res = await fetch(`${this.providers.noaa.baseUrl}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch NOAA predictions');
    const data = await res.json();

    if (!data.predictions) {
      throw new Error(data.error?.message || 'No predictions available');
    }

    return data.predictions.map(p => ({
      time: new Date(p.t.replace(' ', 'T')),
      height: parseFloat(p.v),
      type: p.type,
      unit: 'ft',
    }));
  },

  async _fetchAdmiraltyPredictions(stationId, beginDate, endDate) {
    this._checkQuota('admiralty');
    const apiKey = Storage.getApiKey('admiralty');
    if (!apiKey) throw new Error('Admiralty API key required');

    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const duration = Math.min(Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1), 7);

    const url = `${this.providers.admiralty.baseUrl}/Stations/${stationId}/TidalEvents?duration=${duration}&subscription-key=${encodeURIComponent(apiKey)}`;
    const res = await this._fetchWithTimeout(this._proxyUrl(url));
    Storage.incrementUsage('admiralty');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid or expired Admiralty API key');
      if (res.status === 429) throw new Error('Admiralty rate limit reached');
      throw new Error(`Failed to fetch UK tide predictions (${res.status})`);
    }
    const data = await res.json();

    return data
      .map(e => ({
        time: new Date(e.DateTime.endsWith('Z') ? e.DateTime : e.DateTime + 'Z'),
        height: e.Height,
        type: e.EventType === 'HighWater' ? 'H' : 'L',
        unit: 'm',
      }))
      .filter(p => p.time >= beginDate && p.time <= endDate);
  },

  async _fetchStormglassPredictions(stationId, beginDate, endDate) {
    this._checkQuota('stormglass');
    const apiKey = Storage.getApiKey('stormglass');
    if (!apiKey) throw new Error('Stormglass API key required — add it in settings');

    // Get lat/lng from station
    const station = this._getStationById(stationId, 'stormglass');
    if (!station) throw new Error('Station not found');

    const start = beginDate.toISOString();
    const end = endDate.toISOString();
    const url = `${this.providers.stormglass.baseUrl}/tide/extremes/point?lat=${station.lat}&lng=${station.lng}&start=${start}&end=${end}`;

    const res = await this._fetchWithTimeout(url, {
      headers: { 'Authorization': apiKey },
    });
    Storage.incrementUsage('stormglass');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid Stormglass API key');
      if (res.status === 429) throw new Error('Stormglass daily limit reached (10 req/day)');
      throw new Error(`Stormglass error (${res.status})`);
    }
    const data = await res.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Unexpected Stormglass response');
    }

    return data.data.map(e => ({
      // Stormglass times may be space-separated "2026-04-05 04:17:00"
      time: new Date(e.time.includes('T') ? e.time : e.time.replace(' ', 'T') + 'Z'),
      height: e.height,
      type: e.type === 'low' ? 'L' : 'H',
      unit: 'm',
    }));
  },

  async _fetchTidecheckPredictions(stationId, beginDate, endDate) {
    this._checkQuota('tidecheck');
    const apiKey = Storage.getApiKey('tidecheck');
    if (!apiKey) throw new Error('TideCheck API key required — add it in settings');

    // First find station ID via nearest-station lookup if we only have a curated ID
    const station = this._getStationById(stationId, 'tidecheck');
    if (!station) throw new Error('Station not found');

    // Find real TideCheck station ID
    const tcStation = await this._findTidecheckStation(station, apiKey);

    const diffMs = endDate.getTime() - beginDate.getTime();
    const days = Math.min(Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1), 7);
    const url = `${this.providers.tidecheck.baseUrl}/station/${tcStation.id}/tides?days=${days}&datum=LAT`;

    const res = await this._fetchWithTimeout(url, {
      headers: { 'X-API-Key': apiKey },
    });
    Storage.incrementUsage('tidecheck');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid TideCheck API key');
      if (res.status === 429) throw new Error('TideCheck daily limit reached (50 req/day)');
      throw new Error(`TideCheck error (${res.status})`);
    }
    const data = await res.json();

    const events = data.extremes || data.data || data;
    if (!Array.isArray(events)) {
      throw new Error('Unexpected TideCheck response');
    }

    return events.map(e => ({
      time: new Date(e.time),
      height: e.height,
      type: e.type === 'L' ? 'L' : 'H',
      unit: data.unit || 'm',
    }));
  },

  // Cache TideCheck station lookups
  _tidecheckStationCache: {},

  async _findTidecheckStation(station, apiKey) {
    const cacheKey = `${station.lat}_${station.lng}`;
    if (this._tidecheckStationCache[cacheKey]) return this._tidecheckStationCache[cacheKey];

    const url = `${this.providers.tidecheck.baseUrl}/stations/nearest?lat=${station.lat}&lng=${station.lng}`;
    const res = await this._fetchWithTimeout(url, {
      headers: { 'X-API-Key': apiKey },
    });
    Storage.incrementUsage('tidecheck');
    if (!res.ok) throw new Error('Could not find TideCheck station');
    const data = await res.json();

    const tcStation = data.station || data;
    this._tidecheckStationCache[cacheKey] = tcStation;
    return tcStation;
  },

  _getStationById(id, provider) {
    const stations = this._stationsCache[provider] || this._getUkStations(provider);
    return stations.find(s => s.id === id);
  },

  // ============================
  // SMART DAILY CHECK
  // ============================

  /**
   * Check if tomorrow has any scheduled walks. If so, fetch predictions
   * (using cache). Returns matching low tides for tomorrow only.
   * Designed to be called once at notification time — 1 API call max.
   */
  async checkTomorrow(stationId, schedules, provider) {
    if (!schedules || schedules.length === 0) return [];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = tomorrow.getDay();

    // Only fetch if tomorrow is in at least one schedule
    const hasSchedule = schedules.some(s => s.days.includes(tomorrowDay));
    if (!hasSchedule) return [];

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const predictions = await this.fetchPredictions(stationId, tomorrow, dayAfter, provider);
    const results = [];

    for (const p of predictions) {
      if (p.type !== 'L') continue;

      for (const schedule of schedules) {
        if (p.height > schedule.tideThreshold) continue;
        if (!schedule.days.includes(p.time.getDay())) continue;
        const timeStr = p.time.toTimeString().slice(0, 5);
        if (timeStr < schedule.timeStart || timeStr > schedule.timeEnd) continue;

        results.push({ ...p, schedule });
        break;
      }
    }

    return results;
  },

  // ============================
  // HIGH-LEVEL MATCHING
  // ============================

  async getMatchingLowTides(stationId, schedules, provider) {
    if (!schedules || schedules.length === 0) return [];

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);

    const predictions = await this.fetchPredictions(stationId, now, end, provider);
    const results = [];

    for (const p of predictions) {
      if (p.type !== 'L') continue;

      for (const schedule of schedules) {
        if (p.height > schedule.tideThreshold) continue;
        const day = p.time.getDay();
        if (!schedule.days.includes(day)) continue;
        const timeStr = p.time.toTimeString().slice(0, 5);
        if (timeStr < schedule.timeStart || timeStr > schedule.timeEnd) continue;

        results.push({ ...p, schedule });
        break;
      }
    }

    return results;
  },

  async getLowTidesForSchedule(stationId, schedule, startDate, endDate, provider) {
    const predictions = await this.fetchPredictions(stationId, startDate, endDate, provider);

    return predictions.filter(p => {
      if (p.type !== 'L') return false;
      if (p.height > schedule.tideThreshold) return false;
      const day = p.time.getDay();
      if (!schedule.days.includes(day)) return false;
      const timeStr = p.time.toTimeString().slice(0, 5);
      return timeStr >= schedule.timeStart && timeStr <= schedule.timeEnd;
    });
  },

  // ============================
  // HELPERS
  // ============================

  _checkQuota(provider) {
    if (Storage.isOverLimit(provider)) {
      const limits = Storage.LIMITS[provider];
      const period = limits.daily ? 'Daily' : 'Monthly';
      throw new Error(`${period} API limit reached. Resets ${limits.daily ? 'tomorrow' : 'next month'}.`);
    }
  },

  _formatDateNoaa(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  },

  _formatDateKey(date) {
    return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  },

  _distance(lat1, lng1, lat2, lng2) {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  },

  async _fetchWithTimeout(url, options, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out — check your connection');
      }
      if (err.message && err.message.includes('Failed to fetch')) {
        throw new Error('Network/CORS error — check your connection');
      }
      throw new Error(`Network error: ${err.message || err}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
