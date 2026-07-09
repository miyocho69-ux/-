-- 일별 총자산 스냅샷 (추이 탭의 라인차트 소스, 계좌 구분 없이 전체 합산 1행/일)
create table portfolio_snapshots (
  date date primary key,
  total_value numeric not null,
  total_cost numeric not null
);

alter table portfolio_snapshots enable row level security;

-- 매도 거래의 확정 손익 (매수 행은 항상 null)
alter table trades add column realized_pnl numeric;
