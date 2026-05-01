# Patrouille des Glaciers — Live Tracker

An interactive web app to visualize team positions during the [Patrouille des Glaciers](https://www.pdg.ch/) race, with a live map and elevation profile.

## Features

- **Interactive map** — team markers updated over time, colored by start wave
- **Timeline playback** — play/pause, step forward/back, adjustable speed (1×–20×)
- **Elevation profile** — race route altitude chart with current position indicator
- **Filtering** — search by team name or bib number, filter by race or start time
- **No server required** — pure static files, deployable on GitHub Pages

## Data format

The app reads files from the `data/` folder. All times use **t**, an integer number of minutes elapsed since 22:00 on race night (e.g. `t=135` means 00:15, `t=330` means 03:30).

### `data/teamsPDG.json`

One file, all races. Array of team objects:

```json
[
  {
    "id": 9704,
    "bib": "2155",
    "name": "ALTIVORES",
    "rank": 12,
    "race": "Z2",
    "category": "Z2-P1",
    "t_start": 45,
    "t_end": 780,
    "status": "Finished",
    "time": "12:45:00",
    "start_time": "22:45"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `t_start` | int | Minutes from 22:00 when the team starts |
| `t_end` | int \| null | Minutes from 22:00 when the team finishes/stops (`null` if DNF/still running) |
| `status` | string | Final status: `Finished`, `DidNotFinish`, `Disqualified` |
| `time` | string | Final race time `HH:MM:SS`, shown once `t >= t_end` |
| `start_time` | string | Wall-clock start time `HH:MM` (redundant with `t_start`, not read by the app) |

### `data/positions<RACE>.json.gz`

One gzip-compressed file per race (`positionsZ1.json.gz`, `positionsZ2.json.gz`, `positionsA1.json.gz`, `positionsA2.json.gz`). Loaded on demand when the user activates a race.

```json
{
  "meta": { "interval": 2 },
  "frames": [
    [[9704, 46.0616, 7.3867, 0.1, 1520], [9705, 46.0620, 7.3871, 0.3, 1530]],
    [[9704, 46.0630, 7.3890, 0.5, 1540], [9705, 46.0635, 7.3895, 0.7, 1550]],
    "..."
  ]
}
```

`frames[i]` contains all team positions at `t = i × interval` minutes. Each entry is a compact array `[team_id, latitude, longitude, distance_km, elevation_m]`. The `distance` field must already include any route offset (e.g. the +28.39 km for A-race teams on the combined profile).

### `data/profil_traceZ.json` / `data/profil_traceA.json`

Elevation profile as an array of `{dist, alt}` points used to draw the background chart. The A-race file exists in the repo but is not yet loaded by the app (A-race support is planned).

### `data/traceZ.gpx` / `data/traceA.gpx`

GPX file of the race route, displayed as a polyline on the map. The A-race file exists in the repo but is not yet loaded by the app.

## Configuration

Edit the `CONFIG` object at the top of [`app.js`](app.js) to match your race:

```javascript
const CONFIG = {
    T0:           22 * 60,  // reference hour = 22:00 (minutes from midnight)
    T_MAX:        555,     // index timeline length (22:00 → 16:30 = 18.5h) * 60 / dataInterval
    dataInterval: 2,        // minutes between GPS frames

    mapCenter: [46.020896, 7.480691],
    mapZoom: 12,

    // Colors for each start wave, keyed by t_start value (minutes from T0)
    startTimeColors: {
        0:   '#02d8fd',  // 22:00
        45:  '#f71212',  // 22:45
        // ... add your waves
    }
};
```

## Deployment

The app is fully static — just serve the files. The easiest option is GitHub Pages.

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
