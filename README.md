# TideWalk

Never miss a low tide walk. TideWalk notifies you at the time you choose when a low tide matches your walking schedule.

## Features

- **4 Tide Providers** — TideCheck (default), Stormglass, UK Admiralty, NOAA
- **Global Coverage** — works for beaches worldwide, including Ramsgate and all UK coasts
- **Beach Selection** — search tide stations by name or use GPS to find the nearest one
- **Multiple Schedules** — create as many walking schedules as you need, each with its own days, time window, and tide threshold
- **Flexible Notifications** — choose when to be notified per schedule:
  - Evening before (6 PM)
  - Morning of (7 AM)
  - A set number of hours before the low tide
  - A custom time the day before
- **Check Next Low Tide** — one-tap button to see the next low tide with a countdown
- **Smart API Usage** — only fetches when tomorrow matches a schedule, caches results for 6 hours
- **Credits Tracking** — live counter of remaining API calls with warnings
- **Animated UI** — flowing header waves, staggered card entrances, dark mode
- **Works Offline** — Progressive Web App with Service Worker caching
- **No Backend** — runs entirely in the browser, data stays in localStorage

## Getting Started

1. Enable GitHub Pages on this repo (Settings > Pages > Source: main branch)
2. Visit `https://<username>.github.io/TideWalk/`
3. Pick a tide provider (TideCheck is the default — best free tier)
4. Sign up for a free API key at the provider's site and paste it in
5. Search for your beach or tap "Use My Location"
6. Add a walking schedule and enable notifications

## Tide Providers

| Provider | Region | Free Tier | API Key | CORS |
|----------|--------|-----------|---------|------|
| [TideCheck](https://tidecheck.com/developers) (default) | Global | 50 req/day | Required (free) | Yes |
| [Stormglass](https://stormglass.io/) | Global | 10 req/day | Required (free) | Yes |
| [UK Admiralty](https://developer.admiralty.co.uk/) | United Kingdom | 10,000/month | Required (free) | No (uses proxy) |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | United States | Unlimited | Not needed | Yes |

**Recommended**: TideCheck or Stormglass for UK/international beaches. With the smart daily check (1 call per notification), even 10 req/day is plenty.

## How It Works

1. You pick a beach and create one or more walking schedules (days, time window, max tide height)
2. At your chosen notification time, TideWalk checks if tomorrow matches any schedule
3. If it does, it fetches tide predictions (1 API call) and caches them for 6 hours
4. If a low tide matches, you get a browser notification with the tide time and height
5. The "Check Next Low Tide" button lets you manually check anytime
6. Notifications use exact `setTimeout` timers — no polling

## Project Structure

```
TideWalk/
  index.html             Single-page app
  manifest.json          PWA manifest
  favicon.svg            Wave icon
  sw.js                  Service Worker (offline + background notifications)
  css/
    style.css            Ocean-themed responsive styles, animations, dark mode
  js/
    storage.js           localStorage: station, schedules, API keys, usage tracking, cache
    tides.js             Multi-provider tide API client with smart caching
    notifications.js     Notification scheduling with exact timers
    app.js               UI logic, schedule CRUD, provider settings
```

## Tech Stack

- Vanilla HTML, CSS, JavaScript — no build step, no dependencies
- Service Worker for offline support and background notification timers
- 4 tide APIs: TideCheck, Stormglass, UK Admiralty, NOAA CO-OPS
- Inter font via Google Fonts
- Animated SVG waves, dark mode via `prefers-color-scheme`
