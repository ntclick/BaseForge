import { NextResponse } from "next/server";
import { agentClient } from "@/lib/agent-client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const r = await agentClient.testAgent(id);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "test failed" },
      { status: 502 },
    );
  }
}
