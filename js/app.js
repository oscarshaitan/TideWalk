/**
 * TideWalk main application logic.
 * Multi-provider, multiple schedules, per-schedule notification timing.
 */
(async function () {
  // DOM elements
  const providerSelect = document.getElementById('provider-select');
  const admiraltyKeyRow = document.getElementById('admiralty-key-row');
  const admiraltyKeyInput = document.getElementById('admiralty-key');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const settingsBody = document.getElementById('settings-body');
  const settingsSummary = document.getElementById('settings-summary');
  const settingsExpandBtn = document.getElementById('settings-expand-btn');
  const settingsToggle = document.getElementById('settings-toggle');
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
    return getProvider() === 'admiralty' ? 'm' : 'ft';
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
  function isProviderConfigured() {
    const provider = getProvider();
    if (provider === 'noaa') return true;
    if (provider === 'admiralty') return !!Storage.getApiKey('admiralty');
    return false;
  }

  function collapseSettings() {
    settingsBody.classList.add('collapsed');
    const provider = getProvider();
    const providerName = provider === 'admiralty' ? 'UK Admiralty' : 'NOAA (US)';
    settingsSummary.textContent = providerName;
    settingsExpandBtn.style.display = '';
  }

  function expandSettings() {
    settingsBody.classList.remove('collapsed');
    settingsSummary.textContent = '';
    settingsExpandBtn.style.display = 'none';
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

  function updateProviderUI() {
    const provider = getProvider();
    providerSelect.value = provider;
    admiraltyKeyRow.classList.toggle('hidden', provider !== 'admiralty');
    admiraltyKeyInput.value = Storage.getApiKey('admiralty');
    thresholdUnit.textContent = `Low tides below this level (${getUnit()}) trigger a notification`;

    if (provider === 'noaa') {
      searchInput.placeholder = 'Search US tide stations...';
    } else {
      searchInput.placeholder = 'Search UK tide stations (e.g. Ramsgate, Dover...)';
    }

    // Auto-collapse if already configured
    if (isProviderConfigured()) {
      collapseSettings();
    } else {
      expandSettings();
    }
  }

  providerSelect.addEventListener('change', () => {
    Storage.setProvider(providerSelect.value);
    Storage.clearStation();
    selectedStationEl.classList.add('hidden');
    searchInput.style.display = '';
    useLocationBtn.style.display = '';
    updateProviderUI();
    renderSchedules();
    forecastList.innerHTML = '<p class="placeholder">Select a station to see upcoming low tides.</p>';
  });

  saveApiKeyBtn.addEventListener('click', () => {
    const key = admiraltyKeyInput.value.trim();
    if (!key) {
      showToast('Please enter an API key');
      return;
    }
    Storage.setApiKey('admiralty', key);
    showToast('API key saved!');
    // Collapse after saving
    collapseSettings();
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
    searchTimeout = setTimeout(async () => {
      try {
        const results = await Tides.searchStations(query, getProvider());
        renderSearchResults(results);
      } catch (err) {
        if (err.message.includes('API key')) {
          showToast('Please add your Admiralty API key first');
        } else {
          showToast('Search failed: ' + err.message);
          console.error('Search failed:', err);
        }
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
    searchInput.style.display = 'none';
    useLocationBtn.style.display = 'none';
    refreshForecast();
  }

  clearStationBtn.addEventListener('click', () => {
    Storage.clearStation();
    selectedStationEl.classList.add('hidden');
    searchInput.style.display = '';
    useLocationBtn.style.display = '';
    forecastList.innerHTML = '<p class="placeholder">Select a station to see upcoming low tides.</p>';
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
      tideThreshold.value = getProvider() === 'admiralty' ? '1.5' : '1.0';
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

    useLocationBtn.textContent = 'Detecting nearest beach...';
    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const station = await Tides.findNearest(
            pos.coords.latitude, pos.coords.longitude, getProvider()
          );
          if (station) {
            selectStation(station);
            showToast(`Nearest beach: ${station.name}`);
          }
        } catch (err) {
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
  await Notifications.registerServiceWorker();

  updateProviderUI();

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
