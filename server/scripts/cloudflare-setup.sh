#!/bin/bash

# ==============================================
# Script de configuration Cloudflare Tunnel
# Gestion de Projet - Serveur Raspberry Pi
# ==============================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo "========================================"
echo "  Configuration Cloudflare Tunnel"
echo "========================================"
echo ""

# Vérifier l'architecture
ARCH=$(uname -m)
case $ARCH in
    aarch64)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
        ;;
    armv7l)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
        ;;
    x86_64)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        ;;
    *)
        log_error "Architecture non supportée: $ARCH"
        exit 1
        ;;
esac

log_info "Architecture détectée: $ARCH"

# Installer cloudflared
install_cloudflared() {
    log_step "Installation de cloudflared..."

    if command -v cloudflared &> /dev/null; then
        log_info "cloudflared déjà installé: $(cloudflared --version)"
        read -p "Voulez-vous réinstaller? [y/N]: " reinstall
        if [ "$reinstall" != "y" ] && [ "$reinstall" != "Y" ]; then
            return
        fi
    fi

    curl -L $CLOUDFLARED_URL -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/

    log_info "cloudflared installé: $(cloudflared --version)"
}

# Authentification
authenticate() {
    log_step "Authentification Cloudflare..."
    echo ""
    echo "Une page va s'ouvrir dans votre navigateur."
    echo "Si vous êtes en SSH, copiez le lien affiché et ouvrez-le sur votre ordinateur."
    echo ""
    read -p "Appuyez sur Entrée pour continuer..."

    cloudflared tunnel login

    log_info "Authentification réussie!"
}

# Créer le tunnel
create_tunnel() {
    log_step "Création du tunnel..."

    read -p "Nom du tunnel [gestion-projet]: " TUNNEL_NAME
    TUNNEL_NAME=${TUNNEL_NAME:-gestion-projet}

    # Vérifier si le tunnel existe déjà
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        log_warn "Le tunnel '$TUNNEL_NAME' existe déjà"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    else
        cloudflared tunnel create $TUNNEL_NAME
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    fi

    log_info "Tunnel ID: $TUNNEL_ID"
    echo $TUNNEL_ID > ~/.cloudflared/tunnel_id.txt
}

# Configurer le tunnel
configure_tunnel() {
    log_step "Configuration du tunnel..."

    if [ ! -f ~/.cloudflared/tunnel_id.txt ]; then
        log_error "Tunnel ID non trouvé. Créez d'abord le tunnel."
        exit 1
    fi

    TUNNEL_ID=$(cat ~/.cloudflared/tunnel_id.txt)
    USER_HOME=$(eval echo ~$USER)

    read -p "Domaine pour l'API (ex: api.gestion.dents-studio.com): " API_DOMAIN
    read -p "Domaine pour le frontend (ex: gestion.dents-studio.com) [laisser vide si pas de frontend local]: " FRONTEND_DOMAIN
    read -p "Port du serveur API [3001]: " API_PORT
    API_PORT=${API_PORT:-3001}

    mkdir -p ~/.cloudflared

    # Créer la configuration
    cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: $USER_HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  # API Backend
  - hostname: $API_DOMAIN
    service: http://localhost:$API_PORT
EOF

    if [ -n "$FRONTEND_DOMAIN" ]; then
        read -p "Port du frontend [3000]: " FRONTEND_PORT
        FRONTEND_PORT=${FRONTEND_PORT:-3000}

        cat >> ~/.cloudflared/config.yml <<EOF

  # Frontend
  - hostname: $FRONTEND_DOMAIN
    service: http://localhost:$FRONTEND_PORT
EOF
    fi

    cat >> ~/.cloudflared/config.yml <<EOF

  # Catch-all (obligatoire)
  - service: http_status:404
EOF

    log_info "Configuration créée: ~/.cloudflared/config.yml"
    echo ""
    cat ~/.cloudflared/config.yml
}

# Configurer les routes DNS
setup_dns() {
    log_step "Configuration DNS..."

    if [ ! -f ~/.cloudflared/tunnel_id.txt ]; then
        log_error "Tunnel ID non trouvé."
        exit 1
    fi

    TUNNEL_NAME=$(cloudflared tunnel list | grep $(cat ~/.cloudflared/tunnel_id.txt) | awk '{print $2}')

    read -p "Domaine API à ajouter au DNS (ex: api.gestion.dents-studio.com): " API_DOMAIN
    cloudflared tunnel route dns $TUNNEL_NAME $API_DOMAIN
    log_info "Route DNS ajoutée pour $API_DOMAIN"

    read -p "Ajouter un autre domaine? [y/N]: " add_more
    if [ "$add_more" = "y" ] || [ "$add_more" = "Y" ]; then
        read -p "Domaine frontend (ex: gestion.dents-studio.com): " FRONTEND_DOMAIN
        cloudflared tunnel route dns $TUNNEL_NAME $FRONTEND_DOMAIN
        log_info "Route DNS ajoutée pour $FRONTEND_DOMAIN"
    fi
}

# Créer le service systemd
create_cloudflared_service() {
    log_step "Création du service systemd pour cloudflared..."

    # Méthode recommandée
    sudo cloudflared service install

    log_info "Service cloudflared installé"
    log_info "Le service démarre automatiquement au boot"
}

# Tester le tunnel
test_tunnel() {
    log_step "Test du tunnel..."

    echo "Démarrage du tunnel en mode test (Ctrl+C pour arrêter)..."
    echo ""

    TUNNEL_NAME=$(cloudflared tunnel list | grep $(cat ~/.cloudflared/tunnel_id.txt 2>/dev/null || echo "xxx") | awk '{print $2}')

    if [ -z "$TUNNEL_NAME" ]; then
        log_error "Tunnel non trouvé. Créez d'abord un tunnel."
        exit 1
    fi

    cloudflared tunnel run $TUNNEL_NAME
}

# Menu principal
main() {
    echo "Que souhaitez-vous faire?"
    echo ""
    echo "1) Installation complète (recommandé pour première installation)"
    echo "2) Installer cloudflared uniquement"
    echo "3) S'authentifier à Cloudflare"
    echo "4) Créer un nouveau tunnel"
    echo "5) Configurer le tunnel (config.yml)"
    echo "6) Ajouter les routes DNS"
    echo "7) Installer le service systemd"
    echo "8) Tester le tunnel"
    echo "q) Quitter"
    echo ""
    read -p "Choix [1-8/q]: " choice

    case $choice in
        1)
            install_cloudflared
            authenticate
            create_tunnel
            configure_tunnel
            setup_dns
            create_cloudflared_service
            echo ""
            log_info "Configuration Cloudflare terminée!"
            echo ""
            echo "Pour démarrer le tunnel:"
            echo "  sudo systemctl start cloudflared"
            echo ""
            echo "Pour voir les logs:"
            echo "  sudo journalctl -u cloudflared -f"
            ;;
        2)
            install_cloudflared
            ;;
        3)
            authenticate
            ;;
        4)
            create_tunnel
            ;;
        5)
            configure_tunnel
            ;;
        6)
            setup_dns
            ;;
        7)
            create_cloudflared_service
            ;;
        8)
            test_tunnel
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
