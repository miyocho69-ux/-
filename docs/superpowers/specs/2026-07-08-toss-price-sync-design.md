# Phase 4 — 토스증권 실시간 시세 연동 설계

## 배경

`supabase/migrations/0001_init.sql`에 이미 `toss_credentials` 테이블(client_id/secret을 Supabase Vault로 암호화 저장하는 구조)이 있었지만, 이 프로젝트의 다른 시크릿(Supabase admin key 등)은 전부 Vercel 환경변수로 관리하고 있어 방식을 통일한다. 원래 설계 문서(`C:\Users\miyoc\.claude\plans\swift-launching-sparkle.md`)는 `/api/v1/assets`, "ASSET 5 TPS / ACCOUNT 1 TPS" 같은 추정 스펙을 담고 있었으나, 실제 공식 OpenAPI 스펙(`https://openapi.tossinvest.com/openapi-docs/latest/openapi.json`)을 직접 받아 확인한 결과 다음과 같이 다르다:

- 보유주식 엔드포인트는 `/api/v1/assets`가 아니라 `/api/v1/holdings`
- Rate limit은 고정 TPS 상수가 아니라 429 응답의 `X-RateLimit-Limit`/`X-RateLimit-Remaining`/`X-RateLimit-Reset`/`Retry-After` 헤더 기반(버킷 방식)

## 목표

DB(`holdings` 테이블)에 등록된 보유 종목의 현재가를 토스증권 Open API로 주기적으로 가져와 대시보드에 평가손익을 표시한다. 토스 실계좌의 보유수량/평단가는 사용하지 않는다 — 우리 DB의 `quantity`/`avg_cost`(수동 입력·스크린샷 등록 기반)는 그대로 두고, 시세(`lastPrice`)만 자동 갱신한다.

## 범위 밖

- 토스 실계좌 연동(`/api/v1/accounts`, `/api/v1/holdings`, 주문 API 등)은 사용하지 않는다. 시세 조회(`/api/v1/prices`)만 사용.
- Telegram/이메일 등 외부 알림 채널은 만들지 않는다. 실패 시 대시보드 내 상태 표시로 충분.
- 장 시간에 따른 스케줄 최적화(주말/장 마감 시간대 스킵)는 이번 단계에서 하지 않는다. 필요해지면 추후 조정.

## 자격증명 저장

- `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`을 Vercel 환경변수 + 로컬 `.env.local`로 저장한다.
- 기존 마이그레이션의 `toss_credentials.client_id`, `client_secret_encrypted` 컬럼은 더 이상 쓰지 않으므로 새 마이그레이션으로 제거하고, 발급된 `access_token`/만료시각 캐싱 전용 테이블로 좁힌다:

```sql
alter table toss_credentials drop column client_id;
alter table toss_credentials drop column client_secret_encrypted;
-- access_token_encrypted, token_expires_at은 유지
```

(access_token 자체는 24시간마다 재발급되는 값이라 "암호화 저장"의 실익이 크진 않지만, 기존 컬럼명·구조를 유지해 변경 범위를 최소화한다. 컬럼명은 그대로 두되 평문 저장으로 단순화한다 — 이 프로젝트는 service_role 키로만 접근 가능한 단일 사용자 DB이므로 추가 암호화 계층은 과잉이다.)

## 토큰 발급/캐싱 (`src/lib/toss/auth.ts`)

- `POST https://openapi.tossinvest.com/oauth2/token`, `Content-Type: application/x-www-form-urlencoded`, body: `grant_type=client_credentials&client_id=...&client_secret=...`
- 응답: `access_token`, `token_type`(`Bearer`), `expires_in`(초, 예: 86400)
- `toss_credentials` 싱글턴 행에서 `token_expires_at`을 확인해, 만료 5분 이내로 남았거나 값이 없으면 재발급 후 갱신. 그 외에는 캐시된 토큰 재사용.
- 재발급 시 이전에 발급된 토큰은 서버 측에서 즉시 무효화되므로, 항상 최신 캐시만 신뢰한다(동시 재발급 경합은 이 프로젝트 트래픽 규모에서는 무시 가능).
- 401(`invalid_client`) 발생 시 명확한 에러 메시지로 상위에 전파(자격증명 자체가 잘못됨을 구분).

## 시세 조회/갱신 (`src/lib/toss/prices.ts`)

- `GET https://openapi.tossinvest.com/api/v1/prices?symbols=A,B,C` (Bearer 토큰), 최대 200개 심볼/요청.
- `holdings` 테이블의 모든 `ticker`를 중복 제거해 수집 → 200개 단위로 청크 분할 → 순차 호출(현재 데이터 규모상 1개 청크로 충분하지만 로직은 청크 분할을 전제로 작성).
- 응답의 `lastPrice`를 해당 `ticker`를 가진 모든 `holdings` 행에 반영(`account_id` 무관하게 같은 ticker면 같은 가격).
- 429 응답 시 `Retry-After` 헤더(초)만큼 대기 후 해당 청크 1회 재시도. 재시도도 실패하면 그 청크는 건너뛰고 다음 청크 진행, 최종 결과에 부분 실패로 기록.
- 네트워크 오류/5xx도 청크 단위로 1회 재시도 후 실패 시 스킵.

## 스키마 변경

```sql
alter table holdings add column last_price numeric;
alter table holdings add column price_updated_at timestamptz;

alter table toss_credentials drop column client_id;
alter table toss_credentials drop column client_secret_encrypted;

create table price_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success','partial','failed')),
  synced_count int not null default 0,
  failed_tickers text[],
  error_message text
);
```

- `price_sync_runs`는 매 실행마다 1행 insert. 대시보드는 가장 최근 행만 조회해 "마지막 갱신: n분 전" + 상태 배지를 표시.
- 오래된 로그는 이번 단계에서 별도 정리 로직을 만들지 않는다(실행 빈도가 5분이라 누적되지만, 정리는 필요해지면 나중에 처리).

## API 라우트

`GET /api/cron/toss-price-sync`
- `Authorization: Bearer {CRON_SECRET}` 헤더로 GitHub Actions에서만 호출 가능하도록 검증(불일치 시 401).
- 토큰 확보 → holdings ticker 수집 → 청크별 시세 조회/갱신 → `price_sync_runs` 기록 → 결과 JSON 반환.

## GitHub Actions

`.github/workflows/toss-price-sync.yml`
- `schedule: cron: '*/5 * * * *'` + `workflow_dispatch`(수동 실행 가능하게).
- `curl -f -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://<vercel-domain>/api/cron/toss-price-sync`
- 실패해도 워크플로우 자체의 별도 알림 설정은 하지 않는다(대시보드 상태 표시로 충분하다는 사용자 결정).

## 대시보드 표시

- `/`(대시보드) 상단에 `price_sync_runs` 최신 행 기준 "마지막 시세 갱신: n분 전" 텍스트.
- `status`가 `partial`/`failed`면 경고 배지(예: 노란/빨간 점 + 툴팁에 실패 티커 또는 에러 메시지) 표시.
- 보유종목 목록에서 `last_price`가 있으면 `(last_price - avg_cost) * quantity`로 평가손익 계산해 표시, 없으면 "시세 미확인" 표시.

## 검증 방법

1. 로컬에서 `TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET`으로 실제 토큰 발급 왕복 테스트(스크립트로 1회 호출).
2. 발급된 토큰으로 실제 보유 ticker(NVDA, VRT) 시세 조회 왕복 테스트.
3. `/api/cron/toss-price-sync`를 로컬/배포 환경에서 수동 호출해 `holdings.last_price`/`price_sync_runs` 갱신 확인.
4. GitHub Actions에 시크릿(`CRON_SECRET`, Vercel 배포 도메인) 등록 후 `workflow_dispatch`로 수동 1회 실행해 실제 배포 환경에서 종단 간 확인.
5. 잘못된 client_secret으로 401 처리 경로, 존재하지 않는 ticker로 404/부분 실패 처리 경로도 확인.
