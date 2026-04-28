# Architecture

See [BASEFORGE_DESIGN.md](../BASEFORGE_DESIGN.md) for the product vision. This file captures the *as-built* architecture; update it as code lands.

## Components

```
┌──────────────┐   HTTPS    ┌────────────────────┐   HTTP    ┌────────────────────┐
│  Next.js web │ ─────────► │ Next.js API routes │ ────────► │ BaseForge agent    │
│ (Vercel)     │            │ (same app, Prisma) │           │ (systemd on VPS)   │
└──────────────┘            └─────────┬──────────┘           │ Python + FastAPI   │
                                      │                      │ port 8200          │
                                      │ Prisma               └────────┬───────────┘
                                      ▼                               │ writes
                              ┌──────────────────────┐                │
                              │ Supabase Postgres    │ ◄──────────────┘
                              │ ref: yxnmthhkvmjuu…  │   alerts table
                              │ (managed, pooler)    │
                              └──────────────────────┘
                                      ▲
                              Binance WS  │  Telegram Bot API
                                          │
                                  ┌───────┴────────┐
                                  │ Long-running   │
                                  │ asyncio loops  │
                                  │ inside agent   │
                                  └────────────────┘
```

## Boundaries

- **Web app** owns: auth, wallet binding, wizard UX, DB writes for User/Agent metadata, alert history reads. Stateless, deploys to Vercel.
- **Agent service** (`agent/`) owns: long-lived Binance WebSocket connections, indicator math, per-agent supervisor tasks, Telegram dispatch, alert persistence to DB. Stateful, deploys as a systemd unit on the VPS.
- **DB** is a shared substrate: web writes user/agent rows; agent writes alerts. Both read.

## Why a separate VPS service (not Hermes skill, not Vercel function)

- **Vercel** can't host long-lived WebSocket connections (serverless cold starts kill them).
- The **SocialFlow Hermes API** on the VPS is content-focused (`/agent-chat`, `/generate`, etc.) — its `/skills` endpoint is just metadata, not a runtime for trading loops. So we don't deploy as a Hermes skill.
- A dedicated systemd service is the simplest reliable way: one Python process, one open port for the web to call, one log file.

## Why we don't call Hermes for LLM either

User decided to call OpenAI / DeepSeek / Claude directly with each user's stored API key, so BaseForge has no runtime dependency on the SocialFlow Hermes API.

## Replaces the legacy `hermes-trading-bot`

The VPS currently runs `/app/hermes-trading-bot` (Node + Next on PM2 :3010/:3011, DB `hermes_trading_bot`, 14 tables with live data). BaseForge will fully rewrite/replace it. See [MIGRATION.md](MIGRATION.md) for the tear-down checklist — must be executed manually with explicit user approval since there's real trade/position data.
