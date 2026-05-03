#!/bin/bash
# Install the schoolcatering login toggle (sc-login) into /etc/nginx and /usr/local/bin.
# Idempotent: re-running is safe.
# Run from the repo root: sudo bash scripts/ops/login-toggle/install.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SNIPDIR=/etc/nginx/snippets
NGINX_FILE=/etc/nginx/sites-available/gaiada1-subdomains

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

mkdir -p "$SNIPDIR"
install -m 0644 "$HERE/sc-login-block.conf" "$SNIPDIR/sc-login-block.conf"
install -m 0644 "$HERE/sc-login-empty.conf" "$SNIPDIR/sc-login-empty.conf"

# Default state: ON (login enabled). The operator flips to off explicitly.
if [[ ! -L "$SNIPDIR/sc-login-state.conf" ]]; then
    ln -sf "$SNIPDIR/sc-login-empty.conf" "$SNIPDIR/sc-login-state.conf"
fi

install -m 0755 "$HERE/sc-login" /usr/local/bin/sc-login

# Wire the include into the schoolcatering server block (idempotent)
if ! grep -q "sc-login-state" "$NGINX_FILE"; then
    cp "$NGINX_FILE" "${NGINX_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
    sed -i "/server_name schoolcatering.gaiada1.online;/a\\    include /etc/nginx/snippets/sc-login-state.conf;" "$NGINX_FILE"
    echo "include line inserted into $NGINX_FILE"
fi

nginx -t && systemctl reload nginx
echo "install OK. Current state: $(/usr/local/bin/sc-login status)"
