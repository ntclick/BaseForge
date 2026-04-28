-- BaseForge initial schema
-- Apply via Supabase dashboard SQL editor or MCP apply_migration

CREATE SCHEMA IF NOT EXISTS baseforge;

CREATE TABLE IF NOT EXISTS baseforge.users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address        TEXT UNIQUE NOT NULL,
  email                 TEXT UNIQUE,
  telegram_chat_id      TEXT,
  notification_channels JSONB NOT NULL DEFAULT '{"telegram": true, "email": false}',
  llm_provider          TEXT,
  llm_key_enc           TEXT,
  plan                  TEXT NOT NULL DEFAULT 'free',
  identity_token_id     NUMERIC(78, 0) UNIQUE,
  identity_minted_at    TIMESTAMPTZ,
  identity_tx_hash      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS baseforge.agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES baseforge.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  token_symbol    TEXT NOT NULL,
  prompt          TEXT,
  config          JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  nft_token_id    NUMERIC(78, 0) UNIQUE,
  nft_minted_at   TIMESTAMPTZ,
  nft_tx_hash     TEXT,
  last_alert_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_user_id_idx ON baseforge.agents(user_id);

CREATE TABLE IF NOT EXISTS baseforge.alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES baseforge.agents(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  delivered   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_agent_id_created_idx ON baseforge.alerts(agent_id, created_at DESC);

-- Enable realtime on alerts table (run once)
ALTER PUBLICATION supabase_realtime ADD TABLE baseforge.alerts;
