// ===== CONFIG =====
// Time reference: t=0 corresponds to 22:00 (minutes from midnight).
// All t_start / t_end values in teams.json use this same origin.
//
// Expected data formats:
//   teams.json      → [{id, bib, name, rank, race, category, t_start, t_end, status, time}, ...]
//   positions_<RACE>.json.gz → {
//       meta: {interval: 2},
//       frames: [                         // frames[i] = positions at t = i*interval minutes
//           [[team_id, lat, lon, dist, elev], ...],
//           ...
//       ]
//   }

const CONFIG = {
    T0: 22 * 60,        // 22:00 in minutes from midnight
    T_MAX: 1110/2,        // 22:00 → 16:30+1day = 18.5h = 1110 min
    dataInterval: 2,    // minutes between frames

    mapCenter: [46.020896, 7.480691],
    mapZoom: 12,

    //categoryShapes: { 'P1': 'circle', 'P2': 'square', 'P3': 'diamond', 'P4': 'triangle', 'P5': 'pentagon' },
    raceShapes:     { 'A1': 'circle', 'A2': 'square', 'Z1': 'diamond', 'Z2': 'triangle' },

    // Colors keyed by t_start (integer minutes from T0=22:00)
    startTimeColors: {
        0:   '#02d8fd',  // 22:00
        45:  '#f71212',  // 22:45
        90:  '#f59e0b',  // 23:30
        135: '#0fd420',  // 00:15
        180: '#0452ce',  // 01:00
        240: '#6e33f7',  // 02:00
        300: '#FF1D8D',  // 03:00
        330: '#02d8fd',  // 03:30
        360: '#f71212',  // 04:00
        390: '#f59e0b',  // 04:30
        420: '#0fd420',  // 05:00
        480: '#0452ce',  // 06:00
        510: '#6e33f7',  // 06:30
    }
};

// Convert t (minutes from T0) to "HH:MM" display string, handling midnight crossing
function tToDisplay(t) {
    const totalMin = (CONFIG.T0 + t) % 1440;
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

// ===== STATE =====
const state = {
    teams: [],
    teamsMap:   new Map(),  // id → team object (built once after load)
    teamDomMap: new Map(),  // id → DOM element (built once)

    frames:      {},        // race → frames array
    raceMeta:    {},        // race → {interval}
    loadedRaces: new Set(),

    elevationProfile: [],
    gpxTrace: null,

    selectedRaces:      new Set(['Z2']),
    selectedStartTimes: new Set(),
    favoriteTeams:      new Set(),

    currentT:      0,       // current time in minutes from T0
    isPlaying:     false,
    playbackSpeed: 2,

    canvasLayer:      null,
    map:              null,
    elevationMarkers: [],
};

// ===== CANVAS MARKERS LAYER =====
// Draws all team markers on a single canvas — much faster than individual Leaflet markers.
const CanvasMarkersLayer = L.Layer.extend({
    initialize() { this._data = []; },

    onAdd(map) {
        this._map = map;
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450';
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        map.getContainer().appendChild(canvas);
        this._resize();
        this._onMove   = () => this._redraw();
        this._onResize = () => { this._resize(); this._redraw(); };
        map.on('move zoom viewreset', this._onMove);
        map.on('zoomend moveend resize', this._onResize);
    },

    onRemove(map) {
        map.getContainer().removeChild(this._canvas);
        map.off('move zoom viewreset', this._onMove);
        map.off('zoomend moveend resize', this._onResize);
    },

    _resize() {
        const c = this._map.getContainer();
        this._canvas.width  = c.clientWidth;
        this._canvas.height = c.clientHeight;
    },

    update(data) {
        this._data = data || [];
        this._redraw();
    },

    _redraw() {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        // Draw normals first, favorites on top
        const favs = [];
        for (const d of this._data) {
            if (d.isFavorite) { favs.push(d); continue; }
            this._drawMarker(ctx, d);
        }
        for (const d of favs) this._drawMarker(ctx, d);
    },

    _drawMarker(ctx, d) {
        const p = this._map.latLngToContainerPoint([d.lat, d.lon]);
        const x = p.x, y = p.y, r = 6;

        ctx.fillStyle   = d.color;
        ctx.strokeStyle = d.isFavorite ? '#fbbf24' : 'rgba(0,0,0,0.8)';
        ctx.lineWidth   = d.isFavorite ? 2.5 : 1;
        const sh = d.isFavorite ? 'star' : d.shape;
        ctx.beginPath();

        switch (sh) {
            case 'circle':
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                break;
            case 'square':
                ctx.rect(x - 6, y - 6, 12, 12);
                break;
            case 'diamond':
                ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y);
                ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y);
                ctx.closePath();
                break;
            case 'star':
                ctx.moveTo(x,       y - 13);
                ctx.lineTo(x + 2.94, y - 4.05);
                ctx.lineTo(x + 12.36, y - 4.02);
                ctx.lineTo(x + 4.76, y + 1.55);
                ctx.lineTo(x + 7.64, y + 10.52);
                ctx.lineTo(x,        y + 5);
                ctx.lineTo(x - 7.64, y + 10.52);
                ctx.lineTo(x - 4.76, y + 1.55);
                ctx.lineTo(x - 12.36, y - 4.02);
                ctx.lineTo(x - 2.94, y - 4.05);
                ctx.closePath();
                break;
            case 'triangle':
            default:
                ctx.moveTo(x, y - 6);
                ctx.lineTo(x + 6, y + 6);
                ctx.lineTo(x - 6, y + 6);
                ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
    }
});

// ===== INIT =====
async function init() {
    try {
        showLoading(true);
        await loadData();
        initMap();
        buildRaceFilters();
        buildStartTimeFilters();
        buildTeamsList();
        buildCategoryLegend();
        attachEventListeners();
        updateVisualization();
        showLoading(false);
    } catch (err) {
        console.error('Erreur initialisation:', err);
        alert('Erreur lors du chargement: ' + err.message);
    }
}

// ===== DATA LOADING =====
async function loadData() {
    const [teamsResp, elevResp, gpxResp] = await Promise.all([
        fetch('data/teamsPDG.json'),
        fetch('data/profil_traceZ.json'),
        fetch('data/traceZ.gpx'),
    ]);

    state.teams         = await teamsResp.json();
    state.teamsMap      = new Map(state.teams.map(t => [t.id, t]));
    state.elevationProfile = await elevResp.json();
    state.gpxTrace      = await gpxResp.text();

    // All start times selected by default
    state.teams.forEach(t => state.selectedStartTimes.add(t.t_start));

    const saved = localStorage.getItem('pdg_favorites');
    if (saved) state.favoriteTeams = new Set(JSON.parse(saved));

    await loadRacePositions([...state.selectedRaces]);
    console.log(`Chargé: ${state.teams.length} équipes`);
}

async function loadRacePositions(races) {
    const toLoad = races.filter(r => !state.loadedRaces.has(r));
    if (!toLoad.length) return;
    showLoading(true);
    await Promise.all(toLoad.map(async race => {
        try {
            const resp = await fetch(`data/positions${race}.json.gz`);
            const buf  = await resp.arrayBuffer();
            const parsed = JSON.parse(pako.inflate(buf, { to: 'string' }));
            state.frames[race]   = parsed.frames;
            state.raceMeta[race] = parsed.meta;
            state.loadedRaces.add(race);
            console.log(`Positions ${race}: ${parsed.frames.length} frames`);
        } catch (e) {
            console.warn(`positions${race}.json.gz introuvable:`, e);
        }
    }));
    showLoading(false);
}

// ===== MAP =====
function initMap() {
    state.map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);

    L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
        attribution: '© swisstopo', maxZoom: 18
    }).addTo(state.map);

    if (state.gpxTrace) {
        new L.GPX(state.gpxTrace, {
            async: true,
            marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null },
            polyline_options: { color: '#dc2626', weight: 4, opacity: 0.8 }
        }).addTo(state.map);
    }

    state.canvasLayer = new CanvasMarkersLayer();
    state.canvasLayer.addTo(state.map);
}

// ===== ELEVATION PROFILE =====
function updateElevationProfile() {
    const profileData = state.elevationProfile;
    if (!profileData.length) return;

    const raceSymbols = { 'A1': 'circle', 'A2': 'square', 'Z1': 'diamond', 'Z2': 'triangle-up' };

    const traceProfile = {
        x: profileData.map(p => p.dist),
        y: profileData.map(p => p.alt),
        type: 'scatter', mode: 'lines', fill: 'tozeroy',
        fillcolor: 'url(#elevationGradient)',
        line: { color: 'rgb(220,38,38)', width: 2, shape: 'spline' },
        hoverinfo: 'skip'
    };

    const byRace = {};
    const favs   = [];
    for (const d of state.elevationMarkers) {
        if (d.isFavorite) { favs.push(d); continue; }
        if (!byRace[d.race]) byRace[d.race] = [];
        byRace[d.race].push(d);
    }

    const markerTraces = Object.entries(byRace).map(([race, data]) => ({
        x: data.map(d => d.dist),
        y: data.map(d => d.elev),
        type: 'scattergl', mode: 'markers',
        marker: { size: 10, color: data.map(d => d.color), symbol: raceSymbols[race] || 'circle', line: { color: 'black', width: 1 } },
        hoverinfo: 'skip', showlegend: false
    }));

    if (favs.length) {
        markerTraces.push({
            x: favs.map(d => d.dist), y: favs.map(d => d.elev),
            type: 'scattergl', mode: 'markers',
            marker: { size: 14, color: '#fbbf24', symbol: 'star' },
            hoverinfo: 'skip', showlegend: false
        });
    }

    const layout = {
        xaxis: { title: { text: 'Distance (km)' }, range: [0, 57], nticks: 8, showgrid: true, gridcolor: '#e5e7eb', zeroline: false, automargin: true },
        yaxis: { title: { text: 'Altitude (m)' }, range: [1000, 4000], dtick: 500, tickmode: 'linear', showgrid: true, gridcolor: '#e5e7eb', zeroline: false, automargin: true },
        margin: { t: 10, r: 30, l: 50, b: 40, pad: 0 },
        autosize: true, hovermode: 'closest', showlegend: false,
        paper_bgcolor: 'white', plot_bgcolor: 'white'
    };

    Plotly.react('elevation-profile', [traceProfile, ...markerTraces], layout, { responsive: true, displayModeBar: false });
    ensureElevationGradient('elevation-profile');
}

function ensureElevationGradient(id) {
    document.getElementById(id).querySelectorAll('svg.main-svg').forEach(svg => {
        if (!svg.querySelector('#elevationGradient')) {
            svg.insertAdjacentHTML('afterbegin', `<defs><linearGradient id="elevationGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgb(220,38,38)" stop-opacity="0.5"/><stop offset="100%" stop-color="rgb(220,38,38)" stop-opacity="0"/></linearGradient></defs>`);
        }
    });
}

// ===== FILTERS =====
function buildRaceFilters() {
    const container = document.getElementById('race-filters');
    ['A1', 'A2', 'Z1', 'Z2'].forEach(race => {
        const btn = document.createElement('button');
        btn.className = `race-filter-btn ${state.selectedRaces.has(race) ? 'active' : ''}`;
        btn.textContent = race;
        btn.addEventListener('click', async () => {
            if (state.selectedRaces.has(race)) {
                state.selectedRaces.delete(race);
                btn.classList.remove('active');
            } else {
                state.selectedRaces.add(race);
                btn.classList.add('active');
                await loadRacePositions([race]);
            }
            updateStartTimeFilters();
            filterTeams();
        });
        container.appendChild(btn);
    });
}

function buildStartTimeFilters() {
    const container = document.getElementById('start-time-filters');
    container.innerHTML = '';

    // Derive start times from the actual teams in currently selected races
    const times = new Set();
    state.teams.forEach(t => { if (state.selectedRaces.has(t.race)) times.add(t.t_start); });

    [...times].sort((a, b) => a - b).forEach(t => {
        const color = CONFIG.startTimeColors[t] || '#2563eb';
        const btn = document.createElement('button');
        btn.className = `start-time-btn ${state.selectedStartTimes.has(t) ? 'active' : ''}`;
        btn.textContent = tToDisplay(t);
        btn.style.setProperty('--wave-color', color); 
        btn.addEventListener('click', () => {
            state.selectedStartTimes[state.selectedStartTimes.has(t) ? 'delete' : 'add'](t);
            btn.classList.toggle('active', state.selectedStartTimes.has(t));
            filterTeams();
        });
        container.appendChild(btn);
    });
}

function updateStartTimeFilters() { buildStartTimeFilters(); }

// ===== TEAMS LIST =====
function buildTeamsList() {
    const container = document.getElementById('teams-list');
    container.innerHTML = '';
    state.teamDomMap.clear();

    const sorted = [...state.teams].sort((a, b) => {
        const ra = a.rank === 0 ? 999999 : a.rank;
        const rb = b.rank === 0 ? 999999 : b.rank;
        return ra - rb;
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach(team => {
        const bibThousand = Math.floor(parseInt(team.bib) / 1000) * 1000;
        const div = document.createElement('div');
        div.className = 'team-item';
        div.dataset.teamId = team.id;
        div.dataset.race   = team.race;
        div.dataset.tStart = team.t_start;
        div.innerHTML = `
          <div class="team-aside">
              <div class="team-rank">${team.rank === 0 ? '-' : team.rank}</div>
              <div class="team-race">${team.race}</div>
          </div>
          <div class="team-content">
              <div class="team-identity">
                  <span class="team-bib bib-${bibThousand}">${team.bib}</span>
                  <span class="team-name">${team.name}</span>
              </div>
              <div class="team-details">
                  <span class="team-detail-item team-category">${team.category}</span>
                  <span class="team-detail-item">🕐 ${tToDisplay(team.t_start)}</span>
                  <span class="team-detail-item" data-time-display>
                      <span class="team-flag"></span>
                      <span data-elapsed>--:--</span>
                  </span>
                  <span class="team-detail-item status" data-status-display></span>
              </div>
          </div>
          <button class="favorite-btn ${state.favoriteTeams.has(team.id) ? 'active' : ''}" data-team-id="${team.id}">★</button>
        `;

        div.querySelector('.favorite-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleFavorite(team.id);
        });

        state.teamDomMap.set(team.id, div);
        fragment.appendChild(div);
    });

    container.appendChild(fragment);
    filterTeams();
}

function toggleFavorite(teamId) {
    if (state.favoriteTeams.has(teamId)) state.favoriteTeams.delete(teamId);
    else state.favoriteTeams.add(teamId);

    localStorage.setItem('pdg_favorites', JSON.stringify([...state.favoriteTeams]));
    const btn = document.querySelector(`.favorite-btn[data-team-id="${teamId}"]`);
    if (btn) btn.classList.toggle('active', state.favoriteTeams.has(teamId));
    updateMarkers(state.currentT);
}

function buildCategoryLegend() {
    // Everything in the HTML
}

// ===== FILTERING =====
function filterTeams() {
    const searchTerm = document.getElementById('team-search').value.toLowerCase();

    state.teamDomMap.forEach((item, teamId) => {
        const team = state.teamsMap.get(teamId);
        const ok = (!searchTerm || team.name.toLowerCase().includes(searchTerm) || team.bib.includes(searchTerm))
                && state.selectedRaces.has(team.race)
                && state.selectedStartTimes.has(team.t_start);
        item.classList.toggle('hidden', !ok);
    });

    updateStats();
    updateVisualization();
}

function updateStats() {
    const visible = document.querySelectorAll('.team-item:not(.hidden)').length;
    document.getElementById('active-teams').textContent = `${visible} équipes`;
}

// ===== EVENT LISTENERS =====
function attachEventListeners() {
    const slider = document.getElementById('time-slider');
    slider.max = CONFIG.T_MAX;

    slider.addEventListener('input', e => {
        state.currentT = parseInt(e.target.value);
        updateVisualization();
    });

    document.getElementById('play-pause').addEventListener('click', togglePlayback);

    document.getElementById('step-back').addEventListener('click', () => {
        state.currentT = Math.max(0, state.currentT - 1);
        slider.value = state.currentT;
        updateVisualization();
    });

    document.getElementById('step-forward').addEventListener('click', () => {
        state.currentT = Math.min(CONFIG.T_MAX, state.currentT + 1);
        slider.value = state.currentT;
        updateVisualization();
    });

    document.getElementById('playback-speed').addEventListener('change', e => {
        state.playbackSpeed = parseFloat(e.target.value);
    });

    let searchTimer;
    document.getElementById('team-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(filterTeams, 150);
    });
}

// ===== PLAYBACK =====
function togglePlayback() {
    state.isPlaying = !state.isPlaying;
    document.getElementById('play-pause').classList.toggle('playing', state.isPlaying);
    if (state.isPlaying) playbackLoop();
}

function playbackLoop() {
    if (!state.isPlaying) return;
    if (state.currentT >= CONFIG.T_MAX) {
        state.currentT = CONFIG.T_MAX;
        togglePlayback();
        return;
    }
    state.currentT = Math.min(state.currentT + state.playbackSpeed, CONFIG.T_MAX);
    document.getElementById('time-slider').value = state.currentT;
    updateVisualization();
    setTimeout(playbackLoop, 1000);
}

// ===== VISUALIZATION =====
function updateVisualization() {
    document.getElementById('time-display').textContent = tToDisplay(state.currentT * CONFIG.dataInterval);

    const slider = document.getElementById('time-slider');
    const pct    = (state.currentT / parseInt(slider.max)) * 100;
    slider.style.background = `linear-gradient(to right, var(--color-primary) ${pct}%, #e5e7eb ${pct}%)`;

    updateMarkers(state.currentT);
    updateTeamStatuses(state.currentT * CONFIG.dataInterval);
}

function getTeamStatusAtT(team, t) {
    if (t < team.t_start)
        return { cssStatus: 'not-started', label: 'Not Started', elapsed: '--:--:--' };
    if (team.t_end != null && t >= team.t_end)
        return { cssStatus: team.status, label: team.status, elapsed: team.time }; //TODO
    const el = t - team.t_start;
    return {
        cssStatus: 'Running',
        label:     'En course',
        elapsed:   `${String(Math.floor(el / 60)).padStart(2, '0')}:${String(el % 60).padStart(2, '0')}:00`
    };
}

function updateTeamStatuses(t) {
    state.teamDomMap.forEach((item, teamId) => {
        if (item.classList.contains('hidden')) return;
        const team = state.teamsMap.get(teamId);
        const { cssStatus, label, elapsed } = getTeamStatusAtT(team, t);

        const elapsedEl = item.querySelector('[data-elapsed]');
        const statusEl  = item.querySelector('[data-status-display]');
        if (elapsedEl) elapsedEl.textContent = elapsed;
        if (statusEl)  {
            statusEl.className  = `team-detail-item status status-${cssStatus}`;
            statusEl.textContent = label;
        }
    });
}

function updateMarkers(timeIndex) {
    const markerData = [];
    const elevData   = [];

    for (const race of state.selectedRaces) {
        const frames = state.frames[race];
        if (!frames || timeIndex >= frames.length) continue;
        const frame = frames[timeIndex];
        if (!frame) continue;

        const shape = CONFIG.raceShapes[race] || 'circle';

        for (const [teamId, lat, lon, dist, elev] of frame) {
            if (!lat || !lon) continue;
            const team = state.teamsMap.get(teamId);
            if (!team) continue;

            const isFavorite = state.favoriteTeams.has(teamId);
            if (!isFavorite && !state.selectedStartTimes.has(team.t_start)) continue;

            const color = CONFIG.startTimeColors[team.t_start] || '#999';

            markerData.push({ lat, lon, color, shape, isFavorite });
            elevData.push({ dist, elev, color, race, isFavorite });
        }
    }

    state.canvasLayer.update(markerData);
    state.elevationMarkers = elevData;
    updateElevationProfile();
}

// ===== UTILS =====
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) overlay.classList.remove('hidden');
    else setTimeout(() => overlay.classList.add('hidden'), 300);
}

document.addEventListener('DOMContentLoaded', init);
