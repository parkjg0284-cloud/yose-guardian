# 요새의 수호자 — 구현 계약서 (CONTRACT)

> 이 문서는 **단일 진실 공급원(single source of truth)** 이다. 모든 모듈은 여기 적힌 이름·시그니처를 **글자 그대로** 구현한다.
> 계약을 바꿔야 하면 코드를 고치지 말고 이 문서를 고친 뒤 보고한다.

## 0. 공통 규칙

- ESM 전용 (`import`/`export`), TypeScript 금지, 번들러는 Vite.
- 클라이언트 3D는 `three` (^0.170) 만 사용. 추가 런타임 의존성 **추가 금지**.
- 서버는 express 4 / socket.io 4 / jsonwebtoken / bcryptjs + Node 내장 `node:sqlite` 사용. `better-sqlite3` 금지.
- UI 텍스트는 한국어. 코드 식별자·주석 키 이름은 영어.
- 좌표계: Three.js 표준. **Y가 위**, 지면은 XZ 평면. 맵은 5000x5000 (half = 2500).
- 시간 단위: 초. `update(dt)` 의 dt는 초.
- 모든 시스템 클래스는 생성자에서 **단일 opts 객체**를 받고 `update(dt, ctx)` 를 갖는다(필요한 경우).
- 순수 로직 모듈(`systems/economy.js`, `systems/gacha.js`, `systems/achievements.js`, `utils/rng.js`, `data.js`)은
  **THREE를 import 하지 않는다.** (헤드리스 스모크 테스트 대상)
- 결과 보고는 짧게: 만든 파일 목록 + 계약에서 벗어난 점 + 미구현 TODO.

## 1. 디렉터리

```
/                      루트 워크스페이스 (package.json, .env, README.md, docs/, tools/)
server/
  index.js  db.js  api/{auth,admin,save,leaderboard,stats}.js  game/{Room,RoomManager,protocol}.js
client/
  index.html  vite.config.js
  src/
    main.js  data.js  net.js  audio.js
    utils/rng.js
    world/{world,terrain,trees,minerals,base,portals,sky}.js
    player/{player,staff,projectiles}.js
    systems/{waves,turrets,spells,gacha,achievements,fairies,economy,enemies}.js
    ui/{hud,minimap,panels,fps,cutscene,styles.css}.js
```

## 2. 서버

### 2.1 DB (`server/db.js`)

`node:sqlite` 의 `DatabaseSync` 사용. `server/data/` 디렉터리 자동 생성.

```js
export function initDb(dbPath?) // 테이블 생성, db 인스턴스 반환
export const db            // 열린 DatabaseSync
export function closeDb()
```

테이블:

| 테이블 | 컬럼 |
|---|---|
| `users` | `id INTEGER PK AUTOINCREMENT`, `username TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `nickname TEXT`, `role TEXT NOT NULL DEFAULT 'user'`(`'user'`\|`'admin'`), `created_at TEXT` |
| `saves` | `user_id INTEGER PK REFERENCES users(id)`, `data TEXT NOT NULL`, `updated_at TEXT` |
| `scores` | `id INTEGER PK AUTOINCREMENT`, `user_id INTEGER`, `nickname TEXT`, `mode TEXT`, `score INTEGER`, `wave INTEGER`, `seed TEXT`, `duration INTEGER`, `created_at TEXT` |
| `stats` | `user_id INTEGER PK`, `data TEXT NOT NULL`, `updated_at TEXT` |

### 2.2 REST API (모두 JSON, 접두사 `/api`)

| 메서드 | 경로 | 인증 | 요청 | 응답 |
|---|---|---|---|---|
| GET | `/api/health` | - | - | `{ok:true, version, uptime, users, rooms}` |
| POST | `/api/auth/register` | - | `{username, password, nickname?}` | `201 {token, user}` |
| POST | `/api/auth/login` | - | `{username, password}` | `200 {token, user}` |
| GET | `/api/auth/me` | Bearer | - | `{user}` |
| GET | `/api/admin/overview` | Bearer(admin) | - | `{ok, admin, counts:{users,admins,saves,scores}, users[], scores[], uptime}` |
| GET | `/api/admin/users` | Bearer(admin) | `?limit=1..200` | `{ok, limit, users[]}` |
| DELETE | `/api/admin/scores/:id` | Bearer(admin) | - | `{ok, deleted}` · 없으면 `404` |
| GET | `/api/save` | Bearer | - | `{data:object\|null, updatedAt}` |
| POST | `/api/save` | Bearer | `{data:object}` | `{ok:true, updatedAt, bytes}` |
| GET | `/api/leaderboard?mode=&limit=` | - | - | `{entries:[{rank,nickname,score,wave,mode,seed,createdAt}]}` |
| POST | `/api/leaderboard` | Bearer | `{mode,score,wave,seed,duration,stats?}` | `{ok:true, rank, entry}` |
| GET | `/api/stats` | Bearer | - | `{stats:object}` |
| POST | `/api/stats` | Bearer | `{stats:object}` | `{ok:true}` |

규칙:
- 비밀번호는 bcryptjs 해시(round 10), 최소 4자. username 3~20자 `[a-zA-Z0-9_]`, 중복 시 `409`.
- JWT payload `{id, username, role}`, 만료 `.env JWT_EXPIRES`(기본 30d). 인가 판단은 토큰이 아니라 `requireAuth` 가 DB 에서 읽은 `row.role` 을 신뢰한다.
- `user` 객체 = `{id, username, nickname, role, isAdmin}` (role 은 `'user'|'admin'`).
- 제작: `client/src/crafting.js`(제작대 8종 `CRAFTING_TABLES` · 무기 레시피 48종 `WEAPON_RECIPES` · **화살 레시피 7종 `ARROW_RECIPES`** · **요정의 날개 레시피 8종 `WING_RECIPES`** · `validateCrafting()`)와
  `client/src/systems/crafting.js`(`CraftingSystem` — `isBuilt/isUnlocked/build/canCraft/craft/toJSON/fromJSON` + **`canCraftWing/craftWing`**).
  제작대 티어 = 무기 등급 티어이고, 제작 전용 무기(`craftOnly: true`, 24종)는 `_defaultOwned()` 에서 제외된다.
무기별 서명 비용(`WEAPONS[].cost`)이 있으면 레시피 비용이 티어 표준(`RECIPE_COST_BY_TIER`) 대신 그 값을 쓴다(예: `time_scissors` 36,000 G).
- 작업대: `WORKBENCH_RECIPES`(전체 82종 − `WORKBENCH_EXCLUDED`(꿈의 끝은 희망) = 81종). `CraftingSystem.canCraft/craft` 는
  ctx 의 `hasWorkbench` 가 true 면 작업대 경로(`via: 'workbench'`)를 먼저 쓰고, 없으면 티어 제작대 경로로 떨어진다.
- 패널 id 는 **15종**(`craft`·`classes`·`enchant` 포함), 단축키는 **24행**(`C` 제작대 · `V` 요정의 날개 · `Ctrl` 앉기 · `R` 홀드 회전)이다. 관리자 계정은 서버 시작 시 `ensureAdminAccount()` 가 보장한다(`.env ADMIN_USERNAME`·`ADMIN_PASSWORD`·`ADMIN_NICKNAME`, 기본 `admin`/`(비밀번호는 .env 참조)`/`관리자`).
- `requireAdmin` 미들웨어 = `requireAuth` + `req.user.isAdmin` 검사(아니면 `403`).
- 점수는 서버 재검증: `score = floor(wave*1000 + kills*10 + gold/10)` 상한 검사, `wave < LEADERBOARD_MIN_WAVE` 거부, 같은 유저·모드 중복 제출은 **최고점만 유지**.
- 에러 응답은 `{error: '메시지'}` + 알맞은 상태코드. 서버는 절대 throw로 죽지 않는다.
- 프로덕션(`NODE_ENV=production`)이면 `client/dist` 를 정적 서빙하고 SPA fallback(`*` → index.html, `/api`·`/socket.io` 제외).

### 2.3 Socket.io 프로토콜

연결 namespace: `/` (기본). 모든 ack는 `{ok:true, ...}` 또는 `{ok:false, error}`.

**클라이언트 → 서버**

| 이벤트 | 페이로드 | ack |
|---|---|---|
| `room:create` | `{nickname, mode, seed, difficulty, maxPlayers?}` | `{ok, code, state}` |
| `room:join` | `{code, nickname}` | `{ok, state}` |
| `room:leave` | `{}` | `{ok}` |
| `room:ready` | `{ready:boolean}` | `{ok}` |
| `room:start` | `{}` (방장만) | `{ok}` |
| `chat:send` | `{text}` (200자 제한) | `{ok}` |
| `player:state` | `{x,y,z,yaw,pitch,hp,mana,element,tier,anim}` | - |
| `turret:place` | `{typeId,x,y,z,ownerId}` | - |
| `turret:sell` | `{turretId}` | - |
| `game:event` | `{type, payload}` | - |

**서버 → 클라이언트**

| 이벤트 | 페이로드 |
|---|---|
| `room:state` | `{code, hostId, mode, seed, difficulty, phase:'lobby'\|'playing'\|'ended', players:[{id,nickname,ready,alive,hp,wave}], maxPlayers}` |
| `room:error` | `{message}` |
| `chat:message` | `{id, nickname, text, ts}` |
| `game:start` | `{seed, mode, difficulty, wave, startAt}` |
| `game:snapshot` | `{t, wave, phase, baseHp, baseMaxHp, players:{[id]:{x,y,z,yaw,pitch,hp,mana,nickname,alive}}, enemies:[{id,type,x,z,hp,maxHp,isBoss}], turrets:[{id,typeId,x,y,z,ownerId}]}` (20Hz) |
| `game:event` | `{type, payload, from?}` |
| `game:over` | `{wave, score, duration, stats}` |

### 2.4 방 관리 (`server/game/Room.js`, `server/game/RoomManager.js`)

```js
// Room.js
export class Room {
  constructor({ code, hostId, mode, seed, difficulty, io, maxPlayers = 4 })
  code, hostId, mode, seed, difficulty, phase, players /* Map<socketId, Player> */
  addPlayer(socket, nickname), removePlayer(socketId), setReady(id, ready)
  setPlayerState(id, state), placeTurret(id, turret), removeTurret(id, turretId)
  start(), end(), tick()          // 서버 권위 20Hz
  broadcastState(), snapshot(), serialize()
  chat(socketId, text)
}
// RoomManager.js
export class RoomManager {
  constructor({ io })
  createRoom(opts), joinRoom(code, socket, nickname), getRoom(code), removeRoom(code)
  get count(), tickAll(), listPublic()
  static generateCode()   // 4자리 A-Z0-9, 중복 회피
}
```
- tick 20Hz(`SERVER_TICK_HZ`). 방에 플레이어가 없으면 자동 정리.

**초대코드 규칙 (협동 진입의 유일한 수단)**

- 코드는 **4자리 `A-Z0-9`** 이고 방마다 `RoomManager.uniqueCode()` 가 살아 있는 방과 겹치지 않게 발급한다.
- `room:join` 은 코드를 대문자로 정규화하므로 **대소문자를 구분하지 않는다**(`k7f2` = `K7F2`).
- 거절 사유는 그대로 문자열로 돌려준다 — `방을 찾을 수 없습니다`(없는/만료된 코드) · `방이 가득 찼습니다`(정원 초과) · `이미 시작된 게임입니다`(phase ≠ lobby).
- 거절돼도 **이전 방에서 쫓겨나지 않는다**(성공한 뒤에만 이전 방을 떠난다).
- 마지막 플레이어가 나가면 방과 코드가 함께 사라진다(빈 방은 살아 있지 않다).
- `room:state`(=`serialize()`)에 `code` 가 들어 있어 클라이언트가 초대 링크를 만들 수 있다.

### 2.5 전직(직업) 규칙 — 무기 잠금의 단일 출처

- 직업은 **계열과 1:1** 이다 — `staff`=마법사 · `sword1h`=기사 · `sword2h`=광전사 · `scythe`=사신 · `dagger`=그림자.
- **공용 계열** `scissors`(시간의 가위) · `dream`(꿈나무)은 직업과 무관하게 쓸 수 있고 **등급 상한도 받지 않는다**(`CLASS_RULES.sharedFamilies`).
- 단계별 등급 상한: 미전직 2 · 1차 4 · 2차 6 · 3차 8. 단계 배율은 1차 ×1 · 2차 ×1.5 · 3차 ×2 로 직업 패시브에 곱해진다.
- 전직 조건: 1차 웨이브 3(무료) · 2차 웨이브 12 + 1,200 G · 3차 웨이브 22 + 3,000 G · **재전직** 웨이브 12 + 2,000 G(단계는 1차로 초기화).
- 잠금은 **장착(사용)만** 막는다 — 보유·제작·가챠는 허용하고 UI 에 🔒 사유를 표시한다.
- 장착 거부는 `equipWeapon()` 한 곳에서만 일어난다(`silent` 여부와 무관). 전직으로 현재 무기가 잠기면 쓸 수 있는 가장 좋은 무기로 자동 교체한다.
- 세이브 `classes: { classId, stage }` — 불러오기는 **무기 장착보다 먼저** 복원한다(순서가 뒤바뀌면 잠금 검사가 무력화된다).
- 배율 반영 지점: 무기 피해 `main.js` 피해 계산 · `player.damageTakenMult`(받는 피해) · `player.speedMult` · `player.manaRegenMult` · `turrets.miningBonus`.
- 서버는 적 스폰/웨이브 수치를 **검증만** 하고(클라 시뮬레이션 신뢰 구조), 점수는 서버 공식으로 재계산.

## 3. 클라이언트 — 데이터 (`client/src/data.js`)

THREE import 금지. 아래 이름을 **정확히** export:

```js
export const VERSION
export const MAP = { size: 5000, half: 2500, fogColor, fogNear, fogFar }
export const TERRAIN_TYPES   // 4종: [{id,name,desc,color,heightScale,roughness,mineralBonus}]
export const TREE_TYPES      // 30종: [{id,name,category,tier,hp,wood,magic,color,trunkColor,scale,shape,speedBonus}]
export const MINERAL_TYPES   // 27종: [{id,name,tier,weight,color,emissive,value,hardness,rarity}]
export const MINERAL_TIERS   // {1:'일반',...5:'신화'}
export const TURRET_CATEGORIES // {attack:{id,name,icon,desc}, heal:{...}, mining:{...}, lumber:{...}}
export const TURRETS         // 86종: [{id,name,category,tier,cost:{gold,wood,minerals},damage,range,fireRate,hp,effect,color,desc,income}]
                             // category: attack(47) | heal(7) | mining(7) | lumber(7) | facility(18)
                             // facility kind: workbench·enchanter·storage·autominer + conveyor(T1~T7: speed·boost·beltLength·beltWidth) + spawner(T1~T7: spawnInterval·spawnCount) + storeRate({gold,wood}) / drillPool([
                             //   광물 id…]) 를 추가로 가진다. 작업대 id 는 crafting.js 의 WORKBENCH_ID 와 같아야 한다.
// 지형: terrain.surfaceHeight(x,z) = 렌더된 메시 표면 높이(삼각분할 보간). 객체 배치는 반드시 이 값을 쓴다
//       (world.getHeight() 가 이를 위임). terrain.getHeight() 는 메시 생성용 해석값이며 정점 사이에서 값이 다르다.
// 벨트 승강: TurretSystem.conveyorPushAt(pos) → {x,z,speed} | null. main.js 가 world.conveyorPushAt 로 배선하고,
//           Player._integrate 가 그 값을 dt 만큼 더한다(벨트 밖이면 null). 방향은 forward() = (-sin yaw, 0, -cos yaw).
// 소환문(웨이브): 세계에 세워지는 3D 차원문은 world/portals.js 의 PortalField 가 만들고, 웨이브는
//           PortalField.spawnPoint(pattern,index,wave,rng) 지점(문 바깥쪽 3.4m)에서 시작한다.
//           등장 연출 수치는 data.js 의 SPAWN_FX { emergeTime, scaleFrom, riseHeight, tint }.
// 소환문(시설): TurretSystem 이 ctx.spawnEnemy(x, z, {tier}) 를 호출 → main.js 가 WaveSystem.spawnAt 로 연결한다.
//         spawnAt 이 만든 적은 enemy.fromTower = true 이며 웨이브 정산(_aliveCount·_waveTotal)에서 제외된다.
export const TOWER_TIER_SCALE // {1:{hp,damage,range},...7:{...}}
export const SPELL_ELEMENTS  // 19종: [{id,name,color,status,desc}]
export const SPELL_GRADES    // 7종: [{id,name,weight,mult,color,glow,cutscene,desc}]
export const RELIC_STAVES    // 2종: [{id,name,element,grade:'relic',desc,skill:{id,name,cooldown,desc}}]
export const STAFF_TIERS     // 6종: [{tier,name,cost,desc}]
export const FAIRIES         // 7종: [{id,name,element,color,condition:{type,value,desc},hint,reward,quote}]
export const ACHIEVEMENT_CATEGORIES // 7종: [{id,name,icon}]
export const ACHIEVEMENTS    // 75+ : [{id,category,name,desc,stat,target,tier}]
export const STAT_LABELS     // {statKey: '한국어 라벨'}
export const WAVE_CONFIG     // {prepTime, baseHp, hpGrowth, baseSpeed, speedGrowth, baseCount, countGrowth, bossEvery, perfectBonus, rewardGold, rewardWood}
export const SPAWN_PATTERNS  // 5종: [{id,name,desc}]
export const ENEMY_TYPES     // 8종: [{id,name,color,hpMult,speedMult,radius,damage,gold,mineral?}]
export const BOSS_TYPES      // 4종: [{id,name,color,hpMult,speedMult,radius,damage,gold,ability,desc}]
export const FRAME_PRESETS   // 5종: [{id,name,desc,shadow,antialias,pixelRatio,fog,treeCount,mineralCount,particles,drawDistance}]
export const SEED_GALLERY    // 8종: [{seed,name,desc,tags}]
export const DIFFICULTIES    // [{id,name,hpMult,countMult,goldMult,desc}]
export const GACHA_COST      // {single, ten}
export const MINERAL_COMBO_RECIPES // 부여대: [{id,name,input:{mineralId:count},grade,element}]
export const TITLE_LIST      // 칭호: [{id,name,condition:{stat,target},desc}]
export const ACHIEVEMENT_BY_STAT // 편의: {stat: [ach,...]}  (선택)
```

`STAT_LABELS` 키(고정, 업적·통계 공용):
`kills, turretKills, towersBuilt, towersByCategory{heal,mining,lumber}, maxTurrets, goldEarned, goldSpent, mineralsMined,
mineralTypesMined, woodChopped, treesFelled, spellsCast, spellDamage, wavesCleared, perfectWaves, noDamageWaves,
bossKills, damageTaken, deaths, fairiesFound, relicsOwned, gachaPulls, epicSpells, playTime, highestWave, seed42, fairyCrown, t1OnlyWaves, noTurretWaves`

## 4. 클라이언트 — 모듈 API

### 4.1 `utils/rng.js` (THREE 금지)
```js
export function hashSeed(seed)            // string|number -> uint32
export function mulberry32(a)             // -> () => float [0,1)
export class RNG {
  constructor(seed)
  next()                                   // [0,1)
  range(min,max), int(min,max), pick(arr), pickMany(arr,n), chance(p), gaussian(), shuffle(arr), sign()
  fork(label)                              // 파생 RNG (같은 시드 → 같은 결과)
}
export function createRNG(seed)            // RNG
export function normalizeSeed(seed)        // ''|null|undefined -> 랜덤 6자리 숫자 문자열, 그 외 String(seed).trim()
```

### 4.2 `net.js`
- 서버 없이도 **절대 throw 하지 않는다**(오프라인 싱글플레이 모드).
```js
export class Net {
  constructor(url?)                 // 기본: location.origin (dev에서는 Vite 프록시 사용)
  connect(nickname?)                // Promise<void>, 실패해도 resolve
  disconnect()
  get connected(); get id(); get room()
  on(evt, cb); off(evt, cb)
  createRoom(opts) / joinRoom(opts) / leaveRoom() / setReady(b) / startGame()   // 모두 Promise
  sendChat(text); sendPlayerState(state); sendTurretPlace(t); sendTurretSell(id); sendGameEvent(type,payload)
  onRoomState(cb); onSnapshot(cb); onChat(cb); onGameEvent(cb); onGameOver(cb); onError(cb)
}
export const net = new Net()
export const auth = { register(username,password,nickname), login(username,password), me(), logout(), get token, get user, get loggedIn, get isAdmin, setSession(token,user) }
export const cloudSave = { save(data), load() }
export const leaderboard = { top(mode, limit), submit(entry) }
export const statsApi = { get(), push(stats) }
export async function api(path, { method='GET', body, token } = {})   // {ok,status,data,error}
```

### 4.3 `world/world.js`
```js
export function createWorld({ scene, seed, quality = 'balanced', rng }) -> World
export class World {
  group; bounds = { size: 5000, half: 2500 }; terrainType;
  trees /* Tree[] */; minerals /* Mineral[] */; portals /* Portal[] */; base /* Base */;
  getHeight(x, z): number
  isInside(x, z): boolean
  resolveCollision(position, radius = 0.6): void     // position(Vector3) 직접 수정
  nearestMineral(position, radius): Mineral | null
  nearestTree(position, radius): Tree | null
  frustumCull(camera): void
  update(dt, ctx): void                              // ctx = { player, enemies, time, camera }
  dispose(): void
}
```
- `world/{terrain,trees,minerals,base,portals,sky}.js` 로 분리 구현하되, `world.js` 가 조립한다.
- Tree: `{ id, typeId, name, category, x, z, hp, maxHp, radius, mesh, chop(amount) -> {wood, magic, felled} }`
- Mineral: `{ id, typeId, name, tier, x, z, hp, maxHp, radius, mesh, harvest(amount) -> {amount, depleted, mineralId} }`
- Base: `{ group, position, hp, maxHp, shield, maxShield, damage(n) -> {hp, destroyed}, heal(n), update(dt) }` (HP 4100 + 실드 500)
- Portal: `{ id, pattern, x, z, active, radius, mesh, spawnPoint(Vector3), flash() }` — `radius` = 문 바깥쪽 스폰 거리(3.4m)
- **3D 소환문**(`world/portals.js`) — 문 하나가 `arch`(석조 병합) · `trim`(발광 장식) · `vortex` · `vortexCore` · `halo` · `rune` · `runeInner` · `groundGlow` · `flames` · `keystone` · `vortexBack` 11개 메시로 구성된다.
  - `PortalField.spawnPoint(pattern, index, wave, rng) -> Vector3` — 열린 문 바로 뒤(바깥쪽) 지점. `mergeParts(parts)` 로 정적 부품을 1장으로 병합.
  - `PortalField.flashNearest(x, z, strength) -> Portal` — 몬스터가 나온 문을 번쩍이게 한다(waves.js 가 스폰 직후 호출).
  - `PortalField.update(dt)` — 소용돌이/룬/쐐기돌/불꽃 애니메이션 + 번쩍임 감쇠. 라이트를 추가하지 않는다(가산 발광만).

### 4.4 `player/player.js`
```js
export class Input {
  constructor(domElement)
  keys: Set<string>; mouse: { dx, dy, left, right, wheel }
  isDown(code); wasPressed(code); consumePressed(code)   // 1회성 키
  consumeMouse(); requestPointerLock(); exitPointerLock(); get locked
  update(dt); dispose()
}
export class Player {
  constructor({ camera, world, input, audio, stats, position })
  position /* Vector3 */; velocity; yaw; pitch; hp; maxHp; mana; maxMana; alive; onGround
  update(dt)
  takeDamage(amount, source?) ; heal(n); spendMana(n) -> boolean; regen(n)
  get eyePosition() -> Vector3 ; get aimDirection() -> Vector3 ; get moving() -> boolean
  respawn(position?) ; toJSON()/fromJSON(o)
}
```

### 4.5 `player/staff.js`
```js
export function buildStaffMesh({ tier = 1, element = 'arcane', relic = null }) -> THREE.Group
export class StaffView {
  constructor({ camera, tier, element, relic })
  setTier(t); setElement(e); setRelic(id)
  playCast(); playHit(); update(dt, { moving, casting })
  get muzzlePosition() -> Vector3 ; dispose()
}
```
- 6티어 + 유물 외형 변화. 1인칭 뷰(카메라 자식). 지팡이는 우측 하단에 위치.

### 4.6 `player/projectiles.js`
```js
export class ProjectileSystem {
  constructor({ scene, audio, max = 400 })
  spawn({ origin /*Vector3*/, direction /*Vector3*/, speed=40, damage=10, element='arcane',
          behavior='projectile' /* projectile|beam|chain|area|homing */, radius=1.2, range=60,
          color, owner='player', pierce=0, onHit, chainCount=3, aoe=0 })
  update(dt, targets)     // targets: [{ position:Vector3, radius:number, alive:boolean, takeDamage(dmg,element,source) }]
  onExplosion(cb); clear(); dispose()
  get count()
}
```

### 4.7 `systems/economy.js` (THREE 금지)
```js
export class Economy {
  constructor({ gold = 300, wood = 100, minerals = {} } = {})
  gold; wood; minerals /* Record<mineralId, number> */
  addGold(n); spendGold(n) -> bool
  addWood(n); spendWood(n) -> bool
  addMineral(id, n = 1); getMineral(id)
  canAfford(cost /* {gold, wood, minerals} */) -> bool
  spend(cost) -> bool
  totalMinerals() -> number
  toJSON() / fromJSON(o)
}
```

### 4.8 `systems/turrets.js`
```js
export class TurretSystem {
  constructor({ scene, world, economy, projectiles, audio, stats, rng })
  turrets /* Turret[] */
  canPlace(typeId, position) -> { ok, reason }
  place(typeId, position, ownerId) -> Turret | null
  sell(turretId) -> { gold, wood } | null
  upgrade(turretId) -> boolean
  update(dt, ctx)     // ctx = { enemies, player, world }
  countByTier(tier); countByCategory(category); total()
  toJSON() / fromJSON(o); dispose()
  buildPreview(typeId) -> THREE.Object3D      // 건설 모드 고스트
}
```
- 공격형: 자동 탐지 → 발사(beam/projectile/chain/area) + 쿨다운.
- 회복탑: 인접 구조물·기지·플레이어 HP 회복. 채굴탑: 반경 내 광물 자동 채굴 → 인벤토리. 벌목탑: 나무 자동 벌목 → 목재.
- 건설 규칙: 맵 안, 기지 최소 거리 4, 포탑 간 최소 거리 3, 지형 경사 제한, 골드/목재/광물 비용.

### 4.21 지역(티어 지역 · 히든 지역) — `world/regions.js`

거리 기반 지역 띠와 히든 지역을 정의하는 **순수 모듈**(THREE·DOM 의존 없음).

```js
export const REGIONS         // 9개: safe(0~70) · tier1(70~320) … tier7(1820~2120) · outer(2120~)
                             //   각 항목: {id,name,short,tier,inner,outer,treeTiers,mineralTiers,glyph,desc}
export const HIDDEN_REGIONS  // 2개: cherry_garden(🌸 벚꽃의 정원, x−1900 z−1520 r240)
                             //       time_horizon(⏳ 시간의 지평선, x1900 z1520 r240)
                             //   {id,name,glyph,x,z,radius,tier,treeIds,mineralIds,discoverRadius:320,desc}
export const RING_REGIONS    // 띠 지역만(tier1~tier7)
export const REGION_SPAWN = { hiddenTrees: 60, hiddenMinerals: 72 }
export const RING_TREE_WEIGHT / RING_MINERAL_WEIGHT   // 띠별 스폰 가중치

export function regionAt(x, z)        // {…지역, hidden:boolean} — 히든 판정이 띠보다 우선
export function regionIdAt(x, z)      // 'safe' | 'tier1'…'tier7' | 'outer' | 'cherry_garden' | 'time_horizon'
export function ringAt(x, z)          // 히든을 무시한 거리 띠
export function hiddenRegionAt(x, z)  // 히든 지역 또는 null
export function regionById(id) / isHiddenRegion(id) / distanceOf(x, z)
export function allowsTree(regionId, tree)      // 띠: treeTiers 포함 여부 / 히든: treeIds 포함 여부
export function allowsMineral(regionId, mineral) // 히든 전용 자원은 어떤 띠에서도 false
export function randomPointIn(regionId, rand)   // 그 지역 안의 좌표(원판 균등 분포)
export function ringQuotas(total, weights)      // 띠별 할당량(합계 = total, 각 띠 최소 1)
export function regionSummary(x, z)             // {id,name,short,glyph,tier,hidden,distance}
export function inDiscoverRange(regionId, x, z) // 발견 반경(320m) 판정
export function hiddenMineralIds() / hiddenTreeIds()
```

**규칙**
- 나무·광물은 **자기 티어 지역에서만** 스폰된다(`trees.js`·`minerals.js`의 `_placeInRegion`).
- 히든 전용 자원 4종(벚꽃 결정·꿈의 꽃잎·시간의 파편·멈춘 시간)과 전용 나무 2종은
  **전역 풀·웨이브 보상·일반 띠에서 완전히 제외**된다(`waves.js`의 `EXCLUSIVE_MINERAL_IDS`).
- 지역 발견 상태는 `world.regionState()` / `world.loadRegionState(ids)` 로 저장·복원된다(세이브 키 `discoveredRegions`).
- 히든 지역에 들어가면 `game._checkRegionDiscovery()` 가 알림을 띄우고, HUD 우상단(`.hud-region`)이 현재 지역을 표시한다.

**최종보스(§4.9 확장)** — `BOSS_TYPES` 5번째 항목.
- `celestial`(셀레스티얼): `hp: 10000000` · `attack: 17000` — 이 두 필드는 **고정값**으로, 웨이브·난이도 배율을 받지 않는다
  (`enemies.js`의 `fixedHp` / `fixedAttack`). 나머지 보스는 기존 배율식을 그대로 쓴다.
- `radius: 42`(티탄 3.4의 12배 이상) · `ability: 'judgment'`(쿨다운 16초 · 사거리 120m, 기지·포탑 ×3 · 플레이어 ×2.5 + 밀쳐냄).
- `barWidth: 64` · `barRange: 1400` 로 거대 모델에 맞춘 월드 체력바 오버라이드.
- 전용 3D 메시는 `Enemy._buildCelestialMesh()` 가 절차적으로 만든다(몸통·코어·왕관·빛기둥·고리 3·날개 8).
- 등장: `WAVE_CONFIG.finalWave = 30` — 웨이브 30·60·90… 의 마지막에 강림하며 일반 보스 로테이션을 소모하지 않는다.

### 4.9 `systems/waves.js` + `systems/enemies.js`
```js
export class WaveSystem {
  constructor({ scene, world, economy, audio, projectiles, stats, rng, difficulty })
  phase /* 'prep' | 'combat' | 'complete' | 'gameover' */; wave; timeLeft; enemies /* Enemy[] */; alive
  update(dt, ctx)   // ctx = { player, turrets, ui }
  forceStart(); reset(); toJSON()/fromJSON()
  onWaveStart(cb); onWaveComplete(cb); onEnemyKilled(cb); onGameOver(cb)
}
export function spawnEnemy({ scene, world, rng, wave, difficulty, typeId, isBoss, mods, elite, rosterId }) -> Enemy
/** 편성표: 웨이브마다 다른 몬스터 — waveRoster(wave, { prevId, boss }) */
export const WAVE_ROSTERS  // 13종: { id, name, icon, minWave, types[], weight{}, countMult, elite, mods{}, bossEscort }
export const ELITE = { namePrefix, hpMult: 2.4, speedMult, scaleMult: 1.35, goldMult: 2, color }
export const HEALTH_BAR = { width, height, bossWidth, bossHeight, heightFactor, heightOffset, range, alwaysRange, lowRatio, colors{} }
export const SPAWN_FX = { emergeTime: 0.55, scaleFrom: 0.35, riseHeight: 1.15, tint: 0x9fe8ff }
export function waveRoster(wave, { prevId = null, boss = false }) -> roster
```
- Enemy: `{ id, typeId, name, isBoss, position, hp, maxHp, speed, radius, damage, alive, gold, mesh,
  takeDamage(amount, element, source) -> {killed, gold}, update(dt, ctx) }`
- 웨이브: prep 30초 → combat(스폰→전멸 판정) → complete(보상) → 다음 prep. 10의 배수마다 보스.
- 스폰 위치는 시드 기반 `SPAWN_PATTERNS` 5종 중 웨이브마다 선택.
- 5000맵에서 기지까지 이동, 기지 도달 시 기지에 데미지, 광물/나무를 부순다.
- **웨이브 편성**: `waveRoster(wave, { prevId })` 가 주제를 고른다(연속 웨이브 중복 0, `minLevel` 게이트, 보스 웨이브는 `bossEscort`). 편성의 `mods` 는 개체 HP/속도/크기에, `elite` 수만큼 정예 개체(HP×2.4·골드×2)가 섞인다.
- **소환문 등장 연출**: `spawnEnemy({ ..., emerge })`(기본 true) → `Enemy._emergeT` 동안 메시가 `SPAWN_FX.scaleFrom`(0.35배)·`riseHeight`(1.15m, 보스 2배) 만큼 아래에서 시작해 제 크기로 복귀하고, 코어가 `SPAWN_FX.tint` 로 번쩍인다. `enemyInfo().emerging` 으로 확인한다.
- **체력바 계약**: `Enemy.barY`/`barWidth`(enemies.js 가 계산) · `enemyInfo(enemy)` 의 `ratio/elite/barY/shielded`. 월드 체력바는 `client/src/ui/healthbars.js` 의 `EnemyHealthBars({ scene, camera, capacity }).sync(enemies, camera)` (반환 = 그린 개수), HUD 보스 바는 `game.bossInfo` 또는 `waves.bossEnemy` 를 읽는다.

### 4.10 `systems/spells.js` / `systems/gacha.js`
```js
export class SpellSystem {
  constructor({ scene, projectiles, audio, stats, economy, rng })
  spells /* Spell[] 최대 6 */; selected; cooldown
  cast({ origin, direction, player, enemies, turrets }) -> { ok, reason, spell }
  add(spell) -> boolean; select(i); list()
  update(dt)
  useSkill({ player, enemies, turrets }) -> { ok, reason }   // R키: 시간정지(시간의 지팡이)·창세(창세의 지팡이)
}
export class GachaSystem {
  constructor({ rng, stats, economy, audio })
  pull(times = 1) -> { results /* Spell[] */, spent, ok, reason }
  canPull(times); odds() -> [{ grade, chance }]
  makeSpell(gradeId?, elementId?) -> Spell
}
// Spell: { id, name, grade, element, damage, mana, speed, cooldown, behavior, radius, color, relic }
```

### 4.11 `systems/achievements.js` (THREE 금지)
```js
export class AchievementSystem {
  constructor({ stats, onUnlock } = {})
  values /* Record<stat, number> */; unlocked /* Set<achId> */
  track(stat, amount = 1)
  set(stat, value)
  get(stat)
  list()  -> [{ id, category, name, desc, stat, target, progress, unlocked }]
  progress() -> { unlocked, total, ratio, byCategory }
  title() -> {id,name,desc}   // TITLE_LIST 중 달성한 최고 칭호
  toJSON() / fromJSON(o)
  reset()
}
```

### 4.12 `systems/fairies.js`
```js
export class FairySystem {
  constructor({ scene, world, audio, stats, rng, onFind })
  found /* Set<fairyId> */; crown /* boolean */
  update(dt, ctx)      // ctx = { player, game }  — 조건 평가 + 등장 연출 + 이스터에그 오브젝트
  spawn(fairyId, position) ; check(ctx) -> fairyId[] ; codex() -> [{id,name,element,color,condition,hint,reward,quote,found}]
  toJSON() / fromJSON(o)
}
```
- 7종: 아리아(빛)·실피드(바람)·노움(땅)·운디네(물)·살라만더(불)·티타니아(자연)·오베론(왕).
- 조건은 `data.js FAIRIES[].condition` 를 `stats` 값/컨텍스트로 평가. 7명 모두 조우 시 `crown=true` 패시브(마나 회복 +30%, 요정 종소리 BGM).
- HUD에는 **힌트만** 노출, 도감은 `Ctrl+H` (히든).

### 4.13 UI
```js
// ui/hud.js
export class HUD { constructor(game); update(dt); notify(text, type = 'info'); setPhase(phase, wave, timeLeft); dispose() }
// ui/minimap.js
export class Minimap { constructor({ canvas, world, size = 5000 }); update({ player, enemies, turrets, portals }); toggle() }
// ui/fps.js
export class FPSMonitor { constructor({ canvas }); update(dt); get fps(); get history() }
export function applyFramePreset(renderer, preset, scene?)   // FRAME_PRESETS 항목 적용
// ui/panels.js
export class PanelManager {
  constructor({ game })
  open(id); close(); toggle(id); isOpen(id); refresh()
  update(dt)
  on(event, cb)         // 'build:select'|'gacha:pull'|'seed:pick'|'frame:pick'|'save'|'load'|'auth'|'multiplayer'
  readonly current
}
// ui/cutscene.js
export function playCutscene({ grade, element, name, scene, camera, duration }) -> Promise<void>
```
- 패널 id: `build | achievements | inventory | gacha | weapons | seeds | codex | settings | feedback | pause | auth | multiplayer`
- 조작키: `B`건설 `E`부여대 `H`업적 `I`인벤토리 `F`프레임 `G`시드갤러리 `Ctrl+H`요정도감 `ESC`닫기 `1~9`포탑선택 `R`스킬 `T`채팅 `M`미니맵.
- HUD: 골드/목재/웨이브/기지HP+실드/마나/크로스헤어/프레임 그래프/알림 토스트/칭호.

### 4.14 `audio.js` (Web Audio 합성, 외부 파일 금지)
```js
export class AudioSystem {
  constructor()
  init()                                  // 첫 사용자 제스처에서 호출
  get ready()
  play(name, opts = {})                   // fire|cast|castRare|explosion|hit|enemyDeath|build|sell|upgrade|mine|chop|levelup|
                                          // gachaCommon|gachaRare|gachaEpic|gachaLegend|gachaRelic|fairy|waveStart|waveClear|
                                          // boss|baseHit|error|ui|relic|victory|defeat
  startBGM(kind = 'field')                // field|battle|menu|fairy
  stopBGM(); setVolume({ master, sfx, bgm }); toggleMute(); get muted
}
```

### 4.15 `main.js`
- 게임 컨텍스트 `game` 을 만들어 모든 시스템을 조립한다. `window.__GAME__ = game` (디버깅용).
- 로딩 화면 → 시작 메뉴(싱글/멀티/시드/설정/도움말) → 게임 루프(requestAnimationFrame).
- URL `?seed=777` 지원. localStorage 자동 저장(`fortress.save.v1`), 60초마다 + 종료 시.
- 일시정지(ESC), 사망/부활, 웨이브 HUD, 리더보드 제출, 로그인 시 클라우드 세이브 동기화.
- 렌더러: antialias, 그림자, 안개, 태양광+환경광. `FRAME_PRESETS` 즉시 적용.

### 4.16 `game` 컨텍스트 (main.js가 조립, 모든 UI/시스템이 참조)

```js
game = {
  VERSION, THREE, scene, camera, renderer, clock, seed, rng, quality /* preset id */, preset /* FRAME_PRESETS 항목 */,
  mode, difficulty, base,
  world, player, input, staff, projectiles,
  economy, waves, turrets, spells, gacha, achievements, fairies, audio, net,
  ui: { hud, minimap, panels, fps, menu, cutscene },
  state,                       // 'menu' | 'loading' | 'playing' | 'paused' | 'dead' | 'gameover'
  notify(text, type = 'info'),
  track(stat, amount = 1),     // 업적 통계
  addGold(n), addWood(n), addMineral(mineralId, n = 1),
  get enemies(),               // waves.enemies
  get towers(),                // turrets.turrets
  togglePanel(id), closePanels(),
  save(), load(), submitScore(),
  applyPreset(id),
  start({ mode, seed, difficulty }), pause(), resume(), quit()
}
```
- `window.__GAME__ = game` 로 노출(디버깅).
- 모든 선택적 접근은 옵셔널 체이닝으로 방어한다. UI는 `game.state` 변화를 `game.on?.('state', cb)` 없이 **매 프레임 확인**해도 된다.

### 4.17 DOM 계약 (`client/index.html`)

`index.html` 은 아래 요소를 **정확히 이 id로** 제공하고, UI 모듈은 해당 컨테이너 안에 렌더링한다.

```html
<div id="app">
  <canvas id="game-canvas"></canvas>
  <div id="crosshair"></div>
  <canvas id="minimap-canvas" width="220" height="220"></canvas>
  <canvas id="fps-canvas" width="170" height="52"></canvas>
  <div id="hud-root"></div>        <!-- HUD가 채움 -->
  <div id="panel-root"></div>      <!-- PanelManager가 채움 -->
  <div id="menu-root"></div>       <!-- MainMenu가 채움 -->
  <div id="toast-root"></div>      <!-- 알림 토스트 -->
  <div id="cutscene-root"></div>   <!-- 가챠 컷씬 -->
  <div id="loading">…</div>        <!-- 로딩 화면 (main.js가 숨김) -->
</div>
<script type="module" src="/src/main.js"></script>
```

### 4.18 `ui/menu.js` (계약 추가분)

```js
export class MainMenu {
  constructor({ game })
  show(initialTab = 'main'); hide(); get visible
  on(event, cb)   // 'start'({mode,seed,difficulty}) | 'multiplayer' | 'settings' | 'help' | 'auth' | 'codex'
  update(dt); refresh()
}
```

### 4.19 `ui/lobby.js` + `utils/invite.js` (초대코드 멀티플레이)

```js
// utils/invite.js — 순수(THREE·DOM 금지)
export const INVITE = { length: 4, alphabet: 'A-Z0-9', queryKey: 'room' }
export function normalizeInviteCode(input)   // 대문자·기호 제거·4자리 컷
export function isValidInviteCode(input)     // 정확히 4자리
export function inviteLink(code, origin)     // `${origin}/?room=CODE` (코드가 온전할 때만)
export function inviteMessage(code, origin)  // 공유 문구
export function codeFromUrl(search)          // ?room=CODE → 코드(잘린 코드는 '')
export function hasInviteInUrl(search)
export function loadLastCode() / saveLastCode(code)   // 최근 초대코드(localStorage, 실패 시 메모리)

// ui/lobby.js
export class Lobby {
  constructor({ game })        // #lobby-root 생성, net 의 room:state/chat:message 구독
  open({ code = '', auto = false })   // code+auto 면 즉시 참가 시도(?room=CODE 딥링크)
  close(); get visible; render(); update(dt); dispose()
  on(event, cb)   // 'open' | 'close' | 'created' | 'joined' | 'join-failed'
  create() / join(code, { auto }) / ready() / start() / leave() / sendChat(text)
}
```

- 두 뷰로만 구성한다: **entry**(방 만들기 / 초대코드 참가) · **room**(초대코드 공유 + 참가자 + 준비/시작 + 채팅).
- UI 표식(테스트 계약): `#lobby-root`, `[data-role="status"|"code"|"link"|"players"|"chat"|"join-error"|"message"]`,
  `[data-field="lobby-code"|"lobby-seed"|"lobby-chat"]`, `[data-act="lobby-create"|"lobby-join"|"lobby-copy-code"|"lobby-copy-link"|"lobby-share"|"lobby-ready"|"lobby-start"|"lobby-leave"|"lobby-chat-send"|"lobby-mode"|"lobby-diff"|"lobby-max"|"lobby-seed-random"|"lobby-last-code"|"lobby-close"]`.
- 메인 화면(`menu.js`)은 `[data-act="menu-multiplayer"]`(로비 열기)와 `[data-act="menu-invite-join"]`(`multiplayer:join` 이벤트)를 노출한다.
- `main.js` 는 `menu.on('multiplayer')` → `lobby.open()`, `menu.on('multiplayer:join')` → `lobby.open({ code, auto: true })`,
  부팅 시 `codeFromUrl()` 로 `?room=CODE` 를 읽어 자동 참가를 시도하고, `net.on('game:start')` 에서 로비를 닫은 뒤 **방이 보낸 모드/시드/난이도**로 시작한다.

### 4.20 `systems/classes.js` (전직 · 무기 잠금)

```js
export class ClassSystem {
  constructor({ game = null, state = null })   // state = { classId, stage }
  get id / get stage / get def / get stageInfo / get isNovice / get label   // label 예: '🔮 마법사 · 2차'
  get modifiers()        // { weaponDamage, manaRegen, moveSpeed, miningSpeed, damageTaken, healBonus, stageBonus }
  get weaponDamageMult() // 무기 피해 배율(1.0 = 그대로)
  info()                 // 패널/HUD 요약
  canUse(weaponId) / lockOf(weaponId)   // { locked, reason, kind:'ok'|'family'|'tier'|'unknown', tier, family }
  filterUsable(list) / lockedCount(list)
  canAdvanceTo(classId, { wave, gold }) // { ok, error, cost, isChange }
  advance(classId, { wave, gold, spend, free })   // 1차 전직 · 재전직(단계 1로 초기화)
  promote({ wave, gold, spend, free })            // 2차 · 3차 승급
  nextStageRequirement() / reset() / serialize() / toJSON() / load() / fromJSON()
  on/off/emit  // 'advance' | 'promote' | 'reset'
}
```

- UI 표식(테스트 계약): `[data-panel="classes"]`, `[data-role="class-row"]`(`data-class-id`·`data-family`·`data-current`),
  `[data-act="class-advance"]`(`data-id`), `[data-act="class-promote"]`, `[data-role="class-blocked"]`, `[data-role="locked-weapon"]`.
- 무기 패널: 잠긴 카드에 `data-class-locked="family|tier"` + `[data-role="weapon-lock-reason"]`, `[data-act="weapon-equip"]` 는 `disabled`.
- 제작 패널: 잠긴 무기도 `[data-act="craft-make"]` 는 살아 있고 `[data-role="craft-locked"]`(🔒 보관만) 안내가 붙는다.
- 메뉴: `[data-act="menu-classes"]`(→ `game.togglePanel('classes')`) · `[data-role="menu-class"]`(현재 직업 라벨). HUD: `.hud-stat-job`.
- 단축키 `K` = 전직. `PANEL_IDS` **15개** · `KEYBINDS` **24행**(두 수는 ui 스모크가 고정 검증한다).

### 4.22 성능 · 편의 모듈 — `systems/gathering.js` · `systems/admin-commands.js` · `ui/console.js` · `ui/adaptive.js`

> 이 넷은 **THREE·DOM 비의존**(`gathering.js`, `admin-commands.js`, `adaptive.js`) 또는 **DOM 전용**(`ui/console.js`)이며, 판정/표기 로직은 전부 `data.js` 와 위 모듈의 순수 함수에서만 나온다.

#### 4.22.1 `systems/gathering.js` — 맨손 채집

```js
export const BARE_HAND = { reach: 3.8, power: 14, interval: 0.42, maxTier: 1, cone: 0.15, shake: 0.05, name: '맨손 채집' };
export function nodeTier(node)                       // tier ?? 1 .. 0(불명)
export function isNodeAlive(node)                    // felled/depleted 아님
export function canHarvestByHand(node, { maxTier = BARE_HAND.maxTier } = {})
export function pickHarvestNode({ origin, dir, trees, minerals, reach = BARE_HAND.reach, maxTier })
//   → { node, kind: 'tree'|'mineral'|null, blocked }   ← blocked = 잠긴(티어 초과) 노드, 안내용
export function harvestNode(node, { kind, power = BARE_HAND.power, sink, maxTier = null })
//   → { ok, reason: 'tier'|'none'|null, kind, id, amount, felled, depleted }
export function harvestHint(node)                    // HUD 안내 문구
```

- **은닉 규칙**: `maxTier` 보다 높은 노드는 `canHarvestByHand` 가 false 이고 `harvestNode` 도 `reason: 'tier'` 로 거부한다(호출부가 뚫려도 방어).
- **`sink` 계약**: `{ economy, stats, audio, mineralsMined, woodChopped, mineralTypesMined }` — 나무는 `economy.addWood` + `stats.track('woodChopped'|'treesFelled')`, 광물은 `economy.addMineral` + `economy.addGold(round(value*0.1)*amount)` + `stats.track('mineralsMined')`. **채굴탑과 같은 회계**를 쓴다.
- `main.js` 의 `gatherSink()` 가 게임 컨텍스트를 이 형태로 넘긴다.

#### 4.22.2 `systems/admin-commands.js` — 관리자 명령어

```js
export const ADMIN_COMMANDS;   // [{ name, aliases[], usage, desc }] × 14
export const ADMIN_DEFAULTS = { gold: 100000, wood: 10000, mineral: 99, resources: 999 };
export function isAdminUser(user)                  // user.role === 'admin' || user.isAdmin === true
export function parseCommand(text)                 // → { ok, name, args[], raw, reason?: 'empty'|'unknown' }
export function findWeapon(q)                      // → { weapon, matches[] }  (id·이름 부분일치)
export function findMineral(q)                     // → { mineral, matches[] }
export function commandHelp()                      // → string[]
export function runAdminCommand(text, { game, user, isAdmin } = {})
//   → { ok, message, lines[], changed }
```

| 명령 | 별칭 | 기본값 | 동작 |
|---|---|---|---|
| `/도움말` | 도움말 · ? · h · 명령어 | — | 명령 14종 목록 |
| `/무기 <id\|이름>` | 무기 · w · 무기소환 | — | `game.ownWeapon` + `game.equipWeapon` |
| `/무기전부` | 무기전부 · 모든무기 · allweapons | — | 82종 전부 |
| `/돈 [수량]` | 돈 · 골드 · money · g · 돈소환 | 100,000 | `game.addGold` |
| `/목재 [수량]` | 목재 · 나무 | 10,000 | `game.addWood` |
| `/광물 <id\|이름> [수량]` | 광물 · 자원 · ore · minerals | 99 | `game.addMineral` |
| `/전체자원 [수량]` | 전체자원 · 자원전부 · 올인 · all | 999 | 골드·목재·광물 27종 |
| `/웨이브 <번호>` | 웨이브 | 30 | `waves.reset()` → `wave = n-1` → `forceStart()` (30 = 셀레스티얼 안내) |
| `/치유` | 치유 · 회복 · 힐 | — | 플레이어·기지(`base.heal`)·모든 포탑(`tower.heal`) |
| `/플라이 [켜기\|끄기]` | 플라이 · 비행 · 날기 · fly | 토글 | `game.adminFly(mode)` — 날개 없이 비행(마나 0) |
| `/날개 [id\|이름]` | 날개 · 윙 · wing · fairywings | 목록 | `game.wings.grant(id)` + 장착 (날개 8종) |
| `/가죽 [id\|이름\|전부] [수량]` | 가죽 · leather · 가죽소환 | 99 | `economy.addLeather` (5종 · 인자 없으면 전부) |
| `/장비 [id\|이름]` | 장비 · 가죽장비 · gear · leathergear | 전부 | `game.gear.grant(id, {equip:true})` + `game.applyGear()` (6종) |
| `/화살 [id\|이름\|전부] [수량]` | 화살 · arrow · 화살소환 | 500 | `economy.addArrow` (7종 · 인자 없으면 전부) |

- **권한**: `runAdminCommand` 는 `isAdmin`(또는 `isAdminUser(user)`)이 아니면 `{ ok: false, message: '관리자 전용 명령어입니다 (계정 role: admin)' }` 를 돌려주고 **아무 상태도 건드리지 않는다**.
- 없는 명령은 `reason: 'unknown'` + 도움말 라인을 함께 반환한다(콘솔이 그대로 출력).
- `game` 이 없거나 필요한 하위 시스템(`waves`/`player`)이 없으면 실패 메시지만 돌려준다(throw 금지).

#### 4.22.3 `ui/console.js` — 게임 안 콘솔

```js
export class AdminConsole {
  constructor({ game = null, user = null })
  get isOpen(); get lineCount(); get history;
  isAdmin(); toggle(); open(); close(); submit(text); log(text, kind); update(dt); dispose();
}
```

- DOM 계약: `.hud-console`(루트, `hidden` 로 표시 토글) · `[data-role="console-log"]` · `[data-role="console-input"]` · 힌트 행.
- **게이트**: `open()`/`toggle()` 은 `isAdmin()` 이 false 면 `game.notify('관리자 전용 콘솔입니다')` 만 띄우고 `false` 를 돌려준다.
- 키: `Enter` 실행 · `Escape` 닫기 · `↑`/`↓` 기록 · `Tab` 자동완성. `main.js` 의 입력기가 `isTypingTarget(activeElement)` 로 게임 핫키를 막으므로 콘솔에 타이핑해도 게임이 반응하지 않는다.
- `main.js` 배선: `` pressed('Backquote') || pressed('Slash') `` 로 토글, `Escape` 는 **콘솔이 열려 있으면 콘솔부터** 닫는다. 관리자로 접속하면 시작 시 사용법을 한 번 안내한다(`_adminHint`).
- `dispose()` 는 `parentNode ?? parent` 를 모두 확인해 어떤 DOM 구현에서도 루트를 떼어낸다(테스트 더블 호환).

#### 4.22.4 `ui/adaptive.js` — 적응형 해상도

```js
export const ADAPTIVE = { minScale: 0.55, lowFps: 50, highFps: 58, step: 0.08, interval: 1.5, warmup: 3, downgradeFps: 42, downgradeAt: 6 };
export function nextPixelScale({ current, avgFps, config = ADAPTIVE })   // 0 = 변화 없음
export function suggestPreset(avgFps, presets, currentId, { minFps = ADAPTIVE.downgradeFps } = {})  // → id | null
export function formatScale(scale)                                      // '82%'
export class AdaptiveResolution {
  constructor({ renderer, preset, config, onChange })
  get scale(); get pixelRatio(); setPreset(preset); apply(); update(dt, avgFps) → { changed, scale, pixelRatio }
}
```

- 규칙: `warmup`(3초) 동안은 건드리지 않고, `interval`(1.5초) 마다 평균 FPS 를 본다. 50 미만이면 0.08 내리고, 58 초과면 올린다(상한 `baseRatio = 1`). 하한 `minScale`(0.55)에서 멈춘다.
- 프리셋이 바뀌면 `setPreset` 이 배율을 100% 로 되돌린다(`main.js` 의 `applyPreset`).
- `suggestPreset` 은 **한 단계만** 내린다(무한 하향 금지) — `main.js` 는 시작 6초 뒤 1회만 호출한다(`_autoQualityDone`).

#### 4.22.5 청크 컬링 (`world/trees.js` · `world/minerals.js` · `world/world.js`)

- `CHUNK_SIZE`(나무 460 · 광물 340) · `CULL_MARGIN = 150`.
- 각 필드는 `_chunkOf(x,z)` / `_chunksFrom(map)` / `_buildInstances()` / `cullChunks(camera) → 보이는 청크 수` / `invalidateCull()` 를 노출한다. `_chunks[i] = { key, x, z, count, meshes[], on, shadow }`.
- 컬링 반경 = `min(preset.drawDistance, preset.fog.far) + CULL_MARGIN`. 청크가 꺼지면 소속 메시 `visible = false` + `castShadow = false`.
- `world.frustumCull(camera)` 가 두 필드의 `cullChunks` 를 호출하고, `applyQuality()`/`setPreset()` 은 `invalidateCull()` 로 다음 프레임에 강제 재계산한다.
- 광물은 **청크 × (저티어|고티어)** 로만 묶는다(재질 2종 공유, 종류별 색은 `instanceColor`). 나무는 도형별 지오메트리/재질을 공유한다.
- `shadowMap.autoUpdate = false` + `main.js` 의 `SHADOW_INTERVAL = 0.05` 주기 `needsUpdate` — 그림자 맵을 매 프레임 굽지 않는다.

### 4.23 요정의 날개 — 비행 장비 (`systems/wings.js` · `player/wings.js` · `player/player.js` · `data.js`)

> `systems/wings.js` 는 **THREE·DOM 비의존**(순수 로직), `player/wings.js` 는 **THREE 전용 뷰모델**이다. 판정·수치의 단일 출처는 `data.js` 의 `FAIRY_WINGS` 다.

#### 4.23.1 `data.js` — 날개 데이터

```js
export const FAIRY_WINGS;          // 8종 (티어 오름차순: T1~T8)
export const FAIRY_WING_BY_ID;     // { [id]: wing }
export const FAIRY_WING_DEFAULT;   // 'fairy_wings'
export const WING_FLIGHT_DEFAULTS; // { equipped:false, id:null, speed:1, lift:10, descend:12, drain:0, ceiling:100, flap:7 }
export const WING_GRADES;          // 8단계 등급표 (common→transcend)
export const WING_GRADE_BY_ID;     // { [gradeId]: grade }
export function wingGradeInfo(grade);   // { id, name, color, glyph, order } — 모르면 일반 등급
export function fairyWingById(id);
export function fairyWingTier(id);   // 1..8
export function nextFairyWing(id);   // 상위 티어 | null
export function fairyWingGrade(id);  // 날개의 등급 정보
export function fairyWingCount();    // 8
export function wingsByGrade(grade); // 그 등급의 날개들
export function wingsUpToTier(tier); // tier 이하 날개들
```

```js
// 항목 형태
{ id, tier, grade, name, glyph, desc,
  cost: { gold, wood?, minerals?, leather? },  // economy.spend 가 그대로 먹는 형태(leather 는 별도 원장)
  requires: null | 'fairy_wings',              // 업그레이드 체인(선형)
  flight: { speed, lift, descend, drain, ceiling },   // equipped/id 는 런타임에 채운다
  flap, color, accent, glow }
```

**등급 8단계**: `common`(일반) → `uncommon`(고급) → `rare`(희귀) → `hero`(영웅) → `legend`(전설) → `myth`(신화) → **`relic`(유물)** → `transcend`(초월).
CSS 클래스는 `rarity-*`/`r-*` 를 그대로 쓰고, `transcend` 만 §4.23.5 의 전용 색을 쓴다.

| id | 티어 | 등급 | 비용(가죽 포함) | speed | lift | descend | drain | ceiling |
|---|---|---|---|---|---|---|---|---|
| `fairy_wings` 요정의 날개 | 1 | common 일반 | 25,000G · iron 30 · quartz 20 · mana 5 | **1.27** | 11 | 13 | 18/s | 120 |
| `sakura_wings` 벚꽃 날개 | 2 | uncommon 고급 | 120,000G · blossom_crystal 5 · dream_petal 3 · thick_leather 4 | 1.40 | 12 | 15 | 9/s | 200 |
| `star_wings` 별의 날개 | 3 | rare 희귀 | 400,000G · time_shard 5 · frozen_hour 3 · scaled_leather 4 | 1.54 | 14 | 17 | 0 | 320 |
| `runic_wings` 룬 날개 | 4 | hero 영웅 | 900,000G · rune_shard 6 · scaled_leather 10 · dragon_leather 2 | 1.69 | 16 | 19 | 0 | 440 |
| `frost_wings` 설원 날개 | 5 | legend 전설 | 1,600,000G · frost_crystal 8 · dragon_leather 6 · rune_shard 10 | 1.85 | 18 | 21 | 0 | 560 |
| `volcano_wings` 화산 날개 | 6 | myth 신화 | 2,600,000G · heart_flame 10 · dragon_leather 10 · frost_crystal 8 | 2.02 | 20 | 24 | 0 | 680 |
| **`artifact_wings` 유물 날개** | **7** | **relic 유물** | 4,200,000G · timesand 12 · relic_leather 3 · heart_flame 12 | 2.20 | 23 | 27 | 0 | 800 |
| `aether_wings` 영겁의 날개 | 8 | transcend 초월 | 7,500,000G · aether_crystal 15 · relic_leather 6 · timesand 20 | 2.60 | 27 | 32 | 0 | 900 |

#### 4.23.2 `systems/wings.js`

```js
export function wingCostText(wing)        // '25,000 G + 철광석 30 …'
export function wingFlightText(wing)      // '속도 ×1.27 · 상승 11 m/s · 마나 18/s · 상한 120 m'
export function wingIds()                 // id[]
export function findWing(query, list)     // → { wing, matches[] }
export class WingSystem {
  constructor({ economy, fairies, audio, stats, onEvent } = {})
  get equipped(); get equippedName(); get count(); get forced();
  has(id); isEquipped(id); list(); best();
  canBuy(id); buy(id) → { ok, reason?, wing? }
  grant(id, { equip = true } = {}); equip(id); unequip(); toggleEquip(id = null);
  setForced(on);                    // 관리자 플라이 — 날개 없이 flight().equipped = true
  flight();                         // Player.setFlight 에 그대로 넣는 프로필
  toJSON(); fromJSON(data); dispose();
}
```

- `buy()` 는 `economy.canAfford(cost)` → `economy.spend(cost)` → `owned.add` → **자동 장착** 순서다. 실패 사유는 `'owned' | 'locked' | 'cost' | 'unknown'` 중 하나다.
- **UI 는 `buy()` 를 쓰지 않는다 — 정식 획득 경로는 제작대다(§4.25).** `buy()` 는 시스템 API/테스트용으로만 남는다.
- `equip(id)` 는 **보유하지 않은 날개를 거부**한다(관리자 소환은 반드시 `grant` 를 먼저 쓴다).
- `flight()` 반환: `{ equipped, id, name, speed, lift, descend, drain, ceiling, flap, color, accent, glow }` — `drain` 은 `forced` 일 때 항상 0.
- 이벤트(`onEvent`) `{type}`: `wing:buy` · `wing:equip` · `wing:unequip` · `wing:forced`.

#### 4.23.3 `player/wings.js` — 1인칭 뷰모델

```js
export class WingRig {
  constructor({ camera, audio = null })
  get visible(); get wingId(); get root();        // root = 카메라 자식 Group
  setProfile(profile);                            // id|color|accent 가 바뀔 때만 재생성
  setVisible(on);
  update(dt, { flying, speed, ascend, dive, mana } = {}) → { flap }
  dispose();
}
```

- `main.js` 가 `this.scene.add(this.camera)` 를 **반드시** 유지해야 뷰모델이 보인다(§3-4-1 HANDOFF 참고).
- 위치 계약: 좌우 그룹 `(±0.3, -0.16, -0.52)` — 카메라 **앞쪽**(−Z). 재질은 emissive 전용(점광원 0), 모든 메시 `frustumCulled = false`.
- `update` 인자의 `mana`(0~1)가 코어 발광·펄럭임 속도에 반영된다.

#### 4.23.4 `player/player.js` — 비행 추가분

```js
player.flight        // { equipped, id, speed, lift, descend, drain, ceiling, flap }
player.flying        // 현재 비행 중
get player.canFly    // flight.equipped && alive
get player.airborne  // !onGround
player.setFlight(profile)   // 병합 + 클램프(equlas), equipped:false → _foldWings()
player.onFlightStart / onFlightEnd   // 콜백(커스터마이즈 지점)
```

- 입력: `Space` 상승 · `ShiftLeft`/`ShiftRight` 하강. **입력이 없으면 `lift * 0.14` 만큼 가라앉는다**(호버링).
- 이륙 조건: `canFly && (Space 눌림 || 이미 공중)`. 지면 접촉 시 `_flyVy > 0.5`(상승 중)일 때만 호버를 유지하고, 아니면 `_foldWings()` 로 접힌다 → **다시 이륙하려면 `Space` 를 새로 눌러야 한다.**
- 마나: `drain > 0` 이면 초당 `drain` 소모하고, 같은 프레임에 `_regen` 이 회복(이동 5.5/s · 정지 13/s · `manaRegenMult`)을 더한다 — **실효 소모 = drain − 회복**. 0 이 되면 `_foldWings()` → 중력 낙하. T1 18/s(≈8초) · T2 9/s(≈29초) · T3 이상 0(무제한).
- 속도: 수평 속도에 `× flight.speed`(비행 중), 조작 계수 `0.62`(지상 1, 공중 `airControl`).
- 상한: 비행 중 `position.y ≤ flight.ceiling`. 착용 해제 시 즉시 중력.
- **`_integrate` 는 비행 중에만 `position.y` 를 복원한다** — `world.resolveCollision` 이 마지막에 y 를 지형 높이로 스냅하기 때문(`if (this.flying) this.position.y = altitude`). 이 줄이 비행의 필수 조건이다.
- `_die()`/`respawn()` 은 `flying`/`flightRoll`/`_flyVy` 를 초기화한다.
- 저장: `serialize()` 의 `wings`(= `wings.toJSON()`) · `load()` 는 `wings.fromJSON(data.wings)` + `game._applyFlight()`.

#### 4.23.5 UI 계약

- **인벤토리 패널**: `[data-role="wing-row"][data-wing-id][data-tier]` **8행**, 버튼 `[data-act="wing-goto-craft"|"wing-equip"|"wing-unequip"]`, 착용 행은 `.is-selected`. 배지 `[data-role="wing-tier"]` 텍스트는 `T{티어} · {등급명}`, 카드 래리티는 등급(`WING_GRADE_RARITY`)을 우선한다. **미보유 카드의 `[제작대에서 만들기]`(`data-wing`·`data-table`)를 누르면 `state.craft.table` 을 그 날개 레시피의 제작대로 바꾸고 제작 패널을 연다**(게임 이벤트를 내지 않는 순수 UI 이동). 카드에는 `제작대`(건설 여부 ✔/미건설)와 `선행 날개` 행이 추가된다. `wings` 시스템이 없으면 `FAIRY_WINGS` 기본값으로 그린다.
- **단축키**: `V` = `game.toggleWings()` (`KEYBINDS` **24행**).
- **HUD**: `[data-role="hud-stat-wings"]`(래퍼 `.hud-stat-wings` + `.is-flying`/`.is-equipped`) — 착용 시 이름, 비행 중 `비행 Nm`.
- **패널 이벤트**: `wing:equip {id}` · `wing:unequip {}` → `main.js` 핸들러가 `equipWing`/`unequipWings` 호출 후 `_render('inventory')`. **획득은 제작 패널의 `game.craftWing(id)` 직접 호출이다(`craft-make` 와 같은 방식).**

#### 4.23.6 관리자 명령 (14종으로 확장)

| 명령 | 별칭 | 동작 |
|---|---|---|
| `/플라이 [켜기\|끄기]` | 플라이 · 비행 · 날기 · fly | `game.adminFly(mode)` — `wings.setForced(on)` + `_applyFlight()` + 이륙 부스트(`velocity.y ≥ 4.5`). **마나 소모 0 · 상한 320m** |
| `/날개 [id\|이름]` | 날개 · 윙 · wing · fairywings | 인자 없으면 **8종** 목록. 인자가 있으면 `wings.grant(id, {equip:true})` + `game.applyFlight()` + 패널 갱신 |
| `/가죽 [id\|이름\|전부] [수량]` | 가죽 · leather · 가죽소환 | 인자 없거나 `전부` 면 **5종 × 수량**(기본 99). 이름이 있으면 `economy.addLeather(id, n)`. `findLeather(query)` 로 검색 |
| `/장비 [id\|이름]` | 장비 · 가죽장비 · gear · leathergear | 인자 없거나 `전부` 면 **6벌 전부 `grant(id,{equip:true})`** + `game.applyGear()`. 이름이 있으면 1종만. `findGear(query)` 로 검색 |

- 네 명령 모두 `isAdmin` 게이트를 그대로 통과해야 실행된다(§4.22.2). `/전체자원` 도 가죽 5종을 함께 지급한다.
- `runAdminCommand` 는 `game.applyFlight?.()` 를 호출한다. `main.js` 에 `applyFlight()` 공개 별칭이 있어야 관리자 소환 후 즉시 반영된다(§4.15).

### 4.24 가죽 · 가죽 장비 · 지형 야생 몬스터 (`data.js` · `systems/gear.js` · `systems/region-spawns.js` · `systems/economy.js` · `systems/waves.js`)

> `systems/gear.js` · `systems/region-spawns.js` 는 **THREE·DOM 비의존**(순수 로직). 수치의 단일 출처는 `data.js` 다.

#### 4.24.1 `data.js` — 가죽 · 장비 · 야생 몬스터

```js
export const LEATHER_TYPES;    // 5종 (티어 1~5) { id, tier, name, glyph, color, value, drop, desc }
export const LEATHER_TABLE;    // 종류별 요약(가치·드롭 문구)
export const LEATHER_BY_ID;
export function leatherById(id);      // 없으면 null
export function leatherTier(id);      // 0 = 없음
export function leatherForTier(tier); // 그 티어 이하 최고 가죽
export function leathersUpTo(tier);   // id[]

export const GEAR_SLOTS;       // 6곳: head · body · hands · waist · feet · back
export const GEAR_BONUS_KEYS;  // 비율 보너스 키 목록
export const GEAR_BONUS_LABELS;
export const LEATHER_GEAR;     // 6종 { id, name, slot, tier, grade, glyph, color, cost{ gold, leather }, bonus, desc }
export const LEATHER_GEAR_BY_ID;
export const GEAR_SET_BONUS;   // [{ count:2 }, { count:4 }, { count:6 }] — 착용 벌수별 세트 효과
export function leatherGearById(id);
export function gearSlotInfo(slot);
export function otherGearInSlot(id, slot);   // 같은 슬롯의 다른 장비
export function gearBonusText(bonus);        // '받는 피해 -10% · 마나 회복 +20%'
export function gearCostText(gear);          // '4,000 G + 질긴 가죽 6'

export const REGION_ENEMY_TYPES;   // 16종 — 웨이브 ENEMY_TYPES(11종)와 별도 배열
export const REGION_ENEMY_BY_ID;
export function isRegionEnemy(id);
export const REGION_MONSTERS;      // 편성표 9곳 = tier1..tier7 + cherry_garden + time_horizon
export const REGION_MONSTER_BY_ID;
export function regionMonsterRoster(regionId);  // { id, tier, power, interval, maxAlive, spawnRadius, despawnRadius, elite, types[] } | null
export function regionHasMonsters(regionId);
export function pickRegionMonster(regionId, rand);      // 종 정의 | null
export function regionMonsterLoot(type, rand);          // { leather:{id,amount}|null, mineral:{id,amount}|null }
export function waveEnemyLeather(type);                 // 웨이브 몬스터용 저확률 가죽 표

export const ENEMY_TYPE_BY_ID;     // 웨이브 몬스터만(11종)
export const BOSS_TYPE_BY_ID;
export const ALL_ENEMY_BY_ID;      // 웨이브 11 + 야생 16 = 27종 (스폰 경로 전용)
export function enemyTypeById(id);
export const ENEMY_TYPE_TOTAL;     // 27
```

- **야생 몬스터 종은 `region`(편성표 id)를 반드시 가진다.** 편성표의 `types[]` 는 그 지역 종만 담고, `REGION_ENEMY_BY_ID[t.id].region === roster.region` 이 항상 성립해야 한다(스모크가 검사).
- 야생 몬스터는 `leather: { id, min, max, chance }` 를, 히든 지역 종은 `bonus: { mineral, chance, amount }` 를 추가로 가진다.
- 웨이브 편성·시설 소환문의 종 풀(`_typePool`)은 `ENEMY_TYPES` + `minLevel` 만 쓴다 — **야생 몬스터는 절대 섞이지 않는다.**

#### 4.24.2 `systems/economy.js` — 가죽 원장(추가분)

```js
economy.leathers              // { [leatherId]: count } — 미네랄과 분리된 원장
economy.addLeather(id, n);    // 증가 후 총량 반환(음수·NaN·빈 id 방어)
economy.getLeather(id);       // 0 이상 정수
economy.totalLeather();       // 전 종류 합
economy.canAfford({ leather: { id: n } });   // 가죽까지 검사
economy.spend({ gold, minerals, wood, leather });  // 하나라도 부족하면 전부 취소
economy.toJSON()/fromJSON(data);   // leathers 포함
```

- **가죽을 `MINERAL_TYPES` 에 넣으면 안 된다** — 광물 27종 단언·`totalMinerals()`·제작 레시피 검증(`crafting.js` 의 id 검사)이 모두 깨진다.

#### 4.24.3 `systems/gear.js`

```js
export const GEAR_BONUS_KEYS;
export function emptyBonus();          // 모든 키 0
export function addBonus(target, bonus, weight = 1);
export function gearSlotText(slot);
export class GearSystem {
  constructor({ economy, audio, achievements } = {})   // 주의: stats 가 아니라 achievements 필드
  get count(); get equippedCount(); get pieces();
  has(id); isEquipped(id); equippedIn(slot); list(); canBuy(id);
  buy(id) → { ok, reason?, gear? };       // economy.spend 후 즉시 착용
  grant(id, { equip = true } = {});       // 관리자 소환
  equip(id); unequip(id); toggle(id); unequipAll(); clear();
  bonus();                                // 합산 비율 보너스(세트 포함)
  stats();                                // { pieces, equippedIds, sets[], ...bonus }
  toJSON(); fromJSON(data); dispose();
}
```

- **보너스는 전부 비율(0~1)** 이다. `maxHp`/`maxMana`/`manaRegen` 원본을 직접 쓰지 않는다.
- 같은 슬롯은 한 벌만 — `equip` 은 `equipped[slot]` 을 덮어쓴다. `bonus()` 는 장비별 보너스 + 세트 효과(2/4/6)를 합산한다.
- 생성자에 `stats` 를 넘기면 인스턴스 필드가 `stats()` 메서드를 가린다 — 반드시 `achievements` 로 넘긴다.
- 저장: `{ owned: string[], equipped: { [slot]: id } }`. 알 수 없는 id·슬롯은 조용히 버린다.

#### 4.24.4 `systems/region-spawns.js`

```js
export const ROAMER_DEFAULTS;   // { interval:7, maxAlive:10, spawnRadius:80, despawnRadius:400, elite:0.05, totalCap:80, grace:2.5, spawnInPrep:false }
export function roamerRoster(regionId);       // 편성표 + 기본값 병합 | null
export function isRoamer(enemy);              // roaming || spawnerKind==='region'
export function countRoamers(enemies, regionId?);
export function roamerSpawnPoint(rand, position, roster);   // 플레이어 주변 고리(±25%)
export function shouldDespawn(enemy, position, roster);
export class RegionSpawner {
  constructor({ rand, defaults } = {})
  enter(regionId); reset();
  update(dt, { position, regionId, phase, enemies, spawn, despawn })
  // → { region, spawned, despawned, skipped }
}
```

- `phase === 'prep'`(준비 시간)에는 `spawnInPrep` 이 참일 때만 스폰한다. `gameover` 는 항상 스폰하지 않는다.
- `spawn(opts)` 는 `{ regionId, typeId, x, z, wave, elite }` 를 받는다 — `main.js` 는 `(o) => waves.spawnRoamer(o)` 를 그대로 넘긴다.
- `despawn(enemy)` 는 `enemy.alive = false` 로만 표시한다(풀 반납은 `waves._prune()` 이 `despawn()` 으로 처리).

#### 4.24.5 `systems/waves.js` — 로밍 소환·가죽 지급(추가분)

> **적 풀 재사용 계약**: `Enemy` 는 타입별 풀(`POOL` — 키 `${typeId}|m|b`)을 재사용하므로 `reset()` 이 **소환 경로 표시를 모두 초기화**해야 한다.
> 초기화 대상: `roaming`(false) · `regionId`/`spawnerTier`/`leatherDrop`/`spawnerKind`(null) · `fromTower`(false) · `_waveCredited`(false).
> `fromTower` 가 새면 웨이브 정산(`_countAlive`/`_handleEnemyDeath`)에서 빠지고, `spawnerKind='region'` 이 새면 `isRoamer()` 가 참이 되어 지역 상한을 잡아먹는다.

```js
waves.spawnRoamer({ regionId, typeId?, x, z, wave?, elite? }) → Enemy | null
waves.roamersSpawned            // 누적 소환 수
waves._awardKillLeather(enemy)  // 모든 킬의 가죽 지급 단일 창구
DIRECT_HANDLER = { …, leatherGained: 'onLeatherGained', roamerSpawn: 'onRoamerSpawn' }
```

- `spawnRoamer` 는 `fromTower = true` · `spawnerKind = 'region'` · `roaming = true` · `regionId` · `spawnerTier` · `leatherDrop` 을 세팅한다. **`_aliveCount`/`_queue`/`_waveTotal`/`spawnedTotal` 을 건드리지 않는다.**
- `spawnRoamer` 는 편성표가 없는 지역·`gameover`·`enemies.length >= maxAlive` 에서 `null` 을 돌려준다.
- 가죽 지급은 `_awardKillGold` → `_awardKillLeather` 순서로 **골드와 같은 킬 경로**에서 일어난다(웨이브·소환문·로밍 모두). `stats.track('leatherGathered')` + `onLeatherGained` 이벤트를 낸다.
- `Enemy.reset()` 은 `roaming/regionId/spawnerTier/leatherDrop` 을 매번 초기화한다(풀 재사용 대비). 타입 조회는 `ALL_ENEMY_BY_ID` 를 쓴다.

#### 4.24.6 UI 계약(추가분)

- **인벤토리 패널**: 가죽 카드 `[data-role="leather-row"][data-leather-id][data-tier]` **5장**, 장비 카드 `[data-role="gear-row"][data-gear-id][data-slot][data-tier]` **6장**, 버튼 `[data-act="gear-buy"|"gear-equip"|"gear-unequip"|"gear-unequip-all"]`. 착용 카드는 `.is-selected`, 재료 부족 버튼은 `disabled`.
- **HUD**: `[data-role="hud-stat-leather"]`(🟫 가죽 총량). 적 카운터는 야생을 빼고 세며 야생이 있으면 `{생존} / {전체} +야생 {N}`, 지역 칩 이름 뒤에 `· 야생 {N}` 을 붙인다.
- **패널 이벤트**: `gear:buy {id}` · `gear:equip {id}` · `gear:unequip {id}` · `gear:unequip-all {}` → `main.js` 핸들러가 `buyGear`/`equipGear`/`unequipGear`/`unequipAllGear` 를 호출한다.

### 4.25 요정의 날개 제작 (제작대) — `crafting.js` · `systems/crafting.js` · `main.js` · `ui/panels.js`

> **날개는 사지 않는다 — 제작대에서 만든다.** 날개 1종 : 제작대 1곳(1:1 대응, T1~T7 → `forge_tN`, T8 → `garden_of_dreams`).

#### 4.25.1 `crafting.js` — 레시피(추가분)

```js
export const WING_TABLE_BY_TIER;   // { 1:'forge_t1', …, 7:'forge_t7', 8:'garden_of_dreams' }
export const WING_RECIPES;         // 8종 { id:'craft_<wingId>', type:'wing', wingId, table, tier, grade, requires, cost{gold,minerals,leather}, desc }
export const WING_RECIPE_BY_WING;  // { [wingId]: recipe }
export const WING_RECIPES_BY_TABLE;// { [tableId]: recipe[] } — 제작대별 0~1종
export const WING_RECIPE_COUNT;    // 8
export function wingRecipeFor(wingId);      // 없으면 null
export function wingRecipesForTable(tableId); // recipe[]
export function isWingRecipe(recipe);       // 무기 레시피와 구분
```

- **비용의 단일 출처는 `data.js` 의 `FAIRY_WINGS[].cost`** 다 — `WING_RECIPES[].cost` 는 복사본이며 값이 항상 같아야 한다(스모크 검사).
- `costText(cost)` 는 이제 **가죽 이름까지** 출력한다(`골드 120,000 · 벚꽃 결정 5 · 꿈의 꽃잎 3 · 두꺼운 가죽 4`).
- `validateCrafting()` 이 날개까지 검증한다: 레시피 8종 · 제작대 존재/티어 일치 · 골드>0 · `minerals`/`leather` id 실재 · `requires` 가 데이터와 동일 · 모든 날개에 레시피 1개.

#### 4.25.2 `systems/crafting.js` — 제작 API(추가분)

```js
export class CraftingSystem {
  // …기존 무기 API(canCraft/craft)는 그대로다.
  get craftedWingCount(); get wingRecipes();
  canCraftWing(wingId, ctx) → { ok, recipe?, error? }
  craftWing(wingId, ctx) → { ok, wing?, recipe?, error? }
  wasWingCrafted(wingId); wingsFor(tableId); wingRecipe(wingId);
  toJSON()  // { tables, crafted, craftedWings }
}
```

- `ctx` 는 무기와 공유하되 **`hasWing(id)` · `onWingCrafted(id)`** 두 훅을 추가로 쓴다(`main.js._craftingContext`).
- 게이트 순서: ① 레시피 존재 → ② `hasWing(wingId)` 면 거부 → ③ `isBuilt(recipe.table)` → ④ `requires` 보유 → ⑤ `economy.canAfford(cost)`. `craftWing` 은 통과 후 `economy.spend(cost)` → `craftedWings.add` → `onWingCrafted(id)`.
- **작업대(workbench) 경로는 날개에 적용되지 않는다** — `canCraftWing` 은 작업대를 보지 않는다.
- 무기 제작 기록(`crafted`)과 **분리**된 `craftedWings` 를 쓴다(무기 카운트 오염 방지). `fromJSON` 은 `FAIRY_WING_BY_ID` 로 id 를 검증한다.

#### 4.25.3 `main.js` — 배선

```js
game.craftWing(id)        // → crafting.craftWing(id, ctx) · 성공 시 panels.refresh() · 실패 시 notify(error)
game.wingRecipeFor(id)    // → 그 날개 레시피(제작대 안내용)
```

- `_craftingContext()` 에 `hasWing: (id) => wings?.has?.(id)` 와 `onWingCrafted: (id) => { wings.grant(id,{equip:true}); applyFlight(); track('wingsCrafted',1); audio; notify }` 가 추가된다.
- `panels.on('wing:craft')` 배선은 없다 — 제작 패널이 `craft-make` 처럼 `game.craftWing` 을 **직접** 호출한다. `_onClick` 은 `[data-act="craft-wing"][data-wing]` → `_craftWing(wingId)` → `state.craft.message`/`_toast`.

#### 4.25.4 UI 계약(제작 패널)

- 티어 제작대 탭: `[data-role="craft-wing-row"][data-wing-id][data-table][data-tier]` **0~1행**, 버튼 `[data-act="craft-wing"][data-wing]`(재료 부족·미건설·선행 미충족이면 없음/비활성). 카드 본문: 등급 · 비행 성능 · 선행 날개 · 제작 비용 · 제작대(✔/미건설).
- 작업대 탭: 날개 카드 없음 + `날개는 작업대에서 만들 수 없습니다` 안내 행.
- 제작 패널 헤더에 `🪶 요정의 날개 8종 — 같은 티어 제작대에서 만듭니다` 행이 있다.

### 4.26 마우스 포인터 정책 (`ui/pointer-lock.js` · `player/player.js` Input · `ui/panels.js` · `ui/hud.js` · `ui/console.js`)

**문제**: 포인터가 잠겨 있는 동안 브라우저는 커서를 숨기고 마우스 이벤트를 캔버스로 보낸다.
그래서 인벤토리(`I`)·제작(`C`)·건설(`B`) 패널을 열어도 커서가 없어 버튼을 누를 수 없었고,
패널 위 클릭이 `Input._onMouseDown` 을 통해 무기 휘두르기·건설로 이어졌다.

**정책(단일 출처)**: `syncPointerLock({ state, input, panels, admin })` — 순수 함수, DOM 비의존.

- `state === 'playing'` 일 때만 동작한다(메뉴·일시정지·게임오버는 각자 관리).
- UI 열림 판정: `panels.hasOpen() || admin.isOpen`.
- 열려 있으면 `exitPointerLock()` → `'unlock'`, 닫혀 있으면 `requestPointerLock()` → `'lock'`, 이미 원하는 상태면 아무것도 하지 않고 `null`.
- 호출부: `main._syncPointerLock()` — `panels.on('open'|'close')`, `togglePanel()`, `closePanels()`, 건설 모드(`B`) 토글, `console.close()`.

**Input 가드**(`player/player.js`): `_onMouseDown` 이 ① `_isUiTarget(e)` — `e.target` 이 캔버스가 아니면 무시,
② `!this.locked && !this.lookWithoutLock` 이면 무시. `mouseup` 은 UI 여부와 무관하게 항상 버튼을 해제한다.
`requestPointerLock()` 은 반환 Promise 의 거부를 삼킨다(`p.catch(() => {})`) — 재잠금 실패가 콘솔 오류로 남지 않는다.

**재잠금 실패 처리**: 브라우저가 사용자 ESC 해제 직후 재잠금을 막을 수 있다. 이때는 화면(캔버스)을 한 번 클릭하면 잠긴다 —
단 `panels.hasOpen()`/`admin.isOpen` 인 동안에는 캔버스 클릭으로 잠그지 않는다(커서 유지).
`quit()` 은 상태와 무관하게 `exitPointerLock()` 을 호출한다(메뉴는 커서가 필요하다).

**파생 계약**: `panels.hasOpen()`/`currentId` — 인자 없는 `isOpen()` 은 `id` 가 없어 **항상 false** 이므로 "아무 패널이나 열림" 판정에 쓰면 안 된다.
HUD 조준선은 `game.ui.panels.hasOpen()` 이 참이면 숨는다(`hud.js`).

> 자동 검증: smoke(정책 7 + 배선 11) · headless(Input 가드 8, 실제 `Input` 인스턴스) · ui(panels.hasOpen 3 · 조준선 2).

### 4.27 멀티플레이 공유 주소 (`server/net-info.js` · `server/index.js` `GET /api/net` · `client/src/net.js` `netInfo` · `ui/lobby.js`)

**문제**: 초대 링크를 `location.origin` 으로만 만들면 서버를 켠 PC 의 링크가 `http://localhost:3001/?room=K7F2` 가 된다.
`localhost` 는 **받는 사람의 PC** 를 가리키므로 다른 사람은 그 링크로 절대 들어올 수 없다.

**서버 계약**: `GET /api/net` (인증 불필요 — 로그인 전에 필요하다)
```json
{ "ok": true, "host": "0.0.0.0", "port": 3001, "protocol": "http",
  "urls": ["http://192.168.41.53:3001"], "primary": "http://192.168.41.53:3001", "publicUrl": null }
```

- `server/net-info.js` 는 **순수 모듈** — `pickLanAddress(os.networkInterfaces())` 로 후보를 고른다:
  IPv6·루프백(`127.`·`internal`)·링크로컬(`169.254.`)·멀티캐스트 제외,
  `192.168.` → `10.` → `172.16-31.` → 그 외 순위, **가상 어댑터(VMware·VirtualBox·WSL·tailscale·docker…)는 실제 랜카드 뒤로** 밀린다.
- `PUBLIC_URL` 환경변수가 있으면 그 주소가 `primary`(터널·포트포워딩·도메인).
- 서버는 `HOST`(기본 `0.0.0.0`)에 바인딩하므로 같은 네트워크에서 접속할 수 있다.

**클라이언트 계약**:
- `netInfo.load()` 가 `/api/net` 을 한 번 받아 캐시한다(실패해도 조용히 지금 주소를 쓴다).
- `resolveShareOrigin({ origin, lanUrls, protocol })` — 접속 주소가 **루프백이 아니면 그대로**(터널·도메인·LAN),
  루프백이면 서버가 알려준 LAN 주소(프로토콜이 같으면 우선), 그것도 없으면 지금 주소.
- `isLoopbackHost`/`isLoopbackOrigin` — `localhost`·`*.localhost`·`127.x`·`::1`·`0.0.0.0`·빈 값은 "이 PC 전용".
- 로비는 링크가 이 PC 전용이면 `[data-role="link-hint"]` 에 ⚠️ 경고를 넣는다(`lobby-hint warn`).
- 소켓 주소는 접속한 `location.origin` 그대로이므로 **터널 주소로 접속하면 터널이 그대로 게임 서버**가 된다.

> 자동 검증: smoke(순수 17 + 배선 8) · e2e(6: `/api/net` 계약·localhost 금지·공유 링크 결합) · ui(4: LAN 링크·경고·폴백) · `npm run lancheck`(9: 공유 주소 → 초대 링크 → 참가 → game:start, 서버 필요).

### 4.28 건설창 선택 계약 (`ui/panels.js` `_pickTurret`/`markBuildSelected` · `main.js` `selectTurret`/`_closeBuildPanel`)

**요청**: 포탑을 고르면 건설창이 닫혀야 한다(커서가 사라져 조준·설치를 못 하는 문제).

- `panels._pickTurret(typeId)` — `state.build.selected` 갱신 → `build:select` 방출 → **현재 패널이 `build` 면 `close()`**
  (`main.js` 의 `build:select` 리스너가 `selectTurret` 을 부르므로 건설 모드는 그대로 유지된다).
- `main.selectTurret(typeId)` — 단축키 `1~9`·휠(`_cycleTurret`)·관리자 명령도 같은 경로다.
  `panels.markBuildSelected(typeId)` 로 카드 하이라이트를 맞추고 `_closeBuildPanel()` 을 부른다.
- `main._closeBuildPanel()` — **`panels.currentId === 'build'` 일 때만** `close()` + `_syncPointerLock()`(재잠금).
  다른 패널이 열려 있으면 손대지 않는다. **`build.active` 는 절대 건드리지 않는다**(건설 모드 유지 → 좌클릭 설치).
- `panels.markBuildSelected(typeId)` — 열려 있으면 다시 그리고, 닫혀 있으면 상태만 기억한다(다음에 열 때 하이라이트).
- 휠은 `Input._onWheel` 의 `if (!this.locked) return;` 로 **건설창이 열린 동안(잠금 해제) 아무 일도 하지 않는다** —
  패널 목록 스크롤과 충돌하지 않는다.

> 자동 검증: smoke 7(계약) · headless 2(휠은 잠금 중에만) · ui 3(카드 선택 → 닫힘 · 이벤트 유지 · 하이라이트 동기화).

### 4.29 열린 방 목록 (`GET /api/rooms` · `Room.summary` · `RoomManager.listPublic`)

**요청**: 같은 서버의 열린 방을 메인 화면에 보여주고, 코드 없이 클릭으로 참가.

- `Room.summary(now)` — 방 하나를 `{ code, mode, seed, difficulty, phase, players, maxPlayers, host, private, joinable, ageSec }` 로 요약.
  `host` 는 `hostId` 플레이어의 닉네임, `joinable = phase === 'lobby' && players < maxPlayers`.
- `RoomManager.listPublic({ includeFull = true })` — **비공개 방 제외 · 로비 단계만** → 참가 가능 우선 → 인원 많은 순 → 코드 순으로 정렬.
- `GET /api/rooms` (인증 불필요, `/api/net` 옆) → `{ ok, rooms: [...], count, now }`.
- `room:create` 는 `private: true` 를 받아 방에 저장한다(`Room.private`). 비공개 방도 **코드/초대 링크로는 정상 참가**되고, 목록에만 뜨지 않는다.
- 클라이언트: `net.js` 의 `roomList` 캐시(최소 1.5초 간격) → `menu.js` 가 메인 화면에서 **4초마다** 갱신하고 `[data-act="menu-room-join"]` 클릭 시 `multiplayer:join { code }` 을 emit 한다(초대코드 입력 경로와 동일한 흐름).

### 4.30 터널 자동 실행 (`npm run dev:tunnel`)

`tools/tunnel-info.mjs`(순수) + `tools/dev-tunnel.mjs`(런처).

- `parseTunnelUrl(text)` — 로그에서 공개 주소 추출(무료 터널 도메인 우선, 문서·다운로드 링크 제외).
- `tunnelPlan({ provider, port, platform, env })` — cloudflared / localtunnel(npx) 명령·인자·설치 안내. `TUNNEL_CMD`·`TUNNEL_ARGS`(JSON) 로 덮어쓰기(자동 테스트).
- `pollForTunnelUrl({ read, isAlive, sleep, now, timeoutMs })` — **주입된 sleep/시계**로만 동작해 부수효과 없이 검증 가능. 결과는 `found` / `exited` / `timeout`.
- 런처는 터널 출력을 **파이프가 아니라 `.tmp/tunnel-<port>.log` 파일**로 받는다(파이프 spawn 이 막힌 환경 대응) → 주소를 찾으면 `PUBLIC_URL`·`TUNNEL_URL` 을 설정하고 `tools/dev.mjs` 를 import 해 서버를 띄운다.
- 터널 실패 시 **설치 안내 + 로그 꼬리**를 출력하고 LAN 모드로 계속 진행한다(서버는 항상 뜬다).

### 4.31 오버레이 레이아웃 (창이 좁아도 위쪽이 잘리지 않는다)

- `.panel-overlay` / `.menu-overlay` 는 **`align-items: flex-start` + `overflow-y: auto`** — 넘칠 때 위쪽이 잘려 스크롤로도 닿지 못하는 flex 중앙 정렬 문제를 없앤다.
- 세로 가운데 정렬은 자식의 **`margin: auto`**(`.panel` · `.menu-shell`)가 담당한다: 창이 넉넉하면 가운데, 좁으면 위에서부터.
- `.panel` 의 `max-height` 는 `min(88vh, 900px)` → **`min(88dvh, 100%, 900px)`** 로 덮어쓴다(미지원 브라우저는 앞 선언 사용). `100%` 는 오버레이 높이 기준이라 모바일 주소창·화면 확대에서도 머리글(제목·✕)이 화면 밖으로 나가지 않는다. 좁은 화면(`max-width: 900px`)은 `min(94dvh, 100%)`.
- 두 오버레이는 `padding-top/bottom: max(…, env(safe-area-inset-*))` 로 노치·홈 인디케이터를 피한다.
- `.menu-rooms-list` 는 `max-height: min(30vh, 300px)` + 자체 스크롤 — 방이 많아도 메인 화면이 끝없이 길어지지 않는다(위 잘림 재발 방지).
- 회귀 방지: `tools/smoke.mjs` 의 **레이아웃 계약 7체크**가 위 규칙을 CSS 텍스트로 검증한다.
- `PanelManager._setOpen(id, true)` 는 **패널 내용 스크롤을 맨 위로** 되돌린다(이미 열려 있으면 유지). `tools/ui-dom-smoke.mjs` 2체크가 검증한다.

### 4.32 맨손 시작 (`data.js` `FIST_WEAPON` · `player/weaponRig.js` · `main.js`)

- `data.js`: `FIST_WEAPON`(id `'fists'`, name 맨손, kind melee, damage 6, range 2.5, cooldown 0.7, `fist: true`) · `FIST_WEAPON_ID` · `weaponOrFist(id)`(null/'fists' → 맨손, 미지 id → null).
  **맨손은 `WEAPONS`/`WEAPON_BY_ID`/`WEAPON_MOTIONS` 에 넣지 않는다** — 수집 82종·가챠·제작·업적 계산이 흔들리지 않게 하기 위함(스모크가 검증).
- `WeaponRig.equip(id)` 는 `weaponOrFist(id)` 를 쓰고, 맨손이면 **메시 없음 + 모션 없음**(이전 무기의 애니메이션 핸들을 `emptyAnimated()` 로 비운다). `constructor({ weaponId = null })` 기본값도 맨손.
- `main.js`: `_defaultOwned()` → **빈 Set**(보유 0종) · `this.weapons = { owned, equipped: FIST_WEAPON_ID }` · `weaponList()` 는 **보유 + 쓸 수 있는 무기만**(WEAPONS 폴백 금지) · `equipWeapon(null|'fists')` 는 보유·전직 잠금 검사를 건너뛴다 · `_attack()` 은 `weapon.fist` 면 `cooldown`(0.7s)마다 `_meleeStrike(FIST_WEAPON)` 을 직접 호출(공격 모션이 없으므로) · `onCrafted` 는 `equipWeapon(id, { silent: true, instant: true })` 로 **자동 장착**.
- 시작 자원은 `gold 1200 · wood 400`(첫 작업대 650 G·160 목재 + 첫 제작 450 G·150 목재를 바로 할 수 있게).
- 레거시 세이브는 `weaponsOwned` 를 그대로 복원하므로 기존 보유 무기가 유지된다.

### 4.33 마법부여 (`systems/enchant.js` · 시설 `facility_enchanter` · `ui/panels.js` `enchant` 패널)

```js
export const ENCHANT_MAX_LEVEL = 5;
export const ENCHANT_DAMAGE_PER_LEVEL = 0.08;        // 레벨 1당 피해 +8%
export const ENCHANT_ELEMENTS = [ /* 14종: id·name·icon·grade·cost{gold,minerals}·desc */ ];
export function enchantCost(elementId, level)        // 1레벨 기준가 × level
export function enchantDamageMult(level)             // 1 + 0.08 × level
export class EnchantSystem {
  constructor({ economy, stats })
  elements  // 14속성 복사본
  count     // 부여된 무기 수
  stateFor(weaponId)            // {element,level,name,icon,damageMult,percent,status,color,maxed,nextCost} | null
  costFor(weaponId, elementId)  // 다음 부여 비용·결과 레벨(같은 속성 → 레벨업, 다른 속성 → 1레벨)
  canEnchant(weaponId, elementId, ctx) // ctx{hasWeapon:(id)=>bool, hasEnchanter:bool}
  enchant(weaponId, elementId, ctx)    // economy.spend(비용) → applied.set(무기별 {element,level})
  bonusFor(weaponId)            // {element,level,damageMult,status,color} — 전투 반영값
  list() / clear(id) / toJSON() / fromJSON(o)
}
export function validateEnchantData()        // 데이터 무결성(스모크가 호출)
```

- **건물 게이트**: `ctx.hasEnchanter === false` 면 `canEnchant` 가 `{ ok:false, error:'마법부여대를 먼저 건설해야 합니다…' }` 를 돌려준다. `main.js` 의 `_enchantContext()` 가 `hasWeapon`(보유) · `hasEnchanter`(`enchanterBuilt()`) 를 넘긴다.
- 시설 `facility_enchanter`(kind `enchanter`, 4,800 G · 목재 1,100 · 은 8 · 수정 6 · 마나 5, hp 460, range 12) — `enchanterBuilt()`/`nearEnchanter(reach=3.4)`/`nearestEnchanter()` 가 판정한다.
- **전투 반영**: `_meleeStrike` 의 피해 = `무기 피해 × 전직 배율 × 장비 배율 × enchantDamageMult`, 속성은 `enemy.takeDamage(power, enchant.element ?? weapon.element, 'player')` 로 전달된다.
- **저장**: `save` 의 `enchant` 필드(`toJSON`) · `load` 의 `this.enchant?.fromJSON?.(data.enchant)`.
- **UI**: `PANEL_IDS` 에 `'enchant'` 추가(→ 15개), 제목 `마법부여`. `E` 는 마법부여대 근처에서 이 패널을 열고 그 밖에서는 부여대(가챠)를 연다. 무기 선택(`data-act="enchant-pick"`) · 속성 카드 + 부여(`data-act="enchant-apply`) · 미건설 시 `data-act="panel-open" data-panel="build"` 안내. 무기 카드(`_weaponCard`)에 부여 상태와 `data-act="enchant-goto"` 버튼이 붙는다.

### 4.34 건물 회전 (`systems/turrets.js` `yaw` · `main.js` `X`/`Shift+X` · `server/index.js` `turret:rotate`)

- `Turret`: `setYaw(yaw)`(정규화 후 `mesh.rotation.y` 반영) · `rotateBy(delta)` · `get yawDegrees` · `toJSON()` 에 `yaw: num(this.yaw, 0)` · `fromJSON` 의 재구성 옵션 `yaw`.
- `TurretSystem.rotate(turretId, delta)` / `setYaw(turretId, yaw)` → `{ ok, yaw, degrees, turret }`(없는 id 는 `ok:false`). `place(typeId, position, ownerId, { yaw })` 로 설치 시 각도를 지정한다.
- `main.js`: `TURRET_ROTATE = { reach: 9, cone: 1.5, match: 1.6 }` · `this.build.yaw`(미리보기) · `rotatePreview(dir)`(45° = `Math.PI/4`) · `_aimedTurret()`/`rotateAimedTurret(dir)` · `rotateTurret(id, dir)`(→ `net.sendTurretRotate`) · `applyNetGameEvent(ev)`(`turret:rotate` 수신, id 매칭 실패 시 `_turretNear` 위치 매칭).
- **키**: `X` = 시계 방향 45°, `Shift+X` = 반대. `R` 은 기본적으로 무기 궁극기지만, **건물을 조준했거나 건설 미리보기 중이면 홀드 = 부드러운 연속 회전**(§4.37).
- `net.js` `sendTurretRotate(turret)` → 서버 `turret:place` 핸들러 안의 `socket.on('turret:rotate')` 가 방 전체에 `{ type:'turret:rotate', payload:{ turretId, yaw, x, y, z }, from }` 로 중계한다(e2e 검증).
- HUD: 건설 중 `X 방향 N° · 좌클릭 설치`, 설치된 건물 조준 시 `X <건물> 회전 · Shift+X 반대`.

### 4.35 캐릭터 만들기 — 멀티플레이 외형 (`client/src/character.js` · `ui/menu.js` · `ui/lobby.js` · `main.js` · `server/game/Room.js`)

- **단일 출처 `client/src/character.js`** (Three.js·DOM 비의존 순수 모듈):
  - `CHARACTER_NAME_MAX = 16` · `CHARACTER_STORAGE_KEY = 'fortress.character.v1'` · `DEFAULT_SKIN_ID = 'guardian'` · `DEFAULT_CHARACTER = { name: '', skin: DEFAULT_SKIN_ID }`.
  - `CHARACTER_SKINS` **8종**: `guardian 수호자 🛡️` · `knight 기사 ⚔️` · `mage 마법사 🧙` · `archer 궁수 🏹` · `rogue 도둑 🗡️` · `alchemist 연금술사 ⚗️` · `bard 음유시인 🎻` · `fairy_friend 요정의 친구 🧚` — 각 `{ id, name, icon, color, accent, desc }`.
  - `characterSkin(id)` — **소유 키만** 인정(`hasOwnProperty`), `__proto__`/`constructor`/`prototype` 등은 `null` → 기본 외형으로 대체.
  - `sanitizeCharacterName(값)` — 문자열화 → 개행/탭/중복 공백 정리 → 16자 절단. `sanitizeCharacter(값, fallback)` — 외형·이름 정리(이름 비면 `fallback`, 그도 비면 `'수호자'`).
  - `characterColors(값)` → `{ color, accent }`(항상 유한) · `characterLabel(값)` → `"🧙 이름"`(이름 없으면 `(이름 없음)`) · `characterPayload(값, fallback)` → 서버로 보내는 `{ name, skin, icon, color, accent }` · `sanitizeRemoteCharacter(값)` → 남에게 받은 값도 같은 규칙으로 재살균.
  - `createCharacterStore({ storage })` → `{ load(fallback), save(값), clear() }`. storage 가 없거나 `getItem/setItem` 이 던져도 **예외를 밖으로 내보내지 않는다**(헤드리스·시크릿 모드 안전).
  - `validateCharacterData()` — 데이터 자체 점검(외형 8종·id/색 유효·오염 입력 거부·색 유한). `smoke`/`bugtest3` 가 호출한다.
- **서버 재살균**(`Room.sanitizeCharacter`): 스킨 `/^[a-z][a-z_]{1,23}$/` + `defaults` 소유 키 검사 → 아니면 `guardian`, 색은 `hex()` 로 `0..0xFFFFFF` 클램프, 아이콘은 `sanitizeText(값, 4)`. `defaults` 는 클라이언트와 같은 **8종 기본 색/아이콘 표**를 갖는다(색을 안 보내도 같은 모습).
- **전송 경로**: `room:create`/`room:join` payload 의 `character` → `server/index.js` → `RoomManager.joinRoom(code, socket, nickname, character)` → `Room.addPlayer(socket, nickname, character)` → `serialize()`(로비 `room:state`)와 `snapshot()`(인게임)에 `character` 포함.
- **UI**: 메인 화면 `TABS` 에 `character: '🧍 캐릭터'`(총 4탭) · 이름 입력 `data-field="character-name"`(16자 클램프) · 외형 카드 8장 `data-act="character-skin" data-skin` · `data-act="character-random"` · `data-act="character-save"` · 미리보기 `data-role="character-preview"` · 저장 시 `character` 이벤트 + 안내 문구. 로비 entry 카드에 `data-role="lobby-character"` 행과 `data-act="lobby-character"`(→ `character` 이벤트, 메인 화면 캐릭터 탭으로 이동).
- **플레이 반영**: 로비 `_nickname()` 은 캐릭터 이름 → 계정 닉네임 → 기본 순. `main.js` `RemotePlayers._make/_applyLook` 가 몸 색 = `color`, 머리 색 = `accent`, `_nameTag()` 캔버스 스프라이트에 아이콘 + 이름(DOM 없는 헤드리스에서는 `null` 반환).
- **계약**: 외형은 **꾸미기 전용** — 능력치·판정에 영향을 주는 필드를 추가하지 않는다(형평성). 클라이언트가 보낸 값은 **서버가 항상 다시 살균**한다.

### 4.36 로그인 후 메인 화면 전환 (`ui/panels.js` `_scheduleAuthClose` · `main.js` `auth:done` · `ui/menu.js` `flash`)

- `panels.js` `_authSubmit` 성공 분기 → `this._scheduleAuthClose(kind)` + `_render('auth')` (환영 문구를 잠깐 보여 준다).
- `_scheduleAuthClose(kind)` — **420ms** 뒤 `this.close?.()` + `this.emit('auth:done', { kind, user })`. 타이머는 `unref?.()` 로 프로세스 종료를 막지 않는다. 연속 제출 시 이전 타이머를 지우고 새로 건다.
- `main.js` `panels.on('auth:done')` → `_adoptAccountName()`(캐릭터 이름이 **비어 있을 때만** 계정 닉네임 채택) → 메인 화면 상태(`state === 'menu'`)면 `menu.show('main')` + `menu.flash()`.
- `menu.flash()` — `#menu-root` 의 `.menu-shell` 에 `menu-enter` 클래스를 붙이고 리플로우 후 제거(900ms). `styles.css` 의 `@keyframes menuEnter`(살짝 떠오르는 연출) + `@media (prefers-reduced-motion: reduce)` 에서 애니메이션 없음.

### 4.37 부드러운 건물 회전 (`R` 홀드) — `systems/turrets.js` · `main.js`

- `TURRET_ROTATE = { reach: 9, cone: 1.5, match: 1.6, holdSpeed: 2.1, netHz: 12 }` — 조준 사거리/원뿔/위치 매칭/초당 회전량(rad)/중계 주기.
- `Turret.setYaw(yaw, { smooth })` — 논리 `yaw` 는 **즉시** 정규화해 반영하고, `smooth` 면 `yawTarget = yaw` 만 세운다. `Turret.rotateBy(delta, opts)` 도 같은 규칙.
- `Turret._followYaw(dt)` — `mesh.rotation.y` 를 `1 - Math.exp(-14 * dt)` 로 `yawTarget` 에 수렴(차이 `< 0.0025` 면 스냅 후 `yawTarget = null`). `TurretSystem.update()` 가 매 프레임 호출한다. 저장/복원(`toJSON`/`fromJSON`)에는 `yaw` 만 실리고 `yawTarget` 은 남지 않는다.
- `TurretSystem.rotate(turretId, delta, opts)` / `setYaw(turretId, yaw, opts)` — `opts` 를 그대로 `Turret` 에 전달(기존 `${ ok, yaw, degrees, turret }` 반환 유지).
- `main.js` `_updateHoldRotate(dt, { shift })` — `KeyR` 홀드 중 한 프레임 step = `holdSpeed * clamp(dt, 0, 0.1) * (shift ? -1 : 1)`. 건설 모드(`build.active`)면 `build.yaw` + 미리보기 고스트, 아니면 **조준한 건물**(`_aimedTurret()`)을 `this.turrets.rotate(id, step, { smooth: true })` 로 회전. 처음 한 번만 안내 토스트를 띄우고, 서버 중계는 `1 / netHz`(12Hz)로 묶는다(`net.sendTurretRotate`).
- **`R` 우선순위**: `build.active || _aimedTurret()` 이면 **회전**, 그 외에는 §4.34 그대로 **무기 궁극기**(`useUltimate()`). `X` = 45° 즉시 회전(`Shift+X` 반대)은 그대로 유지된다.
- 릴레이 수신(`applyNetGameEvent` 의 `turret:rotate`)은 `setYaw(id, yaw, { smooth: true })` 로 반영하고, 터렛 id 가 클라이언트마다 다르므로 실패 시 `_turretNear(p)` 위치 매칭(`match: 1.6`)을 쓴다.

### 4.38 전력망 — `data.js` `POWER` · `systems/power.js` · `systems/turrets.js`

- `POWER = { cableRange: 8, deviceRange: 6, interval: 0.3, draw: { autominer: 3, storage: 2, spawner: 4, workbench: 0, enchanter: 0 } }` — 전선↔전선 8m, 건물↔전선(또는 건물) 6m, 재계산 0.3초, 소비 kW. **수동 시설(작업대·마법부여대)과 기계식(벨트)은 0kW** 라 전기 게이트가 없다(초반 진행이 막히지 않게).
- `systems/power.js` (THREE·DOM 의존 없음, 헤드리스 검증 대상): `POWER_ROLE = { SOURCE, CABLE, CONSUMER, IDLE }`, `powerRoleOf(node)`(명시 `role` > `output>0` > `draw>0` > `kind===cable` > IDLE), `class PowerGrid { rebuild(nodes); networkOf(id); isPowered(id); status(); reset(); selfTest(); }`.
- 노드 규격: `{ id, x, z, output?, draw?, role?, kind? }`. **IDLE 노드는 연결하지 않는다**(다리 역할 금지). 같은 `id` 는 하나로 합쳐지고, 유한하지 않은 좌표(`NaN`/`Infinity`) 노드는 **고립**된다. 연결 성분마다 하나의 전력망(`net1`, `net2`, …)이 된다.
- 판정: 전력망의 `supply >= demand` 면 그 망의 **소비 건물 전부 가동**, 모자라면 **전부 정지**(부분 가동 없음). `source`·`cable` 은 항상 `powered: true`. 미등록 id 는 **관대하게 `true`**(0.3초 재계산 창에서 잠깐 멈추는 것을 방지).
- `status()` → `{ nodes, networks(count), supply, demand, short, shortfall, coverage, unpowered }`. `grid.networks` 는 **망 배열**(`{ id, supply, demand, members, sources, consumers, cables, ok, shortfall, coverage }`). `networkOf(id)` → `{ netId, supply, demand, powered, role }`.
- `TurretSystem` 통합: `this.power = new PowerGrid({...POWER})`, `_powerNodes()` 로 살아 있는 건물만 노드화, `updatePower(force=false)`(`_powerAcc = POWER.interval` 스로틀) → `powerStatus()`(`supply/demand/networks/generators/cables/consumers/short/shortfall/netList/unpowered`) · `isPowered(id)` · `facilityPower(kind)` · `storageStatus()` · `nearestStorage()` · `collectStorageNear(position, radius)` → `{ gained, gold, wood, storages }`.
- 배선: `place()` 와 `_remove()` 가 `_powerAcc` 를 리셋하고 `updatePower(true)` 를 호출, `fromJSON`/`dispose` 는 `power.reset()`. `Turret.powered`/`Turret.powerNet` 이 UI·게이트의 단일 출처다.
- **상한 분리**: `MAX_TURRETS = 50`(v1.14.0에서 40→50, §4.78)은 **전선을 제외**하고 세고(`canPlace` 메시지 "건물은 최대 50개까지 세울 수 있습니다(전선 제외)"), 그중 시설은 `MAX_FACILITIES = 40`, 전선은 `MAX_CABLES = 160` 으로 따로 센다.

### 4.39 저장고 티어 — 버퍼 · 수거 · 용량 (`data.js` · `systems/turrets.js` `_updateStorage`)

- 저장고는 **7종**(`facility_storage`, `facility_storage_t2` … `_t7`)이다. 티어가 오르면 `storeRate.gold/wood`(2/1 → 128/64), `capacity`(60 → 13000), `hp`(640 → 4500), `range`(11 → 17m)가 **모두 단조 증가**한다.
- 동작: **전기가 있고**(`powered !== false`) **버퍼가 용량 미만**일 때만 `storeRate * dt` 만큼 버퍼(`_bufGold`/`_bufWood`)가 찬다. 가득 차면 멈춘다(자원 무한 증식 없음).
- 수거: 플레이어가 **`range` 안**에 있으면 매 프레임 `_collectIfNear(ctx)` 가 자동 수거하고, `collect()` 는 내림(`Math.floor`)해 경제·`system.goldStored/woodStored` 에 반영한 뒤 반환한다. `E` 는 `main.js` `_collectNearbyStorage(radius = 26)` → `collectStorageNear` 로 **즉시** 수거한다(`📦 저장고 수거 — 골드 n · 목재 m` 토스트).
- `storageState()` → `{ id, name, tier, gold, wood, capacity, ratio, powered, range }`. HUD 📦 칩은 이 값의 합계를 보여 주고, 가득/없음 상태에 따라 클래스를 바꾼다.

### 4.40 지형 티어 채굴 — `world/regions.js` · `data.js` `REGION_MINERAL_TIER` · `systems/turrets.js` `_drillPool`

- `REGION_MINERAL_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 }` — 띠 티어 → 광물 티어. `regionMineralTier(region)` · `mineralsForRegionTier(tier)`(실재하는 그 티어 광물 id 배열) · `TIER_BUILD_MINERALS` · `buildMineralFor(tier, index)` · `tierMinerals(tier, count, second)`.
- 광물 티어 풀: T1 철광석·구리광석·석탄·석영·점토 / T2 은광석·주석·흑요석·대리석·마나결정 / T3 금광석·미스릴·사파이어·루비·에메랄드 / T4 아다만타이트·오리하르콘·비전수정·심연광석·용린석 / T5 별의 파편·시간의 모래·창세의 정수(T6·T7 도 같은 풀).
- `Turret._drillPool()` 우선순위: **주변 광물 노드**(설치 시 잡힌 `mineral`) → **히든 지역 전용 광물**(`hiddenRegionAt` 이 있으면 그 지역 전용 id) → **설치 지형 띠의 티어 풀**(`regionAt().tier`). 안전 지대(0~70m)·황야·미등록 좌표는 **T1 풀로 폴백**한다.
- 채굴기는 `powered === false` 면 **완전히 멈춘다**(전기 게이트). 산출은 `_creditMineral(pool[idx], whole, true)` 로 집계되고, `drillRegion`/`drillPool`(데이터)과 `_drillRegion`/`_drillPoolNow`(런타임)가 UI·테스트의 단일 출처다.
- **건설 재료 규칙**: 티어 N 건물(포탑·시설)의 `cost.minerals` 는 **티어 N 지형 광물 id 만** 쓴다(공격: `scaleCost` + `buildMineralFor`, 지원: `tierMinerals(tier, tier + 1, 0)`, 시설: `tierMinerals(tier, 3 + tier, 2 + floor(tier / 2))`). 히든 전용 광물은 건물 재료로 쓰지 않는다.
- 소환문도 **전기 게이트**를 받는다(4kW). 소환문·채굴기·저장고는 `부족하면 정지`, 발전기·전선은 항상 가동이다.

### 4.41 게임 멈춤(프리즈) 하드닝 — `main.js` · `utils/rng.js` · `world/minerals.js` · `world/trees.js` · `systems/enemies.js` · `ui/console.js`

- **GPU 누수 제거**: 원격 캐릭터 이름표의 `CanvasTexture`/재질을 **교체·퇴장 시 `dispose()`** 한다(재접속마다 새로 만들던 텍스처가 쌓여 WebGL 컨텍스트 손실 → 화면 정지로 이어지던 원인).
- **자동 일시정지/재개**: `document.visibilityState === "hidden"` 이면 루프를 멈추고, `visible` 이 되면 **자동 재개**한다(예전에는 숨김에서 멈춘 뒤 돌아와도 영구 정지했다).
- **루프 예외 감시**: `_loop` 는 예외를 세어 **5회부터 콘솔·토스트로 알리고 600회에서 안전 정지**한다(조용히 멈추는 것을 막는다).
- **무한 루프 방지**: `lerpAngle`·`gaussian`·로그 정리 루프에 반복 상한을 둔다(`NaN`/`Infinity` 입력에서도 반환 보장).
- **탐색 비용 상한**: 광물·나무 `nearest()` 를 **16m 격자 인덱스**로 바꿔 매 프레임 전체 스캔을 없앴다(개체 수와 무관하게 프레임 비용 일정).
- **WebGL 컨텍스트 손실 감지**: `webglcontextlost`/`restored` 리스너로 사용자에게 알리고 복구를 시도한다.

### 4.42 추적 조준 — `systems/turrets.js` (`TURRET_AIM` · `_followYaw` · `_updateAttack`)

- `TURRET_AIM = { turnRate: 4.5, holdTime: 1.6 }` — 몸체 회전 속도(rad/s, 초당 약 258°)와 **수동 회전 우선 시간**(초).
- **각도 규약**: 몸체 `yaw` 는 forward = `(-sin yaw, 0, -cos yaw)` 즉 **-Z 규약**(§4.34·벨트 진행 방향과 동일)이고, 포신 `head` 는 로컬 **+Z** 로 만들어진다. 그래서 목표 방향 `barrelYaw = Math.atan2(dx, dz)` 를 그대로 쓰면 몸체가 돌아가 있을 때 포신이 어긋난다 → **몸체 목표 = `wrapPi(barrelYaw + π)`**, **포신 = `head.rotation.y = wrapPi(barrelYaw - bodyYaw)`** 로 보정한다(둘의 합이 항상 목표를 가리킨다).
- 상태 필드: `Turret.aimYaw`(실제로 바라보는 몸체 각도) · `_aimWant`(추적 목표각) · `_aimHold`(수동 우선 남은 시간) · `aimTarget`(조준 중인 적). 저장(`toJSON`)에는 **플레이어가 정한 `yaw`** 만 실린다.
- `_followYaw(dt)`: `_aimHold` 를 감소시키고, `_aimHold <= 0` 이면 `aimYaw` 를 `_aimWant` 쪽으로 **프레임당 `turnRate * dt` 만큼만** 최단 경로 회전(스냅 없음)해 `mesh.rotation.y` 에 반영하고 `yawTarget = null`. `_aimHold > 0` 이면 §4.37 의 기존 지수 보간(`1 - exp(-14 dt)`)을 그대로 쓴다.
- `_updateAttack(dt, ctx)`: 사거리 안 **가장 가까운 살아 있는 적**을 골라 `target`/`aimTarget`/`_aimWant` 를 세우고 포신을 보정한 뒤 발사한다. 적이 없으면 `_aimWant = this.yaw` — **제자리 각도로 복귀**한다.
- `setYaw`/`rotateBy`(플레이어 입력·멀티 릴레이)는 `_aimHold = holdTime`, `aimYaw = yaw` 로 **플레이어 의도를 즉시 반영**하고 그 시간 동안 추적을 멈춘다.
- `Turret.aimState()` → `{ yaw, aimYaw, targetId, tracking, holding, offset }` · `TurretSystem.aimStatus()` → `{ total, aiming, ids }`(패널·테스트용).
- 멀티플레이: 추적은 **각 클라이언트가 같은 `ctx.enemies` 로 계산**하므로 추가 통신이 없다(`turret:rotate` 릴레이는 수동 회전만 나른다).

### 4.43 연사 정상화 — `systems/turrets.js` `_updateAttack` · `data.js` `TURRET_DAMAGE_SCALE`

- 결함: `_updateAttack` 이 `this.cooldown` 을 **감소·재설정만 하고 발사 게이트로 쓰지 않아**, 적이 사거리에 있으면 매 프레임 1발을 쐈다(60fps = 초당 60발). 결과: ① 표시 연사와 실제 발사 수 불일치 ② 프레임레이트에 비례한 화력 ③ 발사체 풀(400) 포화 → `spawn()` 이 null 을 돌려 **플레이어 사격까지 실패**.
- 수정: 조준·추적(§4.42) 갱신 뒤 `if (this.cooldown > 0) return;` 로 **발사만** 게이트하고, 통과 시 `cooldown = 1 / max(0.05, fireRate)`.
- 균형: `data.js` 의 `TURRET_DAMAGE_SCALE = 60` 을 공격 포탑 `damage` 에 곱한다(60fps 기준 체감 DPS 유지, 이제 프레임레이트 무관). `1` 로 두면 순수 표 값 난이도.
- 계약: `DPS = damage × fireRate` · 건설 카드에 `DPS` 행 표시 · 같은 연사 설정에서 30fps/120fps 발사 수가 같아야 한다.

### 4.44 실행·감시 계약 — `run.cmd` · `tools/supervise.mjs` · `tools/dl-server.mjs` · `tools/dev.mjs`

- `tools/dev.mjs`: 시작 시 ① 선호 포트에서 `/api/health` 가 응답하면 **중복 기동하지 않고 exit(0)** ② 아니면 **빈 포트를 3001부터 최대 12개** 탐색해 그 포트로 listen(예전에는 EADDRINUSE 로 listen 만 실패하고 주소만 출력됐다). `PORT`/`SERVER_URL` 은 `let` 이며 확정 후 재계산한다.
- `tools/supervise.mjs`: `tools/dev.mjs`(게임)와 `tools/dl-server.mjs`(다운로드)를 `stdio: inherit` 로 띄우고, **비정상 종료(코드 ≠ 0)면 3~10초 뒤 자동 재시작**, 정상 종료(코드 0)면 재시작하지 않는다. 시작/재시작/종료를 `.tmp/supervise.log` 에 남긴다(PID 포함). SIGINT/SIGTERM 이면 두 자식을 종료한다.
- `tools/dl-server.mjs`: `<repo>/release/*.zip`·안내문을 `8099`(사용 중이면 +1)에서 서빙. `/`(목록) · `/download`(attachment) · `/guide`(inline) · `/health`.
- `run.cmd`: 모드 3종 — 기본(의존성 자동 설치 → 방화벽 규칙 확인 → 브라우저 열기 → 감시자 실행) · `firewall`(UAC 로 자기 자신을 `firewall-run` 으로 재실행해 3001·3002·8099 인바운드 허용) · `build`(`npm run build`).

### 4.45 활 계열 · 화살 소모품 · 궁수 (신규)

**4.45.1 활 계열**
- `WEAPON_FAMILIES` 에 **8번째 계열 `bow`**(활 · 🏹 · 2손 · `kind: 'bow'` · `swing: 'draw'` · 기본 피해 30 · 쿨다운 0.8 · 사거리 54 · `projectile: true` · `pierce: 1`)를 추가한다. **`kind: 'ranged'`(지팡이)를 재사용하지 않는다** — `'ranged'` 는 `_castSpell()`(마나·주문 피해)로 위임되기 때문이다.
- 활 무기 = 자동 생성 7종(`bow_<grade>`, T1~T7) + 제작 전용 3종(`bow_wind` T3 · `bow_dragonbone` T5 · **`bow_forever` T7 유물 = '이 사랑, 영원히'**, 궁극기 `eternalLove`). 자동 생성 id 는 `${family}_${grade}` 규약을 따르고, 화살은 `arrow_*` **별도 네임스페이스**를 쓴다(id 충돌 금지 — `bow_relic` 같은 이름을 쓰지 않는다).
- `WEAPON_MOTIONS.bow`: 스왑 **`nock`**(0.50초 · 다른 7계열 스타일과 중복 금지) · 공격 `loose`(`release: 0.62`) · 스킬 `drawFull`, 그리고 시위 당김 트랙 **`string: { max: 0.3, flex: 0.07 }`**.
- `WEAPON_IMPACTS.bow`(spark · `impactQuick`) 와 `WEAPON_ULTIMATES.eternalLove` + `ULTIMATE_IMPACTS.eternalLove` 를 **반드시 함께** 추가한다(임팩트·궁극기 표를 계열/궁극기 키로 조회한다).
- 티어별 기본 활 레시피는 `FAMILY_FORGE_FAMILIES = ['bow']` + `FAMILY_TIER_RECIPES` 로 **자동 생성**하며, 레시피 표 티어 ≡ 무기 티어를 `validateCrafting()` 이 검증한다. 새 레시피는 **항상 목록 뒤에** 덧붙인다(`forge_t1` 첫 레시피가 `sword1h_guard` 라는 계약이 테스트에 있다).

**4.45.2 화살(소모품)**
- `ARROW_TIERS` 7종(`arrow_t1`~`arrow_t7`): `damageMult` 1.00~1.85 **단조 증가**, `bundle` 150~90, 표(`table`) 티어 ≡ 화살 티어, `cost.minerals` 키는 실존 광물만.
- 원장은 **경제**(`economy.arrows`)가 소유한다(`addArrow/getArrow/_takeArrow/spendArrow/totalArrows/arrowInventory/firstArrowIn`). 무기·광물·가죽 원장과 분리하며 `toJSON/fromJSON` 에 포함한다(화살 없는 옛 세이브도 그대로 읽힌다).
- `cost.arrows` 를 `canAfford`/`spend` 가 처리한다(화살을 재료로 쓰는 제작이 가능).
- 소모 규칙: 발사 1회 = **1발**, **보유 최고 티어 우선**(`ARROW_ORDER_DESC`), 0발이면 **발사하지 않는다**(안내만 · 쿨다운도 소모하지 않는다).
- 피해 = `round(무기 피해 × 화살 damageMult × classes.weaponDamageMult × 가죽 장비 피해% × 마법부여 배율)`. 속성 = 부여 속성 ?? 무기 속성.
- 제작은 `CraftingSystem.canCraftArrow/craftArrow` — **같은 티어 제작대가 건설되어 있어야** 하고(오류 문구 `"<제단이름>을 먼저 건설해야 합니다."`), 성공하면 `bundle` 만큼 한 번에 지급하고 `arrowBatches` 를 센다(`toJSON/fromJSON` 포함).

**4.45.3 발사 경로(런타임 계약)**
- `main.js _attack()` 은 `weapon.kind === 'bow'` 를 **근접/맨손 처리보다 먼저** 가로채 `_bowAttack()` 으로 보낸다(지팡이 `'ranged'` 분기와 별개).
- 활은 **즉시 발사형**이다: `WeaponRig.triggerAttack()` 이 호출마다 모션 타이머를 0으로 되돌리므로, 마우스를 누르고 있는 동안 `release` 기반 발사는 **절대 일어나지 않는다**. 따라서 발사는 쿨다운 게이트(`_bowReadyAt`)가 담당하고 모션은 연출로만 쓴다.
- `_onWeaponRelease()` 는 **활이면 `null` 을 돌려준다** — 놓는 순간 `_meleeStrike()` 가 겹쳐 54 m 사거리 근접 판정이 나가는 것을 막는다.
- 투사체 파라미터: `speed 62 · radius 1.1 · pierce = weapon.pierce · range = weapon.range · element = 부여 속성 ?? 무기 속성 · owner 'player' · onHit → impacts.hit({ weaponId })`.
- 화살은 **발사 성공 뒤에** 차감한다(투사체 스폰이 실패하면 화살을 잃지 않는다).

**4.45.4 궁수(직업)**
- `CLASSES` 마지막에 `archer`(궁수 · `family: 'bow'` · `signature: 'bow_forever'` · `passive: { weaponDamage: 1.14, moveSpeed: 1.06 }`)를 추가한다. 패시브 키는 `classModifiers` 가 읽는 5개 키만 쓴다.
- 무기 잠금: 궁수는 활만, 다른 직업은 활을 쓸 수 없다(`weaponLock` — 계열 불일치는 `kind: 'family'`, 등급 상한 초과는 초심자 규칙 그대로).
- 캐릭터 외형 `archer` 의 표기는 **'궁수'** 로 통일한다(문서 표기와 일치).

**4.45.5 배선(테스트가 검증)**
- `weaponRig.buildBow()` + `buildWeaponMesh` 의 `family === 'bow'` 분기 → 10종 메시 + `userData.muzzle` + `userData.animated.bow`. `_animateMesh` 가 `motion.string` 트랙과 공격 모션 `release` 를 보고 시위·화살을 당긴다.
- `audio.swap({ family: 'bow' })` 분기(없으면 `default:` 로 떨어져 지팡이 소리가 난다).
- UI/명령: 제작 패널 `data-act="craft-arrow"` · `data-role="craft-arrow-row"`, HUD 칩 `hud-stat-arrows`, 관리자 명령 `/화살`.

### 4.46 미니게임 페이지 · 원클릭 실행 (신규)

**4.46.1 화면 전환(오버레이) — 메인 ↔ 미니게임 [H-48]**

- 메인 메뉴의 `🎯 미니게임` 카드(`data-act="menu-minigame"`)는 새 탭이 아니라 `game.openMiniGame()` 을 호출하고,
  본편 위에 `/mini-game.html` iframe 오버레이(`#mini-game-overlay` · `.mini-game-overlay` · `--z-minigame: 85`)를 덮는다. 상단 바에 제목·조작 안내·`← 게임으로 돌아가기` 버튼이 있다.
- 여는 동안 본편이 `playing` 이었다면 `pause()`, 닫으면 `resume()` — 진행 중이던 판은 그대로 이어진다. `menu` 상태에서는 일시정지하지 않고 포인터 동기화만 한다.
- 복귀 경로 3종: ① 상단 버튼 ② **ESC**(캡처 단계 + `stopImmediatePropagation` 으로 본편 ESC 와 충돌하지 않게) ③ iframe 안에서 `postMessage({type:'minigame:exit'})`.
- 수신 메시지는 **출처 + 발신 창 신원**(`frame.contentWindow`)을 확인한 뒤에만 처리한다. 페이지를 직접 열었을 때(iframe 아님)는 `/` 로 이동한다.
- 오버레이를 만들 수 없는 환경이면 `window.open` 새 탭으로 폴백한다(기능 상실 없음).
- 검증: `npm run minigame` 의 10) 구획이 오버레이 생성·iframe 주소·일시정지/재개·버튼·ESC·출처 차단·중복 열기 무시를 실제 모듈 import 로 확인한다.
- `client/public/mini-game.html` — **단독 HTML**(외부 의존 0 · 엔진/모듈 임포트 없음). Vite 가 빌드 시 `dist/mini-game.html` 로 복사하므로 `GET /mini-game.html` 이 `text/html; charset=UTF-8` 200 으로 서빙된다(개발 모드에서는 `publicDir` 로 그대로 서빙).
- 게임 규칙(계약): ① 모든 이동·스폰은 **초당 단위(dt)** — `dt = clamp(0, 0.05)` 로 프레임레이트 무관(30/60/144fps 동일 거리) ② 적 제거는 **배열 뒤에서부터**(`forEach`+`splice` 금지) ③ 스폰은 플레이어에서 **170px 이상**(30회 시도 후 최원거리 폴백) ④ 입력은 **키보드(WASD/방향키) + 포인터 드래그** ⑤ 점수 = 생존 1초당 1점 + 근접(90px) 후 이탈(130px) 시 **+10** ⑥ 탭 숨김 시 정지, 최고 점수는 브라우저 저장소(키 `miniGameBest`)에 기록.
- 본편과의 경계: 이 파일은 본편 모듈·세이브·경제를 **전혀 참조하지 않는다**. 연결은 메뉴 한 곳뿐이다.
- UI/배선: `ui/menu.js` 바로 가기 카드 `data-act="menu-minigame"` → `window.open('/mini-game.html', '_blank', 'noopener')`. 팝업이 막히면(`window.open` 부재/차단) `game.notify(..., 'info')` 로 주소만 안내하고 **메뉴는 닫지 않는다**(본편 상태 유지).
- 원클릭 실행: `게임실행.cmd`(프로젝트 루트 + 바탕 화면 사본) — 어느 폴더에서든 더블클릭하면 `cd /d <프로젝트>` 후 `run.cmd` 를 호출한다. 인자 `check` 는 실행 없이 경로/Node/node_modules/dist 만 점검한다(모든 줄이 ASCII 로 끝나야 하는 cmd 규칙 준수 — `.cmd` 는 CRLF + ASCII 줄끝).
- 검증: `node tools/mini-game-check.mjs`(`npm run minigame`) — 스텁 DOM 에서 스크립트를 실제 실행해 **38체크**.

## 5. 검증
- `node tools/smoke.mjs` — 순수 로직(데이터 개수, RNG 재현성, 경제, 업적, 가챠 확률, 웨이브 수치, **적응형 해상도·맨손 시작(0종)·마법부여 14속성·건물 회전·맨손 채집·관리자 명령(14종)·요정의 날개 8종 + 제작대 레시피 8종·가죽/장비·지형 몬스터·로밍 스포너·배선 계약·마우스 포인터 정책·멀티플레이 공유 주소·건설창 선택 계약·방 목록 요약/정렬·터널 주소 파싱·오버레이 레이아웃/스크롤 계약·캐릭터 만들기/전송/표시·앉기/점프·로그인 전환·R 홀드 부드러운 회전 계약·**전력 상수/저장고 티어/지형 티어 광물/티어 재료 규칙·발전기 7종·전선·채굴기 초당 1개·**추적 조준·연사 정상화 배선 계약·**활 계열 10종·화살 7종 데이터/레시피 무결성·궁수 직업·활 잠금·배선 계약**) 725체크.
- `node tools/headless.mjs` — 실제 모듈 통합(월드·청크 컬링·광원 컬링·맨손 채집·관리자 명령 · **요정의 날개 비행 물리/뷰모델·제작대 날개 제작(게이트·비용·체인·저장) · 야생 몬스터 스폰/처치·가죽 지급·장비 배율 · Input 마우스/휠 가드 · 캐릭터 모듈(살균·저장 왕복·손상 세이브) · 앉기 물리(시야 하강·감속·점프 차단·비행 중 해제) · 부드러운 회전(목표 세우기→수렴→목표 해제·즉시 회전 유지·릴레이) · **전기(발전기 연결·전선 사슬·정전·전선은 상한과 별도) · 저장고(용량·근접 수거) · 지형 티어 채굴(T1 풀·설치 지형 기록) · 소환문 전력 게이트**)** · **활 뷰모델 10종·시위 당김/복귀·화살 제작→소비→티어 우선순위·관통 피해·유물 활 제작 게이트·저장 왕복**) 514체크.
- `node tools/ui-dom-smoke.mjs` — UI DOM 287/287체크(**제작 패널 🏹 화살 구획(티어별 묶음·비용·보유)·HUD 🏹 화살 칩** 포함)(캐릭터 탭 4번째·외형 8장·이름/저장·로비 내 캐릭터 행·로그인 후 `auth:done` 으로 패널 닫힘 포함)(관리자 콘솔 · **요정의 날개 8장/가죽 5장/장비 6장 인벤토리·HUD · 제작 패널 날개 레시피/제작 버튼 · panels.hasOpen · 조준선 숨김 · 로비 LAN 초대 링크·비공개 토글 · 메인 화면 열린 방 목록(클릭 참가·정원 초과·비공개 제외) · 건설창 선택 시 닫힘** 포함).
- `node tools/mini-game-check.mjs`(`npm run minigame`) — **미니게임 페이지 38체크**: 스크립트 로드·dt 기반 이동(30/60/144fps 동일 거리)·대각선·경계, 적 제거 시 인덱스 밀림 없음·충돌/체력, 안전 스폰(150회 ≥170px), 생존·회피 점수(`+10` 라벨), 게임오버·재시작, 탭 숨김 일시정지·최고 점수 저장, 터치 드래그.
- `node tools/e2e-net.mjs`(`npm run e2e`) — 실행 중인 서버에 REST·소켓 **94체크**(**캐릭터와 함께 방 생성/참가 → `room:state` 외형 살균·`game:snapshot` 의 `character`/`sit` 동기화** 포함): 가입/로그인/세이브/리더보드/관리자, 방 생성·참가·시작·스냅샷, **건물 회전 릴레이(`turret:rotate` — yaw 전달)**, **열린 방 목록(`GET /api/rooms`)·비공개 방 제외·정원 초과 `joinable=false`·시작된 방 제외·목록 코드로 참가**.
- `node tools/character-bugtest.mjs`(`npm run bugtest3`) — **캐릭터/앉기/회전 버그테스트 71체크**: 이름 경계(1000자·개행/탭·HTML·원시값), 외형 오염(`__proto__`·`constructor`·`prototype`·`toString`·대소문자 변형 거부), 페이로드/릴레이 살균, 저장소 내성(깨진 JSON·문자열·배열·던지는 storage·storage 없음), 앉기(sitAmount 범위·dt=0/NaN/음수·비행 중 해제·사망 중 유한·400프레임 토글·점프 차단), 부드러운 회전(yaw 정규화·100π·NaN/문자열 입력·목표 누수·건물별 독립·저장/복원 누수·없는 id 거부).
- `node tools/base-bugtest.mjs`(`npm run bugtest4`) — **Round C/D 버그테스트 80체크**: 채굴기 전기 게이트(무전력 정지·발전기 6m 연결·지형 티어 광물·T3 지형 T3 광물), 전선 사슬(7m 간격 34m 공급·8m 초과 단절), 정전(소비 초과 → 전원 정지 → 판매 후 복구), 저장고(용량 상한·원거리 미수거·근접 자동 수거·`E` 수거·업그레이드 용량 60→170), 전력망 단위 규칙(6m/8m 경계·공급 = 소비·NaN 좌표·중복 id·미등록 id 관대), 티어 재료 규칙(티어 N 건물 = 티어 N 지형 광물·히든 전용 광물 제외), **채굴기 산출 속도(10초에 10개 = 초당 1개)**, **연사 정상화(연사 × 시간 발사·프레임레이트 무관·계열별 발사량·발사체 풀 여유·플레이어 사격 보장)**, **추적 조준(대상 획득·프레임당 회전 제한·1.2초 내 추적·포신 보정·수동 우선 1.6초·적이 없으면 제자리 복귀·180° 최단 경로·aimStatus 집계)**, **§⑩ 활·화살(제단 매칭·발당 피해·소모·묶음 제작·유물 활 수치)**.
- `node tools/wings-bugtest.mjs`(`npm run bugtest2`) — **날개 제작 특화 버그테스트 88체크**: 통계 키 계약(`track` 키 ↔ `STAT_LABELS`), 레시피 무결성/비용 단일 출처, 제작 게이트·**재화 원자성**, 손상 세이브 내성, 가죽 원장, 장비 세트 합산, 지역 편성·로밍 스포너 상한, 배선 계약. `node tools/boss-bugtest.mjs` — 20체크.
- `npm run build --workspace client` — Vite 프로덕션 빌드 성공 필수.
- `npm run start --workspace server` → `GET /api/health` 200.
- `node tools/lan-guest-check.mjs`(`npm run lancheck`) — 실행 중인 서버에 **다른 기기 접속 점검 9체크**(초대 링크 코드 참가·정원·시작 브로드캐스트).
### 4.47 대량 지급 · 패널 갱신 병합 · 프레임 감시 (신규)

관리자 `/무기전부` 가 67종을 **한 프레임에** 지급하면서 `panels.refresh()` 를 67번 불러 실제 DOM 을 67번 다시 그렸다 — 화면이 수 초 멈추고 입력(ESC·이동)이 먹지 않았다("무기를 소환하면 게임이 멈춘다").

- **갱신 병합** — `PanelManager.requestRefresh(id?)` 는 예약만 하고 `flushRefresh()` 가 **프레임당 1회**만 그린다(예약 후 패널이 닫히거나 바뀌면 버린다). `Game._refreshPanels()` 를 `ownWeapon`·`equipWeapon`·꿈나무 해금이 쓰고, `requestRefresh` 가 없는 구현에서는 `refresh()` 로 폴백한다.
- **프레임 예산 지급 큐** — `systems/grants.js` `GrantQueue.enqueue(items, handler, { onDone })` + 프레임마다 `step()`. 예산(기본 6ms)을 넘기면 다음 프레임으로 넘기고, 항목이 던져도 나머지는 지급하며 `failed` 로 센다. `onDone(done)` 은 **한 번만**. `Game.grantWeapons(ids)` 가 `/무기전부` 를 이 큐로 넘기고(큐 미지원 게임은 기존 동기 경로) 완료 시 1회 알림 + 1회 갱신.
- **프레임 감시** — `Game.perf = { frames, lastMs, worstMs, slowFrames, lastError }`. 1초 초과 프레임은 `[perf]` 경고 + (첫 회·20회마다) 안내. 설정 ‘성능 지표’ 가 0.5초마다 표시하고 [지표 초기화] 로 초기화한다.

### 4.48 ESC = 설정 화면 (신규)

- `ESC` 는 설정 화면을 연다(`pause({ screen: 'settings' })`). 맨 위 **[▶ 계속하기]**(`data-act="resume"`)·**[나가기]**(`data-act="quit"`)가 있고, 다시 `ESC` 또는 계속하기로 복귀한다.
- `pause()` 의 기본 화면은 기존 `pause` 패널이다(탭 복귀 자동 일시정지 등 사용자가 누른 게 아닌 경로).
- 일시정지 중 패널이 닫히면 자동 재개한다(`panels.on('close')` → `state === 'paused'` 이면 `resume()`).

### 4.49 내 세이브 목록 (신규)

- `systems/saves.js` — `SAVES_KEY = 'fortress.saves.v1'` · `MAX_SAVES = 10` · id 는 `savedAt`. `pushSave`(같은 시각 교체, 최근 10개 유지) · `listSaves`(최신 순 요약) · `getSave` · `removeSave` · `clearSaves` · `summarize` · `saveLabel`.
- 깨진 JSON · 배열 아님 · `savedAt` 없음 · `localStorage` 없음은 **예외 없이** 빈 목록/거부다.
- `Game.save()` 는 로컬(`SAVE_KEY`)·클라우드 저장 뒤 **항상** 슬롯에 남긴다. 설정 → ‘내 세이브’ 의 `data-act="save-slot-load"` → `save:load` → `Game.loadSaveSlot(id)` → `_restore(data)`, `data-act="save-slot-del"` → `save:del` → `Game.removeSave(id)`. 불러오면 패널을 닫고 게임으로 복귀한다.

### 4.50 자동 화질 지속 적응 · 메모리 감시 (신규)

- **프리셋 사다리는 비용 순서가 단일 출처다** — `ui/adaptive.js` `PRESET_LADDER = ['battery', 'performance', 'balanced', 'ultra', 'unlimited']`. `FRAME_PRESETS` 선언 순서(고품질·균형·성능·저전력·무제한)를 그대로 쓰면 `저전력 → 무제한` 역방향 하향이 생겼다 — **고쳤다**.
- `suggestPreset(avgFps, presets, currentId)` = 한 단계 가볍게(사다리), `stepUpId(presets, currentId, targetId)` = 한 단계 무겁게(단 **`targetId` 를 넘지 않음**). `ladderIndex` 로 위치를 구한다.
- `Game.autoQuality`(기본 켜짐 · `fortress.autoquality.v1`) · `ADAPTIVE.qualityInterval = 12`초마다 재판정 · 하향 `< downgradeFps(42)` · 되올리기 `≥ recoverFps(58)` · 상한 `Game._userQuality`(사용자가 직접 고른 단계).
- `MemoryGuard` — `performance.memory`(Chrome 전용) 0.5초 간격 · `warnMb 900` 초과 시 `memoryCooldown 120`초 간격 경고. 정보가 없으면 조용히 넘어간다.
- 설정 지표: 평균 FPS · 렌더 배율(`adaptive.scale`) · JS 힙(최대 힙). [저장하고 새로고침(메모리 정리)] 는 `save(true)` 후 `location.reload()` — 저장 없이 새로고침하지 않는다.

- 실측(최종): smoke **738/738** · headless **539/539** · ui **292/292** · minigame **61/61** · e2e **94/94** · lancheck **9/9** · bugtest **20/20** · bugtest2 **88/88** · bugtest3 **71/71** · bugtest4 **80/80** · cmd-lint **2/2** — 모두 통과.
- 프로덕션 빌드: `index.html 3.23KB` + `index-uHFATLJv.css 46.89KB (gzip 10.36KB)` + `index-PwWVjALW.js 1,416.40KB (gzip 403.27KB)`.

## §4.53 불멸(유물 등급 카타나) · 꿈의 끝은 희망(낫)

- 신규 무기 `katana_immortal` — 이름 「불멸」, 등급 `relic`(유물), 계열 `katana`, 모델/모션 `katana`.
  - 55 피해 / 0.328 초 쿨다운(단일 대상 DPS 167.7). 궁극기는 없다(계열 공용 동작만).
  - 계열 규칙 `CLASS_RULES.sharedFamilies`(`scissors` · `dream` · `katana`)를 그대로 따른다.
- `dream_lantern`(꿈의 끝은 희망)은 **모델과 모션만 낫(scythe)으로 바뀌었고**, 등급 색(비밀 등급)과
  비살상 불변식(적을 죽이지 않고 잠재운다)은 그대로다. 계열은 `dream` 을 유지한다.

## §4.54 관리자 명령 사용 후 멈춤 · 닉네임

- 관리자 명령의 패널 갱신은 `requestPanels(game)` 로 **프레임 단위 병합**된다(동기 `refresh()` 금지).
- 무기 첫 장착 시 셰이더 컴파일로 멈추던 문제는 `_prewarmStep()` 이 메뉴/일시정지에서 프레임당 6종씩
  미리 컴파일해 해결했다.
- `/웨이브 N` 은 1~999 로 잘라 실행하고, 999 초과·100 이상은 경고를 남긴다.
- 콘솔이 열려 있는 동안에도 키 입력은 게임으로 간다(ESC 안내를 콘솔에 남긴다).
- 닉네임: `profile.js` 의 `fortress.nickname.v1`(최대 16자)이 최우선이고, 계정 닉네임 → 아이디 → '수호자'
  순으로 내려간다. 서버는 `POST /api/auth/nickname`(로그인 필요)으로 저장한다.

## §4.55 점프 · 키 변경

- 점프는 키맵 동작 `jump`(기본 Space)로 처리한다. **날개를 착용해도 지상에서는 점프가 먼저**이고,
  `_jumpLock = 0.22` 초 동안은 비행으로 넘어가지 않는다(점프 키를 계속 누르면 그 뒤 비행으로 이어진다).
- `keys.js` 가 모든 조작을 담당한다: `KEY_ACTIONS`(25개) · `KEY_GROUPS` · `keyCodes/keyLabel/primaryKey`
  · `setKey/resetKey/resetAllKeys` · `isDown(input, action)` · `consume(input, action)` · `validateKeyData()`.
  - 저장 키는 `fortress.keys.v1`. ESC 는 재지정할 수 없고, 중복 지정은 거부한다(기본 별칭 코드는 예외).
  - 설정 패널의 단축키 목록에서 동작마다 [변경]/[기본값] 버튼과 [전체 기본값] 을 제공한다.

## §4.56 조합법(레시피) 도감 — `recipes.js` · `recipes` 패널

- `recipes.js` 가 무기 제작 · 계열 제작 · 작업대 · 날개 · 화살 · 광물 조합을 한 목록으로 모은다
  (`recipeCatalog/recipeTerrains/recipesFor/recipeCount/validateRecipeData`).
- 지형 분류: 제작대 tier(T1~T7) + 숨은 지형(`cherry_garden` 벚꽃의 정원 · `time_horizon` 시간의 지평선 ·
  `garden_of_dreams` 꿈의 정원). 숨은 지형 재료가 들어가면 그 지형으로 분류한다.
- 패널 `recipes`(기본 키 **P**): 지형 탭 · 종류 탭(전체/무기/날개/화살·소모품/광물 조합) · 카드마다 재료와
  [제작대로 이동] 버튼. 일시정지 패널의 [조합법] 버튼으로도 열린다.

## §4.57 웨이브 100 · 셀레스티얼 · 무한 모드

- 기본 모드의 목표 웨이브는 **100** 이다(`WAVE_CONFIG.finalWave = 100`). 100 · 200 · 300 … 배수마다
  최종보스 셀레스티얼이 강림한다.
- 셀레스티얼 고정 스탯: **체력 5,000,000 · 공격력 1,200**(웨이브·난이도 배율을 받지 않는다).
  고정 스탯 보스는 **편성표 배율(`roster.mods`)과 크기 배율도 받지 않는다**(`enemies.js` `fixedStats`).
- 웨이브 100 구간이 실제로 도달 가능하도록:
  - `softenAfter: 30` · `growthSoftening: 0.28` — 30 웨이브부터 체력/속도 성장이 완만해진다.
  - `maxCount: 240` — 한 웨이브 편성 마릿수의 상한.
- 무한 모드 해금: 기본 모드에서 웨이브 100 이상을 클리어하면 `progress.js`(`fortress.progress.v1`)에
  기록되고 무한 모드가 열린다(`unlockEndless/recordWave/isEndlessUnlocked/progressSummary`).
  메뉴의 모드 탭은 해금 전까지 🔒 로 잠기고, 시작 시에도 `start()` 가 한 번 더 막는다.
- 무한 모드 규칙: `WAVE_CONFIG.endlessCelestialEvery = 300`,
  `endlessCelestialGrowth = 1.35`. 300 웨이브마다 셀레스티얼이 다시 오고 **등장할 때마다 스펙이 +35%**
  오른다(1차 5,000,000 → 2차 6,750,000 → 3차 9,112,500 …). 차수는 `waves.celestialSpawns` 로 센다.
  - 구현: `waves._buildQueue` 가 스케일된 **타입 사본**을 만들어 편성 항목의 `type` 으로 넘기고,
    `spawnEnemy` 가 `type: typeOverride` 로 그것을 우선 사용한다.

## §4.58 지형별 3D 텔레포트 포탈

- `travel.js`(three 없음): 지형 목록과 지형별 색(`TERRAIN_COLORS/regionColor/colorInt`),
  `destinationList/destinationById/arrivalPoint/destinationsByTerrain/validateTravelData`.
  - 목적지: 기지 광장 + T1~T7 고리 지형(중간 반지름 · 고르게 흩어진 각도) + 숨은 지형 2곳.
  - 색: T1 `#7ee081` · T2 `#3fbf7f` · T3 `#59d6ff` · T4 `#b18cff` · T5 `#cfefff` · T6 `#ff7a45`
    · T7 `#ffe08a` · 기지 `#e8d9a8` · 벚꽃 `#ff9ecb` · 시간 `#7fd1ff`.
- `world/teleports.js` 의 `TeleportField` 가 지형마다 **3D 고리 포탈**(토러스 고리 + 회전 원반 +
  빛기둥 + 궤도 룬 4개 + 바닥 발광)을 지형 색으로 세우고, `update(dt, { player })` 로 회전·맥동·근접 판정을 한다.
- 조작: 포탈 6.9m 안에 들어가면 HUD 안내 `N — 지형 이동` 이 뜨고, **N** 을 누르면 이동 패널(`travel`)이
  열린다(지형별 묶음 · 색 점 · [이동]). 이동은 `player.setPosition(x, undefined, z)` 로 지면에 맞춰 착지한다.

## §4.59 성능 · 검증

- 관리자 명령·패널 갱신은 프레임 병합, 셰이더는 프레임당 6종 예열, 웨이브 편성은 마릿수 상한을 둔다.
- 검증: `npm run verify`(lint·build·smoke·headless·ui·boss-bugtest). 2026-10-12 기준
  스모크 **801/801** · 헤드리스 **549/549** · UI **301/301** · 버그테스트 전부 통과.

## §4.60 채굴기 티어 채굴 — 맨땅 시추

채굴기(`facility_autominer`)는 광물 위가 아니어도 **맨땅에서 지형 티어 광물**을 캔다(설치는
`canPlace`, 생산은 `Turret._updateAutoMiner` 의 바닥 분기). 등급 판정은 `Turret._drillPool` +
`regionInfo()` 가 하고, 히든 지역은 그 지역 전용 광물(`mineralIds`)을 우선한다.

티어 규칙(순수 헬퍼는 `systems/turrets.js` 에서 내보낸다):

| 헬퍼 | 뜻 |
| --- | --- |
| `drillPower({ drillTier, terrainGrade })` | 채굴 능력 등급 = max(채굴기 티어, 지형 등급) |
| `drillYieldBonus(power, mineralTier)` | 저티어 광물 채굴량 배수 = 1 + 등급차 × **0.35** |
| `drillLowTierChance(power, terrainGrade)` | 저티어 광물을 캘 확률 = (등급−1) × **0.2**, 상한 **0.6** |
| `drillPickGrade({ power, terrainGrade, roll, pickRoll })` | 이번에 캘 등급 선택(저티어 확률 적용) |

- **고티어일수록 저티어 광물을 더 많이 캔다**: 등급 차이 1당 +35%. T3 채굴기 + T1 지형 = ×1.7,
  T5 채굴기 + T1 지형 = ×2.4. 소수점은 모아서 한 개로 지급한다(`_drillBonusAcc`).
- **고티어는 저티어 광물도 랜덤으로 캔다**: `roll < 확률` 이면 지형 등급보다 낮은 등급에서
  무작위로 고른다(난수는 `TurretSystem.rng` → 없으면 `Math.random`).
- T1 채굴기 + T1 지형은 **예전과 완전히 동일**하다(초당 1개 · 1등급 광물만).
- 저장: 시설은 티어별 전용 typeId 가 없어 `Turret.toJSON()` 이 `tier`·`rate` 를 함께 저장하고
  `TurretSystem.fromJSON` 이 그것을 복원한다(예전에는 업그레이드 채굴기가 저장/복원에서 1티어로 되돌아갔다).
  `mineralsDrilled` 도 함께 저장된다.

## §4.61 닉네임 중복 허용

- 닉네임은 **중복을 허용**한다: `users.nickname` 에 고유 제약이 없고(`server/db.js`),
  `POST /api/auth/nickname` 도 중복 검사를 하지 않는다(`server/api/auth.js`).
- 로그인 식별자인 **아이디(username)만 고유**하다 — 가입 시 아이디가 겹치면 409 이고,
  안내 문구가 "아이디는 고유, 닉네임은 중복 가능" 임을 알려 준다.
- 설정 패널·메뉴에 "중복 닉네임도 됩니다" 안내를 표시한다. 멀티에서 같은 이름이어도 그대로 뜬다.

## §4.62 500 FPS 목표 · 렉테스트

- 품질 프리셋에 **`speed`(초고속 · 500 FPS)** 를 추가했다: 그림자 끔 · 안티 끔 · 픽셀비 1 ·
  `drawDistance 260`. 자동 품질 사다리(`PRESET_LADDER`)의 맨 아래(가장 가벼움)에 둔다.
- `npm run lag-test` (`tools/lag-test.mjs`) 가 **렉테스트**를 한다:
  - 웨이브 100 편성 + 최종보스 + 포탈을 실제 `createWorld` 위에 올리고 프레임당 CPU 비용을 잰다.
  - 측정 항목: 평균/중앙값/p95/최악 프레임(ms), 구간별(월드·적·웨이브·포탑·플레이어·포탈·행렬),
    화면 안 그리기 호출·삼각형·광원, 품질 프리셋별 장면 규모.
  - 통과 기준: 평균·게임 로직(측정 도구 제외) ≤ **2.0ms(=500 FPS)**, 최악 ≤ 8ms.
  - 실측(2026-10-12, 품질 speed·적 182마리): 게임 로직 **0.63~0.85ms → 1171~1577 FPS 상한**,
    화면 안 그리기 호출 179 · 삼각형 7.9만. GPU 실측 FPS 는 그래픽 카드에 달려 있다.

## §4.63 채굴기 채굴 모션

채굴기(`facility_autominer`)는 **캐는 동안만** 움직인다. 부품은 메시를 만들 때
`head.userData`(`bit` · `sleeve` · `dust` · `bitY` · `sleeveY`)에 붙이고, `Turret._animate` 의
`facility` 분기에서 `kind === 'autominer'` 일 때 갱신한다.

| 부품 | 동작 |
| --- | --- |
| 날(`bit`, 드릴 콘) | `_drillSpin` 만큼 회전 — 캘 때 9.5 rad/s, 멈추면 1.2 rad/s |
| 슬리브(`sleeve`) | `sin(_animT × 5.5)` 왕복(0.1m) — 타격 피스톤 |
| 먼지 링(`dust`) | 광물을 캘 때마다 `_minePulse = 0.35` → 0.35초 동안 커지며 내려가고 사라진다 |
| 머리(`head`) | 캘 때 미세하게 상하 진동(0.03m), 좌우로 `_drillSpin × 0.32` 회전 |

- `_minePulse` 는 **광맥 채굴**과 **맨땅 시추** 양쪽에서 켜진다(`_updateAutoMiner`).
- 전기가 없으면(`powered === false`) `_minePulse = 0` 이 되고 날이 천천히 멈춘다.
- 회전·왕복은 `_animT`(누적 애니메이션 시간)와 `_drillSpin` 만 쓰므로 프레임당 새 객체를 만들지 않는다.

## §4.64 렉 최적화(프레임 예산)

`npm run lag-test` 로 측정한 병목을 다음처럼 줄였다(계약 §4.62 의 예산 2.0ms = 500 FPS 기준).

| 위치 | 변경 |
| --- | --- |
| `ui/healthbars.js` | 매 프레임 `capacity`(220)칸을 0으로 채우던 것을 **이전 프레임 꼬리만** 지우도록 변경 |
| `ui/minimap.js` | 전체 2D 캔버스 redraw 를 **3프레임에 1회(≈20Hz)** 로 제한 |
| `main.js` | `world.update` 안에서 이미 도는 `frustumCull` 을 프레임마다 **중복 호출하지 않는다** |
| `ui/fps.js` | 런타임 프리셋 적용에도 `devicePixelRatio` 상한을 걸어 초과 해상도(슈퍼샘플링)를 막는다 |
| `systems/region-spawns.js` | 로밍 편성표(`roamerRoster`)를 **지역별로 캐시**해 매 프레임 객체 생성을 없앤다 |

측정 결과(품질 `balanced`, 적 182마리 + 포탈 10개): 게임 로직 **0.59ms → 1694 FPS 상한**,
p95 1.45ms → 688 FPS, 화면 안 그리기 호출 168 · 삼각형 8.5만.

## §4.65 무한 모드 후반 밸런스(300 · 600 · 900 … 웨이브)

무한 모드의 셀레스티얼은 300 웨이브마다 다시 오고, 등장 차수 `n`(= `waves.celestialSpawns`)에 따라
`WAVE_CONFIG` 의 상수로 스펙이 오른다.

| 항목 | 곡선 | 근거 |
| --- | --- | --- |
| 체력 | × `endlessCelestialGrowth`(1.35)^n | 요청 그대로 **등장마다 +35%** |
| 공격력 | × `endlessCelestialAttackGrowth`(1.12)^n, 상한 `endlessCelestialAttackCap`(×6) | 기지가 한 방에 무너지지 않게 완만하게 |
| 보상(골드) | × `endlessCelestialGoldGrowth`(1.25)^n | 후반에도 업그레이드 여지를 남긴다 |

| 차수 | 웨이브 | 체력 | 공격력 | 골드 |
| --- | --- | --- | --- | --- |
| 1 | 300 | 5,000,000 | 1,200 | 250,000 |
| 2 | 600 | 6,750,000 | 1,344 | 312,500 |
| 3 | 900 | 9,112,500 | 1,505 | 390,625 |
| 4 | 1,200 | 12,301,875 | 1,686 | 488,281 |
| 5 | 1,500 | 16,607,531 | 1,888 | 610,352 |
| 6 | 1,800 | 22,420,167 | 2,115 | 762,939 |

- 공격력 상한(×6 = 7,200)은 **16차(웨이브 4,800)** 에서 걸린다.
- 심판(judgment) 피해는 공격력에 비례하므로(3,600 = 1,200 × 3) 함께 완만해진다.
- 스폰되는 개체는 편성표 배율을 받지 않고 **표기 스펙 그대로** 나온다(H-58 의 `fixedStats` 규칙 유지).
- `_emit('celestial', …)` 는 `hp/attack/gold` 를 함께 알린다(UI·검사에서 사용).

## §4.66 설정 — 500 FPS 예산 행 · 지형 이동 색점 훅

- 설정 → 성능 지표에 **프레임 예산 (500 FPS)** 행이 생겼다: 마지막 프레임을 2.0ms 와 비교해
  `0.80 ms / 2.00 ms · 여유 60% (≈1246 FPS 여력)` 처럼 보여 준다(프레임이 없으면 `— / 2.00 ms`).
- 지형 이동 패널의 색점은 `data-role="travel-dot"` · `data-color="#7ee081"` 훅을 달고 `title` 에 지형 이름과
  색을 담는다(검사·접근성용). UI 검사는 색점 20개와 **서로 다른 색 10종**을 확인한다.
- 채굴기 티끌은 재질을 복제(`accent.clone()`)해 두고 `regionColor()` 로 **그 지형의 색**으로 물든다
  (T1 초원 `#7ee081` · T3 `#59d6ff` …).

## §4.67 관리자 무기 소환 멈춤 (H-71)

**증상** — 게임 중 `/무기 <id>` 로 무기를 소환하면 화면이 몇백 ms 멈췄다. `/무기전부` 도 이어서 멈췄다.

**원인** — 셰이더 예열(`_prewarmStep`)이 **메뉴·일시정지 상태에서만** 돌았다.

```js
if (this.state === 'menu' || this.state === 'paused') this._prewarmStep(); // 예전
```

그래서 게임 중에 처음 보는 무기는 그 프레임에 메시·재질이 만들어지고 **셰이더 프로그램이 그 자리에서 컴파일**됐다
(WebGL 드라이버가 수백 ms 를 잡아먹는다 — 자바스크립트 프로파일러에는 안 잡힌다).

**수정** — ① 예열을 게임 중에도 매 프레임 돌리고, ② 소환을 지급 → 예열 → 장착으로 나눴다.

| 위치 | 내용 |
| --- | --- |
| `main.js _prewarmStep(perFrame = 6)` | 무대(menu/paused)에서는 6종, **플레이 중에는 1종**씩 컴파일 |
| `main.js summonWeapon(id)` | 지급은 즉시, 장착은 예열 뒤로 미룬다(알림: "셰이더 예열 중…") |
| `main.js _warmWeapon(id)` | 해당 무기 메시를 `_warmScene` 에 만들어 `renderer.compile` 로 예열 |
| `main.js _summonStep()` | 소환 큐를 **프레임당 1종** 진행 → 예열이 끝나면 `equipWeapon(id, { instant: true })` |
| `systems/summon-queue.js` | 순수 지연 큐(`push` · `step(warm, equip)` · `summary` · `validateSummonQueue`) |
| `systems/admin-commands.js` | `/무기` 가 `game.summonWeapon` 을 쓰고, 안내에 "예열 후 장착(잠시)" 표시 |

- 무기 82종 예열은 게임 시작 후 **82프레임(약 1.4초)** 에 걸쳐 끝난다. 프레임당 1종이라 한 프레임이 크게 튀지 않는다.
- `renderer.compile` 이 없는 환경(헤드리스)에서는 예열을 건너뛰고 **즉시 장착**한다(검사가 그대로 돈다).
- 예열한 무기는 `_warmedWeapons` 에 기록해 두 번 컴파일하지 않는다.
- 소환 큐는 순수 로직이라 `tools/smoke.mjs` 에서 순서(예열 → 장착) · 중복 · 예열 실패 · 상한을 직접 검증한다.

## §4.68 컨베이어벨트 물류

벨트는 이제 **실제로 광물을 실어 나른다**. (예전에는 반경 보너스와 흐르는 슬랫만 있었다.)

**한 줄 요약** — 채굴기가 캔 광물이 옆 벨트에 상자로 올라가고, 벨트 사슬을 따라 흘러가 앞 건물에
하역되는 순간 입금된다. 벨트가 없으면 예전처럼 즉시 입금된다(하위 호환).

| 단계 | 규칙 |
| --- | --- |
| ① 적재 | 채굴기가 광물을 캘 때 반경 `BELT_PICKUP`(2.8) 안 벨트의 **꼬리**에 상자를 올린다. 자리가 없으면 남은 만큼만 즉시 입금 |
| ② 이송 | 상자는 `type.speed`(T1 2.5 → T7 9.0 m/s)로 앞(-Z)으로 흐른다. 간격 `BELT_ITEM_GAP`(0.6) 이상 유지 |
| ③ 연결 | 앞 끝에서 `BELT_LINK`(3.0) 안의 **앞 벨트**(진행 방향 ±90° 안, 마주 보는 벨트 제외)에 넘긴다 |
| ④ 하역 | 앞 끝 `BELT_DELIVER`(2.8) 안의 **비(非)벨트 건물**에 넣는다 → 그 순간 `_creditMineral` 로 입금 |
| ⑤ 막힘 | 넘길 곳도 하역할 곳도 없으면 끝에서 멈춘다(`turret.jammed`, `system.beltJammed`) |

- 한 벨트 용량은 `floor(beltLength / 0.6)` — 기본 3.4m 벨트는 **5개**(상한 8).
- 좌표 규칙: **forward = -Z (yaw 0)**, 꼬리 = +Z. 방향은 `R`(건물 회전)로 바꾼다.
- 상자는 광물 색으로 물든 크레이트로 그려진다(`MINERAL_BY_ID[id].color`). 벨트 위에 있던 정적 상자는 없앴다.
- 하역·적재 순간에 각각 `_beltDeliverPulse` / `_beltFeedPulse` 가 켜진다(연출용).
- 저장: `Turret.toJSON()` 의 `items`(`{id, t}`)로 벨트 위 광물까지 저장하고, `fromJSON` 에서
  **아는 광물만 · 용량 안에서 · 앞 → 뒤 순서**로 복원한다(모르는 id 는 버린다).
- 벨트 자신은 `_creditMineral` 에서 적재를 시도하지 않는다 — 하역한 광물이 다시 벨트로 올라가면 순환한다.
- 통계: `system.beltLoaded`(실은 개수) · `system.beltDelivered`(하역 횟수) · `system.beltJammed`(막힌 벨트 수) ·
  `system.lastBeltReceiverId`.
- 검사: `node tools/conveyor-test.mjs` (21검사) · 순수 규칙은 `validateConveyorLogic()` 자체 검증.

## §4.69 렉테스트 판정 기준 (H-76 ~ H-77)

`npm run lag-test` 의 예산(기본 2.0ms = 500 FPS)은 **측정 도구 비용을 뺀 게임 프레임**으로 판정한다.

| 항목 | 기준 | 이유 |
| --- | --- | --- |
| 평균 게임 프레임 | ≤ 2.0ms | 500 FPS 예산 |
| p95 게임 프레임 | ≤ 2.0ms | 도구가 매 프레임 그리기 호출을 세는 비용(약 0.15ms)을 게임 탓으로 돌리지 않는다 |
| 게임 로직 합계 | ≤ 2.0ms | 구간별 합(측정 도구 제외) |
| 최악 게임 프레임 | ≤ 8ms | OS 스케줄링·GC 한 번은 허용(끊김 판정) |

**표본 수가 중요하다** — 기본값은 `--frames=600`(워밍업 15% 제외 → 510 표본)이다.
`--frames=240` 처럼 표본이 적으면 OS 스케줄링 한 번에 p95 가 2.5ms 까지 튄다(실측).
빠른 확인용으로만 줄이고, 판정은 기본값으로 한다.

측정 예(기본 600프레임 · 적 182마리 + 포탈 10개 · 품질 balanced):

```
평균 0.669ms (도구 제외 0.518ms) · p95 0.933ms · 최악 3.491ms
→ 게임 로직 0.518ms = 1929 FPS 상한 · p95 1072 FPS
구간: 월드 0.025 · 적 0.189 · 웨이브 0.051 · 포탑 0.003 · 플레이어 0.013 · 포탈 0.012 · 행렬 0.309
```

## §4.70 마법연성 (Y 키)

마법연성은 **영구 업그레이드 11종**이다. 골드로 사고, 사는 즉시 효과가 게임 전체에 반영된다.

| 연성 | 효과(단계당) | 최대 |
| --- | --- | --- |
| 🎯 포탑 사거리 | 모든 포탑 사거리 +6% | 12 |
| ⚔ 포탑 데미지 | 모든 포탑 공격력 +7% | 12 |
| ⚡ 포탑 공격속도 | 모든 포탑 공격속도 +5% | 12 |
| 🛰 중앙코어 공격 | 코어가 스스로 적을 공격 — 사거리 +6m | 6 |
| 💥 중앙코어 데미지 | 코어 공격 피해 +25% | 12 |
| ❤ 중앙코어 체력 | 코어 최대 체력 +15%(즉시 회복) | 12 |
| 📦 중앙코어 저장고 | 저장고 보관량 +20% | 12 |
| 🧍 플레이어 체력 | 최대 체력 +8%(즉시 회복) | 12 |
| 🏹 플레이어 데미지 | 주는 피해 +7% | 12 |
| ⛏ 채굴기 채굴속도 | 채굴 시설 속도 +8% | 12 |
| 🪓 벌목기 벌목속도 | 벌목 시설 속도 +8% | 12 |

**규칙**
- 배율 = `1 + per × 단계`. 값은 항상 **상대 배율**로 곱한다 — 포탑이 스스로 업그레이드로 올린
  데미지가 연성 때문에 초기화되지 않는다(`Turret._applyArcana` 가 이전 배율과의 비만 곱한다).
- 가격은 `base × growth^단계` (예: 포탑 데미지 2,600G → 4,030G → …).
- 저장고 보관량은 **사용 시점에** 배율을 읽는다(`Turret.storageCapacity()`) — 저장/복원 후에도 그대로 적용된다.
- 중앙코어 공격은 쿨다운마다 사거리 안 **가장 가까운 적 하나**를 때린다(프레임 비용 O(적 수)).
  데미지 = `20 × coreDamage배율 × (1 + 0.35 × coreAttack단계)`, 처치 골드는 경제로 들어온다.
- 코어 체력·플레이어 체력은 **기준값을 기억**하고 배율만 다시 곱한다(중복 적용 없음).
- 저장: `save.arcana = { levels: {...}, total }` — 복원 후 `applyArcana()` 를 부른다.
- 검사: `node tools/command-freeze-test.mjs` §④ · `validateArcana()` 자체 검증.

## §4.71 무기 소환 → ESC 멈춤 (고침)

**증상** — `/무기`·`/무기전부` 뒤에 ESC 를 누르면 화면이 얼어붙었다.

**원인** — 프레임 루프가 `this.state === 'menu' || this.state === 'paused' ? 6 : 1` 로 예열했고,
`_summonStep()` 이 상태를 보지 않았다. 무기 메시 생성 + `renderer.compile`(셰이더 컴파일)은
프레임당 수 ms~수십 ms 를 쓰는 작업이라, **일시정지 화면에서 프레임당 7종**을 컴파일하면서
일시정지 UI 가 멈춘 것처럼 보였다.

**고침(3중)**
1. **일시정지 중에는 예열·장착을 하지 않는다** — `menu` 만 프레임당 6종(로딩 화면), 그 외에는 1종.
   `_summonStep()` 도 `paused`·`menu` 에서 즉시 빠져나온다. 풀리는 순간 이어서 진행된다.
2. **예열에 시간 예산**(`budgetMs = 2.5`) — 무거운 무기라도 한 프레임을 통째로 먹지 않는다.
3. **예열된 무기만 장착** — 예열이 안 된 무기는 그 프레임에 장착하지 않고 예열만 한다.

검사: `node tools/command-freeze-test.mjs` ②·③ — 일시정지 30프레임 동안 예열·장착 0회,
큐는 그대로 남고, 풀리면 프레임당 1종씩 이어서 완료(예열 횟수 == 장착 횟수).

## §4.72 마법연성대 (시설)

연성은 **마법연성대**(`facility_arcana`)가 있어야 살 수 있다.

| 항목 | 값 |
| --- | --- |
| 이름 | 🔮 마법연성대 (건설 → 시설) |
| 건설 재료 | **골드 10 · 목재 1** |
| 분류 | `category: 'facility'` · `kind: 'arcana'` · hp 900 · 반경 9m |
| 효과 | 이 건물이 하나라도 서 있으면 `Y` 패널에서 연성 11종을 살 수 있다 |

- 건설 목록에는 `FACILITY_TABLE` 에 한 줄 넣으면 자동으로 뜬다(작업대·마법부여대와 같은 경로).
- 판정은 순수 함수 `hasArcanaTable(turrets)` — 부서진(`destroyed`) 연성대는 쳐 주지 않는다.
- 없으면 구매가 거부된다: `{ ok:false, reason:'마법연성대가 필요합니다 — 건설에서 골드 10 · 목재 1로 세우세요' }`,
  패널에는 빨간 안내 줄이 뜨고 구매 버튼이 비활성화된다.
- 검사: `npm run command-test` §⑤ (재료·분류·판정·구매 경로·패널 안내 8검사).

## §4.73 설정·일시정지에서 멈춤 (고침)

**증상** — ESC 로 설정(또는 일시정지) 화면을 열면 화면이 얼어붙었다. 무기 소환과 무관하게 재현됐다.

**원인** — 패널은 9px 백드롭 블러(`--glass-blur`)를 쓴다. 그 패널이 **매 프레임 새로 그려지는 3D 캔버스 위에**
올라가면, 브라우저가 매 프레임 배경 전체를 다시 흐리게 만든다(합성 비용이 프레임마다 발생).
일시정지 중에는 게임 세계가 변하지 않는데도 3D 렌더를 계속 돌린 것이 원인이다.

**고침** — 일시정지·게임오버·메뉴에서는 **3D 렌더를 건너뛴다**.
- 상태가 바뀐 직후 한 번(`_viewDirty`)과 1.5초에 한 번만 다시 그린다(화면이 어긋나지 않게).
- `pause()`·`resume()` 에서도 dirty 를 세워 즉시 한 프레임 그린다.
- 결과: 멈춰 있는 동안 프레임 비용이 사실상 사라지고, 백드롭 블러는 정지한 배경을 그대로 쓴다.

검사: `tools/smoke.mjs` 의 "일시정지·메뉴에서는 3D 렌더를 멈춘다" · "풀릴 때·멈출 때 화면을 한 번 다시 그린다".

## §4.74 포탈 아이템화 — 월드 포탈 삭제 · 제작 · 설치

**요청** — 게임 안에 서 있던 포탈을 없애고, 포탈을 아이템으로 만들어 제작법을 붙인다.

**바뀐 것**
- `client/src/world/teleports.js`(`TeleportField`)를 **삭제**했다. 지형마다 서 있던 무료 월드 포탈과
  `world.teleports`/장면 그룹 `teleports` 가 사라졌다.
- 포탈 8종(`portal_base`, `portal_tier1`~`portal_tier7`)은 **제작 아이템**으로만 얻는다:
  `PORTAL_RECIPES`(`client/src/crafting.js`) — 모루(T1)·대장간(T2)…창세의 제단(T7)에서
  골드·목재·광물로 제작한다. **아이템 1개 = 포탈 1개**.
- 포탈 건물의 `cost` 는 `{ gold: 0, wood: 0, minerals: {} }` + `craftOnly: true` 로 두고,
  `TurretSystem.canPlace`/`place` 가 `getItem`/`takeItem` 콜백으로 **보유 아이템을 확인·소모**한다.
  아이템이 없으면 `'포탈 아이템이 없습니다 — 제작(C)에서 만드세요'` 로 거부한다.
- 건설( B ) 목록·카테고리에서 `portal` 을 뺐다(`TURRET_CATEGORIES`, `build.list`). 설치는
  제작(C) 패널의 **[설치]** 버튼 → `beginPortalPlacement(dest)` → 기존 건설 모드(좌클릭)로 이어진다.
- `N` 은 설치한 포탈 9m 안에서만 그 목적지로 이동하고(`travelToRegion`), 근처에 없으면
  포탈 안내 패널(설치 목록·만들 수 있는 포탈 8종·제작 패널 열기)을 연다.
- 보유 아이템은 `CraftingSystem.portalItems` 에 저장·복원된다(`toJSON`/`fromJSON`). 인벤토리(I)에 표시된다.

**검사**
- `tools/smoke.mjs` 927/927 — 월드 포탈 제거·제작법 8종·아이템 소모 배선.
- `tools/headless.mjs` 574/574 — 제작대 없음/아이템 없음 거부 · 제작 비용 · 설치 소모 · 저장/복원.
- `tools/ui-dom-smoke.mjs` 333/333 — 포탈 안내 패널(이동 버튼 0 · 제작 안내 8종).
- 실전 브라우저(`.tmp/portal-live.mjs`) 21/21 — 제작 → 설치 → 아이템 소모 → N 이동(161m) → 패널 UI.

## §4.75 건마스터 · 쌍권총 7티어 · 은하수의 밤 · 무기 스킬 HUD

**요청** — 직업에 건마스터를 추가해 쌍권총을 티어별로 쓰게 하고, 유물 등급은 은하수 테마의 쌍권총
"은하수의 밤"으로 만든다. 무기 임팩트를 추가하고, 무기를 들면 무기 스킬 키와 스킬 이름이 HUD 에 보이게 한다.

**데이터 (`client/src/data.js`)**
- 계열 `gun`(쌍권총) — `kind: 'gun'` · `hands: 2` · `projectile: true` · `burst: 2` · 기본 피해 13 · 쿨다운 0.34 · 사거리 46 · 탄약 소모 없음.
- 7티어 이름 — 낡은 / 강철 / 서리 / 번개 / 황혼 / 성운 / **은하수의 밤**. 속성은 T3 얼음 · T4 번개 · T5 어둠 · T6 비전 · T7 공허.
- `WEAPON_MOTIONS.gun` — 스왑 `cross`(0.48s) · 사격 `recoil`(0.2s, release 0.02) · 스킬 `galaxy`(1.35s) · 반동 kick.
- `WEAPON_IMPACTS.gun` = `bullet`(금빛 탄흔·작은 고리·가벼운 흔들림/impactBullet) +
  `WEAPON_IMPACT_OVERRIDES.gun_relic` = `galaxy`(보라 별가루 28 · 이중 고리 · impactGalaxy).
- `WEAPON_ULTIMATES.galaxyNight` — 무기 `gun_relic` · 반경 42m · 쿨다운 150초 · 별 120개 나선 · 고리 4겹.
- `CLASSES.gunmaster` — 건마스터 · `family: 'gun'` · 대표 무기 `gun_relic` · 패시브 무기 피해 ×1.12 · 이동 ×1.04.
- 수량은 **무기 82종(코어 81)** · 계열 11개(요정의 지팡이 포함) · 직업 9개(초심자 포함).
  제작 레시피 **48종**(계열 자동 활 7 + 쌍권총 7 + 요정 지팡이 7 포함) · 작업대 **81종** · 계열 탭 **12개**.

**뷰모델 (`client/src/player/weaponRig.js`)**
- `buildDualPistols()` — 좌우 두 자루(슬라이드·배럴·그립·방아쇠울·가늠쇠). 3티어 이상 룬 고리, 5티어 이상 장식.
- `gun_relic` 은 은하수 전용 — 회전하는 성운 원반 · 토러스 후광 · 36개 별 `THREE.Points` · 총구 섬광 오브.
- `group.userData.muzzles = [왼총구, 오른총구]` · `muzzleAt(index)` 가 인덱스에 따라 번갈아 반환한다.
  기존 `muzzlePosition` 은 `muzzleAt(0)` 으로 유지된다.

**사격 (`client/src/main.js`)**
- `_attack()` 의 `kind === 'gun'` 분기 → `_gunAttack(weapon)`. `_onWeaponRelease` 는 총을 근접 판정에서 제외한다.
- 한 번에 **두 발** — `muzzleAt(0)`/`muzzleAt(1)` 에서 각각 스폰, 좌우 `spread` 0.005(유물)/0.011, 속도 96 · 반경 0.42 · 사거리 46.
- 피해 = `weapon.damage` × 직업 배율 × 장비/마법부여/아르카나 배율(반올림). 탄약을 쓰지 않는다.
- 쿨다운은 `_gunReadyAt` 하나로 묶어 두 발이 같은 리듬으로 나간다. 스폰이 실패하면 쿨다운을 걸지 않는다.
- 발사음은 `gunshot`/`gunshotGalaxy`, 뷰모델 모션은 `silent` 로 겹치는 사격음을 막는다.
- 명중 시 `impacts.hit({ weaponId })` + `triggerRecoil()` + HUD 히트마커. 유물은 `power 1.25`, 일반은 0.9.

**임팩트 (`client/src/player/impacts.js` · `client/src/audio.js`)**
- `KIND_DEFAULTS.bullet`/`star` 추가. `hit()` 의 `bullet` 은 탄흔 + 작은 고리, `galaxy` 는 별가루 + 공허 + 교차 고리 2겹.
- `skill()` 의 `galaxy` 는 4겹 확장 고리 · 별 120 · 안쪽으로 빨려드는 공허 · 성스러운 반짝임.
- 효과음 `gunshot` · `gunshotGalaxy` · `impactBullet` · `impactGalaxy` · `ultimateGalaxy`.

**HUD (`client/src/ui/hud.js` · `styles.css`)**
- `.hud-weaponskill` — 장착 무기의 **[키캡] + 라벨(무기 스킬/기본 공격) + 이름 + 쿨다운**.
- `game.weaponSkill()` 이 유일한 데이터원 — `{ key, label, name, weaponId, ultimate, kind, cooldown, readyIn, ready }`.
  키는 사용자 키 설정의 궁극기 키(기본 `R`), 궁극기가 없으면 `좌클릭 · 기본 공격 · 무기 이름 · 연사`.
- 맨손은 `null` 로 칩을 숨긴다. 쿨다운 중에는 `13초` 처럼 남은 초와 `is-cooling`, 유물 쌍권총은 `is-relic` 강조.
- 장착 알림에도 `· R 무기 스킬 은하수의 밤` 을 덧붙인다.

**검사**
- `tools/smoke.mjs` 971/971 — 82종·11계열·8직업·쌍권총/요정 지팡이 7티어·임팩트·레시피·배선 문자열.
- `tools/headless.mjs` 594/594 — 뷰모델 두 총구·요정 꽃잎 뷰모델·추적 꽃가루·bullet/galaxy 임팩트·은하수 궁극기.
- `tools/ui-dom-smoke.mjs` 349/349 — HUD 무기 스킬·81종/12탭·8직업 카드.
- `tools/base-bugtest.mjs` 80/80 — 활·쌍권총 T1~T7 제단 레시피 분리.
- 실전 브라우저 `.tmp/gun-live.mjs` 20/20 — 은하수의 밤 장착·두 총구 dx 0.404·2발 사격·실제 명중 2회·쿨다운·HUD R/이름/150초·
  건마스터 카드·페이지 예외 0.

## §4.76 조준선 설정 · 세이브 불러오기 · 멀티 창 배율 · 관리자/네트워크 환경 (v1.12.0)

**요청** — 설정에서 조준선을 바꾸고, 멀티플레이 창 배율을 바로잡고, 티어별 무기(유물 포함) 목록을 뽑고,
이전부터 실패하던 관리자 계정·`/api/net` 환경 문제를 고치고, 최적화·버그·멀티플레이를 검증하고,
싱글 세이브를 불러오는 버튼을 만든다.

**조준선 (`client/src/ui/crosshair.js` · `client/src/ui/panels.js` · `client/src/ui/hud.js`)**
- 새 모듈 `crosshair.js` — `CROSSHAIR_KEY = 'fortress.crosshair.v1'`.
  `CROSSHAIR_STYLES` 6종(`classic` 십자 · `dot` 점 · `circle` 원 · `x` 엑스 · `t` T자 · `twin` 쌍점),
  `CROSSHAIR_COLORS` 6종(금빛 · 흰색 · 보라 · 초록 · 빨강 · 하늘), `DEFAULT_CROSSHAIR = { style:'classic', color:'gold', size:1 }`.
- 크기 0.7~1.8(70~180%)로 제한하고 0.05 단위로 반올림. 잘못된 저장값은 기본값으로 복구한다.
- `applyCrosshair(el, prefs)` 가 `#crosshair[data-crosshair]` 와 CSS 변수 `--ch-color` · `--ch-glow` · `--ch-size` 를 설정한다.
  HUD 는 생성 시 저장값을 읽고, `setCrosshair(prefs)` 로 게임 중 즉시 바꾼다.
- 설정 패널 — 6개 모양 버튼 · 6개 색 버튼 · 크기 슬라이더 · 실시간 미리보기 · [기본값으로].
  변경은 `crosshair:change` 이벤트 → `main.js` 가 `this.ui.hud.setCrosshair()` 로 전달하고 localStorage 에 저장한다.
- CSS — 기존 십자 HUD 를 변수 기반으로 바꾸고 `[data-crosshair="dot|circle|x|t|twin"]` 프리셋을 추가했다.
  발사 중(`is-firing`)·저체력 색상도 유지된다.

**세이브 불러오기 (`client/src/ui/menu.js`)**
- 메인 화면의 [싱글 플레이]·[멀티플레이] 옆에 `[📂 불러오기]` 를 실제로 렌더한다(이전에는 버튼 정의만 있고 `visible` 이 꺼져 있었다).
  `data-act="load"` · `data-mode="world|multi"` 이고, 싱글 카드 안에도 `data-act="menu-load"` 버튼이 있다.
- 클릭 → `_heroAct('load')` → `menu` 의 `load` 이벤트 → `main.load()` → `loadSaveSlot(id)`/`_restore`.
- 설정 패널의 기존 세이브 슬롯 목록([불러오기]/[삭제])도 그대로 동작한다.

**멀티플레이 창 배율 (`client/src/ui/ui-polish.css`)**
- 원인 — `.menu` 는 `width:min(880px,96vw)` + `padding:20px` 인데, 그 안의 `.menu-card.menu-multi` 가 다시 `96vw`/880px 이라
  카드가 메뉴 프레임보다 21~40px 넓었다. 390px 창에서는 오른쪽이 잘렸고, 1366px 이하에서도 프레임을 넘었다.
- 수정 — 멀티 화면 `.menu` 를 `min(920px,96vw)`, `.menu-shell`/`.menu-body` 를 `width:100%`, 카드를 `min(880px,100%)` 로 맞췄다.
  싱글 화면도 `.menu` 800px · 카드 `min(760px,100%)` 로 같은 규칙을 적용했다. 방 목록은 `width:100%`.
- 실측(Chrome headless, `Emulation.setDeviceMetricsOverride`) — 1920/1600/1440/1366/1280/1024/390 폭에서
  카드 오른쪽이 메뉴 프레임 안(`right <= menu.right`)이고 `scrollWidth == clientWidth`, 가로 스크롤 0.

**무기 목록 (`docs/WEAPONS.md`)**
- `client/src/data.js` 의 실제 데이터에서 생성 — **82종** · 11계열 · T1~T7 + 비밀(T8).
  티어별 표(계열·등급·이름·원소·피해·쿨다운·사거리·궁극기), 계열 요약, 직업별 시그니처.
- T7 유물 14종(계열 최종 유물 + 요정 여왕의 홀·창세의 지팡이·창세의 대검·창세의 낫·이 사랑, 영원히 등 제작 전용·특수 포함), T8 비밀 2종(꿈나무 계열).

**관리자 계정 · `/api/net` 환경**
- `server/api/auth.js` — `.env` 의 `ADMIN_PASSWORD` 가 있으면 그 값을 쓴다.
  없으면 `data/admin-password.txt`(또는 `ADMIN_PASSWORD_FILE`)를 읽고, 파일도 없을 때만 한 번 생성해 저장한다.
  이전에는 매 시작마다 무작위 비밀번호를 만들어 **재시작 후 관리자 로그인이 불가능**했다. 생성한 비밀번호는 로그에 찍지 않는다.
- `tools/e2e-net.mjs` — `.env` 를 `fileURLToPath(new URL('../.env', import.meta.url))` 로 읽는다.
  한글 경로에서 `new URL(...).pathname` 이 퍼센트 인코딩되어 `.env` 를 못 읽던 문제를 고쳤다.
  `/api/net` 의 포트 검사는 하드코딩 3001 대신 `E2E_BASE` 의 포트를 쓴다(예: 3151 테스트 서버).
- `server/index.js` 의 `/api/net` 은 실제 `PORT` 로 `localShareUrls()` 를 만든다. 서버 코드는 포트를 3001 로 고정하지 않는다.

**최적화 — 실제 프레임 시간 (`client/src/main.js` · `client/src/ui/adaptive.js`)**
- 게임 시뮬레이션은 dt 를 0.05초로 자르지만, FPS 모니터에는 **원본 프레임 시간(rawDt)** 을 넘긴다.
  이전에는 20 FPS 아래에서도 20 FPS 로 표시되어 렉을 숨겼다.
- 적응형 해상도·자동 화질·메모리 감시의 누적 시간도 `_frameDt`(실제 시간)를 쓴다.
  이전에는 저FPS에서 3초 웜업이 실제로는 수십 초 걸려 해상도가 제때 내려가지 않았다.
- `AdaptiveResolution.baseRatio` 를 `devicePixelRatio` 이하로 제한한다.
  이전에는 dpr=1 화면에서 preset 1.5 × scale 0.68 = 1.02 로 **오히려 해상도가 올라가** 더 느려질 수 있었다.

**검사**
- `tools/smoke.mjs` 951/951 — 조준선 6종·저장·HUD 변수, 무기 문서 75/T7 13/T8 2, 멀티 배율 CSS, FPS 실제 시간, dpr 상한.
- `tools/headless.mjs` 578/578 — 기존 통합 시뮬레이션 전부.
- `tools/ui-dom-smoke.mjs` 342/342 — 조준선 설정 6+6·미리보기·모양/색/크기 이벤트, 메인 [불러오기] 2개·load 이벤트.
- `tools/mp-check.mjs` 37/37 — 실제 서버 + 소켓 2~3개: 방 생성/참가/시작/중계/회전/철거/재접속/방장 위임/비공개.
- `node tools/e2e-net.mjs` 94/94 — 관리자 로그인·관리자 API·`/api/net`(포트 3151) 포함.
- `npm run pages` 12/0 — 배지 v1.12.0, 특징 카드 6, 설치 3단계, 가로 넘침 없음.
- 실전 브라우저 — 조준선 12/12(모양 x·초록·140% 즉시 반영, 새로고침 유지, 게임 중 표시),
  세이브 9/9(저장 → 새로고침 → [불러오기] → 같은 시드 복원), 최적화 13/13(적 120기, 드로콜 603, 삼각형 212,740,
  적응형 60%, 지오메트리 41, 예외 0). 헤드리스 SwiftShader 는 3 FPS 수준이라 FPS 절대값은 실제 GPU 성능이 아니다.

## §4.77 포탑·시설 철거 25% 환불 · 시드 선택창 불러오기 (v1.13.0 → v1.13.1)

**요청** — 포탑과 시설물을 철거하는 기능을 만들고, 철거하면 재료의 25%를 돌려주며,
불러오기 버튼을 시드 선택창에 넣고, 멀티플레이에서도 철거가 동작하게 한다.
GitHub 에 이미 올라가 있으면 다시 올리지 않는다.

**철거 모드 (`client/src/main.js` · `client/src/systems/turrets.js` · `client/src/ui/panels.js` · `client/src/ui/hud.js`)**
- `Z`(키 설정 `demolish`, 기본 `KeyZ`)로 켜고 끈다. 건설 패널에도 `[🔨 철거 모드]` 버튼이 있다.
  모드를 켜면 건설 모드·건설창을 닫고 포인터 잠금으로 돌아간다.
- 조준선 중앙에서 최대 10m 레이캐스트해 **포탑·시설을 가리지 않고** `userData.turret` 을 찾는다.
  `TurretSystem.turrets` 가 이미 모든 건물을 담으므로 별도 시설 목록을 만들지 않는다.
- 좌클릭 → `_tryDemolish()` → 대상 소유권 확인 → `TurretSystem.sell(id)` → `net.sendTurretSell(id)`.
  `sell()` 은 `SELL_REFUND = 0.25` 로 골드·목재·광물을 각각 `Math.floor(투자량 × 0.25)` 환불한다(포탑·시설 공통).
- HUD `.hud-demolish` — 대상 이름·티어, `좌클릭 철거 — 재료 25% 환불 · Z 취소` 를 보여 준다.
  대상이 없으면 조준 안내, 동료 건물이면 `⛔ 동료 건물`·`내가 지은 건물만` 안내로 바뀐다.
  조준선은 철거 중 적색으로 바뀌고, 종료하면 사용자가 설정한 색으로 돌아간다
  (`applyCrosshair` 가 인라인 변수를 쓰므로 CSS 클래스가 아니라 HUD 에서 색을 덧씌운다).
- 페이지 예외·중복 환불 없음 — 원격 철거는 `removeRemote()` 로 메시만 지우고 환불하지 않는다.
- v1.13.1 — `B` 로 건설을 다시 켜거나 숫자/카드로 포탑을 고르면 철거 모드를 함께 끈다.
  두 모드가 동시에 켜져 조준선·좌클릭이 엇갈리는 문제를 막는다.

**멀티플레이**
- 클라이언트는 `multiplayer` 일 때 `turret.ownerId === net.id` 인 건물만 대상으로 삼는다.
- 서버 `Room.removeTurret(id, turretId)` 가 소유자 또는 방장만 허용하고, 성공 시에만
  `turret:sell` 을 다른 소켓에 1회 중계한다. 남의 건물 요청은 스냅샷에 그대로 남는다(기존 37/37 검사).
- 설치 id 는 플레이어별 접두사(`net.id 앞 8자 + 시간 + 난수`)라 철거가 남의 건물 id 와 충돌하지 않는다.

**시드 선택창 불러오기 (`client/src/ui/menu.js`)**
- 싱글 카드의 시드 줄(`.solo-seedrow`)에 `[📂 불러오기]`(`data-act="menu-load"` · `data-mode="solo"`)를 넣었다.
  기존 하단 버튼은 중복이라 제거했고, 클릭 시 `load` 이벤트 → `main.load()` → `loadSaveSlot()` 경로는 그대로다.
- 메인 카드의 싱글·멀티 [불러오기] 2개는 유지한다.

**검사**
- `tools/smoke.mjs` 954/954 — 키 30개(Z), `SELL_REFUND = 0.25`, 철거 레이캐스트·`sendTurretSell`·건설 패널 배선.
- `tools/headless.mjs` 579/579 — 포탑 철거 환불 25%, 시설물 철거 환불 25%, 기존 통합 시뮬레이션.
- `tools/ui-dom-smoke.mjs` 348/348 — KEYBINDS 28행(Z), 건설 패널 철거 버튼 이벤트, HUD 대상/25%/동료 차단/종료,
  시드 선택 줄 [불러오기].
- `tools/mp-check.mjs` 37/37 — 실제 소켓 2~3개: 설치·회전·철거 중계, 남의 건물 철거 거부, 재접속·방장 위임.
- 실전 브라우저 `.tmp/demolish-live.mjs` 17/17 — 시드 줄 버튼·load(solo), Z 토글, 조준선 대상(작업대),
  HUD 이름/25%, 작업대 환불 162g·40w·철 1·구리 1, 포탑 환불 15g·3w, 조준선 적색/원복, 건설 패널 버튼, 페이지 예외 0.

## §4.78 건설 50/40 · 맨땅 채굴 · 전직 1티어 무기 · T2 재료 · 초대코드 · 6초 리스폰 (v1.14.0)

**요청** — 건물은 최대 50개, 작업대 같은 시설은 40개로 제한한다. 채굴기를 맨땅에 설치해도 광물을 캐게 한다.
전직할 때 직업별 1티어 무기를 지급한다. T2 채굴탑 건설 재료에서 은을 뺀다.
초대코드 멀티에서 "방을 찾을 수 없습니다"를 고치고, 관리자 계정 로그인을 확인한다.
나무·광물 리스폰 시간을 6초로 줄인다.

**건설 한도 (`client/src/systems/turrets.js` · `client/src/ui/panels.js`)**
- `MAX_TURRETS = 50`(전선 제외 전체) · `MAX_FACILITIES = 40`(그중 `category === 'facility'`).
- `structureCounts()` 하나로 전체/시설 수를 센다. `canPlace`·`place`·`placeRemote` 가 같은 계산을 쓴다.
  전선은 기존처럼 `MAX_CABLES = 160` 으로 따로 세고, 전체 50개에 포함하지 않는다.
- 거부 문구 — 전체 `건물은 최대 50개까지...`, 시설 `시설은 최대 40개까지...(전체 50개 안)`.
- 건설 패널 상단에 `전체 n/50 · 시설 n/40 (전선 별도)` 현황을 표시한다.

**맨땅 채굴 (`client/src/systems/turrets.js`)**
- 기존 `_updateAutoMiner` 의 지형 시추 부분을 `_drillTerrain(dt, rate)` 로 분리했다.
- `mineral` 이 없는 **채굴 카테고리 탑**도 `_drillTerrain` 을 호출해 주변 광물 없이 지형 티어 광물을 캔다.
  `채굴탑 자동 채굴` 검사는 광물 위에 놓았을 때, 새 `맨땅 채굴탑` 검사는 주변 12m 안에 광물이 없는 위치에서
  15초 동안 산출물이 늘어나는지 확인한다.
- 채굴기(시설)의 맨땅 시추는 기존과 같다 — 3kW 전력이 필요하고, 전기가 없으면 멈춘다(계약 §4.63).

**전직 보상 (`client/src/main.js` · `client/src/ui/panels.js`)**
- `advance`(전직) 이벤트에서 `family_common`(1티어 일반 무기)을 지급한다.
  마법사 `staff_common` · 기사 `sword1h_common` · 광전사 `sword2h_common` · 사신 `scythe_common` ·
  그림자 `dagger_common` · 아처 `bow_common` · 건마스터 `gun_common`.
- 이미 보유한 무기는 중복 지급하지 않는다. 전직 직후 현재 무기를 쓸 수 없으면 지급한 1티어를 바로 장착한다.
- 승급(`promote`)은 1티어 지급 대상이 아니다. 전직 패널에 `전직 보상` 안내 줄을 추가했다.

**T2 채굴탑 재료 (`client/src/data.js`)**
- `mining_t2`(곡괭이탑)의 건설 재료에서 `silver` 를 제거했다. 남는 광물 재료가 없으므로 **골드 190 · 목재 53** 만 든다.
  T1·T3 이상 채굴탑과 다른 시설의 재료는 그대로다.

**초대코드 참가 (`client/src/ui/lobby.js` · `server/game/Room.js` · `server/game/RoomManager.js`)**
- 원인 후보 1 — 방장이 코드를 만든 직후 친구가 바로 입력하면 서버에 방이 아직 없을 수 있다.
  로비 `join` 이 `방을 찾을 수 없습니다` 에 한해 350ms 간격으로 최대 3회 재시도한다.
- 원인 후보 2 — 로비에서 방장이 새로고침·와이파이 순단으로 끊기면 방을 즉시 지웠다.
  `handleDisconnect` 는 `keepEmpty` 로 20초 유예를 두고, 그 안에 같은 코드로 참가하면 새 방장이 된다.
  명시적 `room:leave` 는 기존처럼 즉시 삭제한다(빈 방 코드 만료 검사 유지).
- 유예 중 빈 방은 공개 방 목록에서 숨긴다(`players.size > 0`).
- 실전 검증 — 노드 소켓이 만든 코드로 브라우저 로비가 참가해 2명·`view === 'room'` 확인.
  `mp-check` 는 방장 소켓을 끊은 뒤 250ms 후 같은 코드 참가가 성공하는지 확인한다.

**관리자 로그인 (`server/api/auth.js`)**
- 로그인 아이디 조회를 정확한 철자 우선, 없을 때만 `COLLATE NOCASE` 로 한 번 더 찾는다.
  `Admin`·`ADMIN` 처럼 대소문자를 잘못 입력해도 `.env` 의 관리자 계정으로 로그인된다.
- 관리자 계정 자체는 기존처럼 서버 시작 시 `.env` 의 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 로 보장·재설정된다.
  실제 자격 증명은 저장소에 적지 않는다(설치 폴더 `.env`).

**6초 리스폰 (`client/src/world/minerals.js` · `client/src/world/trees.js`)**
- `RESPAWN_DELAY` 를 광물 120→6, 나무 90→6 으로 바꿨다. 고갈 시 `respawnAt = _time + 6`.
- 검사 — 5.9초에는 아직 없고 6.1초에 광물 HP·나무 상태가 복구되는지 실제 필드에서 확인한다.

**검사**
- `tools/smoke.mjs` 959/959 — 기존 계약 전부 + 전직 1티어 배선·T2 재료·건설 상한·6초 리스폰.
- `tools/headless.mjs` 592/592 — 전체 50·시설 40 거부, 맨땅 채굴탑 산출, T2 은 제거, 직업별 1티어 무기,
  광물·나무 6초 리스폰.
- `tools/ui-dom-smoke.mjs` 348/348 — 건설 패널·전직 패널·로비 기존 경로.
- `tools/mp-check.mjs` 38/38 — 방장 접속 끊김 뒤 20초 초대코드 유지 포함.
- `tools/e2e-net.mjs` 95/95 — 관리자 로그인(대소문자 무시 포함)·관리자 API·`/api/net`(포트 3151).
- 실전 브라우저 `.tmp/feature-live.mjs` 19/19 — 7직업 전직 1티어 지급·즉시 장착, 건설 한도 UI,
  T2 재료, 6초 설정, 노드 호스트 코드 → 브라우저 로비 참가(2명), 페이지 예외 0.
- `npm run verify` — 2,258개 통과(빌드 포함).

## §4.79 티어별 포탑 피해 — 1티어 100% · 47% 복리 (v1.15.0)

**요청** — 포탑 피해를 티어별로 다시 잡는다. 1티어를 100% 기준으로 두고 티어마다 47%씩 올리며,
몬스터 체력을 기준으로 밸런스를 맞춘다.

**변경 (`client/src/data.js`)**
- `TOWER_TIER_DAMAGE_GROWTH = 1.47` · `TOWER_TIER_DAMAGE_MULT` 를 새로 두고
  `TOWER_TIER_SCALE[tier].damage` 가 이 표를 쓰게 했다.
  `T1 1.0000 → T2 1.4700 → T3 2.1609 → T4 3.1765 → T5 4.6695 → T6 6.8641 → T7 10.0903`.
- 실제 피해식은 그대로 `fam.damage × tier.damage × TURRET_DAMAGE_SCALE(60)` 이다.
  1티어 계열 기본 피해는 바꾸지 않아 초반 난이도가 유지된다.
  화살탑 기준 `780 → 1,147 → 1,686 → 2,478 → 3,642 → 5,354 → 7,870`.
- 이전 배율(1 / 1.75 / 3.1 / 5.4 / 9.5 / 17 / 31)은 7티어가 1티어의 31배였다.
  새 표는 10.09배로, 상위 티어가 몬스터 체력 성장보다 지나치게 폭주하지 않게 낮춘 값이다.

**몬스터 체력 기준**
- 표준 고블린(`hpMult 1`) 체력은 `60 × 1.16^(웨이브-1)`(30웨이브 이후 성장 완만화)이다.
  30웨이브 이후 10웨이브당 성장은 `1.16^(10 × 0.28) ≈ ×1.515` 이므로 47% 성장은 그보다 조금 낮다.
- 기준 웨이브 `10 × 티어`의 표준 몬스터에 대해 티어 평균 피해의 처치 발수는
  T2 0.65발 · T3 1.97발 · T4 2.03발 · T5 2.09발 · T6 2.12발 · T7 2.19발이다.
  (1티어는 초반용으로 일부러 여유 있게 강하다 — 기존 780 피해 유지.)
- 즉 상위 티어일수록 한 발 피해가 무한정 커지는 대신, 기준 웨이브 몬스터를 1~3발에 정리하는 대역에 맞췄다.

**검사**
- `tools/smoke.mjs` 963/963 — 성장률 1.47·배율 표·T1 780/T7 7,870·T2~T7 기준 웨이브 0.5~3발 처치.
- `tools/headless.mjs` 592/592 — 기존 전투·건설·자원 시뮬레이션 전부.
- `tools/ui-dom-smoke.mjs` 348/348 · `tools/mp-check.mjs` 38/38 · `tools/e2e-net.mjs` 95/95.
- 실전 브라우저 `.tmp/feature-live.mjs` 20/20 — 건설 카드가 실제로 화살탑 T1 780 · T2 1,147 · T7 7,870을 표시.
- `npm run verify` — 2,262개 통과(빌드 포함).

## §4.80 서버 포트 변경 — 설정 · .env · 자동 재시작 (v1.16.0)

**요청** — 서버 포트를 바꾸는 기능.

**설정 위치 (`client/src/ui/panels.js`)**
- **설정 → 서버 · 포트**에 현재 포트와 `1024~65535` 입력칸을 둔다.
- 관리자만 **[포트 변경 · 재시작]** 을 누를 수 있다. 게스트에게는 "관리자 계정으로 로그인하면 바꿀 수 있습니다"만 보인다.
- `GET /api/server/port` 는 현재 포트/허용 범위/재시작 가능 여부를 공개한다.
- `POST /api/server/port` 는 `requireAdmin` 을 통과해야 하며 `{port, restart}` 를 받는다.
  - 정수가 아니거나 `1024` 미만/`65535` 초과 → 400
  - 현재 포트와 같음 → 400
  - 이미 사용 중 → 409
  - 다른 요청이 변경 중 → 409

**저장 (`server/port-config.js`)**
- `.env` 의 `PORT` 줄만 바꾼다. `ADMIN_PASSWORD`·`JWT_SECRET` 등 다른 줄은 보존하고,
  기존 `PORT` 줄이 여러 개면 하나로 합친다. 임시 파일에 쓴 뒤 rename 해 중간 깨짐을 막는다.
- `YOSE_ENV_FILE` 로 다른 env 파일을 지정할 수 있다(테스트/운영 분리).
- 서버·`app.js`·`tools/dev.mjs`·`게임실행.vbs`·`run.cmd` 가 모두 같은 `.env` 의 `PORT` 를 읽는다.

**자동 재시작**
1. 새 포트가 비어 있는지 `net` 으로 먼저 검사한다.
2. 새 포트에 `node server/index.js` 를 detached 로 띄우고 `/api/health` 가 200 이 될 때까지 기다린다.
3. 성공하면 응답을 보낸 뒤 0.7초 후 기존 서버를 정상 종료한다. 브라우저는 새 포트의 health 를 폴링한 뒤 새 주소로 이동한다.
4. 새 서버가 뜨지 못하면 `.env` 를 원래 포트로 되돌리고 기존 서버를 계속 쓴다.
- `YOSE_NO_PORT_RESTART=1` 이면 저장만 하고 재시작하지 않는다.
- 멀티 방은 서버 프로세스가 바뀌므로 종료된다. 주소(origin)가 바뀌므로 로그인 토큰·닉네임(localStorage)도 새 주소에서 다시 설정해야 할 수 있다(설정 화면에 경고).

**런처**
- `app.js` 는 `.env` 의 PORT 를 읽어 그 포트로 서버를 띄우고 앱 창을 연다.
- `게임실행.vbs` 는 `.env` 를 읽어 URL 을 만든다(설치 프로그램이 만드는 VBS 템플릿도 동일).
- `run.cmd` 는 `.env` 의 PORT 로 게임 주소·방화벽 규칙을 만든다.
- `tools/dev.mjs` 는 dotenv 로 `.env` 를 먼저 읽는다.
- `installer/install.ps1`·`launcher/install.ps1` 가 만드는 VBS 와 `installer/install-gui.ps1`·`installer/launcher.ps1` 도 `.env` 의 PORT 를 읽는다.

**검사**
- `tools/smoke.mjs` 965/965 — 포트 범위 검사 · `.env` PORT만 수정/비밀 값 보존.
- `tools/ui-dom-smoke.mjs` 349/349 — 설정 패널의 **서버 · 포트** 구역/권한 안내.
- `tools/headless.mjs` 592/592 · 보스 21/21 · 날개 88/88 · 캐릭터 71/71 · 기지 80/80 · 미니게임 61/61 · mp 38/38.
- 실전 브라우저 관리자 로그인 `.tmp/admin-ui-live.mjs` 5/5 — 실제 설정 화면에 현재 포트 3151·입력·버튼 표시.
- 실전 브라우저 포트 변경 `.tmp/port-ui-flow.mjs` 6/6 — 설정에서 3171→3172 입력·클릭 → 새 포트 3172 로 실제 이동·게임 재로딩.
- 실서버 API 실측 — 401(토큰 없음)/400(범위 밖·현재 포트와 동일)/3161→3162→3161 자동 재시작, 이전 포트 DOWN/새 포트 OK, `.env`의 관리자 값 보존.
- `npm run verify` — 2,273개 통과(빌드 포함). `tools/cmd-lint.mjs` 13/13.

---

## §4.81 요정 직업과 요정의 지팡이 (v1.17.0)

**직업**
- `CLASSES` 에 `fairy`(요정, 🧚)를 추가한다. 계열은 `fairywand` 하나이며, 다른 직업은 이 계열을 쓸 수 없다.
- 패시브: `manaRegen ×1.3` · `moveSpeed ×1.08` · `weaponDamage ×1.08`. 전직 단계 배율은 기존 `classModifiers()` 규칙을 그대로 따른다.
- 대표 무기는 T7 `fairywand_relic`(요정 여왕의 홀)이다.

**무기 7티어**
- `fairywand_common`(T1) ~ `fairywand_relic`(T7), 총 7종. `WEAPONS`/`WEAPON_BY_ID`/`WEAPON_TOTAL_COUNT` 에 포함된다.
- 이름: 요정의 지팡이 → 꽃망울 → 이슬빛 → 달빛 → 여왕의 → 세계수의 → 요정 여왕의 홀.
- 수치는 계열 기본 피해 20 × 등급 배율로 자동 생성한다. `kind:'wand'`, `behavior:'homing'`, 사거리 64, 쿨다운 0.62초부터 등급마다 소폭 감소.
- 공격은 `main.js _wandAttack()` 이 담당한다. 다른 지팡이(마법 습득식 `kind:'ranged'`)와 달리 **무기 티어 피해 × 직업/장비/마법부여 배율**이 그대로 들어가고, 투사체가 가장 가까운 적을 추적한다. 명중 시 `fairywand` 임팩트(꽃가루/꽃잎)가 터진다.
- 뷰모델은 `staff.js buildStaffMesh({ fairy:true })` 가 만든다. 기존 지팡이 실루엣에 꽃잎 6장·꽃술 오브·빛 고리를 더하고, T7은 바깥 꽃잎 왕관과 두 번째 고리를 더한다. `weaponRig.js` 가 `fairywand` 형태를 이 빌더로 연결하며 T7 이름은 `fairy_wand_t7`.
- 스왑모션 `fairywand`(`fairyBloom`), 임팩트 `fairywand` 를 추가한다. 모든 무기에 스왑모션·공격/스킬/반동 모션·임팩트가 있어야 한다.

**전직 지급**
- `classStarterWeaponId(classId)` 가 `${family}_common` 을 반환한다. 요정은 `fairywand_common`.
- 기존 `_onClassChange(payload,'전직') → _grantClassStarterWeapon()` 경로가 T1을 `ownWeapon()` 으로 지급하고, 필요하면 즉시 장착한다. 이미 보유하면 중복 지급하지 않는다.
- T2~T7은 `crafting.js FAMILY_FORGE_FAMILIES` 에 `fairywand` 를 넣어 `forge_t2`~`forge_t7` 레시피로 만든다. T1도 같은 방식으로 제작할 수 있지만, 요정 전직 시 무료 지급이 우선이다.

**수량·문서**
- 무기 82종 = 기존 75 + 요정의 지팡이 7. 계열 11개, 직업 9개(초심자 포함)/8개 계열.
- `docs/WEAPONS.md` 82행, `README.md` 무기 목록·직업 설명, `docs/index.html` v1.17.0·업데이트 내역을 갱신한다.

**런처 업데이트 내역**
- `launcher/updates.json` · `installer/updates.json` · `downloader/updates.json` 에 버전별 제목/날짜/변경 항목을 둔다.
- 실제 배포 exe(`YoseGuardian-Launcher.exe`)는 `downloader/downloader.ps1` 을 쓰므로 이 파일에도 **[업데이트 내역]** 버튼과 읽기 전용 내역 창을 추가하고, `tools/build-launcher.mjs` payload 에 `updates.json` 을 넣는다.
- `launcher/launcher.ps1` · `installer/launcher.ps1` 에도 같은 버튼을 둔다. 시작 로그에 최신 버전 한 줄을 표시한다.
- `launcher.json` 의 `game.zip` 주소는 그대로 GitHub Releases 의 `latest/download/game.zip` 을 쓴다.

**검사**
- `tools/smoke.mjs` 971/971 — 요정 직업/7티어/전직 지급 id/레시피/잠금/문서 82행.
- `tools/headless.mjs` 594/594 — `fairy_wand_t7` 뷰모델(꽃잎·꽃술·고리)과 `fairywand` 스왑·임팩트.
- `tools/ui-dom-smoke.mjs` 349/349 — 요정 카드·T7 대표 무기·작업대 81종/12탭·요정 제작 탭 7종.
- 실전 브라우저 `.tmp/fairy-live.mjs` 13/13 — UI로 요정 전직 → T1 자동 지급·즉시 장착·중복 없음, T7 장착/뷰모델 `fairy_wand_t7`, 실제 `_attack()` 추적 꽃가루 1발·쿨다운.
- 런처 `-SelfTest` — launcher/installer 각각 업데이트 내역 3개 버전, downloader `-DumpControls` 에 **[업데이트 내역]** 버튼.
- `npm run verify` — 2,273개 통과(빌드 포함). `tools/cmd-lint.mjs` 13/13.

---

## §4.82 메인화면 정리 · 런처 시작 잠금 (v1.18.0)

**메인화면 [불러오기] 제거**
- `client/src/ui/menu.js` 에서 `menu-load` 액션, 싱글 시드 줄의 `solo-load` 버튼, 멀티 카드의 불러오기 버튼,
  `_renderHeroActions` 의 싱글·멀티 옆 `menu-cta-load` 버튼을 모두 제거한다.
- `_heroAct` 의 `load` 분기와 `main.js` 의 `menu.on('load')` 연결도 제거한다. 세이브 불러오기는
  **설정 → 내 세이브 목록**(`save:load`)만 남긴다.
- 제거된 버튼의 CSS(`.menu-cta-load`, `.solo-load`)도 함께 지운다.
- `tools/ui-dom-smoke.mjs` 는 메인·싱글·멀티 화면에 `[data-act="load"]`/`[data-act="menu-load"]` 가
  **0개**인지 검사한다.

**런처 [게임 시작] 잠금**
- `downloader/downloader.ps1` 에 `Set-PlayLocked` 를 둔다. 설치 전·새 버전·설치/업데이트 진행 중에는
  `$playBtn.Enabled = $false` 이고 문구는 `업데이트 후 시작` 또는 `설치/업데이트 중…` 이다.
- `Update-InstallButton` 이 설치 상태(`install`/`update`/`done`)와 `$script:selectedZip`/`$script:busy` 를
  함께 보고 잠금을 계산한다. 최신(`done`)이고 선택 파일이 없을 때만 `게임 시작` 으로 활성화한다.
- 설치 핸들러는 시작 시 잠그고, 성공/실패와 무관하게 `finally` 에서 상태를 다시 계산한다. 성공 후에는
  게임을 자동 실행하지 않고 **`[게임 시작]` 버튼을 활성화**한다(사용자 요청).
- `Start-Game` 은 `$script:busy`/`$script:playLocked` 이면 실행하지 않는다.
- `downloader/downloader.json` 에 `tag` 를 두어 오프라인에서도 내장 버전을 올바르게 판정한다.
- `tools/build-launcher.mjs`·`build-downloader.mjs` 는 `YOSE_TAG`(없으면 `git describe`)으로 내장 태그를 정하고,
  `Set-PlayLocked`·`업데이트 후 시작` 문구가 payload 에 있는지 검사한다.

**게임 코드 오류 처리**
- `main.js` 의 `panels.on('load')` 는 `this.load()` 의 rejection 을 잡아 `console.error` + 안내로 처리한다.
- `load()` 는 클라우드 저장 확인을 `try/catch` 로 감싸 실패해도 로컬 세이브로 진행한다.
- `_restore()` 는 `this.start()` 까지 `try` 안에서 실행해 복원 초기화 실패도 오류 안내로 끝낸다.

**검사**
- `tools/smoke.mjs` 972/972 — 불러오기 오류 처리(클라우드·복원) 소스 계약 1건 추가.
- `tools/ui-dom-smoke.mjs` 349/349 — 메인/싱글/멀티 불러오기 버튼 0개, 설정 세이브 목록 불러오기 유지.
- `tools/headless.mjs` 594/594 · 버그테스트 변동 없음.
- `npm run verify` — 2,274개 통과(빌드 포함). `tools/cmd-lint.mjs` 13/13.
- 런처 `-DumpControls` 로 설치 전/최신 상태의 `게임 시작` enabled 값을 확인한다.

---

## §4.83 지옥 난이도 · 디아블로 · 캐릭터 리뉴얼 (v1.19.0)

**난이도별 체력·공격력**
- `client/src/data.js` 의 `DIFFICULTIES` 는 `hpMult`·`attackMult`·`countMult`·`goldMult`·(선택)`maxWaves` 를 가진다.
  평온 `0.7/0.7` · 표준 `1.0/1.0` · 도전 `1.8/1.35` · 악몽 `3.0/2.0` · 지옥 `5.0/3.0`.
- `client/src/systems/enemies.js` 의 일반 몬스터 피해는
  `damage × (1 + 0.04 × (wave−1)) × difficulty.attackMult` 로 계산한다. 고정 스펙 보스(`type.attack`)는 배수를 타지 않는다.
- `server/game/protocol.js` 의 검증용 난이도 목록도 같은 수치·`hell.maxWaves=100` 을 갖는다. 레거시 `easy` 는 평온과 동일.

**지옥 = 100 웨이브 고정**
- `WaveSystem` 은 `difficulty.maxWaves` 를 읽어 `this.maxWaves` 에 둔다.
- 100 웨이브 완료 시 `phase='victory'`, `victory` 이벤트(`{ wave, wavesCleared, bossId, stats }`)를 한 번 발생시키고
  더 이상 다음 웨이브를 만들지 않는다. `forceStart` 는 `victory` 에서 거부한다.
- `main.js` 의 `_victory()` 는 상태를 `victory` 로 두고 점수를 등록한 뒤 일시정지 패널을 승리 화면으로 연다.
  HUD/패널은 `승리 — 지옥 정복` 문구를 사용하며 [계속하기]를 숨긴다.

**디아블로**
- `BOSS_TYPES` 에 `id:'diablo'`, `hp:1000000000`, `attack:1700000`, `damage:1700000`, `ability:'apocalypse'`,
  `radius:5.6`, `barWidth:96`, `barRange:1800` 을 추가한다. `hpMult:1` 이며 난이도/웨이브/엘리트 배수를 적용하지 않는다.
- 일반 보스 순환에서는 제외하고, `maxWaves>0` 인 지옥의 마지막 웨이브에서만 최종보스로 등장한다.
  일반 모드 웨이브 100은 기존 셀레스티얼이 맡는다.
- `_buildDiabloMesh` 는 뿔·흉갑·불타는 심장·3쌍 날개·가시 꼬리·지옥 오라·`diabloLight` 를 만든다.
  `_diabloParts`/`_diabloAura`/`_diabloSkin` 으로 날갯짓·오라 회전·피격 발광을 구동한다.
- `apocalypse` 는 쿨다운 18초·사거리 180. 포탑 피해 ×2.5, 기지 피해 ×4, 플레이어 피해 ×2.5 + 넉백.

**캐릭터 외형**
- `client/src/avatar.js` — `buildCharacterAvatar` 가 판금 몸통·투구·어깨·망토·스킨별 장비를 조립한다.
  `animateCharacterAvatar` 는 망토·날개·후광을 움직이고, `disposeCharacterAvatar` 는 재질만 해제한다(지오메트리는 공용).
- 로컬 3인칭과 `RemotePlayers` 가 같은 빌더를 사용한다. 원격 외형(스킨·색)이 바뀌면 모델을 재생성한다.
- 신규 스킨 `seraph`(천상기사) — 황금 성광 갑주·빛의 날개·후광·성표. `CHARACTER_SKINS` 9종,
  `CHARACTER_ITEMS` 9종(1:1), 서버 `sanitizeCharacter` 기본값에도 추가한다. 외형은 능력치에 영향이 없다.

**런처**
- `downloader/downloader.ps1`·`launcher/launcher.ps1` 의 사용자 표기 `업데이트 내역` 을 전부 `패치노트` 로 바꾼다.
- `downloader/updates.json` 에 v1.19.0 을 추가하고 `launcher`·`installer` 사본도 동일하게 유지한다.
- 빌드 스크립트의 필수 문자열 검사도 `패치노트` 로 바꾼다. PowerShell 5.1 한글 스크립트는 **UTF-8 BOM** 필수.

**검사**
- `tools/smoke.mjs` 978/978 — 난이도 5종/공격력 상승, 지옥 100, 디아블로 고정 스펙, 9번째 외형·장비, 아바타 빌더.
- `tools/headless.mjs` 600/600 — 지옥 큐의 디아블로, HP 10억/공격력 170만, 100 웨이브 완료 → `victory`.
- `tools/ui-dom-smoke.mjs` 349/349 — 난이도 버튼 5개, 캐릭터 카드 9개.
- `tools/character-bugtest.mjs` 71/71 — 외형 9종.
- `npm run verify` — **2,286개 통과**(빌드 포함). `cmd-lint` 13/13, 멀티 38/38.

---

## §4.84 초대 링크·초대코드 참가 수정 (v1.19.1)

- `client/src/utils/invite.js` 의 `resolveShareOrigin` 은 `publicUrl`(서버 `PUBLIC_URL`) → 현재 비루프백 origin →
  같은 protocol 의 LAN URL 순으로 고른다. 루프백(`localhost`·`127.0.0.1`)은 초대 링크의 기준으로 쓰지 않는다.
- `main.js` 의 `createInviteCode` 는 `/api/net` 을 먼저 `await` 하고, 새 코드를 `saveLastCode` 로 저장한 뒤
  `setShareInfo({ address, code, link })` 로 **방금 만든 링크**를 UI 에 넘긴다. 메뉴의 링크는 `share.link` 를 그대로 표시한다.
- `lobby.js` 의 참가 실패 안내는 현재 서버 주소와 "같은 서버인지"를 함께 표시한다. 초대코드는 서버 인스턴스 범위이므로
  다른 서버에 접속한 친구는 코드만으로 참가할 수 없다.
- 공개 서버는 `PORT=9685`·`PUBLIC_URL=<터널 주소>` 로 운용한다. 터널을 재시작하면 주소가 바뀌므로 `.env` 의
  `PUBLIC_URL` 과 새 초대 링크를 갱신한다. 기존 링크는 새 주소로 자동 이전되지 않는다.
- 검사: `tools/smoke.mjs` 981/981(공유 주소 우선순위·저장 순서), `tools/ui-dom-smoke.mjs` 351/351(표시 링크·같은 서버 안내),
  `tools/lan-guest-check.mjs` 9/9(공개 경로 생성·참가·시작).

---

## §4.85 공장 탭 · 티어별 공장 · 설치 제한 삭제 (v1.19.2)

**카테고리**
- `TURRET_CATEGORIES.factory` — 이름 `공장`, 아이콘 `🏭`. 건설 패널 카테고리 탭은 이 객체에서 자동 생성된다.
- `TURRETS` 끝(포탈 앞)에 `factoryTurrets` 를 넣는다. 공장은 **8종 × T1~T7 = 56종**이다.
  id 규칙은 `factory_<factoryType>_t<tier>` (예: `factory_water_t1`, `factory_purifier_t7`).
- 모든 공장은 `category:'factory'`, `kind:'factory'`, `factoryType`, `tier`, `outputs`, `draw` 를 가진다.
  산출물은 **기존 경제(골드·목재·광물)** 만 사용한다 — 새 재화/저장 형식을 만들지 않는다.

**8종 생산표 (T1 기준 → 티어마다 ×1.5)**

| factoryType | 이름 | 산출물 | 전기 |
|---|---|---|---|
| `water` | 물추출기 | 골드 2.2/s | 2kW |
| `waterway` | 물통로 | 직접 생산 없음 · 반경 내 공장 +12% (티어마다 +3.5%) | 1kW |
| `clay` | 점토·씨맛 제조기 | 점토 0.45/s + 골드 0.9/s(씨맛 특산품 판매) | 2kW |
| `mana` | 마력 수정 공장 | 마나결정 0.1/s + 골드 1.6/s | 3kW |
| `alchemy` | 연금술 공장 | 석영 0.3/s + 골드 2.2/s | 3kW |
| `abyss` | 심연 에너지 공장 | 심연광석 0.06/s + 골드 3.4/s | 4kW |
| `ancient` | 고대 마력로 | 비전수정 0.05/s + 마나결정 0.12/s + 골드 4.5/s | 5kW |
| `purifier` | 심연 정화기 | 마나결정 0.15/s + 심연광석 0.04/s + 골드 5.2/s | 5kW |

- 티어가 오르면 생산량 ×1.5, 체력 ×1.32, 비용(골드 ×2.35 · 목재 ×2.1 · 광물 등급)이 오른다.
- 물통로는 `factoryBoost`(T1 0.12 → T7 0.33)와 `range`(T1 12m → T7 24m)를 가진다.
  여러 물통로가 겹치면 합산하되 **최대 +150%** 로 제한한다.
- 공장은 전기를 쓰는 소비 건물이다. `POWER.draw.factory = 3` 은 기본값이며 실제 값은 각 타입의 `draw` 다.
  전력이 끊기면 `powered=false` 가 되어 생산/지원이 멈춘다.

**시뮬레이션**
- `Turret` 은 `factoryType`, `_factoryAcc`(산출물별 소수 누적), `_factoryBoost`, `_factoryPulse`,
  `factoryProduced` 를 가진다. `update()` 는 `case 'factory': this._updateFactory(dt)` 로 분기한다.
- `_updateFactory` 는 전력이 있을 때만 `dt × rate × amount × (1+boost)` 를 누적하고,
  정수 단위가 되면 `_creditFactoryOutput` 으로 경제에 넣는다. 골드는 `addGold`, 광물은 `_creditMineral`
  (컨베이어벨트 적재·통계 포함), 목재는 `addWood` 를 쓴다.
- `_factoryAura()` 는 반경 안의 **전력이 공급된 물통로**의 `factoryBoost` 를 합산한다(0.5초마다 갱신).
- `nextTierType` 은 `factory_<factoryType>_t<tier>` 를 반환한다. 업그레이드해도 `factoryType` 은 유지된다.
- 모델은 공장 본체·양옆 탱크·굴뚝·마력 코어, 물통로는 누운 관과 연결 고리로 만든다.
  전력이 있으면 코어가 회전/맥동하고, 없으면 느려진다.

**건설 제한 삭제 — 모든 종류**
- `client/src/systems/turrets.js` 의 `MAX_TURRETS`·`MAX_FACILITIES`·`MAX_CABLES` 상수와 모든 검사를 삭제한다.
  `canPlace` 는 위치·기지 거리·지형·자원·중복만 검사하고, `placeRemote` 도 개수로 거부하지 않는다.
- `structureCounts()` 는 `{ total, facilities, factories }` 를 **집계만** 한다.
- `server/game/Room.js` 의 `MAX_TURRETS=256` 과 `placeTurret` 의 개수 거부를 삭제한다.
- 건설 패널의 한도 표시는 `설치 현황 — 전체 n개 · 시설 n개 · 공장 n개 — 설치 제한 없음 (전선 별도)` 로 바꾼다.
- 남기는 상한은 건설 개수와 무관한 안전 상한뿐이다 — `SPAWNER_MAX_ALIVE=90`, `MAX_ENEMIES=200`.

**패널**
- `_renderBuild` 의 `factory` 분기는 `factoryType` 별로 묶어 `🏭 이름 — T1~T7 · 7종` 섹션을 만든다.
  티어 탭에서는 `T4 · 8종` 처럼 실제 범위만 표시한다.
- 공장 카드는 생산량/전력/체력을, 물통로 카드는 지원 반경·보너스·중첩 상한을 보여준다.
- `STAT_LABELS` 에 `factoriesBuilt:'공장 건설'`, `factoryOutput:'공장 생산'` 을 추가한다.

**검사**
- `tools/smoke.mjs` 987/987 — 공장 56종·8계열·물통로·전력, 서버 300개 수용, 상한 상수 부재.
- `tools/headless.mjs` 603/603 — 물추출기 골드 생산, 물통로 +12%, T1→T2 승급, 60개 집계.
- `tools/ui-dom-smoke.mjs` 354/354 — 공장 탭 56종/T4 8종, 설치 제한 없음 안내.
- `tools/base-bugtest.mjs` 80/80 — 전선 5개 제한 없이 설치.

---

## §4.86 기사단 길드 — 건물 티어별 기사 능력치 강화 (v1.19.3)

**데이터**
- `client/src/data.js` 의 `KNIGHT_GUILD_TABLE` 이 **기사단 길드 7종(T1~T7)** 을 만든다.
  id 는 `facility_knight_guild_t1` ~ `facility_knight_guild_t7`, `kind:'knight_guild'`, `category:'facility'`.
- 티어별 보너스는 `knightBonus:{ damage, damageTaken, moveSpeed }` 로 저장한다.

| 티어 | 공격력 | 받는 피해 | 이동 속도 | 건설 비용(골드/목재) |
|---|---|---|---|---|
| T1 | +6% | -3% | +2% | 1,200 / 240 |
| T2 | +12% | -6% | +4% | 2,800 / 520 |
| T3 | +18% | -9% | +6% | 6,200 / 1,100 |
| T4 | +25% | -12% | +8% | 13,000 / 2,200 |
| T5 | +32% | -15% | +10% | 27,000 / 4,200 |
| T6 | +40% | -18% | +12% | 56,000 / 8,000 |
| T7 | +50% | -22% | +15% | 115,000 / 15,000 |

- 광물 재료는 `tierMinerals(tier, 4+tier, 2+floor(tier/2))` 로 생성해 **티어 N 길드 = 티어 N 지형 광물** 규칙을 지킨다.
- 길드는 **전기를 쓰지 않는다**(`draw:0`). 건설 개수 제한도 없다.
- 여러 길드를 세워도 **가장 높은 티어 하나만** 적용한다(중첩 없음). 파괴되면 그다음 높은 길드로 자동 복귀한다.

**적용**
- `TurretSystem.guildBonus()` 가 살아 있는 길드 중 최고 티어의 `{tier, damage, damageTaken, moveSpeed}` 를 반환한다.
- `main.js` 의 `_knightGuildBonus()` 는 **현재 직업이 기사(knight)일 때만** 이 값을 채택한다.
- `_weaponDamageMult()` = 직업 패시브 × 길드 공격력. 일반 공격·강공격·스킬·화살 피해 계산에 모두 사용한다.
- `_applyClassModifiers()` 는 `player.damageTakenMult` 에 길드 받는 피해 배율을, `player.speedMult` 에 길드 이동 배율을 곱한다.
- `TurretSystem.onStructuresChanged` 콜백을 건설·철거·파괴·업그레이드·원격 동기화·저장 복원 후 호출해,
  길드가 생기거나 사라지면 즉시 능력치를 다시 계산한다. `main.js` 가 이 콜백을 `_applyClassModifiers()` 에 연결한다.

**모델·패널**
- `buildTurretObject` 의 `kind:'knight_guild'` 분기 — 석조 회관·지붕·양쪽 깃발·방패 문장. 문장은 천천히 회전/발광한다.
- `_renderBuild` 의 시설 묶음에 `🛡 기사단 길드 (T1~T7)` 섹션을 추가한다.
- 길드 카드는 `기사단 강화 — 공격력 +n% · 받는 피해 -n% · 이동 +n%`, `적용 — 기사 클래스 · 가장 높은 길드 1개` 를 보여준다.
- 직업 패널에서 기사일 때 현재 적용 중인 길드 티어와 수치를 함께 보여준다.

**검사**
- `tools/smoke.mjs` 995/995 — 시설 40종·길드 7종·티어별 보너스 단조 증가·T7 수치·승급 경로·배선 문자열.
- `tools/headless.mjs` 608/608 — 길드 T1 건설·T2가 T1을 덮음·파괴 시 T1 복귀·구조물 변경 콜백.
- `tools/ui-dom-smoke.mjs` 355/355 — 시설 탭 40종, T4 5종(길드 포함), 길드 카드 수치.
- `tools/base-bugtest.mjs` 82/82 — 길드 T1~T7 보너스 상승·T1→T2 경로.
- 전체 건물 수: **172종**(공격47·지원21·시설40·공장56·포탈8). — v1.19.4에서 물추출기·물통로 삭제로 **158종**이 된다(§4.87).

---

## §4.87 공장 정리 — 물추출기·물통로 삭제 (v1.19.4)

**요청** — 물추출기와 물통로를 삭제한다.

**데이터**
- `FACTORY_TABLE` 에서 `water`·`waterway` 두 항목을 완전히 제거한다. 공장은 **6종**이 된다.
  - `clay` 점토·씨맛 제조기 · `mana` 마력 수정 공장 · `alchemy` 연금술 공장
  - `abyss` 심연 에너지 공장 · `ancient` 고대 마력로 · `purifier` 심연 정화기
- 공장 id 는 `factory_<factoryType>_t<tier>` 그대로이며, **6종 × T1~T7 = 42종**이다.
- `factory_water_t*`·`factory_waterway_t*` 는 `TURRET_BY_ID` 에 존재하지 않는다.
- `factoryBoost`·`effect:'boost'` 필드도 데이터에서 제거한다. 모든 공장은 `effect:'produce'`, `range:10`, `draw>0`.

**시스템**
- `Turret` 의 `_factoryBoost`/`_factoryBoostT` 와 `_factoryAura()` 를 삭제한다.
- `_updateFactory()` 는 전력이 있으면 `dt × rate × amount` 만 누적한다. 보너스 배율(`mult`)이 없다.
- 공장 모델은 본체·양옆 탱크·굴뚝·마력 코어 하나만 남긴다. 물통로 전용 관 모델 분기를 삭제한다.
- 공장 애니메이션은 전력이 있으면 코어를 1.8rad/s 로 돌리고, 없으면 0.2rad/s 로 느리게 돈다.

**세이브**
- `TurretSystem.fromJSON` 은 `TURRET_BY_ID[entry.typeId]` 가 없는 항목을 건너뛴다. 따라서 기존 세이브의
  물추출기·물통로는 오류 없이 자동 정리되고, 다음 저장부터 완전히 사라진다.
- 별도 마이그레이션·환불은 하지 않는다(삭제된 건물은 복원하지 않음).

**패널**
- 공장 탭 안내는 `공장은 전기가 필요합니다. 전력이 끊기면 생산이 멈춥니다.` 로 바꾼다.
- 공장 카드는 생산량·전력·사거리·체력만 표시한다. 물통로의 `공장 지원`/`연결` 행은 없다.
- 공장 묶음은 6개, 티어 탭 T4는 6종을 표시한다.

**검사**
- `tools/smoke.mjs` 995/995 — 공장 42종·6계열, 물추출기/물통로 id 부재, 계열 합계 150, 전체 158.
- `tools/headless.mjs` 608/608 — 점토·씨맛 제조기 점토+골드 생산, 발전기 판매 후 생산 정지, T1→T2 승급.
- `tools/ui-dom-smoke.mjs` 355/355 — 공장 탭 42종, T4 6종, 물추출기/물통로 카드 없음.
- 전체 건물 수: **158종**(공격47·지원21·시설40·공장42·포탈8). — 이후 §4.88에서 물탱크 7종이 추가되어 **165종**이 된다.

---

## §4.88 물 추출 기능 · 물탱크 T1~T7 (v1.19.5)

**요청** — 물을 기능으로 추출할 수 있게 하고, 물탱크를 추가한다.

**데이터**
- `WATER_TANK_TABLE` 7종 — `facility_water_tank_t1..t7`, 이름 `물탱크` / `물탱크 T2..T7`.
  - 저장 용량 **100 / 250 / 500 / 900 / 1,500 / 2,500 / 4,000L** (티어마다 단조 증가).
  - `kind:'water_tank'`, `effect:'water'`, `draw:0`(전기 불필요), `range:0`, `waterCapacity` 보유.
  - 비용은 골드·목재·`tierMinerals(tier, 3+tier, 1+floor(tier/2))`, 체력 600→3,200.
  - 시설 합계 **47종**, 전체 건물 **165종**(공격47·지원21·시설47·공장42·포탈8).
- `client/src/systems/water.js` 순수 모듈 — `WATER` 상수, `waterCapacityOf`, `storedWater`, `clampWater`, `extractWater`.
  - 1회 추출 **20L**, 쿨다운 **800ms**. 탱크 없음(`no_tank`)·가득 참(`full`)·쿨다운(`cooldown`)을 구분해 반환한다.
- `Economy` 에 `water` 필드와 `addWater`/`spendWater` 를 추가하고 `toJSON`/`fromJSON` 에 포함한다.

**시스템**
- 물탱크는 전력을 쓰지 않고, 건설·철거·업그레이드·파괴 시 `onStructuresChanged` 가 발생한다.
- `Game._syncWaterCapacity()` 가 살아 있는 탱크 용량 합을 캐시하고, 용량을 넘는 물은 즉시 버린다.
- 탱크가 파괴·철거되면 용량이 줄고 초과분은 폐기된다(환불 없음).
- `Game.extractWater()` 는 `state==='playing'` 에서 **L 키**로 호출한다. 성공 시 소리만 재생하고 HUD 수치가 갱신된다.
  탱크가 없거나 가득 차면 안내 토스트를 띄운다. 패널이 열려 있으면 추출하지 않는다.

**패널/HUD**
- 건설 **🏗 시설** 탭에 `💧 물탱크 (T1~T7)` 묶음과 카드(저장 용량·L 키 안내)를 추가한다.
- 시설 전력 요약에 `💧 물탱크 — 저장량/용량L` 행을 추가한다.
- HUD 상단에 `💧 물` 칩(`저장량/용량L`, 탱크 없으면 `—`, 가득 차면 강조)을 추가한다.
- 기본 안내 문구에 `L 물 추출` 을 포함한다.

**검사**
- `tools/smoke.mjs` 1008/1008 — 물탱크 7종·용량 단조 증가·전기 불필요·승급 경로, 추출/쿨다운/가득 참/철거 폐기/저장 왕복, L 키 배선, 전체 165.
- `tools/headless.mjs` 612/612 — 물탱크 T1 100L → T2 250L 업그레이드, 파괴 시 0L.
- `tools/ui-dom-smoke.mjs` 358/358 — 시설 탭 47종, T4 6종, 물탱크 카드, HUD 💧 칩.
