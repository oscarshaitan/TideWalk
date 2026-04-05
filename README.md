# TideWalk

Never miss a low tide walk. TideWalk notifies you at the time you choose when a low tide matches your walking schedule.

## Features

- **US & UK Coverage** - NOAA (US, free) and UK Admiralty (UK, free API key) tide providers
- **Beach Selection** - Search tide stations by name or use GPS to find the nearest one
- **Multiple Schedules** - Create as many walking schedules as you need, each with its own days, time window, and tide threshold
- **Flexible Notifications** - Choose when to be notified per schedule:
  - Evening before (6 PM)
  - Morning of (7 AM)
  - A set number of hours before the low tide
  - A custom time the day before
- **7-Day Forecast** - See upcoming low tides that match your schedules
- **Works Offline** - Progressive Web App with Service Worker caching
- **No Backend** - Runs entirely in the browser, data stays in localStorage

## Getting Started

1. Enable GitHub Pages on this repo (Settings > Pages > Source: main branch)
2. Visit `https://<username>.github.io/TideWalk/`
3. **US users**: Select NOAA (default) — no setup needed
4. **UK users**: Select UK Admiralty, then add a free API key:
   - Sign up at the [Admiralty Developer Portal](https://developer.admiralty.co.uk/)
   - Subscribe to **UK Tidal API - Discovery** (free)
   - Copy your key and paste it into TideWalk's settings
5. Search for your beach or tap "Use My Location"
6. Add a walking schedule and enable notifications

## How It Works

1. You pick a beach and create one or more walking schedules (days, time window, max tide height)
2. TideWalk fetches the next 7 days of tide predictions from NOAA or UK Admiralty
3. Low tides that fall within your schedule are shown in the forecast
4. At the notification time you chose, you get a browser alert with the tide details
5. Notifications use exact `setTimeout` timers — no polling, no wasted checks

## Tide Providers

| Provider | Region | API Key | Units | Stations |
|----------|--------|---------|-------|----------|
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | United States | Not needed | Feet | ~3000 |
| [UK Admiralty](https://developer.admiralty.co.uk/) | United Kingdom | Free (Discovery tier) | Metres | ~600 |

## Project Structure

```
TideWalk/
  index.html             Single-page app
  manifest.json          PWA manifest
  favicon.svg            Wave icon
  sw.js                  Service Worker (offline + background notifications)
  css/
    style.css            Ocean-themed responsive styles
  js/
    storage.js           localStorage for station, schedules, API keys
    tides.js             Multi-provider tide API client
    notifications.js     Notification scheduling with exact timers
    app.js               UI logic, schedule CRUD, provider settings
```

## Tech Stack

- Vanilla HTML, CSS, JavaScript — no build step, no dependencies
- Service Worker for offline support and background notification timers
- NOAA CO-OPS API and UK Admiralty Tidal API
- Inter font via Google Fonts
