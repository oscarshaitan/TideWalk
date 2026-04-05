/**
 * TideWalk main application logic.
 */
(async function () {
  // DOM elements
  const searchInput = document.getElementById('station-search');
  const searchResults = document.getElementById('search-results');
  const selectedStationEl = document.getElementById('selected-station');
  const stationNameEl = document.getElementById('station-name');
  const clearStationBtn = document.getElementById('clear-station');
  const useLocationBtn = document.getElementById('use-location-btn');
  const saveScheduleBtn = document.getElementById('save-schedule');
  const forecastList = document.getElementById('forecast-list');
  const enableNotifBtn = document.getElementById('enable-notifications');
  const notifStatus = document.getElementById('notification-status');
  const timeStart = document.getElementById('time-start');
  const timeEnd = document.getElementById('time-end');
  const tideThreshold = document.getElementById('tide-threshold');
  const dayCheckboxes = document.querySelectorAll('.day-chip input');

  // Toast helper
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
        const results = await Tides.searchStations(query);
        renderSearchResults(results);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 300);
  });

  function renderSearchResults(results) {
    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-result-item">No stations found</div>';
    } else {
      searchResults.innerHTML = results.map(s =>
        `<div class="search-result-item" data-id="${s.id}" data-name="${s.name}" data-state="${s.state}" data-lat="${s.lat}" data-lng="${s.lng}">
          ${s.name}${s.state ? ', ' + s.state : ''}
          <div class="station-id">Station #${s.id}</div>
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
    });
  });

  function selectStation(station) {
    Storage.setStation(station);
    stationNameEl.textContent = `${station.name}${station.state ? ', ' + station.state : ''} (#${station.id})`;
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
    forecastList.innerHTML = '<p class="placeholder">Select a station and save your schedule to see upcoming low tides.</p>';
  });

  // Use geolocation
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
          const station = await Tides.findNearest(pos.coords.latitude, pos.coords.longitude);
          if (station) {
            selectStation(station);
            showToast(`Found: ${station.name}`);
          }
        } catch (err) {
          showToast('Failed to find nearby station');
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

  // --- Schedule ---
  function loadSchedule() {
    const schedule = Storage.getSchedule();
    timeStart.value = schedule.timeStart;
    timeEnd.value = schedule.timeEnd;
    tideThreshold.value = schedule.tideThreshold;
    dayCheckboxes.forEach(cb => {
      cb.checked = schedule.days.includes(parseInt(cb.value));
    });
  }

  function getScheduleFromForm() {
    const days = [];
    dayCheckboxes.forEach(cb => {
      if (cb.checked) days.push(parseInt(cb.value));
    });
    return {
      days,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value,
      tideThreshold: parseFloat(tideThreshold.value),
    };
  }

  saveScheduleBtn.addEventListener('click', () => {
    const schedule = getScheduleFromForm();
    if (schedule.days.length === 0) {
      showToast('Please select at least one day');
      return;
    }
    Storage.setSchedule(schedule);
    showToast('Schedule saved!');
    refreshForecast();
  });

  // --- Forecast ---
  async function refreshForecast() {
    const station = Storage.getStation();
    const schedule = Storage.getSchedule();
    if (!station || schedule.days.length === 0) return;

    forecastList.innerHTML = '<p class="placeholder">Loading tide predictions...<span class="loading"></span></p>';

    try {
      const tides = await Tides.getMatchingLowTides(station.id, schedule);
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
        return `
          <div class="forecast-item${isTomorrow ? ' tomorrow' : ''}">
            <div>
              <div class="date">${dayName}${isTomorrow ? ' (Tomorrow)' : ''}</div>
              <div class="time">${timeStr}</div>
            </div>
            <div class="height">${t.height.toFixed(1)} ft</div>
          </div>`;
      }).join('');
    } catch (err) {
      forecastList.innerHTML = `<p class="placeholder">Error loading predictions: ${err.message}</p>`;
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
      Notifications.startPeriodicCheck();
    }
  });

  // Auto-detect nearest station via geolocation
  async function autoDetectStation() {
    if (!navigator.geolocation) return;

    // Show a loading state in the station section
    useLocationBtn.textContent = 'Detecting nearest beach...';
    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const station = await Tides.findNearest(pos.coords.latitude, pos.coords.longitude);
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
        // Permission denied or error — just leave the manual picker visible
        useLocationBtn.textContent = 'Use My Location';
        useLocationBtn.disabled = false;
      }
    );
  }

  // --- Init ---
  // Register service worker
  await Notifications.registerServiceWorker();

  // Load saved state or auto-detect for new users
  const savedStation = Storage.getStation();
  if (savedStation) {
    selectStation(savedStation);
  } else {
    autoDetectStation();
  }
  loadSchedule();
  updateNotifUI();

  // Start notification checks if enabled
  if (Notifications.getStatus() === 'granted') {
    Notifications.startPeriodicCheck();
  }

  // Refresh forecast on visibility change (user returns to tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshForecast();
    }
  });
})();
