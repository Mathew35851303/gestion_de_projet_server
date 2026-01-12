#!/bin/bash

# ==============================================
# Script de sauvegarde automatique
# Gestion de Projet - Base de données SQLite
# ==============================================

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$SERVER_DIR/data/database.sqlite"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/gestion-projet}"
MAX_BACKUPS=${MAX_BACKUPS:-7}  # Nombre de sauvegardes à conserver

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Créer le dossier de backup s'il n'existe pas
mkdir -p "$BACKUP_DIR"

# Vérifier que la base de données existe
if [ ! -f "$DB_PATH" ]; then
    log_error "Base de données non trouvée: $DB_PATH"
    exit 1
fi

# Générer le nom du fichier de backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/database_$TIMESTAMP.sqlite"

# Effectuer la sauvegarde
log_info "Sauvegarde de la base de données..."
log_info "Source: $DB_PATH"
log_info "Destination: $BACKUP_FILE"

# Utiliser sqlite3 pour une copie cohérente (si disponible)
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
    # Fallback: copie simple
    cp "$DB_PATH" "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    # Calculer la taille
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_info "Sauvegarde réussie! Taille: $SIZE"
else
    log_error "Échec de la sauvegarde"
    exit 1
fi

# Compression (optionnelle)
if command -v gzip &> /dev/null; then
    gzip "$BACKUP_FILE"
    BACKUP_FILE="$BACKUP_FILE.gz"
    log_info "Backup compressé: $BACKUP_FILE"
fi

# Rotation des sauvegardes (garder les N plus récentes)
log_info "Rotation des sauvegardes (conservation: $MAX_BACKUPS)..."

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/database_*.sqlite* 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    # Supprimer les plus anciennes
    DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "$BACKUP_DIR"/database_*.sqlite* | tail -n $DELETE_COUNT | xargs rm -f
    log_info "$DELETE_COUNT ancienne(s) sauvegarde(s) supprimée(s)"
fi

# Lister les sauvegardes actuelles
echo ""
log_info "Sauvegardes disponibles:"
ls -lh "$BACKUP_DIR"/database_*.sqlite* 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'

echo ""
log_info "Sauvegarde terminée!"
