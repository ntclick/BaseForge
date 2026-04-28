import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;

  // Look up the agent config from DB (if configured)
  const sb = supabaseServer().schema("baseforge");
  const { data: agent } = await sb
    .from("agents")
    .select("name, token_symbol, status, config, created_at")
    .eq("nft_token_id", tokenId)
    .neq("status", "deleted")
    .maybeSingle();

  const origin = new URL(req.url).origin;
  const cfg = (agent?.config ?? {}) as {
    enabled_alerts?: string[];
    trade_size_usd?: number;
    volume_multiplier?: number;
  };
  const enabledAlerts = cfg.enabled_alerts ?? [];
  const ipfsCid = process.env.IPFS_AGENT_IMAGE_CID;
  const image = ipfsCid ? `ipfs://${ipfsCid}` : `${origin}/nft/agent.svg`;

  const metadata = {
    name: agent?.name
      ? `${agent.name} (Agent #${tokenId})`
      : `BaseForge Agent #${tokenId}`,
    description: agent
      ? `Real-time monitoring agent for ${agent.token_symbol}/USDT on Base. ` +
        `Tracks ${enabledAlerts.length} alert type${enabledAlerts.length === 1 ? "" : "s"}: ${enabledAlerts.join(", ")}.`
      : "Unconfigured BaseForge Agent NFT — waiting for owner to set up monitoring rules.",
    image,
    external_url: agent ? `https://baseforge.app/agents/${tokenId}` : "https://baseforge.app",
    attributes: [
      { trait_type: "Type", value: "Agent" },
      { trait_type: "Network", value: "Base" },
      ...(agent
        ? [
            { trait_type: "Token", value: agent.token_symbol },
            { trait_type: "Status", value: agent.status },
            { trait_type: "Alert types", value: enabledAlerts.length },
            ...(cfg.trade_size_usd
              ? [{ trait_type: "Trade size threshold", value: `$${cfg.trade_size_usd.toLocaleString()}` }]
              : []),
            ...(cfg.volume_multiplier
              ? [{ trait_type: "Volume multiplier", value: `${cfg.volume_multiplier}x` }]
              : []),
            ...(agent.created_at
              ? [{ trait_type: "Created", value: agent.created_at }]
              : []),
          ]
        : [{ trait_type: "Status", value: "unconfigured" }]),
    ],
  };

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
