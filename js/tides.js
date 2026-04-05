/**
 * NOAA CO-OPS Tide API integration.
 * API docs: https://api.tidesandcurrents.noaa.gov/api/prod/
 */
const Tides = {
  BASE_URL: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
  STATIONS_URL: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json',

  _stationsCache: null,

  /**
   * Fetch all NOAA tide prediction stations.
   */
  async fetchStations() {
    if (this._stationsCache) return this._stationsCache;

    const url = `${this.STATIONS_URL}?type=tidepredictions&units=english`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch stations');
    const data = await res.json();
    this._stationsCache = data.stations.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state || '',
      lat: s.lat,
      lng: s.lng,
    }));
    return this._stationsCache;
  },

  /**
   * Search stations by name.
   */
  async searchStations(query) {
    const stations = await this.fetchStations();
    const q = query.toLowerCase();
    return stations
      .filter(s => s.name.toLowerCase().includes(q) || s.state.toLowerCase().includes(q))
      .slice(0, 20);
  },

  /**
   * Find nearest station to given coordinates.
   */
  async findNearest(lat, lng) {
    const stations = await this.fetchStations();
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

  /**
   * Fetch tide predictions for a station over a date range.
   * Returns array of { time: Date, height: number, type: 'H'|'L' }
   */
  async fetchPredictions(stationId, beginDate, endDate) {
    const params = new URLSearchParams({
      begin_date: this._formatDate(beginDate),
      end_date: this._formatDate(endDate),
      station: stationId,
      product: 'predictions',
      datum: 'MLLW',
      units: 'english',
      time_zone: 'lst_ldt',
      format: 'json',
      interval: 'hilo',
    });

    const res = await fetch(`${this.BASE_URL}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch predictions');
    const data = await res.json();

    if (!data.predictions) {
      throw new Error(data.error?.message || 'No predictions available');
    }

    return data.predictions.map(p => ({
      time: new Date(p.t.replace(' ', 'T')),
      height: parseFloat(p.v),
      type: p.type,
    }));
  },

  /**
   * Get low tides that match the user's schedule for the next 7 days.
   */
  async getMatchingLowTides(stationId, schedule) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);

    const predictions = await this.fetchPredictions(stationId, now, end);

    return predictions.filter(p => {
      if (p.type !== 'L') return false;
      if (p.height > schedule.tideThreshold) return false;

      const day = p.time.getDay();
      if (!schedule.days.includes(day)) return false;

      const timeStr = p.time.toTimeString().slice(0, 5);
      if (timeStr < schedule.timeStart || timeStr > schedule.timeEnd) return false;

      return true;
    });
  },

  /**
   * Get low tides for tomorrow that match schedule (for notifications).
   */
  async getTomorrowLowTides(stationId, schedule) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const predictions = await this.fetchPredictions(stationId, tomorrow, dayAfter);

    return predictions.filter(p => {
      if (p.type !== 'L') return false;
      if (p.height > schedule.tideThreshold) return false;

      const day = p.time.getDay();
      if (!schedule.days.includes(day)) return false;

      const timeStr = p.time.toTimeString().slice(0, 5);
      return timeStr >= schedule.timeStart && timeStr <= schedule.timeEnd;
    });
  },

  _formatDate(date) {
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
};
