-- 포트폴리오 리스크 지표(샤프비율/마코위츠 비교/변동성 손실) 계산 결과 스냅샷.
-- 계산 자체는 토스 API 캔들 데이터를 순회하며 오래 걸리므로(.claude/skills/portfolio-risk-metrics
-- 스크립트를 수동 실행), 페이지 로드 시마다 재계산하지 않고 최신 결과 1건만 저장해 조회한다.
create table portfolio_risk_snapshot (
  id boolean primary key default true,
  result jsonb not null,
  computed_at timestamptz not null default now(),
  constraint portfolio_risk_snapshot_singleton check (id)
);

alter table portfolio_risk_snapshot enable row level security;
