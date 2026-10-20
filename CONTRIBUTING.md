# 기여 안내

## 개발 환경

```bash
npm install          # 의존성
npm run dev          # 개발 서버 (HMR)
npm run verify       # 전체 테스트
```

Node.js 20 이상이 필요합니다 (SQLite 내장 모듈 사용).

## 프로젝트 구조

```
client/          게임 클라이언트 (Three.js)
  src/
    main.js      게임 루프 · 상태 관리
    ui/          메뉴 · 패널 · HUD
    systems/     전투 · 웨이브 · 제작 · 마법
    world/       지형 · 건물 · 자원
server/          게임 서버 (Express + Socket.io)
  index.js       진입점
  api/           REST (auth · save · leaderboard · admin)
  game/          방 관리 · 프로토콜
tools/           테스트 · 빌드 도구
installer/       설치 프로그램
```

## 코드 규칙

- **한국어 주석** — 새 로직에는 왜 그렇게 했는지 적습니다
- **`.js` 파일은 LF 줄바꿈** (CRLF 는 테스트가 깨집니다)
- **`.cmd` 파일은 ASCII + CRLF** (한글은 cmd 가 삼킵니다)
- 테스트 없이 동작을 바꾸지 않습니다 — `npm run verify` 가 통과해야 합니다

## 테스트

```bash
npm run verify       # 스모크 + 헤드리스 + UI + 버그 + 린트 + 빌드
npm run bugtest      # 보스 버그테스트
npm run cmd-lint     # 배치 파일 검사
```

**모든 테스트가 통과해야** PR 을 받습니다.

## 커밋 메시지

```
한 줄 요약 (50자 이내)

- 무엇을 바꿨는지
- 왜 바꿨는지
```

## 버그 신고

이슈에 포함해 주세요:
1. 재현 방법 (가능하면 시드 포함)
2. 기대한 동작 / 실제 동작
3. 브라우저 · OS
4. `console` 오류 (있으면)

## 성능 기준

- 게임 로직: 프레임당 **2.0ms 이하** (500 FPS 예산)
- p95 프레임: **2.0ms 이하**
- `npm run verify` 에 렉테스트 포함

## 라이선스

기여하면 MIT 라이선스에 동의하는 것으로 봅니다.