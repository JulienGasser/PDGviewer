# Patrouille des Glaciers - Visualisation

Interface web pour visualiser la course PDG Z2 avec carte interactive et profil d'altitude.

## Structure des fichiers

```
/
├── index.html          # Page principale
├── styles.css          # Styles
├── app.js              # Logique JavaScript
├── data/
│   ├── teams.json      # Informations des équipes
│   └── positions.json.gz # Positions compressées
└── README.md
```

## Préparation des données

### 1. Fichier teams.json

Format attendu (tableau d'objets) :
```json
[
  {
    "id": 9704,
    "bib": "2155",
    "name": "ALTIVORES",
    "rank": 12,
    "category_key": "Z2-P1",
    "start_time": "20:45"
  },
  ...
]
```

Générer depuis votre DataFrame Python :
```python
teams_for_web = teams_df[[
    'id', 'bib', 'name', 'rank', 'category_key'
]].copy()

# Extraire l'heure de départ au format HH:MM
teams_for_web['start_time'] = teams_df['start'].apply(
    lambda x: pd.to_datetime(x).strftime('%H:%M') if pd.notna(x) else '20:00'
)

teams_for_web.to_json('data/teams.json', orient='records')
```

### 2. Fichier positions.json.gz

Format attendu (tableau d'objets) :
```json
[
  {
    "timestamp": 1776488657,
    "datetime": "2026-04-17 22:00:00",
    "team_id": 9704,
    "latitude": 46.06164398,
    "longitude": 7.386751667
  },
  ...
]
```

Générer et compresser depuis Python :
```python
import gzip
import json

# Préparer les positions
positions_for_web = positions_df.to_dict('records')

# Compresser
with gzip.open('data/positions.json.gz', 'wt', encoding='utf-8') as f:
    json.dump(positions_for_web, f)
```

### 3. Profil d'altitude (optionnel)

Pour remplacer le profil d'exemple, modifiez dans `app.js` :

```javascript
state.elevationPoints = [
  {distance: 0, elevation: 1500},    // km, mètres
  {distance: 5, elevation: 1800},
  {distance: 10, elevation: 2200},
  // ... vos points réels
];
```

## Configuration

Dans `app.js`, ajustez si nécessaire :

```javascript
const CONFIG = {
    startTime: new Date('2026-04-17T22:00:00+02:00'),
    endTime: new Date('2026-04-18T16:30:00+02:00'),
    dataInterval: 2, // minutes entre chaque point
    mapCenter: [46.05, 7.40], // Centre de la carte
    mapZoom: 11,
    
    // Couleurs par heure de départ
    startTimeColors: {
        '2000': '#ef4444',  // 20:00
        '2045': '#f59e0b',  // 20:45
        // ... ajoutez vos heures
    }
};
```

## Déploiement sur GitHub Pages

1. Créer un nouveau repository sur GitHub
2. Pousser les fichiers :
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/pdg-visualization.git
git push -u origin main
```

3. Activer GitHub Pages :
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / (root)
   - Save

4. Votre site sera disponible à :
   `https://VOTRE_USERNAME.github.io/pdg-visualization/`

## Utilisation

- **Slider temporel** : Naviguer dans le temps manuellement
- **Play/Pause** : Lecture automatique
- **Vitesse** : Ajuster la vitesse de lecture (1x à 60x)
- **Recherche** : Filtrer par nom d'équipe ou numéro de dossard
- **Heures de départ** : Cocher/décocher pour afficher/masquer les groupes
- **Liste équipes** : Cocher/décocher individuellement chaque équipe
- **Carte** : Cliquer sur un marqueur pour voir les détails

## Personnalisation

### Couleurs
Modifiez les variables CSS dans `styles.css` :
```css
:root {
    --color-primary: #dc2626;
    --color-accent: #2563eb;
    /* ... */
}
```

### Formes des marqueurs
Ajoutez des formes dans `app.js` :
```javascript
categoryShapes: {
    'P1': 'circle',
    'P2': 'square',
    // ... ajoutez vos catégories
}
```

## Dépendances

Toutes chargées via CDN (aucune installation nécessaire) :
- Leaflet 1.9.4 (carte)
- Pako 2.1.0 (décompression gzip)

## Support navigateurs

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Performance

- 100 Mo de positions → ~20-30 Mo compressé
- Chargement initial : 5-10 secondes
- Rendu : 60 FPS pour <500 marqueurs simultanés

## Licence

À définir selon vos besoins.
