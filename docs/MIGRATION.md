# Legacy bot tear-down checklist

The VPS currently runs `/app/hermes-trading-bot` — a Node.js + Next.js trading bot (PM2 names `hermes-trading-api` :3010, `hermes-trading-frontend` :3011, domain `bot.103-142-24-60.sslip.io`, Postgres DB `hermes_trading_bot` with **live data**: 4 users, 18 trades, 13 positions, 11 campaigns, 6,902 log rows).

BaseForge replaces it. **Do not run any of the steps below without explicit user approval.** Each `❗` step is destructive.

## Pre-flight (read-only)

1. **Snapshot what's running**
   - `pm2 list` (capture PM2 entries)
   - `psql -d hermes_trading_bot -c "\dt+"` (table sizes)
   - `ls -la /app/hermes-trading-bot` (in case there are uncommitted edits on disk)

2. **Verify BaseForge is healthy first**
   - `systemctl status baseforge-agent` → active (running)
   - `curl http://127.0.0.1:8200/health` → `{"status":"ok"}`
   - At least one BaseForge agent has fired a real Telegram alert (smoke test on AERO).

3. **Identify any data worth keeping**
   - Wallet addresses of the 4 users (might overlap with future BaseForge users).
   - Active positions (any open trades that haven't been closed?).
   - Campaign definitions (could inform default agent presets).

## Backup ❗

```bash
# On the VPS, as root:
mkdir -p /root/backups/legacy-bot/$(date +%F)
cd /root/backups/legacy-bot/$(date +%F)

# DB dump
sudo -u postgres pg_dump -Fc hermes_trading_bot > hermes_trading_bot.dump

# Code snapshot
tar czf hermes-trading-bot.tar.gz -C /app hermes-trading-bot

# .env (sensitive - keep on disk only, do NOT push anywhere)
cp /app/hermes-trading-bot/backend/.env env.snapshot

# PM2 process definitions
pm2 save
cp ~/.pm2/dump.pm2 pm2-dump.snapshot
```

## Tear-down ❗

After backup verified (`pg_restore --list hermes_trading_bot.dump | head`):

```bash
# Stop + remove PM2 processes
pm2 delete hermes-trading-api hermes-trading-frontend
pm2 save

# Remove ecosystem config
rm /app/hermes-trading-bot/ecosystem.config.cjs

# Remove Caddy block for bot.103-142-24-60.sslip.io (or repurpose for BaseForge)
# Edit /etc/caddy/Caddyfile, then: caddy reload --config /etc/caddy/Caddyfile

# Drop DB (only after backup is verified)
sudo -u postgres psql -c 'DROP DATABASE hermes_trading_bot;'
sudo -u postgres psql -c 'DROP ROLE hermes;'   # only if no other service uses it

# Remove code dir
rm -rf /app/hermes-trading-bot
```

## Post-tear-down

- `pm2 list` should no longer show `hermes-trading-*`.
- `systemctl status baseforge-agent` still active.
- Caddy reload confirmed (`systemctl status caddy` clean).
- Backup files remain in `/root/backups/legacy-bot/<date>/` — keep at least 30 days before deleting.

## Rollback

If BaseForge breaks within the first 7 days and we need the legacy bot back:

```bash
cd /root/backups/legacy-bot/<date>
sudo -u postgres pg_restore -C -d postgres hermes_trading_bot.dump
tar xzf hermes-trading-bot.tar.gz -C /app
cp env.snapshot /app/hermes-trading-bot/backend/.env
pm2 start /app/hermes-trading-bot/ecosystem.config.cjs
```
