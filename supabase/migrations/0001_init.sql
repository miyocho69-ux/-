-- 계좌 (증권사별/용도별 계좌 구분)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  broker text,
  market text not null check (market in ('KR','US')),
  created_at timestamptz not null default now()
);

-- 보유종목 (계좌별 현재 포지션 — trades로부터 파생되지만 조회 성능을 위해 별도 유지)
create table holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  ticker text not null,
  name text not null,
  quantity numeric not null default 0,
  avg_cost numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (account_id, ticker)
);

-- 매매기록 (수동입력/텔레그램 OCR/이미지 업로드 모두 이 테이블로 귀결)
create table trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  ticker text not null,
  name text not null,
  side text not null check (side in ('buy','sell')),
  quantity numeric not null,
  price numeric not null,
  traded_at date not null,
  memo text,
  source text not null check (source in ('manual','telegram_ocr','image_upload')),
  created_at timestamptz not null default now()
);

-- 텔레그램 OCR로 들어왔지만 아직 확정 안 된 매매건 (확인 큐)
create table pending_trade_reviews (
  id uuid primary key default gen_random_uuid(),
  telegram_message_id bigint,
  telegram_chat_id bigint,
  image_storage_path text not null,
  parsed jsonb not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  trade_id uuid references trades(id),
  created_at timestamptz not null default now()
);

-- 섹터 분류 (AI 제안 + 사용자 override — override는 재분류 배치에도 보존)
create table sector_classifications (
  ticker text primary key,
  ai_sector text,
  user_sector text,
  updated_at timestamptz not null default now()
);

-- Toss API 자격증명 (단일 사용자, 싱글턴 행. secret은 Supabase Vault로 별도 암호화)
create table toss_credentials (
  id boolean primary key default true check (id),
  client_id text not null,
  client_secret_encrypted text not null,
  access_token_encrypted text,
  token_expires_at timestamptz
);

-- 텔레그램 연결 정보 (봇이 신뢰할 chat_id)
create table telegram_link (
  id boolean primary key default true check (id),
  chat_id bigint not null,
  linked_at timestamptz not null default now()
);

-- RLS 활성화: 이 프로젝트는 단일 사용자 개인용이므로 기본적으로 모든 테이블은
-- service_role(서버 전용 키)만 접근 가능하게 잠그고, 세션 인증 붙는 시점에
-- 필요한 테이블에 한해 authenticated 정책을 추가한다.
alter table accounts enable row level security;
alter table holdings enable row level security;
alter table trades enable row level security;
alter table pending_trade_reviews enable row level security;
alter table sector_classifications enable row level security;
alter table toss_credentials enable row level security;
alter table telegram_link enable row level security;

-- toss_credentials, telegram_link는 시크릿을 담으므로 service_role 외 어떤 정책도 만들지 않는다
-- (service_role은 RLS를 우회하므로 정책이 없어도 서버 코드에서 접근 가능, 클라이언트 키로는 절대 접근 불가)
