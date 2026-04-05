# TideWalk

Never miss a low tide walk. TideWalk notifies you the evening before when a low tide matches your walking schedule.

## Features

- **Beach Selection** - Search NOAA tide stations or use your GPS location to find the nearest one
- **Walking Schedule** - Pick your preferred days and time window
- **Low Tide Alerts** - Browser notifications the evening before when tide conditions match
- **7-Day Forecast** - See upcoming low tides that fit your schedule
- **Works Offline** - Service Worker caches the app for offline use (PWA)

## Setup

1. Enable GitHub Pages on this repo (Settings > Pages > Source: main branch)
2. Visit your site at `https://<username>.github.io/TideWalk/`
3. Select a beach station and set your schedule
4. Enable notifications when prompted

## How It Works

- Uses the free [NOAA CO-OPS API](https://tidesandcurrents.noaa.gov/api/) for tide predictions (US coastal stations)
- Stores your preferences in localStorage (nothing leaves your browser)
- Service Worker checks tides periodically and sends browser notifications
- No backend server required - runs entirely in the browser

## Tech Stack

- Vanilla HTML, CSS, JavaScript
- Service Worker for offline support and background notifications
- NOAA CO-OPS Tides & Currents API
