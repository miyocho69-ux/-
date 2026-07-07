"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const broker = String(formData.get("broker") ?? "").trim() || null;
  const market = String(formData.get("market") ?? "");

  if (!name || (market !== "KR" && market !== "US")) {
    throw new Error("계좌 이름과 시장 구분(KR/US)은 필수입니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("accounts").insert({ name, broker, market });
  if (error) throw error;

  revalidatePath("/accounts");
}

export async function deleteAccount(accountId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) throw error;

  revalidatePath("/accounts");
}
