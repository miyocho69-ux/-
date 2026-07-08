import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://openapi.tossinvest.com/oauth2/token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface TossCredentialsRow {
  access_token_encrypted: string | null;
  token_expires_at: string | null;
}

async function fetchNewToken(): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`토스 토큰 발급 실패 (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  return { accessToken: json.access_token, expiresAt };
}

export async function getTossAccessToken(): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("toss_credentials")
    .select("access_token_encrypted, token_expires_at")
    .eq("id", true)
    .maybeSingle<TossCredentialsRow>();
  if (error) throw error;

  const now = Date.now();
  const cachedExpiry = data?.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  const isValid = data?.access_token_encrypted && cachedExpiry - now > EXPIRY_BUFFER_MS;

  if (isValid) {
    return data!.access_token_encrypted!;
  }

  const { accessToken, expiresAt } = await fetchNewToken();

  const { error: upsertError } = await supabase.from("toss_credentials").upsert({
    id: true,
    access_token_encrypted: accessToken,
    token_expires_at: expiresAt.toISOString(),
  });
  if (upsertError) throw upsertError;

  return accessToken;
}
