import { NextResponse } from "next/server";

/**
 * Cheap health probe for the Python agent monitor service.
 * Returns { online, agents } so the UI can warn users that no real
 * monitoring is happening if the service is down.
 */
export const revalidate = 30;

export async function GET() {
  const url = process.env.AGENT_SERVICE_URL;
  if (!url) return NextResponse.json({ online: false, reason: "AGENT_SERVICE_URL not set" });
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return NextResponse.json({ online: false, reason: `health ${r.status}` });
    const data = await r.json();
    return NextResponse.json({ online: true, agents: data.agents ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ online: false, reason: msg.slice(0, 80) });
  }
}
