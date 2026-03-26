#!/bin/bash
echo "=== home dir ==="
ls ~/

echo ""
echo "=== processes ==="
ps aux | grep -i 'openclaw\|casey\|node\|python\|pm2' | grep -v grep

echo ""
echo "=== pm2 list ==="
pm2 list 2>/dev/null || true

echo ""
echo "=== find config files ==="
find ~ /opt /srv /app -maxdepth 5 \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.env" -o -name ".env" \) 2>/dev/null | grep -v node_modules | grep -v ".npm" | head -40

echo ""
echo "=== find openclaw/casey dirs ==="
find / -maxdepth 6 -type d \( -iname "*openclaw*" -o -iname "*casey*" \) 2>/dev/null | head -20
