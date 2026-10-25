# 런처 (다운로드 · 설치)

게임을 **자동으로 내려받아 설치하고 시작**하는 런처입니다.

## 방법 1 — 런처 exe (권장) ⭐

**`YoseGuardian-Launcher.exe`** 하나만 받으면 됩니다 (약 650KB, 게임 내장).

1. 내려받기 → **더블클릭**
2. 창에서 **[게임 다운로드 & 설치]**
3. 최신 게임을 내려받아 설치하고 **바로 시작**

- 이미 최신 판이면 [다운로드] 버튼이 사라지고 **[게임 시작]** 만 남습니다.
- 인터넷이 없으면 내장 판으로 설치됩니다.
- 설치 위치: `%LOCALAPPDATA%\YoseGuardian\app`

### 설치 파일 직접 선택

내려받아 둔 `game.zip` 을 골라 설치할 수 있습니다.

1. 창에서 **[설치 파일 선택]** → `game.zip` 고르기
2. **[선택한 파일 설치]** → 그 파일로 설치 (인터넷 없이도 가능)
3. **[선택 초기화]** 를 누르면 다시 최신 릴리스 자동 다운로드로 돌아갑니다

> 같은 최신 판 파일을 고르면 '최신 버전'으로 표시되고, 다른 판이면 '직접 설치'로 표시됩니다.

게임을 **자동으로 내려받아 설치**하는 런처입니다.

## 방법 0 — 단일 파일 (가장 쉬움) ⭐

**`요세의수호자_설치.exe`** 하나만 받으면 됩니다 (약 0.6MB, 게임 내장).

1. 내려받기
2. **더블클릭**
3. 자동 설치 → 게임 실행

- 인터넷 없이도 설치됩니다 (게임이 파일 안에 들어 있음)
- `%LOCALAPPDATA%\YoseGuardian\app` 에 설치
- 저장 파일(`game.db`)은 재설치해도 유지됩니다

### 최신 판으로 설치하려면
```cmd
요세의수호자_설치.exe https://github.com/<아이디>/<저장소>/releases/latest/download/game.zip
```

### 다른 폴더에 설치하려면
```cmd
set YOSE_TARGET=D:\Games\Yose
요세의수호자_설치.exe
```

### 직접 빌드
```bash
npm run single     # → 요세의수호자_설치.exe
```

---

## 사용자용 — 3단계

1. **다운로드** — Releases 에서 `YoseGuardian-launcher.zip` 받기
2. **압축 풀기** — 원하는 폴더에
3. **`설치실행.cmd` 더블클릭** — 끝

자동으로:
- 최신 게임을 내려받고
- `%LOCALAPPDATA%\YoseGuardian\app` 에 설치하고
- 게임을 실행합니다

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `설치실행.cmd` | 원클릭 설치 (더블클릭용) |
| `런처.cmd` | 런처 실행 (GUI) |
| `launcher.ps1` | 다운로드 + 검증 + 설치 |
| `install.ps1` | 실제 설치 (파일 복사 · npm) |
| `launcher.json` | 다운로드 주소 설정 |
| `launcher-gui.vbs` | 창 없이 실행 |

## 다운로드 주소 바꾸기

`launcher.json` 을 열어 수정:

```json
{
  "url": "https://github.com/본인아이디/저장소/releases/latest/download/game.zip"
}
```

- **GitHub Releases** (권장): `https://github.com/<아이디>/<저장소>/releases/latest/download/game.zip`
- **로컬 서버**: `http://127.0.0.1:3001/game.zip`

## 릴리스 만들기 (자동)

```bash
git tag v1.0.0
git push origin v1.0.0
```

→ GitHub Actions 가 자동으로:
1. 클라이언트 빌드
2. `game.zip` 생성
3. `YoseGuardian-launcher.zip` 생성
4. **Releases 에 업로드**

## 수동으로 릴리스하기

```powershell
# 1. 빌드
npm run build

# 2. 패키지
$stage = "stage"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item client/dist "$stage\client\dist" -Recurse -Force
Copy-Item server $stage\server -Recurse -Force
Copy-Item package.json $stage -Force
Compress-Archive -Path "$stage\*" -DestinationPath game.zip -Force

# 3. GitHub 에 업로드
gh release create v1.0.0 game.zip YoseGuardian-launcher.zip
```

## 요구 사항

- **Windows 7 이상** (PowerShell 5.1)
- **Node.js 20 이상** (없으면 런처가 안내 후 중단)

## 설치 위치

```
%LOCALAPPDATA%\YoseGuardian\app
```

- 저장 파일(`game.db`)도 여기 있습니다
- 재설치해도 **저장은 유지**됩니다 (덮어쓰지 않음)
- 제거: 폴더 삭제

## 문제 해결

### "PowerShell 을 찾을 수 없습니다"
Windows 7 이상이면 기본 포함입니다. 없다면 [PowerShell 설치](https://aka.ms/powershell).

### "다운로드 실패"
- 인터넷 연결 확인
- `launcher.json` 의 주소가 올바른지 확인
- GitHub Releases 에 `game.zip` 이 있는지 확인

### "Node.js 가 없습니다"
[Node.js LTS](https://nodejs.org) 설치 후 다시 실행.

### 설치 로그 보기
```
%LOCALAPPDATA%\YoseGuardian\install-log.txt
```