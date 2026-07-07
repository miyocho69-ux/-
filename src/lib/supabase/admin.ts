import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * RLS를 우회하는 secret key 클라이언트. toss_credentials, telegram_link 등
 * 서버 전용 테이블 접근에만 사용한다. 절대 클라이언트 컴포넌트나 API 응답에 노출하지 않는다.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
