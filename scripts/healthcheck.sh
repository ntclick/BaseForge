#!/usr/bin/env bash
# Liveness check for the BaseForge agent service on the VPS.

set -euo pipefail

HOST="${BASEFORGE_HOST:-103.142.24.60}"
USER="${BASEFORGE_USER:-root}"
KEY="${BASEFORGE_SSH_KEY:-$HOME/.ssh/socialflow_deploy}"

ssh -i "$KEY" "$USER@$HOST" "
  echo '== systemd =='
  systemctl status baseforge-agent --no-pager | head -10 || true
  echo
  echo '== HTTP =='
  curl -s -m 5 http://127.0.0.1:8200/health || echo '(no response)'
  echo
  echo '== last 20 log lines =='
  tail -n 20 /var/log/baseforge-agent.log 2>/dev/null || echo '(no log)'
"
