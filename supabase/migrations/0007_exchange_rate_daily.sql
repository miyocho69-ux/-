-- USD/KRW 일별 스냅샷. exchange_rates(현재값 단일행)와 별도로, 날짜별 값을 쌓아
-- 전일 대비 등락률을 계산할 수 있게 한다. 토스 환율 API는 현재값만 주고 과거값을
-- 제공하지 않으므로, 매일 첫 upsertExchangeRate 호출 시점의 값을 그날의 대표값으로 고정한다.
create table exchange_rate_daily (
  date date primary key,
  rate numeric not null,
  updated_at timestamptz not null default now()
);

alter table exchange_rate_daily enable row level security;
