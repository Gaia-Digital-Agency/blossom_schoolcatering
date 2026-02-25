#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <N>"
  echo "Example: $0 1 -> v$(date +%Y.%m.%d)-1"
  exit 1
fi

TAG="v$(date +%Y.%m.%d)-$1"

git tag "$TAG"
git push origin "$TAG"
echo "Created and pushed $TAG"
