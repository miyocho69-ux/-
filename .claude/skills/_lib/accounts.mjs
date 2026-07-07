import { getSupabaseAdminClient } from "./supabase.mjs";

export async function listAccounts() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, broker, market")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
