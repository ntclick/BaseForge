/**
 * Minimal LLM client supporting OpenAI-compatible APIs.
 * Provider is detected from the key prefix:
 *   sk-ant-*  → Anthropic Claude
 *   sk-*      → OpenAI
 *   anything  → DeepSeek (same API shape as OpenAI)
 */

export type ParsedAgentConfig = {
  name: string;
  token_symbol: string;
  enabled_alerts: string[];
  thresholds: {
    trade_size_usd: number;
    volume_multiplier: number;
    rsi_oversold: number;
    rsi_overbought: number;
  };
};

const SYSTEM_PROMPT = `You are a crypto alert configuration parser.
Extract alert configuration from the user's natural language prompt.
Return ONLY valid JSON with this exact shape:
{
  "name": "<short name for the agent>",
  "token_symbol": "<uppercase token e.g. AERO, BRETT, ETH>",
  "enabled_alerts": ["trade_size" | "volume_spike" | "ema_cross" | "rsi_extreme" | "bb_touch" | "macd_cross"],
  "thresholds": {
    "trade_size_usd": <number, default 50000>,
    "volume_multiplier": <number, default 3>,
    "rsi_oversold": <number, default 30>,
    "rsi_overbought": <number, default 70>
  }
}
Rules:
- If user mentions volume / vol / 3x / Nx → add volume_spike, set volume_multiplier
- If user mentions RSI / oversold / overbought → add rsi_extreme
- If user mentions EMA / crossover / trend → add ema_cross
- If user mentions buy/sell size / large trade / whale → add trade_size, set trade_size_usd
- If user mentions Bollinger / band → add bb_touch
- If user mentions MACD → add macd_cross
- Default to ["trade_size"] if nothing matches
- token_symbol: pick the most prominent token from the prompt, default AERO`;

export type Provider = "openai" | "anthropic" | "deepseek" | "kimi";

function detectProvider(key: string, hint?: Provider): Provider {
  if (hint) return hint;
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  return "kimi";
}

async function callOpenAICompat(
  baseUrl: string,
  model: string,
  key: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function callAnthropic(key: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text as string;
}

export async function parseAgentPrompt(
  userPrompt: string,
  llmKey: string,
  providerHint?: Provider,
): Promise<ParsedAgentConfig> {
  const provider = detectProvider(llmKey, providerHint);
  let raw: string;

  if (provider === "anthropic") {
    raw = await callAnthropic(llmKey, userPrompt);
  } else if (provider === "deepseek") {
    raw = await callOpenAICompat(
      "https://api.deepseek.com/v1",
      "deepseek-chat",
      llmKey,
      userPrompt,
    );
  } else if (provider === "kimi") {
    raw = await callOpenAICompat(
      "https://api.moonshot.ai/v1",
      "kimi-k2-0711-preview",
      llmKey,
      userPrompt,
    );
  } else {
    raw = await callOpenAICompat(
      "https://api.openai.com/v1",
      "gpt-4o-mini",
      llmKey,
      userPrompt,
    );
  }

  // Strip markdown fences if model wraps in ```json
  const json = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(json) as ParsedAgentConfig;
}
