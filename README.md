# Patrouille des Glaciers — Live Tracker

An interactive web app to visualize team positions during the [Patrouille des Glaciers](https://www.pdg.ch/) race, with a live map and elevation profile.

![Screenshot placeholder](https://placehold.co/800x400?text=PDG+Live+Tracker)

## Features

- **Interactive map** — team markers updated over time, colored by start wave
- **Timeline playback** — play/pause, step forward/back, adjustable speed (1×–20×)
- **Elevation profile** — race route altitude chart with current position indicator
- **Filtering** — search by team name or bib number, filter by race or start time
- **No server required** — pure static files, deployable on GitHub Pages

## Data format

The app reads two JSON files from the `data/` folder:

**`data/teams.json`** — array of team objects:
```json
[
  {
    "id": 9704,
    "bib": "2155",
    "name": "ALTIVORES",
    "rank": 12,
    "category_key": "Z2-P1",
    "start_time": "20:45"
  }
]
```

**`data/positions.json.gz`** — gzip-compressed array of position records:
```json
[
  {
    "timestamp": 1776488657,
    "datetime": "2026-04-17 22:00:00",
    "team_id": 9704,
    "latitude": 46.06164398,
    "longitude": 7.386751667
  }
]
```

A helper script [`export_web.py`](export_web.py) is included to generate these files from a pandas DataFrame.

## Configuration

Edit the `CONFIG` object at the top of [`app.js`](app.js) to match your race:

```javascript
const CONFIG = {
    startTime: new Date('2026-04-17T22:00:00+02:00'),
    endTime:   new Date('2026-04-18T16:30:00+02:00'),
    dataInterval: 2,           // minutes between GPS points
    mapCenter: [46.05, 7.40],
    mapZoom: 11,
    startTimeColors: {
        '2000': '#ef4444',     // wave 20:00
        '2045': '#f59e0b',     // wave 20:45
    }
};
```

## Deployment

The app is fully static — just serve the files. The easiest option is GitHub Pages:

1. Push the repository to GitHub.
2. Go to **Settings → Pages**, set source to `main / (root)`, and save.
3. Your tracker will be live at `https://<username>.github.io/<repo>/`.

## Dependencies

Loaded via CDN — no install needed:

| Library | Version | Purpose |
|---------|---------|---------|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | Interactive map |
| [Pako](https://nodeca.github.io/pako/) | 2.1.0 | Gzip decompression |
| [Plotly.js](https://plotly.com/javascript/) | 2.27.0 | Elevation profile chart |

## Browser support

Chrome/Edge 90+, Firefox 88+, Safari 14+

## License

MIT
