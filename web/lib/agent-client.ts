/**
 * Type-safe HTTP client for the Python agent service running on port 8200.
 * All calls are server-side only (uses AGENT_SERVICE_TOKEN secret).
 */

const BASE_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8200";
const TOKEN = process.env.AGENT_SERVICE_TOKEN ?? "";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent service ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type AgentCreatePayload = {
  agent_id: string;
  token: string;
  telegram_chat_id: string;
  telegram_bot_token?: string;     // BYOB — per-user bot. If unset, agent service falls back to shared bot.
  trade_size_usd?: number;
  volume_multiplier?: number;
  rsi_oversold?: number;
  rsi_overbought?: number;
  funding_rate_threshold?: number;
  enabled_alerts?: string[];
  report_interval_minutes?: number;   // 0 = off
};

export type AgentUpdatePayload = {
  trade_size_usd?: number;
  volume_multiplier?: number;
  rsi_oversold?: number;
  rsi_overbought?: number;
  enabled_alerts?: string[];
  report_interval_minutes?: number;
  status?: "active" | "paused";
};

export type AgentStatus = {
  agent_id: string;
  token: string;
  status: string;
  uptime_seconds: number;
  last_alert_at: number;
  alert_count: number;
  error: string | null;
};

export const agentClient = {
  health: () => request<{ status: string; agents: number }>("/health"),

  create: (payload: AgentCreatePayload) =>
    request<{ agent_id: string; status: string }>("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (agentId: string, payload: AgentUpdatePayload) =>
    request<{ agent_id: string; status: string }>(`/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  delete: (agentId: string) => request<undefined>(`/agents/${agentId}`, { method: "DELETE" }),

  get: (agentId: string) => request<AgentStatus>(`/agents/${agentId}`),

  list: () => request<AgentStatus[]>("/agents"),

  /** Pre-mint test — send an alert via arbitrary bot+chat to verify setup. */
  testBot: (payload: { telegram_chat_id: string; telegram_bot_token?: string; token?: string }) =>
    request<{ ok: boolean }>("/test-bot", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Post-mint test — send an alert via the agent's configured bot. */
  testAgent: (agentId: string) =>
    request<{ ok: boolean }>(`/agents/${agentId}/test`, { method: "POST" }),
};
