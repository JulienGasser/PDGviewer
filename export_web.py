import pandas as pd
import gzip
import json

def export_for_web(teams_df, positions_df, output_dir='data'):
    """
    Exporte les DataFrames au format JSON pour l'interface web
    
    Args:
        teams_df: DataFrame des équipes
        positions_df: DataFrame des positions
        output_dir: Répertoire de sortie
    """
    
    print("Préparation des données pour l'interface web...")
    
    # 1. Fichier teams.json
    print("\n1. Génération de teams.json...")
    teams_for_web = teams_df[[
        'id', 'bib', 'name', 'rank', 'category_key'
    ]].copy()
    
    # Extraire l'heure de départ au format HH:MM
    if 'start' in teams_df.columns:
        teams_for_web['start_time'] = teams_df['start'].apply(
            lambda x: pd.to_datetime(x).strftime('%H:%M') if pd.notna(x) else '20:00'
        )
    else:
        teams_for_web['start_time'] = '20:00'  # Valeur par défaut
    
    teams_json_path = f'{output_dir}/teams.json'
    teams_for_web.to_json(teams_json_path, orient='records', force_ascii=False)
    print(f"   ✓ {len(teams_for_web)} équipes → {teams_json_path}")
    
    # 2. Fichier positions.json.gz (compressé)
    print("\n2. Génération de positions.json.gz...")
    
    # Convertir le DataFrame en liste de dictionnaires
    positions_for_web = positions_df.to_dict('records')
    
    # Compresser et sauvegarder
    positions_gz_path = f'{output_dir}/positions.json.gz'
    with gzip.open(positions_gz_path, 'wt', encoding='utf-8') as f:
        json.dump(positions_for_web, f, ensure_ascii=False)
    
    # Calculer les tailles
    import os
    uncompressed_size = len(json.dumps(positions_for_web, ensure_ascii=False).encode('utf-8'))
    compressed_size = os.path.getsize(positions_gz_path)
    compression_ratio = (1 - compressed_size / uncompressed_size) * 100
    
    print(f"   ✓ {len(positions_for_web)} positions → {positions_gz_path}")
    print(f"   Taille non compressée: {uncompressed_size / 1024 / 1024:.2f} MB")
    print(f"   Taille compressée: {compressed_size / 1024 / 1024:.2f} MB")
    print(f"   Compression: {compression_ratio:.1f}%")
    
    print("\n✓ Export terminé ! Les fichiers sont prêts pour l'interface web.")
    print(f"\nProchaines étapes:")
    print(f"  1. Copiez le dossier 'data' dans votre projet web")
    print(f"  2. Ouvrez index.html dans un navigateur")
    print(f"  3. Ou déployez sur GitHub Pages")

# Exemple d'utilisation - à ajouter dans votre script principal
if __name__ == "__main__":
    # Ces variables doivent être définies dans votre script principal
    # export_for_web(teams_df, positions_df, 'data')
    print("Importez cette fonction dans votre script principal:")
    print("from export_web import export_for_web")
    print("export_for_web(teams_df, positions_df)")
