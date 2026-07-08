-- holdings에 시세 캐시 컬럼 추가
alter table holdings add column last_price numeric;
alter table holdings add column price_updated_at timestamptz;

-- toss_credentials: client_id/secret은 Vercel 환경변수로 이관, access_token 캐시만 남김
alter table toss_credentials drop column if exists client_id;
alter table toss_credentials drop column if exists client_secret_encrypted;

-- 시세 동기화 실행 로그
create table price_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success','partial','failed')),
  synced_count int not null default 0,
  failed_tickers text[],
  error_message text
);

alter table price_sync_runs enable row level security;
