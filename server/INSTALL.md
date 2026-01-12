# Guide d'Installation - Serveur Gestion de Projet

Ce guide vous accompagne dans l'installation du serveur sur un Raspberry Pi avec un tunnel Cloudflare pour l'accès distant.

## Prérequis

- Raspberry Pi 3B+ ou supérieur avec Raspberry Pi OS (64-bit recommandé)
- Carte SD de 16GB minimum
- Connexion Internet stable
- Un compte Cloudflare avec un domaine configuré
- Accès SSH au Raspberry Pi

---

## Étape 1 : Préparation du Raspberry Pi

### 1.1 Mise à jour du système

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Installation de Node.js 18+

```bash
# Installer Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier l'installation
node --version  # Doit afficher v18.x.x ou supérieur
npm --version
```

### 1.3 Installation de Git

```bash
sudo apt install -y git
```

### 1.4 Installation des dépendances pour better-sqlite3

```bash
sudo apt install -y build-essential python3
```

---

## Étape 2 : Clonage et Installation du Projet

### 2.1 Cloner le repository

```bash
cd /home/pi
git clone https://github.com/VOTRE_USERNAME/gestion_de_projet.git
cd gestion_de_projet/server
```

### 2.2 Installer les dépendances

```bash
npm install
```

> **Note :** La compilation de `better-sqlite3` peut prendre quelques minutes sur Raspberry Pi.

### 2.3 Configuration de l'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer la configuration
nano .env
```

Modifiez les valeurs suivantes dans `.env` :

```env
PORT=3001
NODE_ENV=production

# IMPORTANT: Générer un secret unique et sécurisé
JWT_SECRET=votre_secret_super_long_et_aleatoire_minimum_32_caracteres

JWT_EXPIRES_IN=24
DATABASE_PATH=./data/database.sqlite

# URL de votre frontend (sera configuré avec Cloudflare)
FRONTEND_URL=https://gestion.dents-studio.com
```

**Pour générer un JWT_SECRET sécurisé :**
```bash
openssl rand -hex 32
```

### 2.4 Initialiser la base de données

```bash
npm run init-db
```

Notez les identifiants de l'admin créé :
- **Email:** admin@gamedev.com
- **Mot de passe:** admin123

---

## Étape 3 : Configuration du Tunnel Cloudflare

### 3.1 Installation de cloudflared

```bash
# Télécharger cloudflared pour ARM
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared

# Rendre exécutable et déplacer
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Vérifier l'installation
cloudflared --version
```

### 3.2 Authentification Cloudflare

```bash
cloudflared tunnel login
```

Cela ouvrira un navigateur (ou affichera un lien). Connectez-vous à votre compte Cloudflare et autorisez cloudflared pour votre domaine `dents-studio.com`.

### 3.3 Créer le tunnel

```bash
# Créer un nouveau tunnel
cloudflared tunnel create gestion-projet

# Notez le TUNNEL_ID affiché (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
```

### 3.4 Configuration du tunnel

Créez le fichier de configuration :

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Contenu du fichier (remplacez `TUNNEL_ID` par votre ID) :

```yaml
tunnel: TUNNEL_ID
credentials-file: /home/pi/.cloudflared/TUNNEL_ID.json

ingress:
  # API Backend
  - hostname: api.gestion.dents-studio.com
    service: http://localhost:3001

  # Frontend (si hébergé localement aussi)
  - hostname: gestion.dents-studio.com
    service: http://localhost:3000

  # Catch-all (obligatoire)
  - service: http_status:404
```

### 3.5 Configurer le DNS sur Cloudflare

```bash
# Ajouter les routes DNS
cloudflared tunnel route dns gestion-projet api.gestion.dents-studio.com
cloudflared tunnel route dns gestion-projet gestion.dents-studio.com
```

Ou via le dashboard Cloudflare :
1. Allez dans **DNS** de votre domaine
2. Ajoutez un enregistrement CNAME :
   - **Nom:** `api.gestion`
   - **Cible:** `TUNNEL_ID.cfargotunnel.com`
   - **Proxy:** Activé (orange)

### 3.6 Tester le tunnel

```bash
# Démarrer le tunnel en mode test
cloudflared tunnel run gestion-projet
```

---

## Étape 4 : Configuration en tant que Service

### 4.1 Service pour le serveur Node.js

Créez le fichier service :

```bash
sudo nano /etc/systemd/system/gestion-projet.service
```

Contenu :

```ini
[Unit]
Description=Gestion de Projet - API Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/gestion_de_projet/server
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 4.2 Service pour Cloudflare Tunnel

```bash
sudo cloudflared service install
```

Ou manuellement :

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

Contenu :

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=pi
ExecStart=/usr/local/bin/cloudflared tunnel run gestion-projet
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4.3 Activer et démarrer les services

```bash
# Recharger systemd
sudo systemctl daemon-reload

# Activer au démarrage
sudo systemctl enable gestion-projet
sudo systemctl enable cloudflared

# Démarrer les services
sudo systemctl start gestion-projet
sudo systemctl start cloudflared

# Vérifier le statut
sudo systemctl status gestion-projet
sudo systemctl status cloudflared
```

---

## Étape 5 : Vérification

### 5.1 Tester l'API localement

```bash
curl http://localhost:3001/api/health
```

Réponse attendue :
```json
{"status":"ok","timestamp":"...","uptime":...}
```

### 5.2 Tester via Cloudflare

```bash
curl https://api.gestion.dents-studio.com/api/health
```

---

## Commandes Utiles

### Gestion du serveur

```bash
# Voir les logs
sudo journalctl -u gestion-projet -f

# Redémarrer le serveur
sudo systemctl restart gestion-projet

# Arrêter le serveur
sudo systemctl stop gestion-projet
```

### Gestion du tunnel

```bash
# Voir les logs du tunnel
sudo journalctl -u cloudflared -f

# Lister les tunnels
cloudflared tunnel list

# Supprimer un tunnel
cloudflared tunnel delete gestion-projet
```

### Mise à jour

```bash
cd /home/pi/gestion_de_projet
git pull
cd server
npm install
sudo systemctl restart gestion-projet
```

---

## Sécurité

### Recommandations

1. **Changez le mot de passe admin** dès la première connexion
2. **Utilisez un JWT_SECRET fort** (minimum 32 caractères aléatoires)
3. **Activez le pare-feu UFW** :
   ```bash
   sudo apt install ufw
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw enable
   ```
4. **Sauvegardez régulièrement** le fichier `data/database.sqlite`

### Sauvegarde automatique

Créez un script de backup :

```bash
nano /home/pi/backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /home/pi/gestion_de_projet/server/data/database.sqlite /home/pi/backups/database_$DATE.sqlite
# Garder seulement les 7 dernières sauvegardes
ls -t /home/pi/backups/database_*.sqlite | tail -n +8 | xargs rm -f
```

```bash
chmod +x /home/pi/backup-db.sh
mkdir -p /home/pi/backups

# Ajouter au cron (sauvegarde quotidienne à 3h)
crontab -e
# Ajouter la ligne:
0 3 * * * /home/pi/backup-db.sh
```

---

## Dépannage

### Le serveur ne démarre pas

```bash
# Vérifier les logs
sudo journalctl -u gestion-projet -n 50

# Vérifier que le port n'est pas utilisé
sudo lsof -i :3001

# Tester manuellement
cd /home/pi/gestion_de_projet/server
node src/index.js
```

### Le tunnel ne fonctionne pas

```bash
# Vérifier les logs
sudo journalctl -u cloudflared -n 50

# Vérifier la configuration
cloudflared tunnel info gestion-projet

# Tester le tunnel manuellement
cloudflared tunnel run gestion-projet
```

### Erreur de compilation better-sqlite3

```bash
# Réinstaller les dépendances de build
sudo apt install -y build-essential python3

# Nettoyer et réinstaller
rm -rf node_modules
npm install
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
│   api.gestion.dents-studio.com → Tunnel → localhost:3001   │
│   gestion.dents-studio.com → Tunnel → localhost:3000       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Raspberry Pi                            │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │   cloudflared   │    │    Node.js API Server        │   │
│  │   (tunnel)      │───▶│    Port 3001                 │   │
│  └─────────────────┘    │                              │   │
│                         │    ┌──────────────────────┐  │   │
│                         │    │  SQLite Database     │  │   │
│                         │    │  data/database.sqlite│  │   │
│                         │    └──────────────────────┘  │   │
│                         └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Support

Pour toute question ou problème, consultez les logs ou ouvrez une issue sur le repository GitHub.
