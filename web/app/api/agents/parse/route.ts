import { NextResponse } from "next/server";
import { z } from "zod";
import { parseAgentPrompt } from "@/lib/llm";

const Body = z.object({
  prompt: z.string().min(1).max(1000),
  llm_key: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { prompt, llm_key } = parsed.data;

  // Server-side keys (priority order)
  const serverKey = process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY || "";
  const serverHint = process.env.KIMI_API_KEY ? ("kimi" as const) : undefined;

  const key = llm_key || serverKey;
  const hint = llm_key ? undefined : serverHint;

  if (key && key !== "replace-me") {
    try {
      const result = await parseAgentPrompt(prompt, key, hint);
      return NextResponse.json(result);
    } catch (err) {
      console.error("LLM parse failed, falling back to regex:", err);
    }
  }

  // Regex fallback (no LLM key configured)
  return NextResponse.json(regexFallback(prompt));
}

function regexFallback(prompt: string) {
  const text = prompt.toUpperCase();
  const tokenMatch = text.match(/\b(AERO|BRETT|HIGHER|DEGEN|ETH|USDC|BTC|WBTC|BASE|TOSHI)\b/);
  const token = tokenMatch?.[1] ?? "AERO";

  const enabled: string[] = [];
  if (/VOL/.test(text)) enabled.push("volume_spike");
  if (/RSI/.test(text)) enabled.push("rsi_extreme");
  if (/EMA|CROSS/.test(text)) enabled.push("ema_cross");
  if (/MACD/.test(text)) enabled.push("macd_cross");
  if (/BOLLING|BAND/.test(text)) enabled.push("bb_touch");
  if (/\$\s*\d+/.test(text) || /BUY|SELL|TRADE|WHALE/.test(text)) enabled.push("trade_size");
  if (enabled.length === 0) enabled.push("trade_size");

  const sizeMatch = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(K|M)?/i);
  const tradeSize = sizeMatch
    ? Number(sizeMatch[1]) * (sizeMatch[2]?.toUpperCase() === "M" ? 1_000_000 : sizeMatch[2]?.toUpperCase() === "K" ? 1_000 : 1)
    : 50_000;

  const volMatch = text.match(/(\d+(?:\.\d+)?)\s*X/);

  return {
    name: `${token} ${enabled[0].replace("_", " ")} alert`,
    token_symbol: token,
    enabled_alerts: enabled,
    thresholds: {
      trade_size_usd: tradeSize,
      volume_multiplier: volMatch ? Number(volMatch[1]) : 3,
      rsi_oversold: 30,
      rsi_overbought: 70,
    },
  };
}
