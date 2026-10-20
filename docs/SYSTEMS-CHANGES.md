# 게임플레이 시스템 계층 — 최종 상태

프로젝트 이동: `<프로젝트 폴더>` (세션 작업 폴더 `이전 작업폴더` 은 비어 있음).
수정한 파일은 아래 8개뿐이며, 나머지 파일은 건드리지 않았다.

| 파일 | 크기 | 비고 |
| --- | --- | --- |
| `client/src/systems/economy.js` | 6,073 | three 없음 |
| `client/src/systems/achievements.js` | 5,892 | three 없음 |
| `client/src/systems/gacha.js` | 10,329 | three 없음 |
| `client/src/systems/enemies.js` | 32,689 | |
| `client/src/systems/waves.js` | 22,825 | |
| `client/src/systems/turrets.js` | 33,241 | |
| `client/src/systems/spells.js` | 12,173 | |
| `client/src/systems/fairies.js` | 14,455 | |

## 검증 (재현 명령, workdir = 프로젝트 루트)

```
node --check client/src/systems/{economy,achievements,gacha,enemies,waves,turrets,spells,fairies}.js   # 8/8 OK
node tools/smoke.mjs        # 스모크 테스트 결과: 95개 통과 / 0개 실패
node tools/headless.mjs     # 헤드리스 통합 시뮬레이션: 71개 통과 / 0개 실패
```

인라인 순수 모듈 검증(`node --input-type=module -e`) 관측값:

- gacha 등급 확률 합 = 100.000000 (7등급)
- 20,000회: common 12088/12000, uncommon 4908/5000, rare 1820/1800, epic 791/800,
  legendary 305/300, mythic 81/98, relic 7/2 — 전 등급 3σ 이내
- 200,000회: common 119871/120000, uncommon 49895/50000, rare 18229/18000, epic 8009/8000,
  legendary 3016/3000, mythic 958/980, relic 22/20 — 전 등급 5% 이내
- 유물: 22/200,000 = 0.0110% (선언 0.01%, 기대 20), `ids={genesis:9, time:13}`, `relicCount=2`
- 골드 소비: 220,000회 × 100G = 22,000,000G 차감, `history.length=1000` 상한 유지
- Economy: 무효 입력 무시, spend/refund 불변식, 원자적 실패(부분 차감 없음), toJSON/fromJSON 왕복
- AchievementSystem: 통계 90종 → 업적 90/90 해금, `onUnlock` 90회·중복 0, 재설정 시 재해금 없음,
  `title()` = `전설`, 저장/복원/리셋 정상
- `TURRETS.length === 68`, id 중복 0

자체 통합 시나리오 54개 검사(원소 배율·상태이상·풀링·보스 소환, 포탑 배치/강화/판매/채굴/벌목/저장,
웨이브 전 구간·정지·보스·게임오버, 마법 시전·시간정지·창세, 요정 7종·왕관·패시브)도 54/54 통과.

## 이번 세션에서 적용한 계약 정합 수정

적용 스크립트(세션 폴더에 보관, 앵커 불일치 시 실패하도록 작성): `patch-apply.mjs`, `patch-apply2.mjs`,
`patch-apply3.mjs`, `patch-apply4.mjs` + `patch-apply4b.mjs`.

1. **`waves.js` — kills 의미 정정 (계약 §4.11)**
   기존: 포탑 처치를 `turretKills` 에만 계산해 `kills=0`. 변경: `kills` = 총 처치 수, `turretKills` = 그 부분집합.
2. **`enemies.js` — 포탑 어그로 제거 (계약 §4.9)**
   계약 §4.9 는 적의 대상으로 "기지 + 광물/나무"만 규정한다. 기존 구현은 반경 `3.5+radius` 의 포탑을
   먼저 공격해 공식 시뮬레이션에서 채굴탑이 파괴됐다(지원 포탑/채굴 검사 실패). 해당 분기를 삭제하고
   기지 공격만 남겼다(보스 광역기는 구조물을 계속 때릴 수 있음).
3. **`enemies.js` — `_devour()` 추가 (계약 §4.9 "광물/나무를 부순다")**
   이동 중 접촉한 나무/광물을 0.6초마다 `treeField.chop` / `mineralField.harvest` 로 파괴한다.
   이동은 멈추지 않으며, 이미 쓰러진 나무는 건너뛰어 `onFellTree` 가 중복 호출되지 않는다.
   콜백: `onResourceStolen(enemy,'wood'|'mineral',amount)`, `onFellTree(enemy,tree)`(선택).
4. **`turrets.js` — `rate` = 초당 산출량으로 해석**
   `data.js` 의 `income.per === rate` 이므로 채굴/벌목은 `rate 개/초` 가 되도록
   `damage = rate × (maxHp / 총산출량)` 로 환산한다(`_yieldDamage`). 수정 전에는 채굴탑이
   20초 동안 0.8개(마블: hp 60, yield 4)만 캐서 헤드리스 채굴 검사가 실패했다. 수정 후
   채굴 0.6개/초, 벌목 0.8개/초로 계약·데이터 표기와 일치한다.
5. **`waves.js` — 콜백 직접 대입 지원**
   `main.js` 는 `waves.onWaveStart = fn` 처럼 **대입**하는데, 기존에는 등록 메서드만 지원해
   웨이브 시작/완료/게임오버 콜백이 전혀 호출되지 않았다(게임오버 처리 포함). `_emit` 이
   프로토타입 메서드가 아닌 자체 속성 콜백도 계약 인자 형태
   (`onWaveStart(wave,count)`, `onWaveComplete(wave,reward)`, `onEnemyKilled(enemy,info)`, `onGameOver(info)`)
   로 호출하도록 수정했다. 생성자 opts / 등록 메서드 방식도 그대로 동작한다.

## 계약 편차 (이유 포함)

1. `noDamageWaves` = 기지·플레이어 모두 무피해, `perfectWaves` = 기지만 무피해(×2 보상 조건).
2. `t1OnlyWaves` 는 포탑 1개 이상일 때만 계산(포탑 0개는 `noTurretWaves`).
3. `canPlace` 기지 이격 = `world.base.radius + 4`.
4. `genesis` 는 살아있는 모든 적을 소멸시킨다(프러스텀 제한 없음).
5. 유물 가챠는 `RELIC_STAVES` 항목을 지팡이로 지급(`grade:'relic'`, `relicId`).
6. 채굴 골드 = `round(mineral.value × 0.1) × 개수`.
7. `spawnedTotal` 누적, `remaining`/`waveTotal` 은 웨이브 단위.
8. rng 미주입 시 `createRNG('waves'|'gacha'|'enemy-<id>')` 폴백.
9. 적 피해 = `type.damage × (1+0.04(wave-1)) × (0.9+0.1×difficulty.hpMult)`, 처치 골드 = `type.gold × (1+0.05(wave-1)) × difficulty.goldMult`.
10. `waves.fromJSON` 은 저장된 `combat` 을 `prep` 로 내린다(전투 재개 대신 안전한 준비 상태).
11. `rate` 를 초당 산출량으로 해석(위 수정 4).

## 후속 라운드 — 🎯 미니게임 페이지 + 원클릭 실행 (신규)

- `client/public/mini-game.html` — 단독 HTML(외부 의존 0) 피하기 게임. Vite 가 `dist/` 로 복사 → `GET /mini-game.html` 200. 본편 모듈/세이브 미참조(연결은 메뉴 카드 한 곳).
- 이동·스폰 전부 **dt 기반**(`clamp(0,0.05)`) — 프레임레이트 무관. 적 제거는 뒤에서부터. 스폰은 플레이어 170px 이상. 입력은 키보드 + 포인터 드래그. 점수 = 생존 + 회피 보너스(+10).
- `tools/mini-game-check.mjs`(`npm run minigame`) — 스텁 DOM 실행 38체크. `게임실행.cmd`(루트+바탕 화면)는 어느 폴더에서든 실행되게 하고, `check` 로 경로 점검.

## 남은 TODO / 확인 권장

- 보스 광역(`smash`/`breath`)은 반경 내 포탑도 피해를 준다(보스 전용, 계약 위반 아님). 필요 시 제거 가능.
- `main.js` 배선 확인 완료: `waves.onWaveStart/onWaveComplete/onGameOver` 대입 지원, `waves.pattern.id` → `world.setSpawnPattern` 경로 유지.
- 게임 밸런스(채굴 0.6개/초 등)는 데이터 값이므로 `data.js` 만 바꾸면 조정된다.

## 후속 라운드 — 🏹 활 계열 · 화살 소모품 · 궁수 (신규)

- **8번째 무기 계열 `bow`(활)** 추가 — 무기 **67종**(코어 66 = 보너스 유물 지팡이 1종 제외), 계열별 **12/10/11/11/10/1/2/10(활)**. 활 10종 = 자동 생성 7종(T1~T7) + 제작 전용 3종(`bow_wind` T3 · `bow_dragonbone` T5 · `bow_forever` T7 유물).
- 활은 **좌클릭 홀드 = 쿨다운마다 즉시 발사**(`kind: 'bow'` — 지팡이 `'ranged'` 재사용 금지 · 마나 0). 사거리 54 m · 탄속 62 · 관통 1~3 · 발사 간격 0.80→0.73초, `WEAPON_MOTIONS.bow`(스왑 `nock` 0.50s · `string` 시위 트랙) · `WEAPON_IMPACTS.bow` · `WEAPON_ULTIMATES` **9종**(`eternalLove`).
- **화살 7종**(`ARROW_TIERS`, ×1.00~×1.85 · 묶음 150~90발)은 **소모품**이며 원장을 `economy.arrows` 로 **분리**했다(세이브 포함 · 화살 없는 옛 세이브 호환). 발당 1발 · **보유 최고 티어 우선** · 0발이면 발사하지 않고 안내만(쿨다운도 소모하지 않음).
- **궁수(`archer`) 7번째 직업** — `family: 'bow'` · signature `bow_forever` · 패시브 무기 피해 +14% · 이동 속도 +6%. 다른 직업은 활을 쓸 수 없다(기존 `weaponLock` 규칙 그대로).
- 유물 활 **'이 사랑, 영원히'**(`bow_forever`) — 피해 70 · 발사 간격 0.73초 · 관통 3 · 수정 속성. 제작은 T7 창세의 제단 — 132,000 G · 목재 12,000 · 별의 파편 12 · 시간의 모래 8 · 창세의 정수 4 · 시간의 조각 4 · 멈춘 시간 3. 궁극기 **[영원한 사랑]**(반경 44 m · 12연격 · 화살 60발 연출 · 쿨다운 165초).
- 제작: `WEAPON_RECIPES` **33종**(제작 전용 무기 **23종**) · 활 계열 자동 레시피 7종(`FAMILY_FORGE_FAMILIES = ['bow']` + `FAMILY_TIER_RECIPES`) · `WORKBENCH_RECIPE_COUNT` **66종** · 화살 레시피 **7종**(`ARROW_RECIPES` · 같은 티어 제작대 1:1).
- 관리자 명령 **14종** — `/화살 [id|이름|전부] [수량]`(기본 500발 · 인자 없으면 7종 전부) · `/전체자원` 도 화살 7종 지급. UI 는 제작 패널 **🏹 화살 구획**(묶음·비용·보유)과 HUD **🏹 화살 칩**.
- 검증(이번 라운드 실측): `smoke 725/725` · `headless 514/514` · `bugtest4 80/80` · `bugtest(boss) 20/20` · `bugtest2 88/88` · `bugtest3 71/71` · `ui 285/285`. `e2e 94/94` · `lancheck 9/9` 는 서버가 필요해 기존 값 유지.

---

## 후속 라운드 — 🎯 미니게임 화면 전환 + 🔧 실행기 복구 [H-47 · H-48]

- **실행기 복구(H-47)** — `run.cmd` 의 한 줄이 한글로 끝나 cmd 가 그 줄의 CR 을 삼켰고, 스크립트가 `... was unexpected at this time.` 로 즉사해 서버가 **한 번도 뜨지 않았다**. 모든 줄을 ASCII 로 끝나게 재작성하고(에코 문구 `-` 로 마감), `tools/cmd-lint.mjs`(`npm run cmd-lint`)를 추가해 모든 `.cmd` 의 **CRLF + 비ASCII 줄끝**을 자동 검사한다(`npm run verify` 체인 포함).
- **미니게임 화면 전환(H-48)** — 메인 화면 `🎯 미니게임` → 새 탭이 아니라 **본편 위 오버레이**(`ui/minigame.js` · `#mini-game-overlay` · `--z-minigame: 85` · iframe `/mini-game.html`). 여는 동안 본편이 `playing` 이면 `pause()`, 닫으면 `resume()` — 진행 중이던 판이 그대로 이어진다. 복귀는 상단 `← 게임으로 돌아가기` · **ESC** · iframe 의 `postMessage({type:'minigame:exit'})` 3종이며, 메시지는 **출처 + 발신 창 신원**을 확인한 뒤에만 처리한다. 오버레이를 못 만들면 새 탭 폴백.
- **미니게임 페이지 자체** — 게임오버 화면에서도 ESC 로 복귀하고, 페이지를 직접 열었을 때는 `/` 로 이동한다(iframe 안이면 부모에게 알림).
- 검증(이번 라운드 실측): `minigame 61/61`(페이지 44 + 오버레이 17) · `ui 287/287` · `smoke 725/725` · `headless 514/514` · `cmd-lint 2/2` · 빌드 `index-Y472mMF9.js`(1,404.46KB · gzip 399.14KB) + `index-uHFATLJv.css`(46.89KB).


---

## 후속 라운드 — 🔧 소환 멈춤 · ⚙️ ESC 설정 · 💾 내 세이브 · 🚀 최적화 [H-49 · H-50 · H-51 · H-52]

- **무기 소환 멈춤(H-49)** — 관리자 `/무기전부` 가 67종을 한 프레임에 지급하며 `panels.refresh()` 를 **67번** 불렀고, 실제 DOM 재렌더가 수 초를 잡아 화면·입력이 멈췄다. `PanelManager.requestRefresh()/flushRefresh()` 로 **프레임당 1회** 병합, `systems/grants.js` `GrantQueue` 로 **프레임 예산(6ms) 지급**, `Game.perf` 프레임 감시 + 설정 ‘성능 지표’. 실측: 67종 빌드 40.8ms · 장착/애니메이션 <2ms · 머티리얼 서명 4종 · 6,000프레임 전투 시뮬 힙 +0.59MB → **원인은 JS 연산이 아니라 DOM 재렌더 횟수**였다.
- **ESC = 설정 화면(H-50)** — `ESC` → 설정 화면(`pause({screen:'settings'})`), 맨 위 [계속하기]·[나가기], 일시정지 중 패널을 닫으면 자동 재개. 자동 화질 토글·평균 FPS·렌더 배율·JS 힙 지표를 설정에 추가.
- **내 세이브(H-51)** — `systems/saves.js`(최근 10개 슬롯, `fortress.saves.v1`). 저장할 때마다 슬롯이 쌓이고 설정 → ‘내 세이브’ 에서 [불러오기]/[삭제]. 복원은 `_restore(data)` 로 `load()` 와 같은 경로.
- **최적화(H-52)** — 자동 화질이 `저전력 → 무제한`(가장 무거움)으로 내려가던 **역방향 하향 버그**를 비용 순 사다리 `PRESET_LADDER` 로 고치고, 1회성 하향을 **12초 주기 지속 적응**(하향 <42 FPS · 되올리기 ≥58 FPS · 사용자 선택이 상한)으로 바꿨다. `MemoryGuard`(900MB·120초 쿨다운) + [저장하고 새로고침(메모리 정리)].
- 검증(이번 라운드 실측): `smoke 738/738` · `headless 539/539` · `ui 292/292` · `minigame 61/61` · `cmd-lint 2/2` · 빌드 `index-PwWVjALW.js`(1,416.40KB · gzip 403.27KB) + `index-uHFATLJv.css`(46.89KB).

## H-53 ~ H-59 (점프 · 키 변경 · 웨이브 100 · 무한 모드 · 조합법 · 3D 텔레포트 포탈 · 불멸)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `client/src/keys.js` | 25개 동작 키맵 · 재지정/초기화 · `consume/isDown` |
| 신규 | `client/src/profile.js` | 로컬 우선 닉네임(`fortress.nickname.v1`, 16자) |
| 신규 | `client/src/progress.js` | 무한 모드 해금 · 최고 웨이브 · 셀레스티얼 처치(`fortress.progress.v1`) |
| 신규 | `client/src/recipes.js` | 조합법 도감(134종 · 지형 10곳 분류) |
| 신규 | `client/src/travel.js` | 지형 이동 목록 · 지형별 색 · 도착 좌표 |
| 신규 | `client/src/world/teleports.js` | 지형별 3D 텔레포트 포탈(`TeleportField`) |
| 변경 | `client/src/player/player.js` | 점프 우선 + `_jumpLock` · 키맵 전환 |
| 변경 | `client/src/main.js` | `_prewarmStep` · `requestPanels` · 무한 모드 게이트 · 포탈 생성/갱신 · N 키 |
| 변경 | `client/src/ui/panels.js` | 키 변경 UI · 닉네임 UI · `recipes`/`travel` 패널 |
| 변경 | `client/src/systems/waves.js` | `mode` · 무한 모드 셀레스티얼(+35%) · 마릿수 상한 |
| 변경 | `client/src/systems/enemies.js` | 고정 스탯 보스 편성표 제외 · 완만한 성장 곡선 · `type` 우선 |
| 변경 | `client/src/data.js` | `finalWave: 100` · 셀레스티얼 5,000,000/1,200 · 무한 모드 규칙 |
| 변경 | `client/src/ui/menu.js` | 무한 모드 잠금 표시 |
| 변경 | `client/src/ui/console.js` | ESC 안내 · 명령 소요 시간 표시 |
| 변경 | `client/src/systems/admin-commands.js` | `requestPanels` · `/웨이브` 클램프 |
| 변경 | `server/api/auth.js` | `POST /api/auth/nickname` |
| 테스트 | `tools/smoke.mjs` · `tools/headless.mjs` · `tools/ui-dom-smoke.mjs` · `tools/boss-bugtest.mjs` | 키맵·점프·조합법·무한 모드·포탈 검사 |

## H-60 ~ H-64 (렉테스트 · 500 FPS 프리셋 · 닉네임 중복 · 채굴기 티어 채굴)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `tools/lag-test.mjs` | 렉테스트 — 프레임 비용·그리기 호출·품질별 장면 규모(`npm run lag-test`) |
| 신규 | `tools/drill-tier-test.mjs` | 채굴기 티어 채굴 통합 검사(`npm run drill-test`) |
| 변경 | `client/src/systems/turrets.js` | `drillPower/drillYieldBonus/drillLowTierChance/drillPickGrade` · 맨땅 시추 티어 보정 · 시설 tier/rate 저장·복원 · `mineralsDrilled` 저장 |
| 변경 | `client/src/data.js` | `speed` 프리셋(500 FPS 목표) 추가 |
| 변경 | `client/src/ui/adaptive.js` | `PRESET_LADDER` 맨 아래에 `speed` |
| 변경 | `client/src/ui/panels.js` | 채굴기 카드에 티어 채굴 안내 · 닉네임 중복 안내 |
| 변경 | `client/src/ui/menu.js` | 닉네임 중복 안내 |
| 변경 | `server/api/auth.js` | 닉네임 중복 허용 명시 · 아이디 중복 안내 문구 |
| 변경 | `package.json` | `lag-test` · `drill-test` · `test:all` 스크립트 |
| 테스트 | `tools/smoke.mjs` · `tools/base-bugtest.mjs` | 채굴기 티어 헬퍼 검사 · T3 검사(저티어 랜덤 반영) |

## H-66 ~ H-68 (렉 최적화 · 채굴 모션)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 변경 | `client/src/ui/healthbars.js` | 체력바 꼬리만 지우기(`_lastCount`) |
| 변경 | `client/src/ui/minimap.js` | 3프레임에 1회 redraw(≈20Hz) |
| 변경 | `client/src/main.js` | 중복 `frustumCull` 제거 |
| 변경 | `client/src/ui/fps.js` | 프리셋 적용 시 `devicePixelRatio` 상한 |
| 변경 | `client/src/systems/region-spawns.js` | 편성표 캐시(`_rosterFor`) |
| 변경 | `client/src/systems/turrets.js` | 채굴기 채굴 모션(날·슬리브·먼지) · `_minePulse` |
| 테스트 | `tools/drill-tier-test.mjs` · `tools/smoke.mjs` | 모션 부품·회전·정지 검사 |

## H-69 ~ H-70 (후반 밸런스 · 예산 행 · 색점 훅 · 티끌 색)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 변경 | `client/src/data.js` | `endlessCelestialAttackGrowth/Cap` · `endlessCelestialGoldGrowth` |
| 변경 | `client/src/systems/waves.js` | 후반 성장 곡선(체력 +35% · 공격 +12%/×6 · 골드 +25%) · `gold`/`endlessCount` 전달 |
| 변경 | `client/src/ui/panels.js` | 성능 지표 "프레임 예산 (500 FPS)" 행 · 색점 `data-role/data-color/title` 훅 |
| 변경 | `client/src/systems/turrets.js` | 티끌 재질 복제 + `regionColor()` 지형 색 |
| 테스트 | `tools/ui-dom-smoke.mjs` | 지형 이동 패널 클릭 → `travelTo` 호출 · 색점 20 · 색 10종 |
| 테스트 | `tools/smoke.mjs` · `tools/headless.mjs` · `tools/drill-tier-test.mjs` | 곡선·예산 행·티끌 색 검사 |

## H-71 (관리자 무기 소환 멈춤)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `client/src/systems/summon-queue.js` | 소환 지연 큐(순수) `SummonQueue` · `validateSummonQueue()` |
| 변경 | `client/src/main.js` | 게임 중 예열(1종/프레임) · `summonWeapon` · `_warmWeapon` · `_summonStep` · `_warmedWeapons` |
| 변경 | `client/src/systems/admin-commands.js` | `/무기` 가 소환 큐를 거치고 결과에 예열 안내 표시 |
| 테스트 | `tools/smoke.mjs` | 예열 상태 분기 · 소환 분리 · 큐 순서/중복/실패/상한 (828개) |

## H-73 ~ H-74 (컨베이어벨트 물류)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `client/src/systems/conveyors.js` | 순수 물류 — `beltForward` · `beltAdvance` · `beltNeighbor` · `beltReceiver` · `beltLoad` · `validateConveyorLogic()` |
| 변경 | `client/src/systems/turrets.js` | `_creditMineral` 적재 훅 · `_updateConveyor` 물류 · 상자 렌더 · `toJSON/fromJSON items` |
| 테스트 | `tools/conveyor-test.mjs` | 21검사(규칙 자체검증 · 사슬 하역 · 막힘 · 저장/복원 · 티어 속도 · 상자 렌더) |
| 변경 | `package.json` | `conveyor-test` 추가 · `test:all` 에 포함 |

## H-79 ~ H-82 (마법연성 · 명령어/ESC 멈춤)

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `client/src/systems/arcana.js` | 마법연성 11종(순수) — `Arcana.mult/cost/buy/coreRange` · `validateArcana()` |
| 변경 | `client/src/systems/turrets.js` | `_applyArcana`(상대 배율) · `storageCapacity()` · `TurretSystem.applyArcana()` |
| 변경 | `client/src/main.js` | `applyArcana` · `_updateCoreAttack` · `buyArcana` · Y 키 · 저장/복원 · **일시정지 중 예열 금지 + 예열 시간 예산 + 예열된 무기만 장착** |
| 변경 | `client/src/ui/panels.js` · `keys.js` | 마법연성 패널(11종 구매) · Y 키 등록 |
| 테스트 | `tools/command-freeze-test.mjs` | 명령 15종 CPU 비용 · 무기소환→ESC(예열/장착 0회) · 소스 가드 · 연성 배율 15검사 |
