"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function setUserSector(formData: FormData) {
  const ticker = String(formData.get("ticker") ?? "").trim();
  const userSector = String(formData.get("user_sector") ?? "").trim();

  if (!ticker || !userSector) {
    throw new Error("종목과 섹터는 필수입니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("sector_classifications").upsert(
    {
      ticker,
      user_sector: userSector,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ticker" }
  );
  if (error) throw error;

  revalidatePath("/analysis");
}

export async function clearUserSector(ticker: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sector_classifications")
    .update({ user_sector: null, updated_at: new Date().toISOString() })
    .eq("ticker", ticker);
  if (error) throw error;

  revalidatePath("/analysis");
}
