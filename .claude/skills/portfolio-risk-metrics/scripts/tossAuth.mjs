import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_URL = "https://openapi.tossinvest.com/oauth2/token";

function loadEnvLocal() {
  const envPath = join(__dirname, "..", "..", "..", "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

let cachedToken = null;

export async function getTossAccessToken() {
  if (cachedToken) return cachedToken;

  const env = loadEnvLocal();
  const clientId = env.TOSS_CLIENT_ID;
  const clientSecret = env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(".env.local에서 TOSS_CLIENT_ID / TOSS_CLIENT_SECRET을 찾을 수 없습니다.");
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

  const json = await res.json();
  cachedToken = json.access_token;
  return cachedToken;
}
