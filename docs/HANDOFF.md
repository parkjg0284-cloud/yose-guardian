# 인수인계 문서 (HANDOFF)

> 최종 갱신: 전체 검증 완료 시점. 프로젝트는 세션 도중 OneDrive가 폴더 이름을 바꿔
> `이전 작업폴더` → **`요세의 수호자`** 로 이동했다. 현재 위치가 정본이다.

## 0. 한 줄 요약

빈 폴더에서 시작해 **요새의 수호자(FPS + 타워디펜스 + 협동 멀티)** 를 끝까지 구현했고,
로직·통합·UI·네트워크·프로덕션 빌드까지 **자동 검증 전부 통과**했다.
남은 것은 사람이 직접 하는 **브라우저 실플레이 확인**뿐이다.

## 1. 위치와 실행

```
<프로젝트 폴더>
```

```powershell
cd "<프로젝트 폴더>"

npm.cmd install --ignore-scripts --cache ./.npm-cache   # 의존성(이미 설치됨)
npm.cmd run dev        # 단일 프로세스 런처 → 게임 http://localhost:3001 (HMR 은 되면 5173)
npm.cmd run verify     # smoke + headless + ui + 버그테스트 4종 + 프로덕션 빌드
npm.cmd run start      # 프로덕션 정적 서빙 → http://localhost:3001  (내부적으로 --prod)
npm.cmd run e2e        # 실서버 REST/소켓 E2E 94체크 (서버를 먼저 띄운 상태에서)
npm.cmd run bugtest3   # 캐릭터/앉기/부드러운 회전 버그테스트 71체크
npm.cmd run bugtest4   # 전기·저장고·지형 채굴·포탑 추적·연사 정상화·활/화살 80체크 (Round C/D)
```

- **`run.cmd` 더블클릭**이 가장 간단하다(서버 기동 + 브라우저 자동 오픈).
- 서버 포트는 기본 3001이며, 관리자 로그인 → 설정 → **서버 · 포트**에서 바꿀 수 있다.
  `.env` 의 `PORT` 에 저장되고 `app.js`·`게임실행.vbs`·`run.cmd`·`tools/dev.mjs` 가 모두 그 값을 읽는다(v1.16.0).
- **v1.17.0 요정 직업** — 메인코어 E → 전직에서 **요정(🧚)** 선택. 요정의 지팡이 T1은 전직 시 자동 지급되고,
  T2~T7은 해당 티어 제작대에서 만든다. 무기 82종·계열 11개. 런처 **[패치노트]** 에 변경 내용이 표시된다.
- **v1.18.0 메인화면·런처** — 메인/싱글/멀티의 [불러오기] 버튼을 없앴다(설정 → 내 세이브 목록만 사용).
  런처는 설치/업데이트 중 [게임 시작]을 잠그고 끝나면 활성화하며, 설치 후 자동 실행하지 않는다.
- **v1.19.0 지옥·디아블로·캐릭터** — 난이도별 몬스터 HP/공격력 배수, **지옥 100 웨이브 고정**,
  최종보스 **디아블로 HP 1,000,000,000 / 공격력 1,700,000**, 멀티 캐릭터 **고품질 3D 모델 + 천상기사**,
  런처 **[패치노트]** 로 명칭 변경. 전체 검증 **2,286개** 통과.
- `npm run dev` 는 `tools/dev.mjs` 로 바뀌었다: 서버(Express+Socket.io)와 Vite 를 **같은 프로세스에서** 띄운다.
- `npm run dev:tunnel` 은 `tools/dev-tunnel.mjs` 가 터널 출력을 `.tmp/tunnel-<port>.log` 로 받아 공개 주소를 찾고 `PUBLIC_URL` 로 넘긴 뒤 `dev.mjs` 를 그대로 import 한다(파이프 spawn 금지 환경 대응).
  `concurrently` 는 자식 프로세스 spawn 을 막는 환경에서 `spawn EPERM` 으로 즉사했기 때문에 제거했다.
  Vite 가 막히면(esbuild/자식 프로세스 차단) 자체 점검(`/src/main.js` 200 확인) 후 **정적 서빙으로 자동 대체**한다.
  `NODE_ENV=production` 을 켜지만 이 값은 정적 서빙만 좌우한다(게임 로직·네트워크에는 영향 없음 — `server/index.js` 사용처 3곳).

- 이 환경은 PowerShell 실행 정책으로 `npm`/`npm.ps1`이 막혀 **`npm.cmd`** 를 쓴다.
- npm 캐시가 워크스페이스 밖이면 샌드박스가 막으므로 `--cache ./.npm-cache` 를 지정한다.
- URL 파라미터: `?seed=777` (시드 고정), `?seed=42` (요정 이스터에그).

## 2. 검증 결과 (실측)

| 스위트 | 명령 | 결과 | 범위 |
|---|---|---|---|
| 데이터/로직 | `npm run smoke` | **978 / 978** | 포탑 **100**(공격47·회복7·채굴7·벌목7·**시설32 = 기본4[작업대·마법부여대·채굴기 + 저장고 T1] + 저장고7 + 발전기7 + 전선1 + 벨트7 + 소환문7**) · **전력 상수·저장고 티어·지형 티어 광물·티어 N 건물 = 티어 N 지형 광물 규칙**, 나무 30, 광물 27, 업적 90, 요정 7, **무기 67 + 맨손(0종 시작)**, **마법부여 14속성(모든 무기·5레벨·건물 게이트·재화 차감·저장 왕복)·건물 회전(yaw 저장/복원)**, **제작대 8종·무기 레시피 33종·화살 레시피 7종·작업대 66종(꿈의 끝은 희망 제외)**, **잔디 지형색**, **벨트 속도·물류 보너스·소환 주기 단조 증가 검증**, 등급 가중치 합 10000, RNG 재현성, 경제 불변식, 가챠 2만 회 분포, **스왑모션 67/67·궁극기 9·제작 데이터 자체 검증**, **성능 배선(광원 컬링·청크 상수·그림자 주기·적응형 해상도)**, **적응형 해상도 순수 함수**, **맨손 채집 규칙(T1 한정·조준 선택·골드 10% 회계)**, **관리자 명령어 14종(한글/영문 별칭·검색·권한·기본값·27종 자원·플라이/날개/가죽/화살/장비)**, **요정의 날개 8종(티어 1~7 + 유물/초월 등급, 비용·비행 수치·구매/장착/해제/저장 왕복·관리자 강제 비행) + 배선 계약(main.js 메서드 8종·이벤트/data-act 일치·styles/HUD·플레이어 고도 복원 한 줄)**, **가죽 5종 원장(economy 왕복·지출/부족 검증·가치)**, **가죽 장비 6종·슬롯 6곳·세트 2/4/6·비율 보너스·같은 슬롯 규칙·저장 왕복**, **지형 몬스터 16종·편성표 9곳(티어 단조 증가·종 소속 일치)·확률 드롭·웨이브 편성 분리**, **로밍 스포너(상한·유예·정리 거리·월드 상한·안전 지대 제외)**, **활 계열 10종·화살 7종 데이터/레시피 무결성·궁수 직업·활 잠금·배선 계약** |
| 통합 시뮬 | `npm run headless` | **600 / 600** | 실제 모듈을 스텁 `THREE.Scene` 위에서 구동: **야생 몬스터 실제 스폰·처치(가죽/골드/통계)·웨이브 정산 격리(_aliveCount 불변)·로밍 스포너→waves.spawnRoamer 배선·확정/확률 드롭·가죽 장비 배율(이동·마나·스태미나·피해감소)·관리자 `/가죽`·`/장비`**, 월드/충돌, 건설·판매·강화·채굴·벌목·회복, 120초 웨이브 전투, 마법·가챠·요정, 플레이어/지팡이, **지형 표면 정합·나무 바닥 고정**, **시설(저장고 용량/근접 자동 수거·채굴기 지형 티어 자동 채굴·작업대)** · **전기(발전기 연결·전선 사슬·정전·전선은 상한과 별도) · 소환문 전력 게이트**, **컨베이어벨트 물류 보너스/승강/승급**, **소환문 소환·과밀 정지·웨이브 정산 제외**, **무기 뷰모델 스왑 67/67 재생·포즈 복귀·꿈나무 스왑 연출·임팩트 수명/dispose·비살상 구원 회계**, **제작 시스템(제작대 건설→무기 제작→비용 차감→해금/재료 실패→저장·복원), **청크 컬링(나무 1,200 → 276 인스턴스·광물 344 → 55·이동 시 청크 집합 변화·재계산)**, **벌목/복구가 청크 메시에서 동작**, **맨손 채집(실제 월드 T1 나무/광물·T2 거부·벌목)**, **관리자 명령(실제 경제 연동·웨이브 30·치유·플라이·날개)**, **요정의 날개 비행 물리(이륙·상한 120m 클램프·마나 소진 추락·Shift 하강·착지 접힘·사망/부활 초기화)·뷰모델(19메시·펄럭임·잔상·dispose)**, **활 뷰모델 10종·시위 당김/복귀·화살 제작→소비→티어 우선순위·관통 피해·유물 활 제작 게이트·저장 왕복**, dispose |
| UI DOM | `npm run ui` | **349 / 349** | **가죽 카드 5장·가죽 장비 카드 6장(슬롯 6곳·제작/착용/해제/전부 해제 버튼·gear:* 이벤트)**, **요정의 날개 8장 카드·등급 배지**, **15개 패널**(🔮 마법부여 포함 · 무기 인벤토리 Tab · **전직** `classes` 포함) 렌더, MainMenu(탭·모드·난이도·시드 카드), **메뉴→패널 중복 토글 회귀 4종**, **제작 패널(작업대 탭·작업대 66종·계열 분류 9탭)·🏗 시설 탭 **32종(⚡전력 묶음 포함)**·시설 티어 탭(T4 4종)**, 컷씬 연출/정리, **관리자 콘솔(비관리자 게이트·Enter 실행·기록/이동·Escape·dispose)**, **요정의 날개 인벤토리 8장 카드·구매/장착 버튼·선택 표시 + HUD 🪶 칩(고도/강조)**, **제작 패널 🏹 화살 구획(티어별 묶음·비용·보유)·HUD 🏹 화살 칩** |
| 미니게임 | `npm run minigame` | **61 / 61** | `client/public/mini-game.html` 스텁 DOM 실행: dt 기반 이동(30/60/144fps 동일 거리)·대각선/경계, 적 제거 인덱스 밀림 없음(원본 버그)·충돌 체력, 안전 스폰(150회 ≥170px), 생존+회피 점수(+10 라벨), 게임오버/재시작, 탭 숨김 정지·최고 점수 저장, 터치 드래그 |
| 버그테스트 | `npm run bugtest` | **21 / 21** | 최종보스 전용: 스폰·고정 스탯(HP 10,000,000/공격력 17,000)·반지름 42·거대 메시 파츠 16개·프레임 120틱 무예외·심판 40회·월드 체력바·풀 재사용·시드 3개 자원 규칙(2,832노드 위반 0) |
| 네트워크 | `npm run e2e` | **94 / 94** | 가입/로그인/세이브/리더보드(서버 재검증·위조 400)/stats, **관리자 로그인·role·관리자 API(401/403/개요/점수 삭제)·리더보드 우회**, 방 생성·참가·준비·채팅·시작·스냅샷·터렛 릴레이·**터렛 회전(turret:rotate) 릴레이**·퇴장 |
| 날개/가죽 버그테스트 | `npm run bugtest2` | **88 / 88** | 제작 게이트·재화 원자성·손상 세이브·가죽 원장·장비 세트·야생 편성/스포너·배선 계약 (tools/wings-bugtest.mjs) |
| Round C/D·연사 버그테스트 | `npm run bugtest4` | **80 / 80** | 전기 게이트(무전력 정지·6m 연결)·전선 사슬(34m 공급·8m 초과 단절)·정전과 복구·저장고 용량/근접 수거/업그레이드(60→170)·전력망 경계(6m/8m·공급=소비·NaN·중복 id·미등록 id)·티어 재료 규칙·**§⑩ 활·화살(제단 매칭·발당 피해·소모·묶음 제작·유물 활 수치)** (tools/base-bugtest.mjs) |
| 캐릭터/앉기/회전 버그테스트 | `npm run bugtest3` | **71 / 71** | 이름·외형 살균(`__proto__` 등 오염 거부)·저장소 내성·전송 페이로드·앉기 경계(`sitAmount`·dt 이상·비행 해제·점프 차단)·yaw 정규화/목표 누수/저장 복원 (tools/character-bugtest.mjs) |
| 프로덕션 빌드 | `npm run build` | 성공 | `index.html 3.23KB` + `CSS 76.78KB (gzip 15.70KB)` + `JS 1,601.90KB (gzip 461.94KB)` (`assets/index-C0abABMJ.js` · `assets/index-UG3hdX9a.css`) + `mini-game.html 14.17KB` |
| 개발 서버 모듈 | Vite 5173 | 200 | `/src/main.js`(weaponRig·impacts·healthbars import 포함)·`/src/player/weaponRig.js`·`/src/player/impacts.js`·`/src/ui/panels.js` 200, `/api/health` 프록시 200 |
| 다른 기기 접속 | `npm run lancheck` | **9 / 9** | 공유 주소(`/api/net`) → 초대 링크 열기(200+game-canvas) → 두 클라이언트 접속 → 방 만들기 → 코드로 참가 → 방장 시작 → `game:start` 수신. **서버를 켠 상태**에서 실행 |
| 정적 서빙 | `npm run start` | 200 | `/` 200(game-canvas 포함), `/assets/*.js|css` 200, SPA 폴백 200, 미지의 API 404 JSON, `/api/health` 200, `/socket.io` 핸드셰이크 200 |

## 3. 구조

```
요세의 수호자/
├─ package.json          # 워크스페이스 + dev/build/start/serve/smoke/headless/ui/e2e/verify
├─ .env                  # PORT 3001, JWT_SECRET, DB_PATH, SERVER_TICK_HZ 20, LEADERBOARD_MIN_WAVE 3
├─ README.md             # 사용자용 개요·조작키·기능표·검증표
├─ 게임실행.cmd           # 어느 폴더에서든 더블클릭 실행(바탕 화면 사본 포함) · client/public/mini-game.html(미니게임)
├─ docs/CONTRACT.md      # 모듈 계약서(단일 진실 공급원) — 새 작업은 이것부터
├─ docs/SYSTEMS-CHANGES.md  # 시스템 계층 구현 노트(계약 편차 11건 포함)
├─ tools/{smoke,headless,ui-dom-smoke,e2e-net,lan-guest-check,wings-bugtest,boss-bugtest}.mjs · dev-tunnel.mjs + tunnel-info.mjs(터널 자동 실행)
├─ server/  index.js db.js net-info.js(LAN 공유 주소) api/{auth,save,leaderboard,stats,admin}.js game/{Room,RoomManager,protocol}.js · GET /api/rooms(열린 방 목록)
└─ client/  index.html vite.config.js
   └─ src/ main.js data.js net.js(netInfo=/api/net) audio.js utils/rng.js
           world/{world,terrain,trees,minerals,base,portals,sky}.js   # terrain.surfaceHeight = 메시 표면 정합(잔디 바닥)
           player/{player,staff,weaponRig,impacts,projectiles}.js   # 무기 67종 뷰모델(가위 두 날개 스닙·활 포함) + 스왑모션/임팩트
world/regions.js                                                   # 티어 지역 9(안전·T1~T7·황야) · 히든 지역 2(벚꽃의 정원·시간의 지평선) · 전용 자원 4종
crafting.js + systems/crafting.js                          # 제작대 8종 · 무기 레시피 33종 + 화살 레시피 7종 + 날개 레시피 8종 · 작업대 66종 · CraftingSystem
           systems/turrets.js                              # 시설 18종 — 마법부여대(enchanter)·벨트(승강/물류)·소환문(waves.spawnAt)
           systems/{economy,achievements,gacha,enemies,waves,turrets,spells,fairies}.js
           systems/enchant.js     # 마법부여 14속성 · 5레벨 — 모든 무기(순수 로직)
           systems/gathering.js   # 맨손 채집(T1) · 맨손 시작(무기 0종) — 순수 로직
           systems/admin-commands.js  # 관리자 명령 14종(무기·자원·돈·웨이브·치유·플라이·날개·가죽·화살·장비)
           systems/wings.js           # 요정의 날개 8종(티어 1~7 + 유물/초월) — 비행 장비(순수 로직)
           systems/gear.js            # 가죽 장비 6종 — 슬롯 6곳 · 세트 2/4/6 · 비율 보너스(순수 로직)
           systems/region-spawns.js   # 지형 야생 몬스터 로밍 스포너(순수 로직 · 웨이브 정산 무관)
           player/wings.js            # 1인칭 날개 뷰모델(WingRig, 카메라 자식)
           ui/{hud,minimap,panels,fps,cutscene,menu,console,adaptive,styles.css}
                                     # console = 게임 안 관리자 콘솔(백틱 또는 /)
                                     # adaptive = 적응형 해상도(0.55~1.0 픽셀 비율)
```

## 3-1. 무기 시스템 (신규 · 계약)

| 파일 | 역할 |
|---|---|
| `client/src/data.js` | **단일 진실 공급원** — `WEAPON_FAMILIES`(8계열 — 활 추가 · 가위는 전용 1종) · `WEAPON_GRADES`(8등급 배율) · `WEAPON_MOTIONS`(rest/swap/attack/skill/recoil + 8 이징) · `WEAPON_IMPACTS` · `WEAPON_ULTIMATES`(9) · `ULTIMATE_IMPACTS` · `DREAM_TREE` · `WEAPONS`(67) |
| `client/src/player/weaponRig.js` | 뷰모델 + 스왑모션 엔진. `equip(id)` 는 **항상** 스왑모션을 재생한다(`hasSwapMotion` 67/67). 가위 계열은 `sampleSnip` 으로 `motion.snip` 트랙을 읽어 두 날개를 여닫는다(release 에 맞물림). 호환 API: `setTier/setElement/setRelic/playCast/playHit/tier/muzzlePosition/update/dispose` |
| `client/src/player/impacts.js` | 타격/스킬 임팩트(`ImpactFX`). 파티클·링·구체 풀링, `hit/skill/salvation/gratitude`. **꿈나무는 shake 0** |
| `client/src/systems/waves.js` | `salvation(enemy)` — 비살상 제거. `kills` 를 올리지 않고 `salvations`·`_aliveCount` 만 처리(웨이브 진행은 정상) |
| `client/src/main.js` | 장착/스왑(`Q`)/무기 패널(`Tab`)/궁극기(`R`)/근접 판정/꿈나무 구원/보유 모델(`weapons.owned`) |
| `client/src/systems/enemies.js` | `reset({ mods, elite, rosterId })` — 편성 강화(HP/속도/크기)·정예 개체(HP×2.4·금색 오라)·`barY`/`barWidth` 계산. `enemyInfo()` 에 `elite`·`ratio`·`barY`·`shielded`·`ability` 포함 |
| `client/src/systems/waves.js` | `WAVE_ROSTERS` 편성표로 웨이브마다 다른 몬스터 구성(`_buildQueue` → `_rosterPool`·정예 배치·`mods` 전달). `rosterInfo`·`bossEnemy`·`snapshot().roster/boss` 노출 |
| `client/src/world/portals.js` | **3D 소환문** — 석조 아치·소용돌이·바닥 룬·화로를 문마다 조립(정적 부품은 `mergeParts` 로 1장 병합, 문 하나 = draw call 11). `spawnPoint()` 가 문 바로 뒤 스폰 지점, `flashNearest()` 가 몬스터가 나올 때 문을 번쩍이게 한다 |
| `client/src/ui/healthbars.js` | **신규** — 월드 몬스터/보스 체력바. `InstancedMesh` 2장(배경+채움)으로 220기까지 draw call 2회. `sync(enemies, camera)` → 그린 개수, `clear()`, `dispose()` |
| `client/src/ui/hud.js` | **보스 체력바**(`hud-bossbar`) — 이름·웨이브·체력 수치·칩(지연 감소)·저체력·실드 연출. `game.bossInfo` → 없으면 적 목록에서 보스 탐색 |
| `client/src/ui/panels.js` | 12번째 패널 `weapons` — 67행 목록·등급 배지·장착(`weapon:equip`)·미리보기(`weapon:preview`)·꿈나무 전용 카드 |
| `client/src/ui/lobby.js` | **신규 — 초대코드 멀티플레이 로비**. entry 뷰(방 만들기: 모드·난이도·시드·인원 / 초대코드 4자리 참가), room 뷰(큰 초대코드·코드/링크 복사·공유·참가자 슬롯·준비 토글·방장 시작·채팅). `?room=CODE` 딥링크 자동 참가, ESC 닫기. 서버 계약은 `net.createRoom/joinRoom/setReady/startGame/leaveRoom/sendChat` 그대로 |
| `client/src/systems/classes.js` | **신규 — 전직 시스템**(THREE·DOM 금지). `ClassSystem`(직업·단계·승급·재전직·저장/불러오기·이벤트) + `advance`/`promote`/`canAdvanceTo`/`lockOf`/`canUse`/`filterUsable`/`modifiers`. 규칙은 `data.js` 의 `CLASSES`·`CLASS_STAGES`·`CLASS_RULES`·`weaponLock()` 하나만 본다 |
| `client/src/data.js` (전직부) | `CLASSES`(초심자 + 6직업: 마법사·기사·광전사·사신·그림자·궁수) · `CLASS_STAGES`(0~3차, maxTier 2/4/6/8) · `CLASS_RULES`(웨이브 3/12/22, 비용 0/1,200/3,000, 재전직 2,000, 공용 계열 scissors·dream) · `weaponLock(무기,직업,단계)` · `classModifiers` |
| `client/src/utils/invite.js` | **신규 — 초대코드 순수 유틸**(THREE·DOM 금지). `normalizeInviteCode`(4자리 A-Z-0-9·대소문자 무시·기호 제거)·`isValidInviteCode`·`inviteLink`/`inviteMessage`·`codeFromUrl`(`?room=`)·`loadLastCode`/`saveLastCode` |
| `client/src/ui/menu.js` | 메인 화면 **초대코드 멀티플레이 카드**(코드 입력·[참가]·최근 코드·초대 링크) + `multiplayer:join` 이벤트 |
| `client/src/audio.js` | SFX 27 → **40종**(`swap`(계열별)·`impact*`·`ultimate*`·`salvation`) |

**불변식**

- 무기 모션/임팩트 수치는 `data.js` 만 고친다. `weaponRig.js`/`impacts.js` 안에 무기별 하드코딩을 넣지 않는다.
- 모든 무기(67)는 스왑모션을 가진다 — 새 무기를 추가하면 `WEAPON_MOTIONS[계열]` 이 자동 적용된다.
- 꿈나무는 죽이지 않는다: 피해 0, `waves.salvation`, `shake 0`, 감사 인사는 HUD 로.
- **맨손(무기 0종) 시작** — `_defaultOwned()` 는 빈 Set. `weaponsOwned` 로 세이브에 저장되고, 제작하면 자동 장착된다.
- `WEAPONS` 67종에 맨손을 넣지 않는다(`FIST_WEAPON` 은 별도 상수) — 수집·가챠·업적 계산을 흔들지 않기 위함.

## 3-2. 관리자 계정 (신규)

| 항목 | 값 / 위치 |
|---|---|
| 아이디 / 비밀번호 | `admin` / `(비밀번호는 .env 참고)` (`.env` 의 `ADMIN_USERNAME`·`ADMIN_PASSWORD`·`ADMIN_NICKNAME`) |
| 생성 시점 | 서버 시작 시 `db.initDb()` 직후 `auth.ensureAdminAccount()` — 없으면 만들고, 있으면 `role` 만 승격 |
| 스키마 | `users.role TEXT NOT NULL DEFAULT 'user'` (+ 기존 DB 자동 `ALTER TABLE` 마이그레이션) |
| 토큰/응답 | `signToken` payload 와 `publicUser` 에 `role`·`isAdmin` 포함. `requireAuth` 는 매 요청 DB 에서 role 을 다시 읽는다 |
| 관리자 API | `server/api/admin.js` — `GET /api/admin/overview`, `GET /api/admin/users`, `DELETE /api/admin/scores/:id` (모두 `requireAdmin` → 401/403) |
| 예외 | 리더보드 등록 시 최소 웨이브·위조 점수 검증을 관리자는 우회(`leaderboard.js` 의 `isAdmin`) |
| UI | `net.auth.isAdmin` 게터 + 계정 패널·메뉴의 👑 관리자 표시 |

```powershell
# 로그인 확인 (개발 서버 기준)
curl.exe -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"(비밀번호는 .env 참조)\"}"
```

## 3-3. 성능 · 맨손 채집 · 관리자 콘솔 (신규)

| 파일 | 역할 |
|---|---|
| `client/src/ui/adaptive.js` | **신규 — 적응형 해상도(THREE·DOM 금지)**. `ADAPTIVE`(하한 0.55 · 하향 50fps · 상향 58fps · 스텝 0.08 · 주기 1.5s · 웜업 3s) · 순수 함수 `nextPixelScale`/`suggestPreset`/`formatScale` · `AdaptiveResolution`(renderer 픽셀 비율 조정, 프리셋 변경 시 100% 복귀) |
| `client/src/systems/gathering.js` | **신규 — 맨손 채집(THREE·DOM 금지)**. `BARE_HAND`(사거리 3.8m · 위력 14 · 주기 0.42s · **T1 까지**) · `nodeTier`/`isNodeAlive`/`canHarvestByHand`/`pickHarvestNode`(가장 가까운 노드 + 잠긴 노드 안내) · `harvestNode`(나무→목재·`woodChopped`/`treesFelled`, 광물→광물·**골드 10%**·`mineralsMined`/종류) · `harvestHint` |
| `client/src/systems/admin-commands.js` | **신규 — 관리자 명령어(THREE·DOM 금지)**. `ADMIN_COMMANDS`(14종 · 한글/영문 별칭) · `ADMIN_DEFAULTS`(gold 100,000 · wood 10,000 · mineral 99 · resources 999) · `isAdminUser` · `parseCommand` · `findWeapon`/`findMineral`(id·이름 부분일치, 모호하면 후보) · `runAdminCommand(text,{game,user,isAdmin}) → {ok,message,lines,changed}` |
| `client/src/ui/console.js` | **신규 — 게임 안 관리자 콘솔 UI**. ` (백틱)/`/` 로 토글, `ESC` 닫기, `↑`/`↓` 기록, `Tab` 자동완성, Enter 실행. **관리자가 아니면 열리지 않는다**(`관리자 전용 콘솔입니다` — 계정 role 기준) |
| `client/src/systems/enemies.js` | 몬스터 점광원을 **보스만 점등**(`_light.visible = !!this.isBoss`) — 140마리 스폰 시 보이는 점광원 140 → 0 |
| `client/src/world/trees.js` | 460m **청크 InstancedMesh** + `cullChunks(camera)`(컬링 반경 = `min(drawDistance, 안개 끝) + 150m`)·`invalidateCull()`. 도형 지오메트리/재질은 공유(dispose 도 공유분만) |
| `client/src/world/minerals.js` | 340m 청크 + 청크당 **저티어/고티어 2메시**(종류별 색은 `instanceColor`, 재질 2종 공유) + `cullChunks`/`invalidateCull` |
| `client/src/world/world.js` | `frustumCull()` 에서 두 필드의 `cullChunks(camera)` 호출, `applyQuality()` 에서 `invalidateCull()` |
| `client/src/main.js` | `shadowMap.autoUpdate = false` + `SHADOW_INTERVAL 0.05` 주기 갱신 · `AdaptiveResolution` 배선 · `_updatePerformance`(6초 뒤 1회 프리셋 하향) · `_tryBareHarvest`(좌클릭 우선, 적이 더 가까우면 전투) · `_updateHarvestPrompt` · 관리자 콘솔 배선 + 관리자 접속 안내 |
| `client/src/ui/fps.js` | FPS 오버레이에 `해상도 N%`(배율 < 100% 일 때만) |

**실측 (성능, `tools/_perf2.mjs`)**

| 프리셋 | 나무 인스턴스(렌더/전체) | 광물 인스턴스 | 보이는 점광원 |
|---|---|---|---|
| 성능 | **116 / 880 (13%)** | 32 / 294 (11%) | 0 |
| 균형 | **276 / 1,200 (23%)** | 55 / 344 (16%) | 0 |
| 최고 | 1,306 / 2,440 (54%) | 221 / 544 (41%) | 0 |

**불변식**

- 청크 크기·컬링 여유(`CHUNK_SIZE`/`CULL_MARGIN`)는 각 필드 파일의 상수 하나만 고친다. 컬링은 **거리·안개 기준**이며 프러스텀은 `world.frustumCull` 이 담당한다.
- 벌목/고갈/복구는 청크 메시에서도 인스턴스 행렬 0 ↔ 복원으로 동작해야 한다(헤드리스 검증 항목).
- 맨손 채집은 **T1 전용**(`BARE_HAND.maxTier = 1`)이며 `harvestNode` 가 `maxTier` 로 한 번 더 막는다. 산출 회계는 채굴탑과 동일 경로(`economy`/`stats`)만 쓴다.
- 관리자 명령은 **계정 role 이 admin 일 때만** 실행된다(콘솔 UI 게이트 + `runAdminCommand` 게이트 이중). 명령은 로컬 상태만 바꾼다.
- 몬스터 점광원을 다시 켜지 않는다(보스 예외만). 이 한 줄이 프레임의 절반을 먹는다.

## 3-4. 요정의 날개 — 비행 장비 (신규)

| 파일 | 역할 |
|---|---|
| `client/src/data.js` (날개부) | **단일 진실 공급원** — `FAIRY_WINGS`(**8종**: `fairy_wings` T1 일반 · `sakura_wings` T2 고급 · `star_wings` T3 희귀 · `runic_wings` T4 영웅 · `frost_wings` T5 전설 · `volcano_wings` T6 신화 · **`artifact_wings` T7 유물** · `aether_wings` T8 초월) · `FAIRY_WING_BY_ID` · `FAIRY_WING_DEFAULT`(=`fairy_wings`) · `WING_FLIGHT_DEFAULTS` · `WING_GRADES`(8단계 등급표)/`WING_GRADE_BY_ID`/`wingGradeInfo` · `fairyWingById`/`fairyWingTier`/`nextFairyWing`/`fairyWingGrade`/`fairyWingCount`/`wingsByGrade`/`wingsUpToTier`. 각 항목 = `{id,tier,grade,name,glyph,desc,cost{minerals,leather,gold},flight{equipped,id,speed,lift,descend,drain,ceiling},flap,color,accent,glow,requires}` |
| `client/src/systems/wings.js` | **신규 — 비행 장비 시스템(THREE·DOM 금지)**. `WingSystem`(`owned`·`equippedId`·`forced`) · `grant`(관리자 소환) · `equip`/`unequip`/`toggleEquip`/`setForced` · `flight()` → `Player.setFlight` 프로필 · `toJSON`/`fromJSON` · `wingCostText`/`wingFlightText`/`findWing`. (`buy` 는 시스템 API 로 남아 있지만 **UI 경로는 제작대**다) |
| `client/src/crafting.js` (날개부) | **날개 레시피 8종** — `WING_RECIPES`(비용은 `FAIRY_WINGS.cost` 를 그대로 참조) · `WING_TABLE_BY_TIER`(T1~T7 → `forge_tN`, T8 → `garden_of_dreams`) · `WING_RECIPE_BY_WING`/`WING_RECIPES_BY_TABLE` · `wingRecipeFor`/`wingRecipesForTable`/`isWingRecipe` · `validateCrafting` 에 날개 검증(개수·제작대 티어·비용 광물/가죽 id·선행 체인) · `costText` 가 가죽 이름까지 표시 |
| `client/src/systems/crafting.js` (날개부) | `canCraftWing(wingId, ctx)`(제작대 건설 + 선행 날개 + 재료) · `craftWing(wingId, ctx)`(`economy.spend` → `ctx.onWingCrafted`) · `craftedWings`/`craftedWingCount`/`wasWingCrafted` · `wingsFor`/`wingRecipe` · `toJSON`/`fromJSON` 에 `craftedWings` |
| `client/src/player/wings.js` | **신규 — 1인칭 날개 뷰모델(THREE)**. `WingRig({camera})` 가 카메라 자식으로 좌우 날개(깃털 12장 + 막 + 코어)를 조립. `setProfile(프로필)`(id·색이 바뀔 때만 재생성) · `update(dt,{flying,speed,ascend,mana})`(펄럭임·기울기·코어 발광·고속 잔상) · `dispose`. **emissive 전용 재질 · 점광원 없음 · `frustumCulled=false`** |
| `client/src/player/player.js` | `flight` 프로필 + `flying`/`canFly`/`airborne`/`setFlight()` · `Space` 상승 · `Shift` 하강 · 입력 없으면 `lift*0.14` 만큼 가라앉음(활공) · 마나 소모(`drain`) → 0 이면 `_foldWings()` · 상한 `ceiling` · 비행 중 `speed` 배율·조작 0.62 · 카메라 롤(`flightRoll`) · `_die`/`respawn` 시 해제 |
| `client/src/systems/admin-commands.js` | 명령 **14종**(+`fly`/`플라이`/`비행`/`날기` · `wings`/`날개`/`윙` · `leather`/`가죽` · `arrow`/`화살`/`화살소환` · `gear`/`장비`/`가죽장비`). `/플라이 [켜기\|끄기]` = `game.adminFly(mode)`(날개 없이 `drain 0`·상한 320m·이륙 부스트) · `/날개 [id\|이름]` = 소환 + 즉시 착용 |
| `client/src/ui/panels.js` | 인벤토리 하단 「가죽」(`_leatherSection`, 5장) · 「가죽 장비」(`_gearSection`/`_gearCard`, 6장 · 슬롯/세트/합산 보너스 · `gear-buy`/`gear-equip`/`gear-unequip`/`gear-unequip-all`) · 「요정의 날개」(`_wingsSection`, **8장** · 등급 배지 `T7 · 유물` · 미보유 카드의 **[제작대에서 만들기]** → 해당 제작대 탭으로 이동). **제작 패널**: 제작대별 `_wingCraftCard`(`[data-role="craft-wing-row"]` · `[data-act="craft-wing"]` · 비용/선행/미건설 안내) · 작업대 탭에는 날개 불가 안내. 단축키 `V` 1행 추가(KEYBINDS 21) |
| `client/src/ui/hud.js` | 상단 🪶 칩 — 착용한 날개 이름 / 비행 중 고도(`비행 42m`) + `is-flying` 강조. **🟫 가죽 칩(가죽 총량)**, 적 카운터는 야생 몬스터를 빼고 `+야생 N` 으로 표시, 지역 칩에 `· 야생 N` |

**불변식**

- 날개 수치의 단일 출처는 `data.js` 의 `FAIRY_WINGS` 다. `WingSystem`/`Player`/`WingRig`/패널/HUD 는 모두 여기서 파생한 값을 쓴다.
- `Player.setFlight(profile)` 은 **클램프된 병합**이며 `equipped:false` 면 날개를 접는다. `canFly = flight.equipped && alive` — 비행은 이 한 조건으로만 시작된다.
- **`world.resolveCollision` 은 마지막에 `position.y` 를 지형 높이로 스냅한다.** 그래서 `Player._integrate` 는 비행 중에만 y 를 복원한다(`if (this.flying) this.position.y = altitude`). 이 한 줄을 지우면 비행이 지면에 붙는다.
- 지면에 닿으면 날개가 접힌다(`_foldWings`). 지면에서 이륙하려면 `Space` 를 다시 눌러야 한다(`_flyVy > 0.5` 인 동안만 호버 유지).
- 마나 소모(`drain`)는 **회복(이동 5.5/s · 정지 13/s)을 뺀 실효값**으로 체공 시간을 정한다(T1 18/s → 약 8초 · T2 9/s → 약 29초 · T3 0 → 무제한).
- 관리자 비행(`/플라이`)은 **날개와 무관**하게 `wings.setForced(true)` + `Player.setFlight` 로 동작하며 `drain` 은 0 으로 강제된다.
- 보유/장착 상태는 런 저장(`serialize`/`load`)에 포함된다. `adminFlight` 는 세션 한정(저장하지 않음).
- **마나 소모는 T1 18/s · T2 9/s · T3 이상 0**(업그레이드하면 완전 무료 비행). 상한은 120 → 900m 로 이어진다.
- **속도 배율은 기본(T1) ×1.27 = +27%** 에서 티어마다 약 +9~10%, 초월만 +18% 도약(×2.60)한다. 지상 이동 속도에는 곱해지지 않는다(비행 중에만).
- **T2 부터는 가죽이 재료로 들어간다**(§3-5). 상위 날개일수록 유물 가죽·시간의 모래 같은 후반 재료를 요구한다.
- **날개의 정식 획득 경로는 제작대다**(`C` → 같은 티어 제작대 탭 → [날개 제작]). 날개 1종 : 제작대 1곳(1:1) — 그래서 제작대 탭에서만 날개 카드가 보이고, 작업대(무기 전용)에는 나오지 않는다.
- `craftWing` 게이트는 **① 제작대 건설 ② 선행 날개 보유 ③ 재료(골드·광물·가죽)** 세 가지다. `canCraft`/`craft`(무기)와 코드 경로를 분리해 두었으니 무기 로직을 건드릴 때 날개가 깨지지 않는다.
- 비용의 단일 출처는 `data.js` 의 `FAIRY_WINGS[].cost` 다. `WING_RECIPES` 는 참조만 하므로 날개 가격을 바꾸면 제작 비용도 함께 바뀐다(스모크가 동일성 검사).

## 3-5. 가죽 · 가죽 장비 · 지형 야생 몬스터 (신규)

| 파일 | 역할 |
|---|---|
| `client/src/data.js` (가죽부) | `LEATHER_TYPES`(**5종** T1~T5) · `LEATHER_TIERS` · `LEATHER_TABLE`(종류별 가치·색·드롭 문구) · `LEATHER_BY_ID` · `leatherById`/`leatherTier`/`leatherForTier`/`leathersUpTo` |
| `client/src/data.js` (장비부) | `GEAR_SLOTS`(**6곳**: head·body·hands·waist·feet·back) · `GEAR_BONUS_KEYS`/`GEAR_BONUS_LABELS` · `LEATHER_GEAR`(**6종**) · `LEATHER_GEAR_BY_ID` · `GEAR_SET_BONUS`(2/4/6) · `leatherGearById`/`gearSlotInfo`/`otherGearInSlot`/`gearBonusText`/`gearCostText` |
| `client/src/systems/gear.js` | **신규 — 장비 시스템(THREE·DOM 금지)**. `GearSystem({economy,audio,achievements})` — `owned:Set` · `equipped:{slot:id}` · `count/equippedCount/has/equippedIn/isEquipped/list/canBuy/buy/grant/equip/unequip/toggle/unequipAll/clear/bonus()/stats()/setTexts/toJSON/fromJSON/dispose` · `emptyBonus/addBonus/GEAR_BONUS_KEYS/gearSlotText` |
| `client/src/data.js` (야생부) | `REGION_ENEMY_TYPES`(**16종** — 웨이브 `ENEMY_TYPES` 11종과 **별도 배열**) · `REGION_ENEMY_BY_ID`/`isRegionEnemy` · `REGION_MONSTERS`(편성표 **9곳** = T1~T7 + 히든 2) · `REGION_MONSTER_BY_ID` · `regionMonsterRoster`/`regionHasMonsters`/`pickRegionMonster`/`regionMonsterLoot` · `waveEnemyLeather` · `ENEMY_TYPE_BY_ID`(웨이브 전용)/`BOSS_TYPE_BY_ID`/**`ALL_ENEMY_BY_ID`(27종)**/`enemyTypeById`/`ENEMY_TYPE_TOTAL` |
| `client/src/systems/region-spawns.js` | **신규 — 로밍 스포너(THREE·DOM 금지)**. `ROAMER_DEFAULTS`(interval 7 · maxAlive 10 · spawnRadius 80 · despawnRadius 400 · totalCap 80 · grace 2.5) · `roamerRoster`/`isRoamer`/`countRoamers`/`deltaXZ`/`shouldDespawn`/`roamerSpawnPoint` · `RegionSpawner.update(dt, {position, regionId, phase, enemies, spawn, despawn})` |
| `client/src/systems/economy.js` | 가죽 **원장 분리** — `this.leathers` · `addLeather/getLeather/_takeLeather/totalLeather` · `canAfford`/`spend` 가 `cost.leather` 를 함께 검사 · `toJSON`/`fromJSON` 에 `leathers` 포함 |
| `client/src/systems/waves.js` | `spawnRoamer({regionId,typeId,x,z,wave,elite})` — `fromTower/spawnerKind='region'/roaming/regionId/spawnerTier/leatherDrop` 를 달아 `enemies` 에 넣는다(**웨이브 정산 제외**) · `_awardKillLeather(enemy)` — 모든 킬이 지나는 가죽 지급 단일 창구 · `DIRECT_HANDLER` 에 `leatherGained`/`roamerSpawn` 추가 |
| `client/src/main.js` | `this.gear = new GearSystem(...)` · `this.regionSpawner = new RegionSpawner(...)` · `_updateRegionSpawns(dt)`(프레임 루프) · `applyGear/buyGear/equipGear/unequipGear/unequipAllGear/gearState` · `spawnRoamerNow(count,typeId)` · `adminLeather/adminGear` · `serialize/load` 에 `gear` 포함 · 장비 비율을 `_applyClassModifiers`/`_applyFlight`/무기 피해/`turrets.miningBonus` 에 곱함 |

**불변식**

- **가죽은 미네랄이 아니다.** `MINERAL_TYPES`(27종)·`totalMinerals()`·제작 검증(`crafting.js:204` 의 id 검사)을 건드리지 않도록 `economy.leathers` 라는 **별도 원장**을 쓴다. 가죽을 미네랄에 섞으면 기존 세이브·27종 단언·채굴 통계가 전부 깨진다.
- **야생 몬스터는 웨이브 편성과 분리된 배열이다.** `REGION_ENEMY_TYPES` 는 웨이브 편성·시설 소환문 풀(`_typePool` = `ENEMY_TYPES` + `minLevel`)에 절대 섞이지 않는다. 스폰 경로만 `ALL_ENEMY_BY_ID` 로 열어 준다.
- **야생 몬스터는 웨이브 정산에 끼지 않는다.** `fromTower = true`(시설 소환문과 같은 플래그) + `roaming` + `spawnerKind='region'` 으로 표시한다. `_aliveCount`·`_queue`·`_waveTotal`·`spawnedTotal` 을 **절대 건드리지 않는다**(`_handleEnemyDeath`/`_countAlive`/`salvation` 이 `fromTower` 를 걸러낸다).
- 야생 몬스터는 `waves.enemies` 에 들어간다 — 무기·포탑 조준, 월드 체력바, 미니맵이 기존 경로를 그대로 쓴다. `Enemy` 는 `dispose()` 가 없고 `despawn()` 으로 풀에 반납된다(풀 재사용이므로 로밍 필드는 `reset()` 에서 매번 초기화한다).
- **가죽 장비 보너스는 전부 비율(%)** 이다. `maxHp`/`maxMana`/`manaRegen` 원본을 직접 쓰지 않으므로 세이브에 굳은 값이 남지 않는다 — `_applyClassModifiers()` 가 전직 패시브·요정 보너스와 **곱해서** 다시 계산한다(스태미나는 `_staminaRegenBase` 에 기본값을 캐시해 매번 기본값에서 재계산).
- 처치 보상은 `_awardKillGold` → `_awardKillLeather` 한 길로만 흐른다. 확률은 종별 표(`leather.chance/min/max`)가 정하고, 히든 지역 종은 보너스 광물도 함께 떨군다.
- 로밍 스포너는 `prep` 단계·게임오버·안전 지대에서 **스폰하지 않는다**. `totalCap`(월드 전체 상한)과 `maxAlive`(지역별)를 모두 지킨다.

### 3-4-1. 이번에 함께 고친 카메라 결함 (중요)

- **카메라가 씬에 추가되지 않았다** — `main.js` 가 `new THREE.PerspectiveCamera` 만 만들고 `scene.add(camera)` 를 하지 않아, **카메라 자식으로 붙는 1인칭 뷰모델(무기·날개)이 한 번도 렌더되지 않았다.** `_initRenderer` 에 `this.scene.add(this.camera)` 를 추가했다.
- 부작용(좋은 쪽): 무기 뷰모델 67종의 스왑모션·임팩트가 이제 실제로 화면에 보인다. 반대로 뷰모델이 갑자기 보이는 것이 어색하면 `WingRig`/`WeaponRig` 의 위치(날개는 `z=-0.52`, 카메라 앞)만 조정하면 된다.

## 3-6. 마법부여 · 맨손 시작 · 건물 회전 (신규)

| 항목 | 내용 |
|---|---|
| 🔮 마법부여대 | 건설 `B` → 🏗 시설 → 마법부여대(4,800 G · 목재 1,100 · 은 8 · 수정 6 · 마나 5). 지어야 부여가 열린다 |
| 속성 14종 | 🔥화염 ❄️냉기 ⚡번개 🪨대지 ☠️독 🌪️바람 💧물 ⚙️금속 🔯비전 🌑어둠 🌟빛 🩸혈마 · ✨신성 🕳️공허 |
| 레벨 | 같은 속성 재부여 = +1레벨(최대 5) · 다른 속성 = 1레벨 교체 · 레벨 1당 피해 **+8%** · 비용 = 1레벨 기준가 × 레벨 |
| 대상 | **보유한 모든 무기**(맨손 제외) — 무기마다 개별 상태, 세이브에 저장 |
| 여는 길 | 마법부여대 앞 `E` · `C` 패널의 **🔮 마법부여 열기** · 무기 카드의 **🔮 마법부여** |
| 맨손 시작 | 보유 **0종** — 주먹(피해 6 · 2.5m · 0.7s)으로 싸우고 T1 채집은 그대로. 제작하면 **자동 장착** |
| 시작 자원 | `골드 1200 · 목재 400`(작업대 650 G·160 목재 + 첫 제작 450 G·150 목재) |
| 건물 회전 | `X` 45° · `Shift+X` 반대 — 미리보기 + 설치된 건물(조준 후). **조준 중 `R` 홀드 = 부드러운 연속 회전**(§3-7) |
| 회전 저장/동기화 | `Turret.toJSON().yaw` · `TurretSystem.rotate(id, delta)` · `net.sendTurretRotate` → 서버 `turret:rotate` 중계 |

**실플레이 확인 포인트**
1. 새 게임 → 인벤토리(`Tab`)에 **보유 0종 · 맨손** 표시, 좌클릭 주먹 타격(피해 6)과 T1 채집이 모두 동작하는지.
2. `B` → 🏗 시설 → 🔨 작업대 설치(650 G) → `C` → 무기 제작 → **자동 장착** + `Q` 순환에 그 무기만 뜨는지.
3. `B` → 🔮 마법부여대 설치 → 가까이 가서 `E`(또는 `C` → 🔮 마법부여) → 무기 선택 → 화염 부여 → 같은 속성 재부여로 2레벨, 피해가 오르는지.
4. 건설 중 `X`/`Shift+X` 로 고스트가 45°씩 도는지, 설치된 건물을 조준하고 `X` 로 도는지(각도 알림·저장 후 재접속 유지).

## 3-7. 캐릭터 만들기 · 앉기/점프 · 로그인 전환 · `R` 홀드 회전 (신규)

| 항목 | 내용 |
|---|---|
| 🧍 캐릭터 탭 | 메인 화면 **4번째 탭**. 이름(최대 16자) + 외형 8종(수호자 🛡️·기사 ⚔️·마법사 🧙·궁수 🏹·도둑 🗡️·연금술사 ⚗️·음유시인 🎻·요정의 친구 🧚) + 무작위 + 저장 |
| 외형은 꾸미기 전용 | 능력치·판정에 영향 없음(형평성). 색은 몸 = `color`, 머리 = `accent` |
| 전송 | `room:create`/`room:join` 에 `character` 동봉 → 서버 `Room.sanitizeCharacter` 로 **재살균** → `room:state`(로비) · `game:snapshot`(인게임) |
| 화면 표시 | 멀티에서 머리 위 **아이콘 + 이름**(캔버스 스프라이트) · 몸 색 · 로비 entry 카드의 `내 캐릭터` 행 + [🧍 캐릭터 만들기] |
| 이름 규칙 | 캐릭터 이름 > 계정 닉네임 > `수호자`. 캐릭터 이름이 곧 **플레이 이름** |
| 앉기 (`Ctrl`) | **누르는 동안**. 시야 0.7m 하강 · 이동 42% · 달리기·점프 잠금 · 날개 비행 중에는 자동 해제 · `sitAmount` 지수 보간 |
| 점프 (`Space`) | 앉아 있으면 막힌다(0.5 이상일 때). 멀티에는 `sit` 불리언이 전달되어 남의 화면에서도 자세가 낮아진다 |
| 로그인 전환 | 성공 → 환영 문구 0.42초 → 패널 자동 닫힘 + `auth:done` → 메인 화면 `menu-enter` 연출. 캐릭터 이름이 비면 **계정 닉네임 자동 채움** |
| `R` 홀드 회전 | 건물을 **조준 중이거나 건설 미리보기일 때** `R` 홀드 = 초당 2.1rad(약 120°/s) 부드러운 연속 회전 · `Shift+R` 반대 · 12Hz 중계 |
| `R` 우선순위 | 조준/건설이 아니면 **기존 그대로 무기 궁극기**. `X` 45° 즉시 회전도 그대로(§4.34) |
| 부드러움 구현 | `Turret.setYaw(yaw, { smooth })` → `yawTarget` → `_followYaw(dt)` 가 `1 - exp(-14·dt)` 로 수렴, 차이 `< 0.0025` 스냅 후 목표 해제(저장에 누수 없음) |

**실플레이 확인 포인트**
1. 메인 화면 → **🧍 캐릭터** 탭 → 이름 입력 + 외형 선택 + [저장] → 새로고침 후에도 유지되는지(localStorage `fortress.character.v1`).
2. **로그인/가입** → 환영 문구가 잠깐 뜨고 **패널이 스스로 닫히며 메인 화면으로 부드럽게 넘어가는지**(캐릭터 이름이 비어 있었다면 계정 닉네임이 채워지는지).
3. 방 만들기/참가 → **내 캐릭터** 행에 이름·아이콘이 뜨는지, 다른 기기에서 접속했을 때 **서로의 머리 위 이름·아이콘·몸 색**이 다른지.
4. `Ctrl` 을 누르고 있는 동안 **시야가 내려가고 느려지며 점프가 안 되는지**, 떼면 즉시 돌아오는지. `Space` 점프가 정상인지.
5. 건물을 **조준한 채 `R` 을 누르고 있으면** 끊김 없이 부드럽게 돌아가는지(`Shift+R` 반대), 아무것도 조준하지 않았을 때 `R` 은 **궁극기**로 나가는지. `X`/`Shift+X` 45° 회전도 그대로인지.

## 3-8. ⚡ 전기 시스템 · 📦 저장고 티어 · ⛏ 지형 채굴 · 게임 멈춤 수정 (신규)

| 항목 | 내용 |
|---|---|
| ⚡ 발전기 | **7종**(T1 12kW 420G → T7 2,100kW 155,000G). 건설 탭 **⚡ 전력** 묶음. 같은 전력망에 전기를 공급 |
| 🔌 전선 | **1종**(120G · 목재 30 · 철광석 2 · hp 220 · 소비 0kW). 전선끼리 **8m**, 건물은 **6m** 안에서 연결. **건물 50기(시설 40기) 상한과 별도**(최대 160개) |
| 소비 건물 | 채굴기 **3kW** · 저장고 **2kW** · 소환문 **4kW**. 작업대·마법부여대는 수동 시설(0kW), 컨베이어벨트는 기계식(0kW) → **전기 때문에 초반 진행이 막히지 않는다** |
| 판정 | 전력망별 `공급 ≥ 소비` 면 전원 가동, 모자라면 **그 망의 소비 건물 전부 정지**(부분 가동 없음). 0.3초마다 재계산 — 발전기·전선을 세우면 곧 반영 |
| 모듈 | `client/src/systems/power.js` (THREE 의존 없음) — `PowerGrid.rebuild/networkOf/isPowered/status/reset/selfTest`, `POWER_ROLE`, `powerRoleOf` |
| HUD/패널 | 상단 **⚡ 칩**(공급/소비kW · 부족하면 붉게 + 12초에 한 번 안내) · **📦 칩**(저장고 합계) · 🏗 시설 탭 위 **전력 현황**(공급·소비·전선·상태·저장고) |
| 📦 저장고 | **7종**. T1 골드 2/s·목재 1/s·용량 60·hp 640 → T7 128/s·64/s·용량 13,000·hp 4,500 (수급·용량·체력 모두 상승). 전기 2kW 필요 |
| 수거 | 버퍼가 **용량까지** 차고(가득 차면 정지), 플레이어가 **반경(11~17m) 안**에 오면 자동 수거. `E` 로 즉시 수거(📦 저장고 수거 — 골드 n · 목재 m) |
| ⛏ 채굴기 | **초당 1개**(벨트 물류 보너스가 붙으면 더 빨라진다). **맨땅에 세우면 설치한 지형 띠의 광물을 캔다** — T1 띠 = 철광석·구리광석·석탄·석영·점토, T3 띠 = 금광석·미스릴·사파이어…, 안전 지대·황야는 T1 폴백. **히든 지역**에 세우면 그 지역 전용 광물. 주변에 광물이 있으면 그것을 우선 |
| 티어 재료 규칙 | **티어 N 건물의 재료 = 티어 N 지형 광물만**. 히든 전용 광물은 어떤 건물 재료로도 쓰지 않는다. 첫 발전기는 420G 로 작업대(650G)보다 싸게 → 전기 진입 장벽 없음 |
| 🧊 멈춤 수정 | ① 원격 이름표 `CanvasTexture` 누수 → 교체/퇴장 시 `dispose`(WebGL 컨텍스트 손실로 이어지던 원인) ② 탭 숨김 → 자동 일시정지, **복귀 시 자동 재개** ③ 루프 예외를 세어 5회부터 알림·600회 안전 정지 ④ `lerpAngle`/`gaussian`/로그 정리 루프 **반복 상한** ⑤ 광물·나무 탐색을 **16m 격자**로 ⑥ `webglcontextlost/restored` 감지·복구 시도 |
| 검증 | `npm run bugtest4` = **80체크** (`tools/base-bugtest.mjs`) — 전기 게이트·전선 사슬·정전·저장고 용량/수거·전력망 경계·티어 재료 규칙·**포탑 추적 조준**·**연사 정상화** |

**실플레이 확인 포인트**
1. 건설(`B`) → **⚡ 전력** 탭에서 발전기를 세우고, 6m 안에 ⛏ 채굴기/📦 저장고를 세우면 **⚡ 칩의 소비가 오르고 실제로 채굴·생산이 시작되는지**.
2. 발전기에서 30m 떨어진 곳에 채굴기를 세우면 **멈춰 있는지**, 그 사이에 🔌 전선을 8m 간격으로 이으면 **다시 도는지**.
3. 전선을 팔거나 소비를 늘려 **공급 < 소비**로 만들면 ⚡ 칩이 붉어지고 **안내가 뜨며 그 망의 건물이 모두 멈추는지**.
4. 📦 저장고에 자원이 쌓이다가 **용량에서 멈추는지**, 가까이 가면 **자동으로 인벤토리에 들어오는지**(`E` 즉시 수거 포함), 티어를 올리면 **수급·용량·체력이 함께 오르는지**.
5. T3 지형(수정 계곡)에 ⛏ 채굴기를 세우면 **금광석·미스릴·사파이어**가 나오는지(안전 지대는 철광석·구리광석·석탄·석영·점토), 히든 지역에서는 **전용 광물**이 나오는지.
6. 오래 플레이(웨이브 여러 번·멀티 재접속)해도 **화면이 얼지 않는지** — 탭을 숨겼다 돌아왔을 때 게임이 **다시 돌아가는지**.

## 3-9. 🎯 추적 조준 — 포탑이 몬스터를 따라간다 (신규)

| 항목 | 내용 |
|---|---|
| 대상 | 공격 포탑(attack). 사거리 안 **가장 가까운 살아 있는 적** |
| 몸체 추적 | `aimYaw` 가 목표 각도로 **초당 4.5rad(약 258°)** 만큼만 돈다 — 순간이동 없이 눈에 보이게 따라간다 |
| 포신 | `head.rotation.y = wrapPi(barrelYaw - bodyYaw)` — 몸체가 어느 각도든 **포신은 목표를 정확히** 가리킨다(예전에는 몸체가 돌아가 있으면 포신이 어긋났다) |
| 각도 규약 | 몸체 `yaw` = -Z forward(벨트·플레이어 규약), 포신 `head` = +Z 로컬 → 서로 π 만큼 보정 |
| 수동 우선 | `X`(45°)/`R`(홀드)로 돌리면 **1.6초 동안** 그 각도를 지키고, 그 뒤 다시 추적한다 |
| 복귀 | 적이 사라지면 플레이어가 정한 **제자리 `yaw`** 로 스스로 돌아온다 |
| 멀티플레이 | 저장·중계되는 값은 플레이어 `yaw` 뿐 — 추적은 각 클라이언트가 같은 적 정보로 계산(추가 통신 0) |
| API | `Turret.aimState()` · `TurretSystem.aimStatus()` · `TURRET_AIM`(상수) |
| 검증 | `npm run bugtest4` = **80체크**(추적 15체크 포함) · `smoke` 배선 계약 8체크 |

**실플레이 확인 포인트**
1. 공격 포탑 근처로 몬스터가 오면 **포탑 몸체가 그 몬스터 쪽으로 돌아가며** 쏘는지(옆으로 지나가면 따라 도는지).
2. 몬스터가 사라지면 포탑이 **원래 방향으로 돌아오는지**.
3. `X`/`R` 로 포탑을 돌리면 **1.6초쯤 그 방향을 유지**하다가 다시 몬스터를 따라가는지(플레이어 의도가 무시되지 않는지).
4. 몬스터가 **뒤(180°)** 에 있어도 짧은 쪽으로 돌아가는지(빙 돌아가지 않는지).

## 3-10. ⚙️ 연사 정상화 + 🔌 접속이 안 될 때 자동 복구 (신규)

### (1) 연사 정상화

| 항목 | 전 (버그) | 후 |
|---|---|---|
| 발사 조건 | 매 프레임(60fps = 60발/s) | `cooldown` 게이트 → **연사 × 시간** |
| 프레임레이트 | 높을수록 강해짐 | **무관**(30fps = 120fps) |
| 발사체 풀(400) | 포화 → **플레이어 사격 실패** | 여유 300+ → 플레이어 사격 보장 |
| 화력 | `피해 × 60`/s | `피해 × 60 × 연사`/s (`TURRET_DAMAGE_SCALE = 60`) |
| 표시 | 피해 · 연사 | 피해 · 연사 · **DPS** |

### (2) 접속 자동 복구

| 항목 | 내용 |
|---|---|
| 실행 | **`run.cmd` 더블클릭** (의존성 자동 설치 → 브라우저 → 감시자) |
| 자동 재시작 | `tools/supervise.mjs` — 비정상 종료 시 3~10초 뒤 재기동, `.tmp/supervise.log` 기록 |
| 포트 충돌 | 3001 사용 중이면 3002·3003… 자동 이동(예전: listen 실패로 주소만 뜸) |
| 중복 실행 | 이미 떠 있으면 새로 띄우지 않고 안내 후 종료 |
| 다른 기기 | `run.cmd firewall` (관리자) → 3001·3002·8099 허용, 인게임 로비가 현재 IP 링크 자동 표시 |
| 다운로드 | `http://localhost:8099` (`release/*.zip`) — 런처가 함께 띄움 |

**실플레이 확인 포인트**
1. 포탑이 이제 **연사에 맞춰 끊어서** 쏘는지(연속 난사가 사라졌는지), 그래도 화력은 비슷하게 느껴지는지.
2. 화면에 `DPS` 가 표시되고, 빠른 탑(비전 1.6/s)이 느린 탑(공성 0.45/s)보다 세게 느껴지는지.
3. `run.cmd` 로 켠 뒤 **창을 닫으면 게임이 꺼지고**, 다시 더블클릭하면 바로 되는지.
4. `run.cmd firewall` 로 폰에서 접속되는지.

## 3-11. 🏹 활 계열 · 화살 소모품 · 궁수 (신규)

| 파일 | 역할 |
|---|---|
| `client/src/data.js` (활부) | **단일 진실 공급원** — `WEAPON_FAMILIES` 에 **8번째 계열 `bow`**(활 · 🏹 · 2손 · `kind: 'bow'` · `swing: 'draw'` · 기본 피해 30 · 쿨다운 0.8 · 사거리 54 · `projectile: true` · `pierce: 1`) · 활 10종 = 자동 생성 7종(`bow_<grade>` T1~T7) + 제작 전용 3종(`bow_wind` T3 · `bow_dragonbone` T5 · **`bow_forever` T7 유물 = '이 사랑, 영원히'**) · `WEAPON_MOTIONS.bow`(스왑 `nock` 0.50s · 공격 `loose` · `string` 트랙) · `WEAPON_IMPACTS.bow` · `WEAPON_ULTIMATES.eternalLove` · `ARROW_TIERS` **7종**(×1.00~×1.85 · 묶음 150~90발) |
| `client/src/systems/economy.js` | **화살 원장 분리** — `this.arrows` · `addArrow/getArrow/_takeArrow/spendArrow/totalArrows/arrowInventory/firstArrowIn` · `canAfford`/`spend` 가 `cost.arrows` 를 함께 검사 · `toJSON/fromJSON` 에 `arrows` 포함 |
| `client/src/crafting.js` · `systems/crafting.js` | `ARROW_RECIPES` **7종**(같은 티어 제작대 1:1) · 활 계열 자동 레시피 7종(`FAMILY_FORGE_FAMILIES = ['bow']` + `FAMILY_TIER_RECIPES`) · `WORKBENCH_RECIPE_COUNT` **66종** · `canCraftArrow/craftArrow`(묶음 지급 · `arrowBatches` 저장) |
| `client/src/data.js` (직업부) | `CLASSES` 마지막에 **`archer` 궁수**(`family: 'bow'` · `signature: 'bow_forever'` · 패시브 무기 피해 +14% · 이동 속도 +6%) — 직업 7종(초심자 + 6) |
| `client/src/main.js` | `_attack()` 이 `kind === 'bow'` 를 근접/맨손보다 먼저 가로채 `_bowAttack()` 으로 보낸다(쿨다운 게이트 `_bowReadyAt` · 화살 1발 차감은 **발사 성공 뒤**) · `_onWeaponRelease()` 는 활이면 `null`(근접 오판 방지) · HUD/제작 패널 갱신 |
| `client/src/player/weaponRig.js` | `buildBow()` + `family === 'bow'` 분기 — 10종 메시 · `userData.muzzle` · `userData.animated.bow` · `motion.string` 으로 시위 당김/복귀 |
| `client/src/ui/panels.js` · `ui/hud.js` · `ui/console.js` | 제작 패널 **🏹 화살 구획**(`data-act="craft-arrow"` · 티어별 묶음·비용·보유) · HUD **🏹 화살 칩**(`hud-stat-arrows`) · 관리자 명령 **14종**(`/화살`) |

**불변식**

- 활은 `kind: 'bow'` 이며 **지팡이 `'ranged'` 를 재사용하지 않는다**(`_castSpell()` 마나·주문 피해로 새는 것을 막는다). 발사는 **쿨다운 게이트**가 담당하고 모션은 연출로만 쓴다(홀드 중 `triggerAttack` 이 타이머를 0으로 되돌리므로 `release` 발사는 일어나지 않는다).
- **화살은 미네랄·가죽이 아니다.** `economy.arrows` 라는 **별도 원장**을 쓴다 — `MINERAL_TYPES`(27종)·`totalMinerals()`·제작 검증을 건드리지 않아 기존 세이브와 충돌하지 않는다(화살 없는 옛 세이브도 그대로 읽힌다).
- 발사 1회 = **화살 1발**, **보유한 것 중 가장 높은 티어를 자동 선택**(`ARROW_ORDER_DESC`). 0발이면 **쏘지 않고 안내만** 한다(쿨다운도 소모하지 않는다).
- 피해 = `round(무기 피해 × 화살 damageMult × classes.weaponDamageMult × 가죽 장비 피해% × 마법부여 배율)` · 속성 = 부여 속성 ?? 무기 속성. 관통은 `weapon.pierce`(기본 1 · 바람의 장궁/용뼈 대궁 2 · 이 사랑, 영원히 3)만큼 적을 꿰뚫는다.
- 화살 제작은 **같은 티어 제작대가 건설되어 있어야** 하고, 성공하면 `bundle`(150~90발)만큼 한 번에 지급한다. 활 계열 기본 7종은 `FAMILY_TIER_RECIPES` 로 자동 생성되고, 새 레시피는 항상 목록 뒤에 덧붙인다.

**실플레이 확인 포인트**
1. `K` 전직 → **🏹 궁수** → `C` 제작대 → ⚒️ 모루 탭에서 **🏹 나무 활** + **🪵 나무 화살** 제작 → HUD 🏹 칩에 발수가 뜨는지.
2. **좌클릭 홀드**로 쿨다운마다 화살이 나가는지, 시위를 당겼다 놓는 연출과 명중 판정이 맞는지, 화살이 떨어지면 `화살이 없습니다 — 제작대(C)에서 화살을 만드세요` 안내만 뜨고 나가지 않는지.
3. 화살 티어를 올리면(룬·용린·성광·유물) 같은 활로도 피해가 오르는지, 관통 활(바람의 장궁·용뼈 대궁)이 적을 꿰뚫는지.
4. T7 창세의 제단에서 **이 사랑, 영원히** 제작(132,000 G · 별의 파편 12 · 시간의 모래 8 · 창세의 정수 4 · 시간의 조각 4 · 멈춘 시간 3) → `R` **[영원한 사랑]**(반경 44 m · 12연격 · 화살 60발 연출 · 쿨다운 165초) 확인.
5. 관리자 콘솔 `/화살`(기본 500발 · 인자 없으면 7종 전부) · `/무기 bow_forever` · `/전체자원`(화살 7종 포함) 확인.

## 3-12. 🎯 미니게임 페이지 + 🔧 원클릭 실행 (신규)

- **`client/public/mini-game.html`** — 사용자가 준 단독 HTML 피하기 게임을 프로젝트 정적 페이지로 편입(14.17KB). 빌드 시 `dist/` 로 복사되어 **/mini-game.html** 로 서빙된다(실서버 200 · 14,171 B 확인). 본편 모듈·세이브와 완전 분리.
- 메뉴 연결은 **한 곳** — `ui/menu.js` 바로 가기 카드 `🎯 미니게임`(`data-act="menu-minigame"`) → **본편 위 오버레이 화면 전환**(`ui/minigame.js`). 여는 동안 본편은 자동 일시정지되고, `← 게임으로 돌아가기`/ESC 로 돌아오면 멈춘 지점에서 이어진다. 오버레이를 못 만들면 새 탭으로 폴백한다.
- 원본 코드의 문제 5가지를 수정: ①**프레임레이트 의존 이동**(144Hz 에서 2.4배 빠름) → `dt` 기반 ②`forEach`+`splice` 로 **적 한 마리씩 건너뜀** → 뒤에서부터 제거 ③**플레이어 위 스폰** → 170px 안전 거리 ④터치 조작 없음 → 포인터 드래그 ⑤점수가 시간만으로 상승 → 근접 후 이탈 회피 보너스(+10).
- 추가로 잡은 **자체 결함(정직 기록)**: 처음 작성한 루프가 첫 프레임에 `Date.now()`(에폭)와 rAF 타임스탬프를 섞어 `dt` 가 음수가 되고 플레이어가 좌상단으로 튀었다 — `dt` 를 `max(0, min(0.05, …))` 로 자르고 첫 시간은 브라우저에서만 받도록 고쳤다(검증 하네스가 잡아냄).
- **`게임실행.cmd`**(프로젝트 루트 + 바탕 화면 사본) — 다른 폴더에서 `npm run dev` 를 쳐서 `ENOENT ... package.json` 이 나던 문제를 없앤다. 어느 폴더에서든 더블클릭 → `cd /d <프로젝트>` → `run.cmd`. `게임실행.cmd check` 는 실행 없이 경로·Node·node_modules·dist 만 점검.
- cmd 규칙 준수: `.cmd` 는 **CRLF** 이고 **모든 줄이 ASCII 로 끝난다**(한글 줄 끝이 CP949 리드바이트면 CR 을 삼켜 다음 줄과 합쳐진다 — `tools/normalize-cmd.mjs` 로 자동 보정).
- 검증(이번 라운드): `minigame 61/61` · `ui 287/287` · `smoke 725/725` · `headless 514/514` · 빌드 `index-Y472mMF9.js`(1,404.46KB) · 실서버 `/mini-game.html` 200.

## 3-13. 🔧 무기 소환 멈춤 · ⚙️ ESC 설정 화면 · 💾 내 세이브 · 🚀 최적화 (신규)

### (1) "관리자 명령으로 무기를 소환하면 게임이 멈춘다"
원인은 **UI 재렌더 폭주**였다. `/무기전부` 는 67종을 **한 프레임에** 지급하면서 `panels.refresh()` 를 67번 불렀다. 스텁 DOM 계측에서도 패널 1회 렌더가 최대 2.9ms(무기)·1.24ms(인벤토리)·0.42ms(제작)였으니 실제 브라우저 DOM 에서는 수 초가 되어 화면과 입력이 함께 멈췄다(멈춤 = 예외가 아니라 **메인 스레드 점유**).

- **갱신 병합** — `PanelManager.requestRefresh(id?)` 는 예약만 하고, 게임 루프가 매 프레임 부르는 `flushRefresh()` 가 **프레임당 1회**만 그린다(그 사이 닫히거나 패널이 바뀌면 버림). `ownWeapon`·`equipWeapon`·꿈나무 해금은 `Game._refreshPanels()` 를 쓴다.
- **프레임 예산 지급 큐** — `systems/grants.js` `GrantQueue`(기본 6ms/프레임, 항목 예외는 `failed` 로 세고 계속). `Game.grantWeapons(ids)` 가 `/무기전부` 를 이 큐로 넘기고 끝나면 **한 번만** 알리고 **한 번만** 갱신한다(큐를 지원하지 않는 스텁 게임은 기존 동기 경로 유지).
- **프레임 감시** — `Game.perf = { frames, lastMs, worstMs, slowFrames, lastError }`. 1초를 넘는 프레임은 `[perf]` 경고 + (첫 회/20회마다) 안내. 설정 → ‘성능 지표’ 가 0.5초마다 표시하고 [지표 초기화] 로 비운다.
- **계측 근거(이번 라운드 실측)** — 67종 빌드 합계 40.8ms(최대 3.49ms) · 장착 0.06~1.5ms · 120프레임 애니메이션 최대 2.35ms · **머티리얼 서명 4종**(셰이더 프로그램 폭증 아님) · NaN/예외 0 · 6,000프레임 전투 시뮬 힙 **+0.59MB**(누수 아님) → **원인은 JS 연산이 아니라 DOM 재렌더 횟수**였다.
- **검증 공백도 함께 고쳤다** — 기존 헤드리스 관리자 검사는 `ownWeapon`/`equipWeapon` 을 **모의 객체로 대체**해 실제 소환 경로를 한 번도 지나지 않았다(그래서 이 버그를 못 잡았다). 이제 큐·갱신 병합·`/무기전부` 위임을 직접 검사한다.

### (2) ESC = 설정 화면
- `ESC` → `Game.pause({ screen: 'settings' })` → 설정 화면. 맨 위 **[▶ 계속하기]** · **[나가기]**, 다시 `ESC` 로도 복귀.
- 탭 복귀 자동 일시정지 등 사용자가 누른 게 아닌 경로는 기존 `pause` 화면(`pause()` 기본값).
- 일시정지 중 패널을 닫으면 자동 재개(`panels.on('close')` → `state === 'paused'` 이면 `resume()`).

### (3) 내 세이브 목록에서 불러오기
- `systems/saves.js` — `fortress.saves.v1` · **최근 10개**(같은 시각은 교체, 오래된 것부터 버림) · 요약(시각 라벨·시드·웨이브·골드·플레이 시간·무기 수).
- `Game.save()` 가 로컬·클라우드 저장 뒤 **항상** 슬롯을 남긴다. 설정 → 내 세이브 → [불러오기] 는 `_restore(data)`(= `load()` 와 같은 복원 경로)로 되돌리고 패널을 닫는다.
- 깨진 JSON · `savedAt` 없음 · `localStorage` 없음 모두 **예외 없이** 빈 목록/거부.

### (4) 최적화
- **역방향 하향 버그 수정** — 자동 화질이 `FRAME_PRESETS` **선언 순서**를 써서 `저전력 → 무제한`(가장 무거움)으로 내려갔다. 비용 순 사다리 `PRESET_LADDER = [battery, performance, balanced, ultra, unlimited]` 를 단일 출처로 두고 `suggestPreset`/`stepUpId` 가 이를 따른다.
- **지속 적응** — 6초 뒤 1회성 하향 → 12초마다 재판정(하향 < 42 FPS · 되올리기 ≥ 58 FPS · **`_userQuality` 상한**). 적응형 해상도(기존)와 함께 동작한다.
- **메모리 감시** — `MemoryGuard` 가 `performance.memory` 를 0.5초마다 보고 900MB 초과 시 120초 간격으로 경고. [저장하고 새로고침(메모리 정리)] 는 **먼저 저장한 뒤** `location.reload()`.
- **설정 지표** — 평균 FPS · 렌더 배율 · JS 힙(최대) 추가.

### 이번 라운드 실측
- `smoke 738/738` · `headless 539/539` · `ui 292/292` · `minigame 61/61` · `cmd-lint 2/2` · `bugtest 20/20` · `bugtest2 88/88` · `bugtest3 71/71` · `bugtest4 80/80` · 빌드 성공.
- 빌드 산출물: `index.html 3.23KB` + `CSS 46.89KB (gzip 10.36KB)` + `JS 1,416.40KB (gzip 403.27KB)` (`assets/index-PwWVjALW.js` · `assets/index-uHFATLJv.css`).

## 4. 이번에 함께 고친 결함 (재발 방지 메모)

8. **좁은 창에서 위쪽이 잘림(메뉴·패널)** — `.menu-overlay`/`.panel-overlay` 가 `align-items: center` + 넘침 조합이라, 내용이 창보다 길면 **위쪽(제목·탭·패널 머리글)이 잘린 채 스크롤로도 닿지 못했다**(메인 화면에 열린 방 카드가 추가되면서 더 쉽게 재현). 두 오버레이를 `align-items: flex-start` + `overflow-y: auto` 로 바꾸고 자식에 `margin: auto` 를 주어 "넉넉하면 가운데, 좁으면 위에서부터"로 만들었다. `.panel` 은 `max-height: min(88dvh, 100%, 900px)` 로 창 높이 안에 들어오게 하고, `.menu-rooms-list` 는 자체 스크롤(최대 30vh)로 화면이 길어지는 원인을 없앴다. `tools/smoke.mjs` 레이아웃 계약 7체크가 재발을 막고, 패널을 새로 열 때 내용 스크롤을 맨 위로 되돌리는 처리(`PanelManager._setOpen`)를 더해 ui 검사 2체크로 고정했다.

1. **`waves.update` 의 `ctx.turrets` 는 TurretSystem 이 아니라 Turret 배열**(`game.towers`). 이 혼동으로 통합 시뮬이 죽었다.
2. **처치 집계 의미** — `kills` = 총 처치 수, `turretKills` = 그 부분집합. (초기 구현은 포탑 처치를 제외해 `kills=0` 이었다.)
3. **적 어그로** — 적의 대상은 기지 + 광물/나무이며 포탑을 공격하지 않는다(보스 광역은 예외). 이 버그 때문에 지원 포탑이 파괴되어 검증이 실패했다.
4. **`waves.onWaveStart` 대입 호환** — main.js 는 콜백을 대입하는데 등록 메서드만 지원해 웨이브/게임오버 콜백이 전혀 불리지 않았다.
5. **`panels.js` 재귀 버그** — `grid()` 도우미가 자기 자신을 호출하고 7개 렌더러가 `const grid = grid()` 로 섀도잉해 모든 패널이 렌더되지 않았다.
6. **`menu.js` 인코딩** — PowerShell 재인코딩으로 유효하지 않은 UTF-8이 되어 읽기/빌드가 불가했다. 정상 UTF-8로 교체.
7. **서버 모드/난이도 id 불일치** — 서버가 `coop/endless/hardcore`·`easy/normal/hard/nightmare` 를 쓰고 있어 클라이언트의 `solo/coop/endless/creative`·`peaceful/...` 와 어긋났다(협동에서 peaceful 가 normal 로 조용히 바뀜). `server/game/protocol.js` 를 `client/src/data.js` 기준으로 정렬.
8. **적 스폰 위치** — 게이트 중심이 아니라 `world.portalField.spawnPoint(pattern, index, wave, rng)` 로 **해당 패턴에서 실제로 열린 게이트**에서 스폰하게 수정.
9. **가챠 조합 이벤트 페이로드** — panels 는 `{id, recipe}` 를 보내는데 main 은 `recipeId` 만 읽어 조합이 무시됐다. `recipeId ?? id` 로 수용.
10. **`ui-dom-smoke` 하드코딩 기대값** — 패널/단축키가 늘면 `PANEL_IDS 11`/`KEYBINDS 17` 같은 고정 기대값이 먼저 깨진다. 패널·단축키를 추가하면 `PANEL_IDS`·`KEYBINDS` 기대값도 함께 갱신할 것(현재 **15개 패널 / 24개 단축키**).
12. **메뉴 패널 중복 토글 → 빈 화면(사용자 표현 "멈춤")** — `menu.js` 가 설정/협동/로그인 버튼에서
    `emit('settings'|'multiplayer'|'auth')` 와 `game.togglePanel(...)` 을 **둘 다** 호출해 패널이 열리자마자 닫혔고,
    이어서 `menu.hide()` 까지 실행되어 아무것도 없는 화면이 남았다. 이벤트 경로 한 곳(main.js 핸들러)으로 통일하고,
    메뉴에서 연 패널을 닫으면 `panels.on('close')` 로 메뉴를 되살리게 했다. 회귀 테스트는 `tools/ui-dom-smoke.mjs` 의
    `menu-* 클릭 → 패널이 열린 채로 남는다` 3종 + `close 이벤트` 검사다(ui 56 → 61체크).
14. **소환문 몬스터가 웨이브를 막고 prep 단계에서 얼어붙던 문제(신규 시설 작업 중 발견)** — (a) `_countAlive()` 가 `fromTower` 몬스터까지 세어
    웨이브 종료 조건(`alive <= 0`)이 영원히 성립하지 않았고, (b) 적 갱신(`_updateEnemies`)이 `case 'combat'` 안에만 있어 준비 단계의 소환몹이 제자리에 서 있었다.
    `fromTower` 는 정산에서 제외하고(`_countAlive`/`_handleEnemyDeath`/`salvation`), 적 갱신은 단계와 무관하게 돌게 했다(전투 경로는 그대로).
13. **지형 표면 높이 불일치 → 나무·광물·포탈 공중부양(사용자 표현 "나무를 바닥에 고정시켜줘")** — 지형 메시는 격자 정점(112분할 ≈ 44m 간격)을 선형 보간하는데
    객체는 해석적 `getHeight()` 로 배치해 산악 지형에서 **최대 23.1m(평균 3.2m)** 떠 있었다. `terrain.surfaceHeight()`(메시 삼각분할 보간, 격자 셀 캐시)를 추가하고
    `world.getHeight()`·나무·광물·포탈·기지를 모두 여기에 맞췄다(나무는 0.22×scale 만큼 묻어 경사에서도 뿌리가 뜨지 않는다).
11. **`staff.js` animated 서술자** — `userData.animated` 항목은 `{mesh, speed, base, pulse}` 서술자다(메시가 아님). `weaponRig._animateMesh` 는 두 형태를 모두 처리한다.
15. **날개 제작 통계가 조용히 버려지던 문제** — `main.onWingCrafted` 가 `track('wingsCrafted', 1)` 을 부르는데 `STAT_LABELS` 에 키가 없어
    `AchievementSystem.isValidStat` 이 걸러냈다(예외·로그 없음 → 통계 영구 0). `wingsCrafted: '날개 제작'` 추가 +
    `tools/wings-bugtest.mjs` 가 **main.js 의 모든 `track`/`set` 키를 `STAT_LABELS` 와 대조**해 재발을 막는다.
16. **날개 제작 이중 차감 위험** — `canCraftWing` 이 보유 판정을 `ctx.hasWing` 훅 하나에만 의존해, 훅 없는 컨텍스트로 호출하면
    같은 날개 재료가 두 번 사라질 수 있었다. `hasWing(wingId) || this.craftedWings.has(wingId)` 로 이중 방어.
18. **패널을 열어도 커서가 없어 UI 를 누를 수 없던 문제(사용자 보고 "건설이나 인벤열때 마우스 포인트 나오게 해줘")** — 포인터 잠금 중에는 커서가 숨겨지고
    마우스 이벤트가 캔버스로만 간다. 단축키(`I`/`C`/`B`/`Tab` 등)가 `panels.toggle()` 을 직접 불러 잠금을 풀지 않았고,
    `Input._onMouseDown` 이 **UI 위 클릭도 게임 입력으로 받아** 버튼을 누르면 무기가 나가거나 포탑이 지어졌다.
    `ui/pointer-lock.js`(`syncPointerLock`) 로 정책을 단일화하고 단축키를 `togglePanel()` 로 통일, `_isUiTarget`+`!locked` 가드를 추가했다.
    덤으로 `panels.isOpen()` 을 인자 없이 부르면 **항상 false** 라 ESC 닫기 분기가 죽어 있던 것도 `hasOpen()` 으로 바로잡았다.
19. **메뉴로 나갈 때 포인터가 잠긴 채 남을 수 있던 경로** — `quit()` 이 패널만 닫고 잠금을 풀지 않았다(상태가 `playing` 이면 잠금 유지).
    `quit()` 에서 `exitPointerLock()` 을 명시 호출하고, 패널이 열려 있는 동안에는 캔버스 클릭으로 재잠금하지 않게 했다(커서 유지).
17. **적 풀(POOL) 재사용 시 소환 경로 표시 누수 (버그테스트로 발견)** — `Enemy.reset()` 이 로밍 표시(`roaming`·`regionId`·`spawnerTier`·`leatherDrop`)는
    지웠지만 **`fromTower`·`spawnerKind` 는 지우지 않았다**. 소환문(시설)이 부른 몬스터가 죽어 풀에 반환된 뒤 같은 종이 웨이브로 스폰되면
    `fromTower=true` 가 남아 `waves._countAlive()` 에서 빠지고(적 카운터 어긋남 · 마지막 적 처치 후 재동기까지 웨이브 미완료),
    `spawnerKind='region'` 이 남아 야생 몬스터로 오인됐다(지역 스폰 상한 잠식). `reset()` 에서 두 값을 초기화하고
    `tools/wings-bugtest.mjs` 9장(5체크)이 회귀를 막는다.

## 5. 남은 일 (사람이 할 것)

0. **이번 라운드 신규 기능 실플레이** — ① 메인 화면 **🧍 캐릭터** 탭에서 이름·외형 저장 후 새로고침 유지, ② **로그인 → 환영 문구 → 패널 자동 닫힘 → 메인 화면 부드러운 전환**, ③ 다른 기기와 멀티에서 **서로의 아이콘·이름·몸 색**과 **앉은 자세**, ④ `Ctrl` 앉기(시야 하강·이동 42%·달리기/점프 잠금)와 `Space` 점프, ⑤ 건물 **조준 + `R` 홀드 부드러운 연속 회전**(조준이 없으면 궁극기 · `X` 45° 유지).
1. **새 기능 실플레이 확인** — ① HUD 좌상단 FPS(`해상도 N%`)와 `F` 프리셋 전환으로 프레임 체감, ② 기지 근처 **T1 나무/광물 좌클릭 맨손 채집**(+알림), ③ 관리자 로그인 후 **` 또는 /** 로 콘솔 → `/도움말` → `/무기 시간의 가위` · `/전체자원` · `/웨이브 30` · `/플라이`(날개 없이 비행) · `/날개 별의 날개`.
4. **요정의 날개 실플레이** — `C`(제작대) → ⚒️ 모루 탭 → 「🪶 요정의 날개」 [날개 제작] → `V` 착용 → HUD 🪶 칩에 `비행 Nm` 이 뜨는지, `Space`/`Shift` 로 오르내리는지, 착지 시 날개가 접히는지, F12 콘솔 오류가 없는지.
2. **브라우저 실플레이** — `npm run dev` → http://localhost:5173 에서 메뉴 → 혼자 지키기 → 이동/마법/건설/가챠/업적/요정 도감. 자동 검증은 로직·DOM·네트워크·**포인터 잠금 정책**까지이며 렌더링·실제 커서 표시·오디오 출력은 확인 대상이 아니다.
   **건설창 확인**: `B` → 포탑 카드 클릭(또는 `1~9`) → **창이 닫히고 커서가 다시 잠기는지**, 그대로 좌클릭해 설치되는지.
   **열린 방 목록 / 터널 확인**: 메인 화면 카드에 같은 서버의 공개 방이 뜨는지(4초마다 갱신) → **[참가]** 클릭으로 들어가는지, 로비에서 `비공개` 로 만든 방은 목록에 없는지. 인터넷 공유는 `npm run dev:tunnel` 한 줄로 터널 주소가 찍히는지.
   **멀티플레이 확인**: `npm run dev` 콘솔의 **공유 주소**(예: `http://192.168.41.53:3001`)로 접속 → 로비 → 방 만들기 → **[초대 링크 복사]** → 다른 기기(휴대폰)에서 그 링크를 열어 **자동 참가**되는지. 같은 네트워크에서 안 되면 Windows 방화벽 인바운드(§README 8-1-1).
   **커서 확인**: `I`/`C`/`B`/`Tab`/``` 를 눌러 마우스 커서가 나타나고 버튼이 눌리는지, 다시 누르거나 `ESC` 로 닫으면 시점이 재잠금되는지(브라우저가 막으면 화면 클릭) 확인. 콘솔(F12) 오류 유무 확인 권장.
2. **밸런싱 판단** — `T1 채굴탑 = 초당 0.6개 산출`(data.js 의 `income.per === rate`). 경도 5 광물은 한 개에 수 분이 걸린다. 상위 티어 채굴탑을 요구하는 의도인지 확인 후 `data.js` 수치만 조정하면 된다.
3. **보스 광역** — 보스의 smash/breath 는 반경 내 포탑도 타격한다(계약에 명시는 없음). 원치 않으면 `client/src/systems/enemies.js` 에서 제거.
4. **무기 강화/조합** — 설계 문서의 8개 제작대(T1 모루 ~ T7 창세의 제단 + 꿈의 정원)와 무기 강화 단계. 보유/장착/스왑/궁극기/꿈나무 해금까지는 구현됨(획득 연출·강화 수치는 미구현).
5. **1000 웨이브 5단계 캠페인** — 학습/성장/도전/초고난도/신화 구간, 소형(10)·중형(50)·대형(100) 보스 분류, 최종 보스 `요새의 신`, 기지 3중 방어(500/300/1500)와 7개 마일스톤 보상.

## 6. 환경 트러블슈팅

- **`npm run dev` 즉사 (`concurrently` → `spawn EPERM`)** — 자식 프로세스의 파이프 stdio spawn 이 막힌 환경의 증상이다.
  `tools/dev.mjs` 로 교체해 해결했다(자식 프로세스 없음). 그래도 Vite(HMR)가 안 뜨면 게임은 3001 정적 서빙으로 뜬다.
  브라우저 실렌더링 확인은 이 환경에서 불가했다(Chrome/Edge 가 named pipe IPC 차단으로 기동 실패) — 사람이 직접 확인해야 한다.
- **`esbuild spawn EPERM` / `remove ...esbuild-...: Access is denied`** — 실행 환경(샌드박스)이 자식 프로세스 파이프와 임시파일 삭제를 막은 것이다. 프로젝트 안에 `.tmp` 를 만들고 `TEMP`/`TMP` 를 그쪽으로 지정하면 정상 빌드된다(실측 성공).
  ```powershell
  New-Item -ItemType Directory -Force .tmp | Out-Null
  $env:TEMP = "$PWD\.tmp"; $env:TMP = "$PWD\.tmp"
  npm.cmd run build
  ```
  그래도 `spawn EPERM` 이면 **같은 빌드 명령을 한 번 더**(샌드박스 승인) 실행하면 통과한다(이번 세션 실측).
  서버가 3001 에서 돌고 있으면 `npm run build` 만 다시 하고 **Ctrl+F5** 로 새 번들을 받으면 된다.
- **정적 서빙이 404** — `NODE_ENV=production` 또는 `--prod` 일 때만 켜진다(개발 중에는 Vite 5173 사용). `npm run start` 가 자동으로 `--prod` 를 넘긴다.
- **폴더 혼동 주의** — 세션 작업폴더였던 `이전 작업폴더` 은 이제 빈 껍데기다. 실제 프로젝트는 `<프로젝트 폴더>` 다. OneDrive 동기화가 켜져 있으면 `node_modules` 동기화로 폴더가 잠길 수 있으니 빌드 중에는 동기화 일시중지를 권장한다.

## 7. 설계 규칙 (깨지 말 것)

- 단일 진실 공급원: `docs/CONTRACT.md` + `client/src/data.js`.
- 순수 로직(`data.js`, `utils/rng.js`, `systems/{economy,achievements,gacha}.js`)은 **three 를 import 하지 않는다** → 헤드리스 검증이 가능한 이유.
- 모든 난수는 주입된 시드 `rng` 에서만. `Math.random()` 금지(월드 재현성).
- 통계 키는 `data.js` 의 `STAT_LABELS` 만 사용(업적 90종이 이 키로 매칭).
- 외부 에셋/폰트/사운드 파일 금지(모든 그래픽 절차 생성, 사운드는 Web Audio 합성).
- 무기/모션/임팩트 수치는 `data.js` 가 유일한 출처다(뷰모델·UI·검증이 같은 값을 읽는다).
- 캐릭터 외형은 **꾸미기 전용**(능력치 필드 금지). 클라이언트가 보낸 캐릭터는 **서버가 항상 재살균**한다(`Room.sanitizeCharacter`) — 외형 목록은 `client/src/character.js` 가 단일 출처다.
- 회전 계약: `X` = 45° **즉시**, `R` 홀드 = **부드러운 연속**(조준/건설 중에만). 두 경로 모두 `TurretSystem.rotate/setYaw` 를 지나고 `yaw` 는 항상 `-π..π` 로 정규화된다.
- 비살상 원칙: 꿈나무는 `kills` 를 올리지 않고(`waves.salvation`), 연출에 화면 흔들림을 넣지 않는다.

## H-53 ~ H-59 (점프 · 키 변경 · 웨이브 100 · 무한 모드 · 조합법 · 3D 텔레포트 포탈 · 불멸)

- 점프: `player.js` `_move()` 에서 비행 판정보다 점프를 먼저 처리하고 `_jumpLock(0.22s)` 를 둔다.
  (예전에는 날개 착용 시 `flying/onGround=false` 가 먼저 실행되어 Space 점프가 죽어 있었다.)
- 키 변경: 모든 조작은 `keys.js` 의 동작 id 로만 판정한다(하드코딩 키 금지). 새 기능은 `KEY_ACTIONS` 에 추가한다.
- 웨이브/무한 모드: `data.js` 의 `WAVE_CONFIG`(finalWave·softenAfter·growthSoftening·maxCount·
  endlessCelestialEvery·endlessCelestialGrowth)와 `BOSS_TYPES` 의 셀레스티얼(hp 5,000,000 / attack 1,200).
  `celestial` 은 반드시 `BOSS_TYPES` 의 **마지막** 항목이어야 한다(관리자 명령이 마지막 항목을 최종보스로 쓴다).
- 무한 모드 진행은 `progress.js`(`fortress.progress.v1`)에 남는다. 세이브 슬롯과 별개다.
- 조합법: `crafting.js` 의 표를 고치면 `recipes.js` 도감이 자동으로 따라온다(별도 목록을 만들지 않는다).
- 포탈: 새 지형을 추가하면 `regions.js` 와 `travel.js` 의 `TERRAIN_COLORS` 만 손보면 3D 포탈과 이동 목록이 함께 생긴다.
- 검증 명령: `npm run verify` (스모크 · 헤드리스 · UI · 버그테스트 · 빌드).

## H-60 ~ H-64 (렉테스트 · 500 FPS 프리셋 · 닉네임 중복 · 채굴기 티어 채굴)

- 렉테스트: `npm run lag-test`(프레임 예산 2.0ms = 500 FPS). 프레임 비용을 건드리는 변경은 이 도구로 수치를 남긴다.
  `npm run drill-test` 는 채굴기 티어 채굴, `npm run test:all` 은 전체 스위트를 순서대로 돌린다.
- 500 FPS 를 노릴 때 우선순위: ① 그림자·안티 끄기(preset `speed`) ② 픽셀비 1 ③ 그리기 호출(메시 수) ④ 광원 수.
  1920×1080 에서 500 FPS 는 프레임당 2ms 예산이므로 CPU 뿐 아니라 GPU 도 함께 봐야 한다.
- 채굴기: `_drillPool()`(무엇을) · `drillPower/drillYieldBonus/drillLowTierChance/drillPickGrade`(얼마나) ·
  `_creditMineral(id, whole, true)`(지급). 지형 등급을 바꾸려면 `regions.js` 의 `tier` 를 고친다.
- 시설 티어 저장: `Turret.toJSON().rate` + `TurretSystem.fromJSON` 의 시설 복원 분기를 지우면
  업그레이드 채굴기가 다시 1티어로 되돌아간다(회귀 주의).
- 닉네임은 중복 허용이다. 고유해야 하는 것은 `username` 뿐이므로, 닉네임으로 사용자를 찾는 코드를 새로 쓰지 않는다.

## H-66 ~ H-68 (렉 최적화 · 채굴 모션)

- 프레임을 건드리면 `npm run lag-test` 로 수치를 남긴다(예산 2.0ms). 구간별 표가 어디가 무거운지 알려 준다.
- 체력바·미니맵처럼 **매 프레임 그리는 UI** 는 반드시 스로틀을 둔다(각각 꼬리 지우기 · 20Hz).
- `world.update` 가 `frustumCull` 을 포함한다 — 프레임에서 따로 부르지 않는다.
- 채굴기 모션 부품은 `head.userData` 에 있고, `_minePulse` 하나로 켜지고 꺼진다(새 타이머를 만들지 않는다).

## H-69 ~ H-70 (후반 밸런스 · 예산 행 · 색점 훅 · 티끌 색)

- 무한 모드 곡선을 바꿀 때는 `WAVE_CONFIG`(성장·상한)와 `tools/smoke.mjs` 의 곡선 검사,
  `tools/headless.mjs` 의 "두 번째 강림" 기대값(체력 6,750,000 / 공격 1,344)을 함께 고친다.
- 지형 이동 패널을 손대면 `data-role="travel-dot"` 훅과 UI 검사(색점 20 · 색 10종 · 클릭 → `travelTo`)를 유지한다.
- 채굴기 티끌 색은 `head.userData.dustMat` 하나만 바꾼다 — 다른 부품과 재질을 공유하지 않도록
  반드시 `accent.clone()` 을 쓴다(공유하면 채굴기를 캔 색으로 전부 물들인다).

## H-71 (관리자 무기 소환 멈춤)

- `_prewarmStep` 을 **상태로 막지 말 것**. 메뉴에서만 돌리면 게임 중 소환·장착이 그 자리에서 컴파일하며 멈춘다.
- 무기처럼 셰이더를 가진 것을 새로 등장시키는 코드는 지급 → `_warmWeapon` → 장착 순서를 지킨다(`summonWeapon` 사용).
- 소환 큐 규칙(프레임당 1종 · 예열 뒤 장착)을 바꾸면 `tools/smoke.mjs` 의 "한 프레임에 한 종씩만 장착한다" 검사도 함께 고친다.

## H-73 ~ H-74 (컨베이어벨트 물류)

- 벨트 로직은 `systems/conveyors.js`(순수) + `turrets.js`(적재·이송·하역) 두 곳뿐이다.
  프레임마다 도는 코드이므로 여기서 새 객체를 만들지 않는다(상자 메시는 벨트마다 한 번만 만든다).
- `_creditMineral` 이 적재를 시도한다(입금 훅 한 곳). **벨트 자신은 제외** — 순환 방지.
- 하역은 "앞 건물"이 있어야 일어난다. 벨트만 깔고 끝나면 상자가 끝에서 쌓인다(막힘) — 정상 동작이다.
- 좌표 규칙을 바꾸면(forward ≠ -Z) `beltForward`·`beltTip`·상자 z 계산(: `span / 2 - t * span`)을 함께 고친다.
- 검사: `npm run conveyor-test`(21검사) — 사슬 하역·막힘·저장/복원·티어 속도·상자 렌더.

## H-76 ~ H-77 (렉테스트 판정)

- 렉테스트는 **기본 프레임 수(600)** 로 돌린다. `--frames` 를 줄이면 p95 가 흔들려 게이트가 거짓 실패한다.
- 게이트는 도구 비용을 뺀 게임 프레임 기준이다 — 도구 자체를 무겁게 바꾸면 그 기준도 함께 본다.

## H-79 ~ H-81 (마법연성 · 일시정지 소환 멈춤)

- 연성은 `systems/arcana.js`(순수) 하나 + 소비 측 3곳(`Turret._applyArcana`, `Turret.storageCapacity`,
  `Game.applyArcana`/`_updateCoreAttack`)뿐이다. 새 효과를 추가하려면 `ARCANA_UPGRADES` 에 한 줄 넣고,
  소비 측에서 `arcana.mult('id')` 를 읽으면 된다.
- **상대 배율 규칙**을 깨지 말 것: 절대값을 다시 쓰면 포탑 자체 업그레이드 이득이 사라진다.
- 일시정지·메뉴에서는 GPU 예열/장착을 하지 않는다(§4.71). 예열 작업을 새로 추가할 때도 같은 가드를 건다.
- 검사: `npm run command-test` (명령 15종 비용 · 소환→ESC · 소스 가드 · 연성 배선 15검사).
