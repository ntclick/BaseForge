import { NextResponse } from "next/server";
import { getAgentNft, getRecentAgentMints, getTotalMintCounts } from "@/lib/onchain";
import { supabaseServer } from "@/lib/supabase";

// Cache showcase responses 60s — stats change slowly, no need to scan logs every request
export const revalidate = 60;

export async function GET() {
  const sb = supabaseServer().schema("baseforge");

  const [counts, recentMints, { count: alertCount }, { data: topTokensData }] = await Promise.all([
    getTotalMintCounts(),
    getRecentAgentMints(12),
    sb.from("alerts").select("id", { count: "exact", head: true }),
    sb.from("agents").select("token_symbol").neq("status", "deleted").limit(500),
  ]);

  // Tally token frequency
  const tokenCounts = new Map<string, number>();
  for (const a of topTokensData ?? []) {
    const t = a.token_symbol as string;
    tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
  }
  const topTokens = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([symbol, agents]) => ({ symbol, agents }));

  // Enrich recent mints with on-chain metadata + DB config
  const recent = await Promise.all(
    recentMints.map(async ({ tokenId, wallet }) => {
      const nft = await getAgentNft(tokenId);
      const { data: agent } = await sb
        .from("agents")
        .select("name, token_symbol, config")
        .eq("nft_token_id", tokenId.toString())
        .neq("status", "deleted")
        .maybeSingle();
      const enabled = (agent?.config as { enabled_alerts?: string[] } | undefined)?.enabled_alerts ?? [];
      return {
        tokenId: tokenId.toString(),
        name: agent?.name ?? nft.metadata?.name ?? `Agent #${tokenId}`,
        tokenSymbol: agent?.token_symbol ?? "—",
        image: nft.metadata?.image ?? null,
        enabledAlerts: enabled,
        wallet,
      };
    }),
  );

  return NextResponse.json(
    {
      stats: {
        identities: counts.identities,
        agents: counts.agents,
        alerts: alertCount ?? 0,
      },
      recent,
      topTokens,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
