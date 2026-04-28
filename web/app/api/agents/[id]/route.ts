import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { agentClient } from "@/lib/agent-client";

const PatchBody = z.object({
  status: z.enum(["active", "paused", "deleted"]).optional(),
  config: z.record(z.unknown()).optional(),
  enabled_alerts: z.array(z.string()).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer().schema("baseforge");

  const { data: agent, error } = await sb
    .from("agents")
    .select("id, name, token_symbol, status, config, created_at, nft_token_id")
    .eq("id", id)
    .neq("status", "deleted")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: alerts } = await sb
    .from("alerts")
    .select("id, type, severity, title, detail, created_at")
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ agent, alerts: alerts ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = PatchBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const sb = supabaseServer().schema("baseforge");
  const updates: Record<string, unknown> = {};
  if (body.data.status) updates.status = body.data.status;
  if (body.data.config) updates.config = body.data.config;

  const { error } = await sb.from("agents").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    if (body.data.status === "deleted") {
      await agentClient.delete(id);
    } else {
      await agentClient.update(id, {
        status: body.data.status as "active" | "paused" | undefined,
        enabled_alerts: body.data.enabled_alerts,
        ...(body.data.config as object),
      });
    }
  } catch (err) {
    console.warn("Agent service sync failed:", err);
  }

  return NextResponse.json({ agent_id: id, status: body.data.status ?? "updated" });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer().schema("baseforge");
  await sb.from("agents").update({ status: "deleted" }).eq("id", id);
  try {
    await agentClient.delete(id);
  } catch (err) {
    console.warn("Agent service delete failed:", err);
  }
  return new Response(null, { status: 204 });
}
