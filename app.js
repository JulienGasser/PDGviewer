// Configuration
const CONFIG = {
    // Les courses démarrent entre 22h et 6h30, finissent vers 16h30
    // On balaie sur 24h pour couvrir toutes les courses
    dataInterval: 2, // minutes
    mapCenter: [46.020896, 7.480691], // Arolla
    mapZoom: 12,
    
    // Catégories avec formes de marqueurs
    categoryShapes: {
        'P1': 'circle',
        'P2': 'square',
        'P3': 'diamond',
        'P4': 'triangle',
        'P5': 'pentagon'
    },
    
    // Heures de départ par type de course
    startTimesA: ['03:30', '04:00', '04:30', '05:00', '06:00', '06:30'],
    startTimesZ: ['22:00', '22:45', '23:30', '00:15', '01:00', '02:00', '03:00']
};

// État global
const state = {
    teams: [],
    positions: [],
    elevationProfile: [],
    gpxTrace: null,
    
    selectedRaces: new Set(['Z2']),
    selectedStartTimes: new Set(),
    favoriteTeams: new Set(),
    
    currentTimeIndex: 0,
    isPlaying: false,
    playbackSpeed: 2,
    
    markers: new Map(),
    elevationMarkers: [],
    traceLayer: null,
    
    map: null,
    elevationCanvas: null,
    
    // Plage horaire pour le slider (22:00 à 16:30 le lendemain)
    minTime: '22:00',
    maxTime: '16:30'
};

// Initialisation
async function init() {
    try {
        showLoading(true);
        
        // Charger les données
        await loadData();
        
        // Initialiser la carte
        initMap();
        
        // Initialiser le profil d'altitude
        //initElevationProfile();
        
        // Construire l'interface
        buildRaceFilters();
        buildStartTimeFilters();
        buildTeamsList();
        buildCategoryLegend();
        
        // Attacher les événements
        attachEventListeners();
        
        // Première mise à jour
        updateVisualization();  // contruit le profil d'altitude
        
        showLoading(false);
    } catch (error) {
        console.error('Erreur d\'initialisation:', error);
        alert('Erreur lors du chargement des données: ' + error.message);
    }
}

// Chargement des données
async function loadData() {
    // Charger teams.json
    const teamsResponse = await fetch('data/teamsPDG.json');
    state.teams = await teamsResponse.json();
    
    // Charger positions.json.gz
    const positionsResponse = await fetch('data/positionsPDG.json.gz');
    const compressedData = await positionsResponse.arrayBuffer();
    const decompressedData = pako.inflate(compressedData, { to: 'string' });
    state.positions = JSON.parse(decompressedData);
    
    // Charger le profil d'altitude
    const elevationResponse = await fetch('data/profil_traceZ.json');
    state.elevationProfile = await elevationResponse.json();
    
    // Charger la trace GPX
    const gpxResponse = await fetch('data/traceZ.gpx');
    const gpxText = await gpxResponse.text();
    state.gpxTrace = gpxText;
    
    // Initialiser toutes les heures de départ comme sélectionnées
    state.teams.forEach(team => {
        state.selectedStartTimes.add(team.start_time);
    });
    
    // Charger les favoris depuis localStorage
    const savedFavorites = localStorage.getItem('pdg_favorites');
    if (savedFavorites) {
        state.favoriteTeams = new Set(JSON.parse(savedFavorites));
    }
    
    console.log(`Chargé: ${state.teams.length} équipes, ${state.positions.length} positions`);
    console.log(`Profil: ${state.elevationProfile.length} points`);
}

// Initialisation de la carte Leaflet
function initMap() {
    state.map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);
    
    // Couche de base Swiss Topo
    L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
        attribution: '© swisstopo',
        maxZoom: 18
    }).addTo(state.map);
    
    // Charger et afficher la trace GPX
    if (state.gpxTrace) {
        new L.GPX(state.gpxTrace, {
            async: true,
            marker_options: {
                startIconUrl: null,
                endIconUrl: null,
                shadowUrl: null
            },
            polyline_options: {
                color: '#dc2626',
                weight: 4,
                opacity: 0.8
            }
        }).on('loaded', function(e) {
            // Optionnel : ajuster la vue sur la trace
            // state.map.fitBounds(e.target.getBounds());
        }).addTo(state.map);
    }
}

// Met à jour ou initialise le profil d'altitude avec les marqueurs
function updateElevationProfile() {
    const containerId = 'elevation-profile';
    const profileData = state.elevationProfile;

    if (profileData.length === 0) return;

    // 1. Préparation de la trace Profil (SVG pour le dégradé)
    const traceProfile = {
        x: profileData.map(p => p.dist),
        y: profileData.map(p => p.alt),
        type: 'scatter', // Indispensable pour le fill gradient
        mode: 'lines',
        fill: 'tozeroy',
        fillcolor: 'url(#elevationGradient)', // Référence au gradient SVG
        line: {
            color: 'rgb(220, 38, 38)',
            width: 2,
            shape: 'spline'
        },
        hoverinfo: 'skip'
    };

    // 2. Préparation des marqueurs (WebGL pour la fluidité)
    const raceSymbols = { 'A1': 'circle', 'A2': 'square', 'Z1': 'diamond', 'Z2': 'triangle-up' };
    
    const favorites = state.elevationMarkers.filter(d => d.isFavorite);
    const byRace = ['A1', 'A2', 'Z1', 'Z2'].reduce((acc, race) => {
        acc[race] = state.elevationMarkers.filter(d => !d.isFavorite && d.race === race);
        return acc;
    }, {});

    const markerTraces = Object.entries(byRace)
        .filter(([_, data]) => data.length > 0)
        .map(([race, data]) => ({
            x: data.map(d => d.dist + (race[0]=='A'? 28.39 : 0)),
            y: data.map(d => d.elev),
            type: 'scattergl',
            mode: 'markers',
            marker: {
                size: 10,
                color: data.map(d => d.color),
                symbol: raceSymbols[race] || 'circle',
                line: {color: 'black', width: 1}
            },
            hoverinfo: 'skip',
            showlegend: false
        }));

    if (favorites.length > 0) {
        markerTraces.push({
            x: favorites.map(d => d.dist + (d.race[0]=='A'? 28.39 : 0)),
            y: favorites.map(d => d.elev),
            type: 'scattergl',
            mode: 'markers',
            marker: { size: 14, color: '#fbbf24', symbol: 'star' },
            hoverinfo: 'skip',
            showlegend: false
        });
    }

    // 3. Configuration du Layout
    const layout = {
        xaxis: {
            title: { text: 'Distance (km)' },
            range: [0, 57],
            nticks: 8,
            showgrid: true,
            gridcolor: '#e5e7eb',
            zeroline: false,
            automargin: true
        },
        yaxis: {
            title: { text: 'Altitude (m)' },
            range: [1000, 4000],
            dtick: 500,
            tickmode: 'linear',
            showgrid: true,
            gridcolor: '#e5e7eb',
            zeroline: false,
            automargin: true
        },
        margin: { t: 10, r: 30, l: 50, b: 40, pad: 0 },
        autosize: true,
        hovermode: 'closest',
        showlegend: false,
        paper_bgcolor: 'white',
        plot_bgcolor: 'white'
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    // 4. Rendu avec React (plus performant)
    Plotly.react(containerId, [traceProfile, ...markerTraces], layout, config);

    // 5. Injection du Gradient (Après le rendu)
    ensureElevationGradient(containerId);
}

/**
 * Injecte le gradient dans le SVG de Plotly s'il n'existe pas
 */
function ensureElevationGradient(containerId) {
    const plotDiv = document.getElementById(containerId);
    // Plotly utilise plusieurs SVG. On injecte dans tous les SVG 'main-svg' pour être sûr.
    const svgs = plotDiv.querySelectorAll('svg.main-svg');
    
    svgs.forEach(svg => {
        if (!svg.querySelector('#elevationGradient')) {
            const gradientSVG = `
            <defs>
              <linearGradient id="elevationGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="rgb(220, 38, 38)" stop-opacity="0.5"/>
                <stop offset="100%" stop-color="rgb(220, 38, 38)" stop-opacity="0"/>
              </linearGradient>
            </defs>`;
            svg.insertAdjacentHTML('afterbegin', gradientSVG);
        }
    });
}

// Construction des filtres de course
function buildRaceFilters() {
    const container = document.getElementById('race-filters');
    const races = ['A1', 'A2', 'Z1', 'Z2'];
    
    races.forEach(race => {
        const btn = document.createElement('button');
        btn.className = `race-filter-btn ${state.selectedRaces.has(race) ? 'active' : ''}`;
        btn.textContent = race;
        btn.dataset.race = race;
        
        btn.addEventListener('click', () => {
            if (state.selectedRaces.has(race)) {
                state.selectedRaces.delete(race);
                btn.classList.remove('active');
            } else {
                state.selectedRaces.add(race);
                btn.classList.add('active');
            }
            updateStartTimeFilters();
            filterTeams();
        });
        
        
        container.appendChild(btn);
    });
}

// Construction des filtres d'heure de départ
function buildStartTimeFilters() {
    const container = document.getElementById('start-time-filters');
    container.innerHTML = '';
    
    // Déterminer quelles heures afficher en fonction des courses sélectionnées
    let timesToShow = [];
    
    if (state.selectedRaces.has('A1') || state.selectedRaces.has('A2')) {
        timesToShow = CONFIG.startTimesA;
    }
    if (state.selectedRaces.has('Z1') || state.selectedRaces.has('Z2')) {
        timesToShow = [...timesToShow, ...CONFIG.startTimesZ];
    }
    
    timesToShow.forEach(time => {
        const btn = document.createElement('button');
        btn.className = 'start-time-btn ' + (state.selectedStartTimes.has(time)? 'active':'');
        btn.textContent = time;
        btn.dataset.time = time;
        
        btn.addEventListener('click', () => {
            if (state.selectedStartTimes.has(time)) {
                state.selectedStartTimes.delete(time);
                btn.classList.remove('active');
            } else {
                state.selectedStartTimes.add(time);
                btn.classList.add('active');
            }
            filterTeams();
        });
        
        container.appendChild(btn);
    });
}

function updateStartTimeFilters() {
    buildStartTimeFilters();
}

// Construction de la liste des équipes
function buildTeamsList() {
    const container = document.getElementById('teams-list');
    container.innerHTML = '';
    
    // Trier : rank 0 à la fin, les autres par ordre croissant
    const sortedTeams = [...state.teams].sort((a, b) => {
        const rankA = a.rank === 0 ? 999999 : a.rank;
        const rankB = b.rank === 0 ? 999999 : b.rank;
        return rankA - rankB;
    });
    
    sortedTeams.forEach(team => {
        const bibThousand = Math.floor(parseInt(team.bib) / 1000) * 1000;
        const bibClass = `bib-${bibThousand}`;
        
        const isFavorite = state.favoriteTeams.has(team.id);
        // Afficher '-' si rank = 0
        const displayRank = team.rank == 0 ? '-' : team.rank;
        
        const div = document.createElement('div');
        div.className = 'team-item';
        div.dataset.teamId = team.id;
        div.dataset.race = team.race;
        div.dataset.startTime = team.start_time;
        div.innerHTML = `
          <div class="team-aside">
              <div class="team-rank">${displayRank}</div>
              <div class="team-race">${team.race}</div>
          </div>
          <div class="team-content">
              <div class="team-identity">
                  <span class="team-bib ${bibClass}">${team.bib}</span>
                  <span class="team-name">${team.name}</span>
              </div>
              <div class="team-details">
                  <span class="team-detail-item team-category">${team.category}</span>
                  <span class="team-detail-item">🕐 ${team.start_time}</span>
                  <span class="team-detail-item" data-time-display><span class="team-flag"></span>${team.time || '--:--:--'}</span>
                  <span class="team-detail-item status status-${team.status.toLowerCase().replace(' ', '-')}">${team.status}</span>
              </div>
          </div>
          <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-team-id="${team.id}">
              ★
          </button>
        `;
        
        container.appendChild(div);
        
        // Événement favori
        div.querySelector('.favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(team.id);
        });
    });
    
    filterTeams();
}

function toggleFavorite(teamId) {
    if (state.favoriteTeams.has(teamId)) {
        state.favoriteTeams.delete(teamId);
    } else {
        state.favoriteTeams.add(teamId);
    }
    
    // Sauvegarder dans localStorage
    localStorage.setItem('pdg_favorites', JSON.stringify([...state.favoriteTeams]));
    
    // Mettre à jour l'affichage
    const btn = document.querySelector(`.favorite-btn[data-team-id="${teamId}"]`);
    if (btn) {
        btn.classList.toggle('active');
    }
    
    updateMarkers();
}

// Construction de la légende des catégories
function buildCategoryLegend() {
    const container = document.getElementById('legend-categories');
    const categories = Object.keys(CONFIG.categoryShapes);
    
    categories.forEach(cat => {
        const shape = CONFIG.categoryShapes[cat];
        const div = document.createElement('div');
        div.className = 'legend-item';
        div.innerHTML = `
            <div class="legend-shape marker-${shape}"></div>
            <span>${cat}</span>
        `;
        container.appendChild(div);
    });
}

// Filtrage des équipes
function filterTeams() {
    const searchTerm = document.getElementById('team-search').value.toLowerCase();
    
    document.querySelectorAll('.team-item').forEach(item => {
        const teamId = parseInt(item.dataset.teamId);
        const team = state.teams.find(t => t.id === teamId);
        
        const matchesSearch = !searchTerm || 
            team.name.toLowerCase().includes(searchTerm) ||
            team.bib.includes(searchTerm);
        
        const matchesRace = state.selectedRaces.has(team.race);
        const matchesStartTime = state.selectedStartTimes.has(team.start_time);
        
        if (matchesSearch && matchesRace && matchesStartTime) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
    
    updateStats();
    updateVisualization();
}

// Mise à jour des statistiques
function updateStats() {
    const visibleCount = document.querySelectorAll('.team-item:not(.hidden)').length;
    document.getElementById('active-teams').textContent = `${visibleCount} équipes`;
}

// Événements
function attachEventListeners() {
    // Slider temporel (22:00 à 16:30 = 18.5 heures = 1110 minutes)
    const slider = document.getElementById('time-slider');
    const totalMinutes = 18.5 * 60; // 1110 minutes
    const steps = totalMinutes / CONFIG.dataInterval;
    slider.max = steps;
    
    slider.addEventListener('input', (e) => {
        state.currentTimeIndex = parseInt(e.target.value);
        updateVisualization();
    });
    
    // Bouton play/pause
    document.getElementById('play-pause').addEventListener('click', togglePlayback);
    
    // Boutons step
    document.getElementById('step-back').addEventListener('click', () => {
        if (state.currentTimeIndex > 0) {
            state.currentTimeIndex--;
            document.getElementById('time-slider').value = state.currentTimeIndex;
            updateVisualization();
        }
    });

    document.getElementById('step-forward').addEventListener('click', () => {
        const slider = document.getElementById('time-slider');
        const maxIndex = parseInt(slider.max);
        if (state.currentTimeIndex < maxIndex) {
            state.currentTimeIndex++;
            slider.value = state.currentTimeIndex;
            updateVisualization();
        }
    });
    
    // Sélecteur de vitesse
    document.getElementById('playback-speed').addEventListener('change', (e) => {
        state.playbackSpeed = parseFloat(e.target.value);
    });
    
    // Recherche (filtre à chaque caractère)
    document.getElementById('team-search').addEventListener('input', filterTeams);
}

// Lecture/pause
function togglePlayback() {
    state.isPlaying = !state.isPlaying;
    const btn = document.getElementById('play-pause');
    btn.classList.toggle('playing', state.isPlaying);
    
    if (state.isPlaying) {
        playbackLoop();
    }
}

function playbackLoop() {
    if (!state.isPlaying) return;
    
    const slider = document.getElementById('time-slider');
    const maxIndex = parseInt(slider.max);
    
    if (state.currentTimeIndex >= maxIndex) {
        state.currentTimeIndex = maxIndex;
        togglePlayback()
    } else {
        state.currentTimeIndex += state.playbackSpeed;
    }
    
    slider.value = state.currentTimeIndex;
    updateVisualization();
    
    setTimeout(playbackLoop, 1000);
}

// Mise à jour de la visualisation
function updateVisualization() {
    // Convertir l'index en temps (de 22:00 à 16:30 le lendemain)
    const minutesFromStart = state.currentTimeIndex * CONFIG.dataInterval;
    const totalMinutes = 22 * 60 + minutesFromStart; // Commence à 22:00
    
    let hours = Math.floor(totalMinutes / 60) % 24;
    let minutes = totalMinutes % 60;
    
    const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
    // Mettre à jour l'affichage du temps
    document.getElementById('time-display').textContent = currentTime;
    
    // Mettre à jour le gradient du slider
    const slider = document.getElementById('time-slider');
    const percent = (state.currentTimeIndex / parseInt(slider.max)) * 100;
    slider.style.background = `linear-gradient(to right, var(--color-primary) ${percent}%, #e5e7eb ${percent}%)`;
    
    // Mettre à jour les marqueurs
    updateMarkers(currentTime);
    
    // Mettre à jour le statut et les temps des équipes
    updateTeamStatuses(currentTime);
}


function updateTeamStatuses(currentTime) {
    state.teams.forEach(team => {
        const teamItem = document.querySelector(`.team-item[data-team-id="${team.id}"]`);
        if (!teamItem) return;
        
        const statusEl = teamItem.querySelector('.status');
        const timeEl = teamItem.querySelector('[data-time-display]');
        
        // Déterminer le statut
        /*let status = 'not-started';
        timeEl.textContent = '00:00:00';
        if (currentTime > '18:00') {
            if ((currentTime > team.start_time) & (team.start_time < '12:00') {
                status = 'running';
                timeEl.textContent = currentTime + ':00';
            }
        } else {
            if (currentTime > team.stop_time) {
                status = team.status.toLowerCase();
                timeEl.textContent = team.time;
            } else if (currentTime > team.start_time) {
                status = 'running';
                timeEl.textContent = currentTime + ':00';
            }
        }
        
        statusEl.className = `team-detail-item status status-${status}`;
        statusEl.textContent = status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());*/
        
        timeEl.textContent = team.time;
        statusEl.className = `team-detail-item status status-${team.status}`;
        statusEl.textContent = team.status;
    });
}

function updateMarkers(currentTime) {
    // Filtrer et préparer les données en une seule passe
    const currentPositions = state.positions.filter(p => p.time === currentTime);
    
    // Créer un Map des teams pour lookup O(1)
    const teamsMap = new Map(state.teams.map(t => [t.id, t]));
    
    // Couleurs par heure de départ (déplacer dans CONFIG si réutilisé)
    const startTimeColors = {
        '22:00': '#02d8fd', '03:30': '#02d8fd',
        '22:45': '#f71212', '04:00': '#f71212',
        '23:30': '#f59e0b', '04:30': '#f59e0b',
        '00:15': '#0fd420', '05:00': '#0fd420',
        '01:00': '#0452ce', '06:00': '#0452ce',
        '02:00': '#6e33f7', '06:30': '#6e33f7',
        '03:00': '#FF1D8D'
            };
    
    const raceSymbols = {
        'A1': 'circle',
        'A2': 'square',
        'Z1': 'diamond',
        'Z2': 'triangle'
    };
    
    // Préparer les données pour map et elevation en une passe
    const validPositions = currentPositions
        .filter(pos => pos.latitude && pos.longitude)
        .map(pos => {
            const team = teamsMap.get(pos.team_id);
            if (!team) return null;
            
            const isFavorite = state.favoriteTeams.has(team.id);
            const isVisible = state.selectedRaces.has(team.race) && 
                            state.selectedStartTimes.has(team.start_time);
            
            if (!isFavorite && !isVisible) return null;
            
            return {
                teamId: pos.team_id,
                lat: pos.latitude,
                lon: pos.longitude,
                dist: pos.dist,
                elev: pos.elev,
                color: startTimeColors[team.start_time] || '#999',
                race: team.race,
                isFavorite: isFavorite,
            };
        })
        .filter(Boolean);
    
    // Nettoyer les anciens marqueurs
    state.markers.forEach(marker => state.map.removeLayer(marker));
    state.markers.clear();
    state.elevationMarkers.length = 0;
    
    // Créer les nouveaux marqueurs (simple et rapide)
    validPositions.forEach(data => {
        const size = data.isFavorite ? 36 : 24;
        const shape = raceSymbols[data.race] || 'circle';
        
        const icon = L.divIcon({
            className: 'simple-marker',
            html: `<div class="marker-${shape}" style="
                width: ${size}px;
                height: ${size}px;
                background: ${data.color};
                filter: drop-shadow(1px 0 0 black) 
                        drop-shadow(-1px 0 0 black) 
                        drop-shadow(0 1px 0 black) 
                        drop-shadow(0 -1px 0 black);
            "></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
        
        const marker = L.marker([data.lat, data.lon], { 
            icon,
            zIndexOffset: data.isFavorite ? 1000 : 100,
            interactive: false
        }).addTo(state.map);
        
        state.markers.set(data.teamId, marker);
    });
    
    state.elevationMarkers = validPositions
    
    updateElevationProfile();
}

// Utilitaires
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

// Démarrage
document.addEventListener('DOMContentLoaded', init);