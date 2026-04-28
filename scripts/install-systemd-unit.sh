#!/usr/bin/env bash
# One-time: install the baseforge-agent systemd unit on the VPS.

set -euo pipefail

HOST="${BASEFORGE_HOST:-103.142.24.60}"
USER="${BASEFORGE_USER:-root}"
KEY="${BASEFORGE_SSH_KEY:-$HOME/.ssh/socialflow_deploy}"

UNIT="$(cat <<'EOF'
[Unit]
Description=BaseForge agent (Binance monitor + alert dispatcher)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/baseforge-agent
EnvironmentFile=/opt/baseforge-agent/.env
ExecStart=/opt/baseforge-agent/.venv/bin/python -m service
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/baseforge-agent.log
StandardError=append:/var/log/baseforge-agent.log

[Install]
WantedBy=multi-user.target
EOF
)"

ssh -i "$KEY" "$USER@$HOST" "cat > /etc/systemd/system/baseforge-agent.service <<'UNIT'
$UNIT
UNIT
systemctl daemon-reload
systemctl enable baseforge-agent
echo 'Unit installed. Start with: systemctl start baseforge-agent'
"
