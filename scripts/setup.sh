#!/usr/bin/env bash
# ==============================================================================
# Life Companion AI — Server Setup Script
# ==============================================================================
# Automates the full deployment on Ubuntu/Linux:
#   Docker, Syncthing, repo clone, .env configuration, docker compose, vault sync
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tranvuongquocdat/life-companition-AI/main/scripts/setup.sh | bash
#   OR: chmod +x setup.sh && ./setup.sh
#
# Tested: Ubuntu 20.04, 22.04, 24.04
# ==============================================================================

set -e

# ─── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; }
header()  { echo -e "\n${CYAN}${BOLD}── $* ──${NC}\n"; }
ask()     { echo -en "${YELLOW}▸ $*${NC}"; }

# ==============================================================================
# Pre-flight
# ==============================================================================

if [[ "$(uname -s)" != "Linux" ]]; then
    error "This script is for Linux. Detected: $(uname -s)"
    exit 1
fi

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║    Life Companion AI — Server Setup              ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ==============================================================================
# 1. Docker
# ==============================================================================

header "1/7 Docker"

DOCKER_RELOGIN=false

if command -v docker &>/dev/null; then
    info "Docker already installed: $(docker --version 2>/dev/null | head -1)"
else
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    info "Docker installed"
fi

if ! groups "$USER" 2>/dev/null | grep -q '\bdocker\b'; then
    sudo usermod -aG docker "$USER"
    DOCKER_RELOGIN=true
    warn "Added $USER to docker group — you may need to log out/in after setup"
fi

# Detect compose command
if docker compose version &>/dev/null 2>&1; then
    DC="docker compose"
elif sudo docker compose version &>/dev/null 2>&1; then
    DC="sudo docker compose"
else
    error "docker compose not available. Install Docker Compose v2."
    exit 1
fi
info "Using: $DC"

# ==============================================================================
# 2. Syncthing
# ==============================================================================

header "2/7 Syncthing"

if command -v syncthing &>/dev/null; then
    info "Syncthing already installed"
else
    info "Installing Syncthing..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y -qq apt-transport-https curl ca-certificates >/dev/null 2>&1 || true
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://syncthing.net/release-key.gpg | sudo tee /etc/apt/keyrings/syncthing-archive-keyring.gpg >/dev/null
        echo "deb [signed-by=/etc/apt/keyrings/syncthing-archive-keyring.gpg] https://apt.syncthing.net/ syncthing stable" \
            | sudo tee /etc/apt/sources.list.d/syncthing.list >/dev/null
        sudo apt-get update -qq
        sudo apt-get install -y syncthing >/dev/null 2>&1
        info "Syncthing installed via APT"
    elif command -v snap &>/dev/null; then
        sudo snap install syncthing
        info "Syncthing installed via snap"
    else
        error "Cannot install Syncthing. Install manually: https://syncthing.net/downloads/"
        exit 1
    fi
fi

# ==============================================================================
# 3. Clone repo
# ==============================================================================

header "3/7 Repository"

REPO_URL="https://github.com/tranvuongquocdat/life-companition-AI.git"

if git -C "$(pwd)" remote get-url origin 2>/dev/null | grep -q "life-companition-AI"; then
    info "Already in repo at $(pwd)"
elif [[ -d "life-companition-AI" ]]; then
    cd life-companition-AI
    git pull --ff-only 2>/dev/null || true
    info "Using existing clone at $(pwd)"
else
    git clone "$REPO_URL"
    cd life-companition-AI
    info "Cloned to $(pwd)"
fi

# ==============================================================================
# 4. Configure .env
# ==============================================================================

header "4/7 Environment (.env)"

SKIP_ENV=false
if [[ -f .env ]]; then
    warn ".env already exists"
    ask "Reconfigure? [y/N]: "
    read -r RECONF
    if [[ ! "$RECONF" =~ ^[Yy]$ ]]; then
        info "Keeping existing .env"
        SKIP_ENV=true
    else
        cp .env ".env.bak.$(date +%s)"
        info "Backed up old .env"
    fi
fi

if [[ "$SKIP_ENV" == "false" ]]; then
    # Telegram
    BOT_TOKEN=""
    while [[ -z "$BOT_TOKEN" ]]; do
        ask "Telegram Bot Token: "
        read -r BOT_TOKEN
    done

    CHAT_ID=""
    while [[ -z "$CHAT_ID" ]]; do
        ask "Telegram Chat ID: "
        read -r CHAT_ID
    done

    # Model
    ask "Default model [claude-opus-4-6]: "
    read -r MODEL
    MODEL="${MODEL:-claude-opus-4-6}"

    # Claude auth
    CLAUDE_KEY=""
    CRED_FILE="$HOME/.claude/.credentials.json"
    USE_OAUTH=false

    if [[ -f "$CRED_FILE" ]]; then
        info "Found Claude Code credentials at $CRED_FILE"
        ask "Use OAuth auto-refresh from Claude Code? [Y/n]: "
        read -r USE_CRED
        if [[ ! "$USE_CRED" =~ ^[Nn]$ ]]; then
            USE_OAUTH=true
            info "Will use OAuth auto-refresh"
        fi
    fi

    if [[ "$USE_OAUTH" == "false" ]]; then
        ask "Claude API Key (or Enter to skip): "
        read -r CLAUDE_KEY
    fi

    # Optional keys
    ask "OpenAI API Key (optional, Enter to skip): "
    read -r OPENAI_KEY
    ask "Gemini API Key (optional, Enter to skip): "
    read -r GEMINI_KEY

    # Write .env
    cat > .env <<ENVEOF
# Generated by setup.sh on $(date)
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_CHAT_ID=${CHAT_ID}
VAULT_PATH=/data/vault
DEFAULT_MODEL=${MODEL}
TZ=Asia/Ho_Chi_Minh
LANGUAGE=vi
MORNING_HOUR=7
EVENING_HOUR=21
CHAT_MODE=quick
PORT=3456
ENVEOF

    [[ -n "$CLAUDE_KEY" ]] && echo "CLAUDE_API_KEY=${CLAUDE_KEY}" >> .env
    [[ -n "$OPENAI_KEY" ]] && echo "OPENAI_API_KEY=${OPENAI_KEY}" >> .env
    [[ -n "$GEMINI_KEY" ]] && echo "GEMINI_API_KEY=${GEMINI_KEY}" >> .env

    info ".env created"
fi

# ==============================================================================
# 5. Vault directory + Docker build
# ==============================================================================

header "5/7 Build & Start"

mkdir -p data/vault
info "Vault directory: $(pwd)/data/vault"

info "Building Docker image (this may take a few minutes)..."
$DC up -d --build
info "Server is running"

# ==============================================================================
# 6. Start Syncthing & configure vault folder
# ==============================================================================

header "6/7 Syncthing Setup"

if [[ $EUID -ne 0 ]]; then
    loginctl enable-linger "$USER" 2>/dev/null || true
    systemctl --user enable syncthing 2>/dev/null || true
    systemctl --user start syncthing 2>/dev/null || true

    if systemctl --user is-active syncthing &>/dev/null; then
        info "Syncthing service running"
    else
        nohup syncthing serve --no-browser >/dev/null 2>&1 &
        info "Syncthing started in background"
    fi
else
    warn "Running as root — start Syncthing manually as your regular user"
fi

# Wait for Syncthing REST API
info "Waiting for Syncthing API..."
API_KEY=""
for i in $(seq 1 30); do
    for cfg in "$HOME/.local/state/syncthing/config.xml" "$HOME/.config/syncthing/config.xml" "/var/snap/syncthing/common/config.xml"; do
        if [[ -f "$cfg" ]] && [[ -z "$API_KEY" ]]; then
            API_KEY=$(sed -n 's/.*<apikey>\(.*\)<\/apikey>.*/\1/p' "$cfg" | head -1)
        fi
    done
    if [[ -n "$API_KEY" ]]; then
        CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/status 2>/dev/null || echo "000")
        [[ "$CODE" =~ ^[23] ]] && break
    fi
    sleep 1
done

if [[ -n "$API_KEY" ]]; then
    # Add vault folder to Syncthing
    VAULT_ABS="$(pwd)/data/vault"
    EXISTING=$(curl -s -H "X-API-Key: $API_KEY" "http://localhost:8384/rest/config/folders" 2>/dev/null || echo "")

    if echo "$EXISTING" | grep -q '"lc-vault"' 2>/dev/null; then
        info "Folder 'lc-vault' already configured"
    else
        FOLDER_JSON="{\"id\":\"lc-vault\",\"label\":\"Life Companion Vault\",\"path\":\"${VAULT_ABS}\",\"type\":\"sendreceive\",\"rescanIntervalS\":30,\"fsWatcherEnabled\":true,\"fsWatcherDelayS\":1,\"devices\":[],\"autoNormalize\":true}"

        HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
            -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
            -d "$FOLDER_JSON" \
            "http://localhost:8384/rest/config/folders" 2>/dev/null || echo "000")

        if [[ "$HTTP" =~ ^[23] ]]; then
            info "Folder 'lc-vault' added to Syncthing"
        else
            warn "Could not auto-configure folder. Add it manually at http://localhost:8384"
            warn "  Folder ID: lc-vault    Path: ${VAULT_ABS}"
        fi
    fi
else
    warn "Could not read Syncthing API key. Configure vault folder manually at http://localhost:8384"
fi

# ==============================================================================
# 7. Get Device ID & Summary
# ==============================================================================

header "7/7 Done!"

DEVICE_ID=""
if [[ -n "$API_KEY" ]]; then
    DEVICE_ID=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/status 2>/dev/null \
        | sed -n 's/.*"myID"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
fi

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║              Setup Complete!                                  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}       $DC logs -f"
echo -e "  ${BOLD}Health:${NC}     curl localhost:3456/health"
echo -e "  ${BOLD}Restart:${NC}    $DC restart"
echo -e "  ${BOLD}Syncthing:${NC}  http://localhost:8384"
echo ""

if [[ -n "$DEVICE_ID" ]]; then
    echo -e "  ${GREEN}${BOLD}┌──────────────────────────────────────────────────────┐${NC}"
    echo -e "  ${GREEN}${BOLD}│  SYNCTHING DEVICE ID (copy this):                    │${NC}"
    echo -e "  ${GREEN}${BOLD}│${NC}"
    echo -e "  ${GREEN}${BOLD}│${NC}  ${YELLOW}${BOLD}${DEVICE_ID}${NC}"
    echo -e "  ${GREEN}${BOLD}│${NC}"
    echo -e "  ${GREEN}${BOLD}│${NC}  Enter in: Obsidian → Life Companion → Settings"
    echo -e "  ${GREEN}${BOLD}│${NC}            → Vault Sync → Server Device ID"
    echo -e "  ${GREEN}${BOLD}└──────────────────────────────────────────────────────┘${NC}"
else
    warn "Could not get Device ID. Find it at: http://localhost:8384 → Actions → Show ID"
    echo -e "  Then enter in: Obsidian → Life Companion → Settings → Vault Sync"
fi

echo ""

if [[ "$DOCKER_RELOGIN" == "true" ]]; then
    echo -e "  ${RED}${BOLD}NOTE:${NC} Log out and back in for Docker group permissions."
    echo ""
fi

echo -e "  ${GREEN}${BOLD}Your Life Companion AI server is running!${NC}"
echo ""