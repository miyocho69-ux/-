-- price_sync_runs: 매 페이지 로드마다 insert하던 방식(0002)에서
-- 최신 1행만 유지하는 싱글턴 방식으로 변경 (on-page-load 동기화로 전환하며
-- 무한정 쌓이는 문제 방지 — toss_credentials와 동일한 싱글턴 패턴 재사용)
truncate table price_sync_runs;

alter table price_sync_runs drop column id;
alter table price_sync_runs add column id boolean primary key default true check (id);
