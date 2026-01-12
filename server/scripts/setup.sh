#!/bin/bash

# ==============================================
# Script d'installation automatique
# Gestion de Projet - Serveur Raspberry Pi
# ==============================================

set -e

echo "========================================"
echo "  Installation Gestion de Projet"
echo "========================================"
echo ""

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si on est sur Raspberry Pi
check_raspberry() {
    if [ -f /proc/device-tree/model ]; then
        MODEL=$(cat /proc/device-tree/model)
        log_info "Détecté: $MODEL"
    else
        log_warn "Ce script est optimisé pour Raspberry Pi"
    fi
}

# Vérifier Node.js
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js détecté: $NODE_VERSION"

        # Vérifier version minimale (18+)
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
        if [ "$MAJOR_VERSION" -lt 18 ]; then
            log_error "Node.js 18+ requis. Version actuelle: $NODE_VERSION"
            exit 1
        fi
    else
        log_error "Node.js non installé. Veuillez installer Node.js 18+"
        echo ""
        echo "Exécutez ces commandes:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        echo "  sudo apt install -y nodejs"
        exit 1
    fi
}

# Installer les dépendances système
install_system_deps() {
    log_info "Installation des dépendances système..."
    sudo apt update
    sudo apt install -y build-essential python3 git
}

# Installer les dépendances Node.js
install_node_deps() {
    log_info "Installation des dépendances Node.js..."
    npm install
}

# Configurer l'environnement
setup_env() {
    if [ ! -f .env ]; then
        log_info "Création du fichier .env..."
        cp .env.example .env

        # Générer un JWT_SECRET aléatoire
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i "s/your_super_secret_jwt_key_change_this_in_production/$JWT_SECRET/" .env

        log_info "JWT_SECRET généré automatiquement"
        log_warn "Pensez à configurer FRONTEND_URL dans .env"
    else
        log_info "Fichier .env existant conservé"
    fi
}

# Créer les dossiers nécessaires
create_directories() {
    log_info "Création des dossiers..."
    mkdir -p data
    mkdir -p uploads/images
    mkdir -p uploads/videos
    mkdir -p uploads/audio
    mkdir -p uploads/misc
}

# Initialiser la base de données
init_database() {
    log_info "Initialisation de la base de données..."
    npm run init-db
}

# Créer le service systemd
create_service() {
    log_info "Création du service systemd..."

    CURRENT_DIR=$(pwd)
    USER=$(whoami)

    sudo tee /etc/systemd/system/gestion-projet.service > /dev/null <<EOF
[Unit]
Description=Gestion de Projet - API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable gestion-projet

    log_info "Service créé et activé"
}

# Menu principal
main() {
    check_raspberry
    echo ""

    echo "Que souhaitez-vous faire?"
    echo "1) Installation complète (recommandé)"
    echo "2) Installer uniquement les dépendances Node.js"
    echo "3) Configurer l'environnement (.env)"
    echo "4) Initialiser la base de données"
    echo "5) Créer le service systemd"
    echo "6) Tout (1-5)"
    echo "q) Quitter"
    echo ""
    read -p "Choix [1-6/q]: " choice

    case $choice in
        1)
            check_node
            install_system_deps
            install_node_deps
            setup_env
            create_directories
            init_database
            ;;
        2)
            check_node
            install_node_deps
            ;;
        3)
            setup_env
            ;;
        4)
            check_node
            init_database
            ;;
        5)
            create_service
            ;;
        6)
            check_node
            install_system_deps
            install_node_deps
            setup_env
            create_directories
            init_database
            create_service
            echo ""
            log_info "Installation terminée!"
            echo ""
            echo "Pour démarrer le serveur:"
            echo "  sudo systemctl start gestion-projet"
            echo ""
            echo "Pour voir les logs:"
            echo "  sudo journalctl -u gestion-projet -f"
            ;;
        q|Q)
            echo "Au revoir!"
            exit 0
            ;;
        *)
            log_error "Choix invalide"
            exit 1
            ;;
    esac
}

main
