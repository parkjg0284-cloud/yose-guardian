# 🏰 요세의 수호자 (Guardian of the Fortress)

> FPS + 타워 디펜스 + 협동 멀티플레이 — Three.js · Socket.io · SQLite

[![테스트](https://github.com/parkjg0284-cloud/yose-guardian/actions/workflows/test.yml/badge.svg)](https://github.com/parkjg0284-cloud/yose-guardian/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## 🎮 게임 소개

요새를 지키는 **1인칭 슈터 + 타워 디펜스** 하이브리드 게임입니다.
웨이브를 막아내며 포탑을 짓고, 자원을 캐고, 마법을 연성해 요새를 지키세요.
친구와 **최대 4인 협동**도 가능합니다.

### 주요 특징

| 기능 | 설명 |
| --- | --- |
| **싱글 플레이** | 시드 기반 절차 생성 세계, 난이도 4단계 |
| **멀티플레이** | 초대코드 / 열린 방, 최대 4인 협동 |
| **전직 시스템** | 6개 계열, 메인코어 근처에서 E |
| **마법연성 · 아르카나** | 재료 조합으로 스킬 획득 |
| **요새 방어** | 웨이브 · 보스 · 포탑 20종 |
| **업적 · 도감 · 시드 갤러리** | 수집 요소 |

---

## 📥 다운로드

### 방법 1 — 단일 파일 (가장 쉬움, 권장)

1. **[Releases](../../releases/latest)** 에서 **`YoseGuardian-Setup.exe`** 내려받기 (약 1MB)
   - 저장소를 직접 받았다면 `요세의수호자_설치.exe` 를 더블클릭해도 됩니다 (같은 파일)
2. **더블클릭**
3. 자동 설치 + 게임 실행

게임이 파일 안에 들어 있어 **인터넷 없이도** 설치됩니다.

### 방법 1-B — 런처 (자동 업데이트)

1. **[Releases](../../releases/latest)** 에서 **`YoseGuardian-Launcher.exe`** 내려받기 (약 624KB)
2. **더블클릭** — 실행하면 최신 게임을 내려받아 설치합니다
3. 인터넷이 없으면 파일 안에 든 게임으로 설치됩니다

### 방법 1-C — 런처 압축본

1. `YoseGuardian-launcher.zip` 내려받기 → 압축 풀기
2. **`설치실행.cmd` 더블클릭**

런처가 자동으로:
- 최신 게임 내려받기
- `%LOCALAPPDATA%\YoseGuardian\app` 에 설치
- 바탕화면 바로가기 생성
- 게임 실행

### 방법 2 — 직접 실행 (개발자)

```bash
git clone https://github.com/parkjg0284-cloud/yose-guardian.git
cd REPO
npm install && npm run build && npm start
```
→ http://localhost:3001

### 방법 3 — 데스크톱 앱

`release\YoseGuardian-1.0.0-portable.exe` (96MB) — 설치 없이 실행

---

## 🚀 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 클라이언트 빌드
npm run build

# 3. 서버 실행
npm start
```

→ http://localhost:3001 접속

### 앱으로 실행 (권장)

**`게임앱.vbs`** 더블클릭 — 서버가 자동으로 켜지고 **전용 앱 창**으로 열립니다.
(브라우저 주소창 없음)

### 데스크톱 앱 빌드 (Electron)

```bash
npm run app:dist     # → release\YoseGuardian-1.0.0-portable.exe (96MB)
```

---

## 🕹️ 조작

| 키 | 기능 |
| --- | --- |
| `WASD` | 이동 |
| `Shift` | 달리기 |
| `Space` | 점프 |
| 마우스 | 시점 · 공격 |
| `E` | 상호작용 (전직·마법부여·채집) |
| `Tab` | 인벤토리 |
| `Q` | 무기 순환 |
| `G` | 시드 갤러리 |
| `K` | 전직 |
| `` ` `` | 관리자 콘솔 (admin 계정만) |
| `ESC` | 일시정지 · 설정 |

---

## 🛠️ 개발

```bash
npm run dev          # 개발 서버 (HMR)
npm run verify       # 전체 테스트 (2,134개)
npm run build        # 프로덕션 빌드
```

### 테스트 구성

| 테스트 | 개수 | 내용 |
| --- | --- | --- |
| 스모크 | 839 | 모듈 계약 · 데이터 정합성 |
| 헤드리스 | 549 | 실제 게임 로직 시뮬레이션 |
| UI DOM | 315 | 메뉴 · 패널 렌더링 |
| 버그테스트 | 233 | 보스 · 날개 · 캐릭터 · 기지 |
| 렉테스트 | 6 | 프레임 예산 (2.0ms / 500 FPS) |
| 배치 린트 | 10 | cmd 파일 무결성 |

**합계 2,134개 — 전부 통과 상태를 유지합니다.**

---

## 🐳 24시간 운영

### Windows 서비스 (가장 쉬움)
```cmd
install-service.cmd    (관리자 권한)
```
재부팅 자동 시작 · 죽으면 5초 후 재시작

### Docker
```bash
docker compose up -d
```

### PM2
```bash
pm2 start ecosystem.config.json && pm2 save
```

자세한 내용: **[24시간_운영_가이드.md](24시간_운영_가이드.md)**

---

## ⚙️ 설정

`.env` 파일을 만들고 값을 채우세요 (`.env.example` 참고):

```ini
PORT=3001
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=여기에_강력한_비밀번호
ADMIN_NICKNAME=관리자
AUTH_SECRET=여기에_무작위_문자열
```

> ⚠️ `AUTH_SECRET` 은 **반드시** 바꾸세요. 이 값으로 로그인 토큰을 서명합니다.
> 무작위 값 만들기: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 관리자 계정

서버를 켜면 `.env` 의 값으로 **자동 생성/갱신**됩니다.
관리자만 `` ` `` 콘솔에서 명령어를 쓸 수 있습니다 (`/돈`, `/무기`, `/웨이브` 등).

---

## 📁 구조

```
client/            게임 클라이언트 (Three.js)
  src/
    main.js        게임 루프 · 상태
    ui/            메뉴 · 패널 · HUD · 콘솔
    systems/       전투 · 웨이브 · 제작 · 마법 · 업적
    world/         지형 · 건물 · 자원 · 하늘
server/            게임 서버 (Express + Socket.io)
  api/             REST (auth · save · leaderboard · admin)
  game/            방 관리 · 프로토콜
tools/             테스트 · 빌드 도구
installer/         설치 프로그램 (PowerShell + C#)
```

---

## 🤝 기여

[CONTRIBUTING.md](CONTRIBUTING.md) 를 읽어 주세요.
모든 테스트가 통과해야 PR 을 받습니다.

---

## 📄 라이선스

[MIT](LICENSE) © 2026 Yose Guardian

---

## ⭐ 참고

- 저장 파일(`*.db`)은 저장소에 포함되지 않습니다
- 첫 실행 시 자동 생성됩니다
- 성능 목표: 프레임당 2.0ms (500 FPS 예산)