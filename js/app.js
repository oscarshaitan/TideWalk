/**
 * TideWalk main application logic.
 * Multi-provider, multiple schedules, per-schedule notification timing.
 */
(async function () {
  // DOM elements
  const providerSelect = document.getElementById('provider-select');
  const apikeyRow = document.getElementById('apikey-row');
  const apikeyInput = document.getElementById('provider-api-key');
  const apikeyLabel = document.getElementById('apikey-label');
  const apikeyInfo = document.getElementById('apikey-info');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const settingsBody = document.getElementById('settings-body');
  const settingsSummary = document.getElementById('settings-summary');
  const settingsExpandBtn = document.getElementById('settings-expand-btn');
  const settingsToggle = document.getElementById('settings-toggle');
  const usageRow = document.getElementById('usage-row');
  const usagePeriodLabel = document.getElementById('usage-period-label');
  const usageCount = document.getElementById('usage-count');
  const usageBarFill = document.getElementById('usage-bar-fill');
  const searchInput = document.getElementById('station-search');
  const searchResults = document.getElementById('search-results');
  const selectedStationEl = document.getElementById('selected-station');
  const stationNameEl = document.getElementById('station-name');
  const clearStationBtn = document.getElementById('clear-station');
  const useLocationBtn = document.getElementById('use-location-btn');
  const addScheduleBtn = document.getElementById('add-schedule-btn');
  const schedulesList = document.getElementById('schedules-list');
  const formSection = document.getElementById('schedule-form-section');
  const formTitle = document.getElementById('form-title');
  const scheduleName = document.getElementById('schedule-name');
  const saveScheduleBtn = document.getElementById('save-schedule');
  const cancelScheduleBtn = document.getElementById('cancel-schedule');
  const forecastList = document.getElementById('forecast-list');
  const enableNotifBtn = document.getElementById('enable-notifications');
  const notifStatus = document.getElementById('notification-status');
  const timeStart = document.getElementById('time-start');
  const timeEnd = document.getElementById('time-end');
  const tideThreshold = document.getElementById('tide-threshold');
  const thresholdUnit = document.getElementById('threshold-unit');
  const nextTideSection = document.getElementById('next-tide-section');
  const nextTideResult = document.getElementById('next-tide-result');
  const checkNextTideBtn = document.getElementById('check-next-tide');
  const creditsBadge = document.getElementById('credits-badge');
  const dayCheckboxes = document.querySelectorAll('[name="sched-day"]');
  const notifyWhen = document.getElementById('notify-when');
  const notifyHoursRow = document.getElementById('notify-hours-row');
  const notifyHours = document.getElementById('notify-hours');
  const notifyCustomRow = document.getElementById('notify-custom-row');
  const notifyCustomTime = document.getElementById('notify-custom-time');
  const editingId = document.getElementById('editing-schedule-id');

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function getProvider() {
    return Storage.getProvider();
  }

  function getUnit() {
    return getProvider() === 'noaa' ? 'ft' : 'm';
  }

  // Toast
  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // --- Provider Settings (collapsible) ---
  const PROVIDER_INFO = {
    noaa: { keyLabel: '', signupUrl: '', signupText: '' },
    admiralty: {
      keyLabel: 'Admiralty API Key:',
      signupUrl: 'https://developer.admiralty.co.uk/',
      signupText: 'Free key from the <a href="https://developer.admiralty.co.uk/" target="_blank" rel="noopener">Admiralty Developer Portal</a>. Subscribe to "UK Tidal API - Discovery".',
    },
    stormglass: {
      keyLabel: 'Stormglass API Key:',
      signupUrl: 'https://stormglass.io/',
      signupText: 'Free key from <a href="https://stormglass.io/" target="_blank" rel="noopener">stormglass.io</a>. Sign up for a free account.',
    },
    tidecheck: {
      keyLabel: 'TideCheck API Key:',
      signupUrl: 'https://tidecheck.com/developers',
      signupText: 'Free key from <a href="https://tidecheck.com/developers" target="_blank" rel="noopener">tidecheck.com</a>. Sign up for the free plan.',
    },
  };

  function isProviderConfigured() {
    const provider = getProvider();
    if (provider === 'noaa') return true;
    return !!Storage.getApiKey(provider);
  }

  function collapseSettings() {
    settingsBody.classList.add('collapsed');
    const provider = getProvider();
    const providerName = Tides.providers[provider]?.name || provider;
    settingsSummary.textContent = providerName;
    settingsExpandBtn.style.display = '';
  }

  function expandSettings() {
    settingsBody.classList.remove('collapsed');
    settingsSummary.textContent = '';
    settingsExpandBtn.style.display = 'none';
    // Refresh the key field to show the correct provider's key
    const provider = getProvider();
    if (provider !== 'noaa') {
      apikeyInput.value = Storage.getApiKey(provider);
    }
  }

  settingsToggle.addEventListener('click', (e) => {
    // Don't toggle if clicking inside the body (form elements)
    if (settingsBody.contains(e.target)) return;
    if (settingsBody.classList.contains('collapsed')) {
      expandSettings();
    } else if (isProviderConfigured()) {
      collapseSettings();
    }
  });

  settingsExpandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandSettings();
  });

  function updateUsageUI() {
    const provider = getProvider();
    const hasLimits = provider !== 'noaa';

    // Settings usage bar
    if (!hasLimits) {
      usageRow.classList.add('hidden');
    } else {
      usageRow.classList.remove('hidden');
      const used = Storage.getUsage(provider);
      const limit = Storage.getLimit(provider);
      const remaining = Storage.getRemaining(provider);
      const pct = limit < Infinity ? Math.min(100, (used / limit) * 100) : 0;
      const limits = Storage.LIMITS[provider];

      usagePeriodLabel.textContent = limits.daily ? 'API usage today' : 'API usage this month';
      usageCount.textContent = `${used} / ${limit}`;
      usageBarFill.style.width = pct + '%';
      usageBarFill.classList.remove('warning', 'danger');
      if (remaining === 0) {
        usageBarFill.classList.add('danger');
      } else if (Storage.isNearLimit(provider)) {
        usageBarFill.classList.add('warning');
      }
    }

    // Credits badge
    if (!hasLimits) {
      creditsBadge.classList.add('hidden');
    } else {
      creditsBadge.classList.remove('hidden');
      creditsBadge.textContent = Storage.getLimitLabel(provider);
      creditsBadge.classList.remove('warning', 'danger');
      if (Storage.getRemaining(provider) === 0) {
        creditsBadge.classList.add('danger');
      } else if (Storage.isNearLimit(provider)) {
        creditsBadge.classList.add('warning');
      }
    }
  }

  function checkUsageWarnings() {
    const provider = getProvider();
    if (provider === 'noaa') return;
    if (Storage.isOverLimit(provider)) {
      const limits = Storage.LIMITS[provider];
      showToast(`${limits.daily ? 'Daily' : 'Monthly'} API limit reached. Resets ${limits.daily ? 'tomorrow' : 'next month'}.`);
    } else if (Storage.isNearLimit(provider)) {
      showToast(`Only ${Storage.getRemaining(provider)} API calls left`);
    }
  }

  function updateProviderUI() {
    const provider = getProvider();
    const info = PROVIDER_INFO[provider];
    providerSelect.value = provider;

    // API key row
    if (provider === 'noaa') {
      apikeyRow.classList.add('hidden');
    } else {
      apikeyRow.classList.remove('hidden');
      apikeyLabel.textContent = info.keyLabel;
      apikeyInput.value = Storage.getApiKey(provider);
      apikeyInfo.innerHTML = info.signupText;
    }

    thresholdUnit.textContent = `Low tides below this level (${getUnit()}) trigger a notification`;

    if (provider === 'noaa') {
      searchInput.placeholder = 'Search US tide stations...';
    } else {
      searchInput.placeholder = 'Search tide stations (e.g. Ramsgate, Dover...)';
    }

    updateUsageUI();

    if (isProviderConfigured()) {
      collapseSettings();
    } else {
      expandSettings();
    }
  }

  providerSelect.addEventListener('change', () => {
    Storage.setProvider(providerSelect.value);
    updateProviderUI();

    // Restore saved station for this provider, or show search
    const savedStation = Storage.getStation();
    if (savedStation) {
      selectStation(savedStation);
    } else {
      selectedStationEl.classList.add('hidden');
      searchInput.classList.remove('hidden');
      useLocationBtn.classList.remove('hidden');
      nextTideSection.classList.add('hidden');
      forecastList.innerHTML = '<p class="placeholder">Select a station to see upcoming low tides.</p>';
    }
    renderSchedules();
  });

  saveApiKeyBtn.addEventListener('click', () => {
    const provider = getProvider();
    const key = apikeyInput.value.trim();
    if (!key) {
      showToast('Please enter an API key');
      return;
    }
    Storage.setApiKey(provider, key);
    showToast('API key saved! Loading stations...');
    collapseSettings();
    // Prefetch stations so first search is instant
    Tides.fetchStations(provider).then(() => {
      showToast('Stations loaded — search away!');
    }).catch(err => {
      showToast('Could not load stations: ' + err.message);
    });
  });

  // --- Station Selection ---
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      searchResults.classList.add('hidden');
      return;
    }
    // Show loading immediately
    searchResults.innerHTML = '<div class="search-result-item">Searching...<span class="loading"></span></div>';
    searchResults.classList.remove('hidden');

    searchTimeout = setTimeout(async () => {
      try {
        const results = await Tides.searchStations(query, getProvider());
        renderSearchResults(results);
      } catch (err) {
        const msg = err.message || 'Unknown error';
        searchResults.innerHTML = `<div class="search-result-item">Error: ${msg}</div>`;
        showToast(msg.includes('API key') ? 'Add your Admiralty API key first' : msg);
        console.error('Search failed:', err);
      }
    }, 300);
  });

  function renderSearchResults(results) {
    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-result-item">No stations found</div>';
    } else {
      searchResults.innerHTML = results.map(s =>
        `<div class="search-result-item" data-id="${s.id}" data-name="${s.name}" data-state="${s.state}" data-lat="${s.lat}" data-lng="${s.lng}" data-provider="${s.provider}">
          ${s.name}${s.state ? ', ' + s.state : ''}
          <div class="station-id">#${s.id}</div>
        </div>`
      ).join('');
    }
    searchResults.classList.remove('hidden');
  }

  searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item || !item.dataset.id) return;
    selectStation({
      id: item.dataset.id,
      name: item.dataset.name,
      state: item.dataset.state,
      lat: parseFloat(item.dataset.lat),
      lng: parseFloat(item.dataset.lng),
      provider: item.dataset.provider,
    });
  });

  function selectStation(station) {
    Storage.setStation(station);
    stationNameEl.textContent = `${station.name}${station.state ? ', ' + station.state : ''}`;
    selectedStationEl.classList.remove('hidden');
    searchInput.value = '';
    searchResults.classList.add('hidden');
    searchInput.classList.add('hidden');
    useLocationBtn.classList.add('hidden');
    nextTideSection.classList.remove('hidden');
    updateUsageUI();
    refreshForecast();
  }

  clearStationBtn.addEventListener('click', () => {
    Storage.clearStation();
    selectedStationEl.classList.add('hidden');
    searchInput.classList.remove('hidden');
    useLocationBtn.classList.remove('hidden');
    nextTideSection.classList.add('hidden');
    forecastList.innerHTML = '<p class="placeholder">Select a station to see upcoming low tides.</p>';
  });

  // --- Check Next Low Tide ---
  checkNextTideBtn.addEventListener('click', async () => {
    const station = Storage.getStation();
    if (!station) {
      showToast('Select a beach first');
      return;
    }

    checkNextTideBtn.disabled = true;
    checkNextTideBtn.textContent = 'Checking...';
    nextTideResult.innerHTML = '<p class="placeholder">Fetching tide data...<span class="loading"></span></p>';

    try {
      const provider = station.provider || getProvider();
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 7);

      const predictions = await Tides.fetchPredictions(station.id, now, end, provider);
      const lowTides = predictions.filter(p => p.type === 'L' && p.time > now);

      updateUsageUI();

      if (lowTides.length === 0) {
        nextTideResult.innerHTML = '<p class="placeholder">No low tides found in the next 7 days.</p>';
        return;
      }

      const next = lowTides[0];
      const timeStr = next.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dateStr = next.time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      const unit = next.unit || getUnit();

      // How far away
      const diffMs = next.time.getTime() - Date.now();
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      let countdown;
      if (diffHrs >= 24) {
        const days = Math.floor(diffHrs / 24);
        countdown = `in ${days} day${days > 1 ? 's' : ''}`;
      } else if (diffHrs > 0) {
        countdown = `in ${diffHrs}h ${diffMins}m`;
      } else {
        countdown = `in ${diffMins} min`;
      }

      nextTideResult.innerHTML = `
        <div class="next-tide-card">
          <div class="next-tide-icon">🌊</div>
          <div class="next-tide-info">
            <div class="next-tide-time">${timeStr} &middot; ${countdown}</div>
            <div class="next-tide-date">${dateStr}</div>
          </div>
          <div class="next-tide-height">${next.height.toFixed(1)} ${unit}</div>
        </div>`;
    } catch (err) {
      nextTideResult.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
    } finally {
      checkNextTideBtn.disabled = false;
      checkNextTideBtn.textContent = 'Check Next Low Tide';
    }
  });

  useLocationBtn.addEventListener('click', async () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser');
      return;
    }
    useLocationBtn.textContent = 'Finding nearest station...';
    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const station = await Tides.findNearest(
            pos.coords.latitude, pos.coords.longitude, getProvider()
          );
          if (station) {
            selectStation(station);
            showToast(`Found: ${station.name}`);
          }
        } catch (err) {
          showToast(err.message.includes('API key')
            ? 'Add your API key first'
            : 'Failed to find nearby station');
        } finally {
          useLocationBtn.textContent = 'Use My Location';
          useLocationBtn.disabled = false;
        }
      },
      () => {
        showToast('Location access denied');
        useLocationBtn.textContent = 'Use My Location';
        useLocationBtn.disabled = false;
      }
    );
  });

  // --- Schedule Form ---
  function showForm(schedule) {
    formSection.classList.remove('hidden');
    if (schedule) {
      formTitle.textContent = 'Edit Schedule';
      editingId.value = schedule.id;
      scheduleName.value = schedule.name || '';
      timeStart.value = schedule.timeStart;
      timeEnd.value = schedule.timeEnd;
      tideThreshold.value = schedule.tideThreshold;
      dayCheckboxes.forEach(cb => {
        cb.checked = schedule.days.includes(parseInt(cb.value));
      });
      notifyWhen.value = schedule.notifyWhen || 'evening_before';
      notifyHours.value = schedule.notifyHours || 3;
      notifyCustomTime.value = schedule.notifyCustomTime || '20:00';
    } else {
      formTitle.textContent = 'New Schedule';
      editingId.value = '';
      scheduleName.value = '';
      timeStart.value = '06:00';
      timeEnd.value = '20:00';
      tideThreshold.value = getProvider() === 'noaa' ? '1.0' : '0.5';
      dayCheckboxes.forEach(cb => { cb.checked = false; });
      notifyWhen.value = 'evening_before';
      notifyHours.value = 3;
      notifyCustomTime.value = '20:00';
    }
    updateNotifyFields();
    formSection.scrollIntoView({ behavior: 'smooth' });
  }

  function hideForm() {
    formSection.classList.add('hidden');
    editingId.value = '';
  }

  addScheduleBtn.addEventListener('click', () => showForm(null));
  cancelScheduleBtn.addEventListener('click', hideForm);

  notifyWhen.addEventListener('change', updateNotifyFields);

  function updateNotifyFields() {
    notifyHoursRow.classList.toggle('hidden', notifyWhen.value !== 'hours_before');
    notifyCustomRow.classList.toggle('hidden', notifyWhen.value !== 'custom_time');
  }

  saveScheduleBtn.addEventListener('click', () => {
    const days = [];
    dayCheckboxes.forEach(cb => {
      if (cb.checked) days.push(parseInt(cb.value));
    });
    if (days.length === 0) {
      showToast('Please select at least one day');
      return;
    }

    const schedule = {
      name: scheduleName.value.trim() || 'My Walk',
      days,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value,
      tideThreshold: parseFloat(tideThreshold.value),
      notifyWhen: notifyWhen.value,
      notifyHours: parseInt(notifyHours.value),
      notifyCustomTime: notifyCustomTime.value,
    };

    if (editingId.value) {
      Storage.updateSchedule(editingId.value, schedule);
      showToast('Schedule updated!');
    } else {
      Storage.addSchedule(schedule);
      showToast('Schedule added!');
    }

    hideForm();
    renderSchedules();
    refreshForecast();
    syncNotifications();
  });

  // --- Render Schedule Cards ---
  function getNotifyLabel(schedule) {
    switch (schedule.notifyWhen) {
      case 'evening_before': return 'Notify: evening before (6 PM)';
      case 'morning_of': return 'Notify: morning of (7 AM)';
      case 'hours_before': return `Notify: ${schedule.notifyHours}h before low tide`;
      case 'custom_time': return `Notify: day before at ${schedule.notifyCustomTime}`;
      default: return 'Notify: evening before';
    }
  }

  function renderSchedules() {
    const schedules = Storage.getSchedules();
    const unit = getUnit();
    if (schedules.length === 0) {
      schedulesList.innerHTML = '<p class="placeholder">No schedules yet. Tap + to add one.</p>';
      return;
    }

    schedulesList.innerHTML = schedules.map(s => {
      const dayLabels = s.days.map(d => DAY_NAMES[d]).join(', ');
      return `
        <div class="schedule-card" data-id="${s.id}">
          <div class="schedule-card-header">
            <strong class="schedule-card-name">${s.name || 'My Walk'}</strong>
            <div class="schedule-card-actions">
              <button class="btn-icon edit-schedule" title="Edit">&#9998;</button>
              <button class="btn-icon delete-schedule" title="Delete">&times;</button>
            </div>
          </div>
          <div class="schedule-card-details">
            <div>${dayLabels}</div>
            <div>${s.timeStart} – ${s.timeEnd} &middot; max ${s.tideThreshold} ${unit}</div>
            <div class="schedule-notify-label">${getNotifyLabel(s)}</div>
          </div>
        </div>`;
    }).join('');
  }

  schedulesList.addEventListener('click', (e) => {
    const card = e.target.closest('.schedule-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('.delete-schedule')) {
      Storage.removeSchedule(id);
      renderSchedules();
      refreshForecast();
      syncNotifications();
      showToast('Schedule deleted');
      return;
    }

    if (e.target.closest('.edit-schedule')) {
      const schedules = Storage.getSchedules();
      const schedule = schedules.find(s => s.id === id);
      if (schedule) showForm(schedule);
    }
  });

  // --- Forecast ---
  async function refreshForecast() {
    const station = Storage.getStation();
    const schedules = Storage.getSchedules();
    if (!station || schedules.length === 0) {
      forecastList.innerHTML = '<p class="placeholder">Add a schedule to see upcoming low tides.</p>';
      return;
    }

    forecastList.innerHTML = '<p class="placeholder">Loading tide predictions...<span class="loading"></span></p>';

    try {
      const provider = station.provider || getProvider();
      const tides = await Tides.getMatchingLowTides(station.id, schedules, provider);
      const unit = tides.length > 0 ? tides[0].unit : getUnit();

      if (tides.length === 0) {
        forecastList.innerHTML = '<p class="placeholder">No matching low tides in the next 7 days.</p>';
        return;
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toDateString();

      forecastList.innerHTML = tides.map(t => {
        const isTomorrow = t.time.toDateString() === tomorrowStr;
        const dayName = t.time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = t.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const schedLabel = t.schedule ? t.schedule.name : '';
        return `
          <div class="forecast-item${isTomorrow ? ' tomorrow' : ''}">
            <div>
              <div class="date">${dayName}${isTomorrow ? ' (Tomorrow)' : ''}</div>
              <div class="time">${timeStr}${schedLabel ? ' &middot; ' + schedLabel : ''}</div>
            </div>
            <div class="height">${t.height.toFixed(1)} ${unit}</div>
          </div>`;
      }).join('');
    } catch (err) {
      forecastList.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
    }
    updateUsageUI();
    checkUsageWarnings();
  }

  // --- Notifications ---
  function updateNotifUI() {
    const status = Notifications.getStatus();
    const dot = notifStatus.querySelector('.status-dot');
    const text = notifStatus.querySelector('.status-text');

    if (status === 'granted') {
      dot.className = 'status-dot active';
      text.textContent = 'Notifications enabled';
      enableNotifBtn.style.display = 'none';
    } else if (status === 'denied') {
      dot.className = 'status-dot denied';
      text.textContent = 'Notifications blocked - enable in browser settings';
      enableNotifBtn.style.display = 'none';
    } else if (status === 'unsupported') {
      dot.className = 'status-dot';
      text.textContent = 'Notifications not supported in this browser';
      enableNotifBtn.style.display = 'none';
    } else {
      dot.className = 'status-dot';
      text.textContent = 'Notifications not yet enabled';
      enableNotifBtn.style.display = '';
    }
  }

  enableNotifBtn.addEventListener('click', async () => {
    const result = await Notifications.requestPermission();
    updateNotifUI();
    if (result === 'granted') {
      showToast('Notifications enabled!');
      Notifications.scheduleAll();
    }
  });

  function syncNotifications() {
    Notifications.scheduleAll();
  }

  // Auto-detect nearest station
  async function autoDetectStation() {
    if (!navigator.geolocation) return;
    // Don't auto-detect if Admiralty without key
    const provider = getProvider();
    if (provider === 'admiralty' && !Storage.getApiKey('admiralty')) return;

    useLocationBtn.textContent = 'Detecting nearest beach...';
    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const station = await Tides.findNearest(
            pos.coords.latitude, pos.coords.longitude, provider
          );
          if (station) {
            selectStation(station);
            showToast(`Nearest beach: ${station.name}`);
          }
        } catch (err) {
          showToast('Could not find nearby station');
          console.error('Auto-detect failed:', err);
        } finally {
          useLocationBtn.textContent = 'Use My Location';
          useLocationBtn.disabled = false;
        }
      },
      () => {
        useLocationBtn.textContent = 'Use My Location';
        useLocationBtn.disabled = false;
      }
    );
  }

  // --- Init ---
  // Don't await SW — it can fail on subdirectory hosting and block everything
  Notifications.registerServiceWorker();

  updateProviderUI();
  checkUsageWarnings();

  const savedStation = Storage.getStation();
  if (savedStation) {
    selectStation(savedStation);
  } else {
    autoDetectStation();
  }

  renderSchedules();
  updateNotifUI();
  refreshForecast();

  if (Notifications.getStatus() === 'granted') {
    Notifications.scheduleAll();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshForecast();
  });
})();
