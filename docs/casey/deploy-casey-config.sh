#!/usr/bin/env bash
# Run this on the OpenClaw server to deploy Casey's order config.
# From your local machine:
#   scp -i ~/.ssh/gda-ce01 /path/to/casey-http-tool-config.json azlan@136.110.15.130:~/
#   ssh -i ~/.ssh/gda-ce01 azlan@136.110.15.130 'bash -s' < deploy-casey-config.sh

set -euo pipefail

OPENCLAW_DIR="${OPENCLAW_DIR:-/home/azlan/openclaw}"
CONFIG_FILE="$HOME/casey-http-tool-config.json"

echo "=== Casey config deploy ==="
echo "Looking for OpenClaw at: $OPENCLAW_DIR"

# Detect config file location (adjust if different)
if [ -f "$OPENCLAW_DIR/agents/casey/config.json" ]; then
  TARGET="$OPENCLAW_DIR/agents/casey/config.json"
elif [ -f "$OPENCLAW_DIR/config/casey.json" ]; then
  TARGET="$OPENCLAW_DIR/config/casey.json"
elif [ -f "$OPENCLAW_DIR/casey.json" ]; then
  TARGET="$OPENCLAW_DIR/casey.json"
else
  echo ""
  echo "Could not auto-detect OpenClaw config path."
  echo "Printing tool definitions for manual paste:"
  echo ""
  cat "$CONFIG_FILE"
  exit 0
fi

echo "Found config at: $TARGET"
echo "Backing up to: ${TARGET}.bak"
cp "$TARGET" "${TARGET}.bak"

# Merge tools into existing config using node
node - "$TARGET" "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const [,, targetPath, newToolsPath] = process.argv;
const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
const newDefs = JSON.parse(fs.readFileSync(newToolsPath, 'utf8'));

existing.tools = existing.tools || [];
for (const tool of newDefs.tools) {
  const idx = existing.tools.findIndex(t => t.name === tool.name);
  if (idx >= 0) {
    existing.tools[idx] = tool;
    console.log(`Updated tool: ${tool.name}`);
  } else {
    existing.tools.push(tool);
    console.log(`Added tool: ${tool.name}`);
  }
}
fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2));
console.log('Done.');
NODE

echo ""
echo "Config updated. Restart OpenClaw to apply."
echo "  e.g. pm2 restart openclaw  OR  systemctl restart openclaw"
