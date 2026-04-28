#!/usr/bin/env bash
# Deploy the BaseForge agent service to the VPS.
# - rsync agent/ to /opt/baseforge-agent
# - install Python deps in venv
# - reload + restart systemd unit
#
# Prerequisite: scripts/install-systemd-unit.sh has been run once.

set -euo pipefail

HOST="${BASEFORGE_HOST:-103.142.24.60}"
USER="${BASEFORGE_USER:-root}"
KEY="${BASEFORGE_SSH_KEY:-$HOME/.ssh/socialflow_deploy}"
REMOTE_DIR="${BASEFORGE_REMOTE_DIR:-/opt/baseforge-agent}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Syncing $ROOT/agent/ -> $USER@$HOST:$REMOTE_DIR/"
ssh -i "$KEY" "$USER@$HOST" "mkdir -p $REMOTE_DIR"
rsync -az --delete \
  -e "ssh -i $KEY" \
  --exclude '__pycache__' --exclude '.venv' --exclude 'tests' \
  "$ROOT/agent/" "$USER@$HOST:$REMOTE_DIR/"

echo "Installing Python deps"
ssh -i "$KEY" "$USER@$HOST" "
  cd $REMOTE_DIR
  test -d .venv || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
"

echo "Restarting systemd service"
ssh -i "$KEY" "$USER@$HOST" "systemctl restart baseforge-agent && systemctl status baseforge-agent --no-pager | head -10"
