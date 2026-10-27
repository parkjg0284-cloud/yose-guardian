# GitHub 업로드 — 최종 안내

## 준비 완료 상태

```
저장소      : 준비 완료 (커밋 a4611c9 · 831개 파일)
패키지      : 바탕 화면\요세의수호자_깃허브.zip (32MB)
민감정보    : .env · *.db · *.exe · node_modules 전부 제외 ✓
표준 파일   : README · LICENSE(MIT) · CONTRIBUTING · CI · .gitattributes ✓
```

---

## 방법 1 — git 명령 (권장, 3줄)

```bash
cd "요세의 수호자"
git remote add origin https://github.com/<본인아이디>/yose-guardian.git
git branch -M main
git push -u origin main
```

**처음 push 할 때** GitHub 로그인 창이 뜹니다:
- **"Sign in with your browser"** 클릭 → 가장 간단
- 또는 Personal Access Token 발급 → 비밀번호 자리에 붙여넣기

---

## 방법 2 — GitHub 웹 (git 없이)

1. https://github.com/new 접속
2. **Repository name**: `yose-guardian`
3. Public / Private 선택 → **Create repository**
4. 생성된 페이지에서 **"uploading an existing file"** 클릭
5. `요세의수호자_깃허브.zip` 을 **압축 해제**한 뒤
6. 폴더 안의 파일들을 **전부 드래그** → **Commit changes**

> ⚠️ 100MB 넘는 단일 파일은 웹 업로드가 안 됩니다.
> 이 패키지는 32MB 이고 개별 파일도 모두 작아서 문제없습니다.

---

## 방법 3 — GitHub CLI

```bash
winget install GitHub.cli
gh auth login
cd "요세의 수호자"
gh repo create yose-guardian --public --source=. --push
```

---

## 업로드 후 확인

```bash
# 저장소에 .env 가 없는지
git ls-tree -r origin/main --name-only | findstr /I ".env"
# → .env.example 만 나와야 정상
```

GitHub 웹에서도 확인:
- ✅ README 가 예쁘게 보이는가
- ✅ LICENSE 탭에 MIT 표시되는가
- ✅ Actions 탭에서 테스트가 도는가
- ❌ `.env` 파일이 없는가 (**중요**)

---

## 배포 관리자 비밀번호 (선택 · 권장)

릴리스 워크플로는 기본적으로 저장소의 `release.env` 에 있는 **bcrypt 해시**를 `game.zip` 에 넣습니다.
비밀번호를 바꾸려면 GitHub **Settings → Secrets and variables → Actions** 에 다음 중 하나를 추가하세요.

| Secret | 의미 |
|---|---|
| `ADMIN_PASSWORD` | 평문 비밀번호 — 워크플로가 bcrypt 해시로 바꿔 `.env` 에 넣는다 |
| `ADMIN_PASSWORD_HASH` | 이미 만든 bcrypt 해시 — 그대로 `.env` 에 넣는다 |

- 평문 비밀번호는 **저장소에 커밋하지 않습니다.** `release.env` 에는 해시만 있습니다.
- Secret 이 없으면 `release.env` 해시를 사용하므로, 관리자 로그인은 항상 동작합니다.
- 관리자 아이디는 `admin` 입니다. 평문 비밀번호 원본은 배포 PC의 `secrets/admin-password.txt` 에만 보관합니다.

---

## 업로드 후 24시간 운영

### A. 내 PC
```cmd
install-service.cmd    (관리자 권한)
```

### B. 클라우드 (진짜 24시간)
```bash
git clone https://github.com/<아이디>/yose-guardian.git
cd yose-guardian
echo "ADMIN_PASSWORD=강력한비밀번호" > .env
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(32).toString('hex'))" >> .env
docker compose up -d
```

### C. 무료 호스팅 (Render / Railway)
- Build: `npm install && npm run build`
- Start: `node server/index.js`
- 환경변수: `NODE_ENV=production`, `ADMIN_PASSWORD`(또는 `ADMIN_PASSWORD_HASH`), `JWT_SECRET`
- ⚠️ 무료 플랜은 슬립 모드 있음 → 상시는 유료

---

## ⚠️ 업로드 전 필수

1. **`JWT_SECRET` 설정** — 비워 두면 서버가 `server/data/jwt-secret.txt` 에 자동 생성합니다
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **`ADMIN_PASSWORD` 변경** — 기본값은 이제 무작위 생성됩니다
3. **`.env` 를 절대 커밋하지 마세요** — `.gitignore` 에 있지만 확인 필수

---

## 저장소 구조

```
client/          게임 클라이언트 (Three.js)
server/          게임 서버 (Express + Socket.io)
tools/           테스트 도구 (2,134개 테스트)
installer/       설치 프로그램
docs/            설계 문서
.github/         CI 워크플로
Dockerfile       24시간 배포
docker-compose.yml
install-service.cmd
README.md        프로젝트 소개
LICENSE          MIT
CONTRIBUTING.md  기여 안내
.env.example     환경변수 예시
```