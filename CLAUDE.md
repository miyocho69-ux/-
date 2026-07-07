# CLAUDE.md — 프로젝트 가이드

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 지침 파일이다.
프로젝트 루트에 `CLAUDE.md`라는 이름으로 두면 세션 시작 시 자동으로 컨텍스트에 로드된다.

---

## 1. 로컬 연결 (Claude Code 설치·실행)

### 설치

```bash
# npm으로 설치 (Node.js 18+ 필요)
npm install -g @anthropic-ai/claude-code

# 또는 데스크톱 앱 사용 (Mac/Windows 지원)
# https://claude.ai/download
```

### 실행

```bash
cd /path/to/project   # 프로젝트 폴더로 이동
claude                # 대화형 세션 시작
```

- 처음 실행하면 브라우저로 Anthropic 계정 로그인(OAuth)을 안내한다.
- `claude "질문"` — 일회성 질문 실행
- `claude -c` — 직전 세션 이어서 계속
- VS Code / JetBrains 확장으로 IDE 안에서도 사용 가능

### 로컬 환경 정보

- OS: Windows 11
- 셸: PowerShell (기본), Git Bash 병행 사용 가능
- 작업 디렉토리: `D:\클로드` 기준으로 실행할 것

---

## 2. 필수 세팅

### 설정 파일 위치

| 파일 | 용도 |
|------|------|
| `~/.claude/CLAUDE.md` | 전역 지침 (모든 프로젝트 공통) |
| `<프로젝트>/CLAUDE.md` | 프로젝트별 지침 (이 파일) |
| `~/.claude/settings.json` | 전역 설정 (권한, 훅, 환경변수) |
| `<프로젝트>/.claude/settings.json` | 프로젝트 설정 (팀 공유, git 커밋) |
| `<프로젝트>/.claude/settings.local.json` | 개인 설정 (git 제외) |

### 권한(permissions) 예시 — `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run build)",
      "Bash(npm run dev:*)",
      "Bash(git status)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)"
    ]
  }
}
```

### 배포 규칙 (중요)

- **배포는 `git push origin main`으로만 한다.**
- Netlify CLI, Vercel CLI 등으로 직접 배포하지 마.
- 배포·서버 구성은 기존 방식 그대로 유지하고 임의로 바꾸지 마.

---

## 3. 하네스(Harness) 기본 내용

하네스란 Claude가 실제로 동작하는 실행 환경(도구, 권한, 컨텍스트 관리)을 말한다.

### Claude가 쓰는 주요 도구

- **Read / Write / Edit** — 파일 읽기·생성·수정
- **Bash** — 셸 명령 실행 (권한 모드에 따라 승인 필요)
- **Glob / Grep** — 파일·코드 검색
- **Agent(서브에이전트)** — 큰 탐색·병렬 작업을 별도 에이전트에 위임
- **WebSearch / WebFetch** — 웹 검색·페이지 가져오기
- **Skill(슬래시 명령)** — `/init`, `/code-review`, `/simplify` 등

### 컨텍스트 로딩 순서

1. `~/.claude/CLAUDE.md` (전역 지침)
2. 프로젝트 루트의 `CLAUDE.md` (이 파일)
3. 메모리 인덱스 (`~/.claude/projects/.../memory/MEMORY.md`)

대화가 길어지면 자동으로 요약(compact)되어 다음 컨텍스트로 이어진다.

### 권한 모드

- 기본: 파일 수정·명령 실행 전 사용자 승인 요청
- `/permissions` 로 허용 목록 관리 (터미널 세션에서)
- 자주 쓰는 안전한 명령은 settings.json의 allow에 등록해 프롬프트 줄이기

### 훅(hooks) — 자동화

특정 이벤트(도구 실행 전/후, 세션 종료 등)에 셸 명령을 자동 실행하려면
settings.json에 hooks를 등록한다. "매번 X 할 때마다 Y 해줘" 같은 자동화는
기억이 아니라 훅으로만 보장된다.

---

## 4. 응답 언어

- Claude는 이 프로젝트에서 항상 한국어로 응답한다. 코드, 파일 경로, 명령어, 고유명사는 원문 그대로 두되 설명·요약·대화 텍스트는 한국어로 작성한다.

---

## 5. 작업 원칙 (요약)

우선순위: **정확성 > 검증 > 최소 변경 > 명확성 > 유지보수성**

- 파일·API·스키마가 존재한다고 가정하지 말고 먼저 읽어서 확인해.
- 수정 전에 관련 파일을 읽고, 수정 후에는 테스트·실행으로 검증해.
- 요청된 작업에만 변경을 국한하고, 관련 없는 리팩토링은 하지 마.
- 가장 단순한 해결책을 선호하고, 불필요한 의존성·추상화를 추가하지 마.
- 기존 프로젝트의 관례와 스타일을 따라.
- 막히면 멈추고 무엇이 막혔는지, 무엇이 검증됐는지 명확히 보고해.
- 검증 없이 "성공했다"고 주장하지 마.

---

## 6. 프로젝트별 정보

- **프로젝트 이름:** 주식 포트폴리오 대시보드 (stock-dashboard)
- **기술 스택:** Next.js(App Router, TypeScript) + Tailwind CSS + Supabase(Postgres/Auth/Storage), Vercel 배포
- **개발 서버 실행:** `npm run dev`
- **빌드:** `npm run build`
- **테스트:** (아직 미구성)
- **배포:** `git push origin main` (Vercel 자동 배포)
- **외부 연동:**
  - 시세: 토스증권 Open API (OAuth2 Client Credentials) — GitHub Actions 스케줄러로 폴링
  - 이미지 파싱: Claude API Vision (보유현황/MTS 매매내역 스크린샷)
  - 매매기록: 텔레그램 봇(사진 전송) + 대시보드 수동 입력
  - Notion: 국내주식/미국주식 매매일지 동기화 (Internal Integration 토큰 필요)
- **주의사항:**
  - Toss API 자격증명은 Supabase Vault로 암호화 저장, 클라이언트에 절대 노출 금지
  - 섹터 분류는 `user_sector`가 있으면 AI 재분류가 덮어쓰지 않음
  - 상세 설계는 `C:\Users\miyoc\.claude\plans\swift-launching-sparkle.md` 참고
