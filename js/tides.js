/**
 * Multi-provider Tide API integration.
 * Providers:
 *   - NOAA CO-OPS (US stations, free, no key)
 *   - UK Admiralty (UK stations, free Discovery tier, requires API key)
 */
const Tides = {
  // --- Provider registry ---
  providers: {
    noaa: {
      name: 'NOAA (US)',
      requiresKey: false,
      baseUrl: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
      stationsUrl: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json',
    },
    admiralty: {
      name: 'UK Admiralty',
      requiresKey: true,
      baseUrl: 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1',
    },
  },

  _stationsCache: {},

  // --- Station fetching ---

  async fetchStations(provider) {
    if (this._stationsCache[provider]) return this._stationsCache[provider];

    if (provider === 'noaa') {
      return this._fetchNoaaStations();
    } else if (provider === 'admiralty') {
      return this._fetchAdmiraltyStations();
    }
    return [];
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
    this._checkAdmiraltyQuota();
    const apiKey = Storage.getApiKey('admiralty');
    if (!apiKey) throw new Error('Admiralty API key required — add it in settings');

    const res = await this._fetchWithTimeout(
      `${this.providers.admiralty.baseUrl}/Stations`,
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
    );
    Storage.incrementUsage();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid or expired Admiralty API key');
      if (res.status === 429) throw new Error('Admiralty rate limit reached — try again later');
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

  // --- Search ---

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

  // --- Predictions ---

  async fetchPredictions(stationId, beginDate, endDate, provider) {
    if (provider === 'noaa') {
      return this._fetchNoaaPredictions(stationId, beginDate, endDate);
    } else if (provider === 'admiralty') {
      return this._fetchAdmiraltyPredictions(stationId, beginDate, endDate);
    }
    return [];
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
      type: p.type, // 'H' or 'L'
      unit: 'ft',
    }));
  },

  async _fetchAdmiraltyPredictions(stationId, beginDate, endDate) {
    this._checkAdmiraltyQuota();
    const apiKey = Storage.getApiKey('admiralty');
    if (!apiKey) throw new Error('Admiralty API key required');

    // Admiralty uses duration in days from today
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const duration = Math.min(Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1), 7);

    const res = await this._fetchWithTimeout(
      `${this.providers.admiralty.baseUrl}/Stations/${stationId}/TidalEvents?duration=${duration}`,
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
    );
    Storage.incrementUsage();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Invalid or expired Admiralty API key');
      if (res.status === 429) throw new Error('Admiralty rate limit reached');
      throw new Error(`Failed to fetch UK tide predictions (${res.status})`);
    }
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
  },

  // --- High-level matching ---

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

  // --- Helpers ---

  _checkAdmiraltyQuota() {
    if (Storage.isOverLimit()) {
      throw new Error('Monthly API limit reached (10,000 calls). Resets next month.');
    }
  },

  _formatDateNoaa(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
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
      throw new Error('Network error — check your connection');
    } finally {
      clearTimeout(timer);
    }
  },
};
