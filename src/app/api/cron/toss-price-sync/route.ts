import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncHoldingPrices } from "@/lib/toss/prices";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  try {
    const result = await syncHoldingPrices();

    await supabase.from("price_sync_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: result.status,
      synced_count: result.syncedCount,
      failed_tickers: result.failedTickers,
      error_message: result.errorMessage,
    });

    return NextResponse.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await supabase.from("price_sync_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      synced_count: 0,
      failed_tickers: [],
      error_message: errorMessage,
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
