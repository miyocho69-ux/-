-- USD/KRW 등 환율 정보 (base_currency가 PK인 소규모 참조 테이블)
create table exchange_rates (
  base_currency text primary key,
  quote_currency text not null,
  rate numeric not null,
  updated_at timestamptz not null default now()
);

alter table exchange_rates enable row level security;
