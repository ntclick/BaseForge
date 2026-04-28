import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;

  // Look up the wallet that minted this Identity (if indexed in DB)
  const sb = supabaseServer().schema("baseforge");
  const { data: user } = await sb
    .from("users")
    .select("wallet_address, created_at")
    .eq("identity_token_id", tokenId)
    .maybeSingle();

  const origin = new URL(_req.url).origin;
  const ipfsCid = process.env.IPFS_IDENTITY_IMAGE_CID;
  const image = ipfsCid ? `ipfs://${ipfsCid}` : `${origin}/nft/identity.svg`;
  const metadata = {
    name: `BaseForge Identity #${tokenId}`,
    description:
      "Soulbound proof-of-membership for BaseForge — the on-chain Base ecosystem alert network. " +
      "Required to mint and operate Agent NFTs. Non-transferable.",
    image,
    external_url: "https://baseforge.app",
    attributes: [
      { trait_type: "Type", value: "Identity" },
      { trait_type: "Soulbound", value: "Yes" },
      { trait_type: "Network", value: "Base" },
      ...(user?.wallet_address
        ? [{ trait_type: "Holder", value: user.wallet_address }]
        : []),
      ...(user?.created_at
        ? [{ trait_type: "Minted", value: user.created_at }]
        : []),
    ],
  };

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
