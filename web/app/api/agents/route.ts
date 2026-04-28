import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { agentClient } from "@/lib/agent-client";
import { getAgentTokensOf, getAgentNft, getIdentityNft } from "@/lib/onchain";
import type { Address } from "viem";

const CreateBody = z.object({
  wallet_address: z.string().min(1),
  telegram_chat_id: z.string().optional(),
  telegram_bot_token: z.string().optional(),
  telegram_bot_username: z.string().optional(),
  email: z.string().email().optional(),
  parsed: z.object({
    name: z.string(),
    token_symbol: z.string(),
    enabled_alerts: z.array(z.string()),
    thresholds: z.object({
      trade_size_usd: z.number(),
      volume_multiplier: z.number(),
      rsi_oversold: z.number(),
      rsi_overbought: z.number(),
      funding_rate_threshold: z.number().optional(),
      report_interval_minutes: z.number().optional(),
    }),
  }),
  prompt: z.string().optional(),
  nft_tx_hash: z.string().optional(),
  nft_token_id: z.string().optional(),
});

export async function POST(req: Request) {
  const body = CreateBody.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const {
    wallet_address,
    telegram_chat_id,
    telegram_bot_token,
    telegram_bot_username,
    email,
    parsed,
    prompt,
    nft_tx_hash,
    nft_token_id,
  } = body.data;
  const wallet = wallet_address.toLowerCase();
  const sb = supabaseServer().schema("baseforge");

  // Upsert user
  const { data: existing, error: lookupErr } = await sb.from("users").select("id").eq("wallet_address", wallet).maybeSingle();
  if (lookupErr) {
    console.error("[agents] user lookup error:", lookupErr);
    return NextResponse.json({ error: `lookup: ${lookupErr.message}` }, { status: 500 });
  }
  let userId: string;
  if (existing) {
    userId = existing.id as string;
    const updates: Record<string, unknown> = {};
    if (email) updates.email = email;
    if (telegram_chat_id) updates.telegram_chat_id = telegram_chat_id;
    if (telegram_bot_token) updates.telegram_bot_token = telegram_bot_token;
    if (telegram_bot_username) updates.telegram_bot_username = telegram_bot_username;
    if (Object.keys(updates).length) {
      await sb.from("users").update(updates).eq("id", userId);
    }
  } else {
    const { data: created, error } = await sb
      .from("users")
      .insert({
        wallet_address: wallet,
        email: email ?? null,
        telegram_chat_id: telegram_chat_id ?? null,
        telegram_bot_token: telegram_bot_token ?? null,
        telegram_bot_username: telegram_bot_username ?? null,
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? "user create failed" }, { status: 500 });
    }
    userId = created.id as string;
  }

  // Insert agent
  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .insert({
      user_id: userId,
      name: parsed.name,
      token_symbol: parsed.token_symbol,
      prompt: prompt ?? null,
      config: { ...parsed.thresholds, enabled_alerts: parsed.enabled_alerts },
      status: "active",
      nft_tx_hash: nft_tx_hash ?? null,
      nft_token_id: nft_token_id ?? null,
    })
    .select("id")
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: agentErr?.message ?? "agent create failed" }, { status: 500 });
  }

  // Bridge to Python agent service (best-effort)
  if (telegram_chat_id) {
    try {
      await agentClient.create({
        agent_id: agent.id as string,
        token: parsed.token_symbol,
        telegram_chat_id,
        telegram_bot_token,
        trade_size_usd: parsed.thresholds.trade_size_usd,
        volume_multiplier: parsed.thresholds.volume_multiplier,
        rsi_oversold: parsed.thresholds.rsi_oversold,
        rsi_overbought: parsed.thresholds.rsi_overbought,
        funding_rate_threshold: parsed.thresholds.funding_rate_threshold,
        report_interval_minutes: parsed.thresholds.report_interval_minutes ?? 0,
        enabled_alerts: parsed.enabled_alerts,
      });
    } catch (err) {
      console.warn("Agent service unavailable, monitor not started:", err);
    }
  }

  return NextResponse.json({ agent_id: agent.id, status: "created" }, { status: 201 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  const walletLower = wallet.toLowerCase();

  // ── 1. On-chain: Identity NFT + Agent tokenIds the wallet currently owns ───
  const [identityNft, onchainTokenIds] = await Promise.all([
    getIdentityNft(walletLower as Address),
    getAgentTokensOf(walletLower as Address),
  ]);
  console.log(`[api/agents] wallet=${walletLower} identity=${identityNft?.tokenId ?? "none"} agentNfts=[${onchainTokenIds.join(",")}]`);

  // ── 2. Off-chain: rows in Supabase ─────────────────────────────────
  const sb = supabaseServer().schema("baseforge");
  const { data: user } = await sb
    .from("users")
    .select("id")
    .eq("wallet_address", walletLower)
    .maybeSingle();

  let dbAgents: Array<{
    id: string; name: string; token_symbol: string; status: string;
    config: Record<string, unknown>; nft_token_id: string | null;
  }> = [];
  if (user) {
    const { data } = await sb
      .from("agents")
      .select("id, name, token_symbol, status, config, nft_token_id, last_alert_at, created_at")
      .eq("user_id", user.id)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    dbAgents = (data ?? []) as typeof dbAgents;
  }

  // ── 3. Recent alerts for DB agents ─────────────────────────────────
  const alertsByAgent: Record<string, unknown[]> = {};
  if (dbAgents.length > 0) {
    const agentIds = dbAgents.map((a) => a.id);
    const { data: recentAlerts } = await sb
      .from("alerts")
      .select("id, agent_id, type, severity, title, detail, created_at")
      .in("agent_id", agentIds)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const alert of recentAlerts ?? []) {
      const aid = alert.agent_id as string;
      if (!alertsByAgent[aid]) alertsByAgent[aid] = [];
      if (alertsByAgent[aid].length < 5) {
        alertsByAgent[aid].push({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          detail: alert.detail,
          createdAt: alert.created_at,
        });
      }
    }
  }

  // ── 4. Merge ───────────────────────────────────────────────────────
  // Each DB agent enriched with on-chain status; on-chain-only tokens get a stub.
  const dbByTokenId = new Map<string, (typeof dbAgents)[number]>();
  for (const a of dbAgents) {
    if (a.nft_token_id) dbByTokenId.set(a.nft_token_id, a);
  }
  const ownedTokenIdSet = new Set(onchainTokenIds.map((id) => id.toString()));

  const merged: unknown[] = [];

  // 4a. DB agents — keep, but mark transferred-away (still in DB but on-chain owner changed)
  for (const a of dbAgents) {
    const isOwnedOnChain = !a.nft_token_id || ownedTokenIdSet.has(a.nft_token_id);
    merged.push({
      id: a.id,
      name: a.name,
      tokenSymbol: a.token_symbol,
      status: isOwnedOnChain ? a.status : "transferred",
      config: a.config,
      alerts: alertsByAgent[a.id] ?? [],
      tokenId: a.nft_token_id,
      onchain: !!a.nft_token_id,
    });
  }

  // 4b. On-chain agents not yet indexed in DB — fetch metadata + add stub
  const unindexed = onchainTokenIds.filter((id) => !dbByTokenId.has(id.toString()));
  const unindexedNfts = await Promise.all(unindexed.map((id) => getAgentNft(id)));
  for (const nft of unindexedNfts) {
    merged.push({
      id: `onchain:${nft.tokenId}`,
      name: nft.metadata?.name ?? `Agent #${nft.tokenId}`,
      tokenSymbol: "—",
      status: "active",
      config: { config_hash: nft.configHash, enabled_alerts: [] },
      alerts: [],
      tokenId: nft.tokenId,
      onchain: true,
      unindexed: true,
      tokenURI: nft.tokenURI,
      image: nft.metadata?.image,
    });
  }

  return NextResponse.json({
    agents: merged,
    identity: identityNft,
  });
}
