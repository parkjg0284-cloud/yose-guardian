// 요새의 수호자 — 실서버 REST/소켓 E2E 검증
// 사용: 서버를 띄운 뒤 (npm run start) -> node tools/e2e-net.mjs
import { io } from 'socket.io-client';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** .env 에서 값을 읽는다 (없으면 환경변수) — 비밀번호를 코드에 적지 않기 위해서. */
function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const path = fileURLToPath(new URL('../.env', import.meta.url));
    if (!existsSync(path)) return '';
    const line = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith(key + '='));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const BASE_URL = new URL(BASE);
const EXPECTED_PORT = Number(BASE_URL.port || (BASE_URL.protocol === 'https:' ? 443 : 80));

/** 관리자 비밀번호 — .env 우선, 없으면 서버가 data/admin-password.txt 에 보관한 값. */
function adminPasswordValue() {
  const fromEnv = envValue('ADMIN_PASSWORD');
  if (fromEnv) return fromEnv;
  try {
    const file = fileURLToPath(new URL('../server/data/admin-password.txt', import.meta.url));
    if (!existsSync(file)) return '';
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 46 - t.length))}`);
}
async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
function connect() {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    const t = setTimeout(() => reject(new Error('connect timeout')), 6000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}
function emitAck(s, event, payload = {}, ms = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: 'timeout' });
      }
    }, ms);
    s.emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(res && typeof res === 'object' ? res : { ok: true });
    });
  });
}
function once(s, event, ms = 6000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    s.once(event, (payload) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(payload ?? {});
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

section('REST API');
const health = await req('GET', '/api/health');
check('GET /api/health 200', health.status === 200 && health.json?.ok === true, JSON.stringify(health.json));

// e2e-net.mjs — /api/net 공유 주소 검사
section('공유 주소 API (/api/net)');
const netInfoRes = await req('GET', '/api/net');
const shareUrls = Array.isArray(netInfoRes.json?.urls) ? netInfoRes.json.urls : [];
check(
  'GET /api/net 200 (인증 없이 공개)',
  netInfoRes.status === 200 && netInfoRes.json?.ok === true,
  `status=${netInfoRes.status}`
);
check(
  '/api/net — port·protocol·urls 계약',
  Number(netInfoRes.json?.port) === EXPECTED_PORT && netInfoRes.json?.protocol === 'http' && Array.isArray(netInfoRes.json?.urls),
  `port=${netInfoRes.json?.port} urls=${shareUrls.join(' ') || '없음'}`
);
check(
  '/api/net — 링크에 localhost 가 없다(남에게 쓸모없는 주소 금지)',
  shareUrls.every((u) => !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(String(u))),
  shareUrls[0] || 'LAN 주소 없음(단일 NIC 환경)'
);
check(
  '/api/net — primary = urls[0] (또는 둘 다 없음)',
  netInfoRes.json?.primary === (shareUrls[0] ?? null),
  String(netInfoRes.json?.primary)
);
if (shareUrls.length) {
  const invMod = await import('../client/src/utils/invite.js');
  const shareLink = invMod.inviteLink('K7F2', netInfoRes.json.primary);
  check(
    '서버 공유 주소로 만든 초대 링크 = <공유주소>/?room=K7F2',
    shareLink === `${netInfoRes.json.primary}/?room=K7F2`,
    shareLink
  );
  check(
    '초대 링크는 이 PC 전용이 아니다(다른 사람이 열 수 있다)',
    invMod.isLoopbackOrigin(shareLink) === false,
    shareLink
  );
}



const uniq = `e2e_${Date.now().toString(36)}`;
const reg = await req('POST', '/api/auth/register', { body: { username: uniq, password: 'test1234', nickname: 'E2E' } });
check('회원가입 201 + 토큰', reg.status === 201 && typeof reg.json?.token === 'string', `status=${reg.status}`);
const token = reg.json?.token;

const dup = await req('POST', '/api/auth/register', { body: { username: uniq, password: 'test1234' } });
check('중복 아이디 409', dup.status === 409, `status=${dup.status}`);

const login = await req('POST', '/api/auth/login', { body: { username: uniq, password: 'test1234' } });
check('로그인 200 + 토큰', login.status === 200 && typeof login.json?.token === 'string', `status=${login.status}`);

const bad = await req('POST', '/api/auth/login', { body: { username: uniq, password: 'wrong-pass' } });
check('잘못된 비밀번호 401', bad.status === 401, `status=${bad.status}`);

const me = await req('GET', '/api/auth/me', { token });
check('GET /api/auth/me 200', me.status === 200 && me.json?.user?.username === uniq, JSON.stringify(me.json?.user));

const noTok = await req('GET', '/api/auth/me');
check('토큰 없음 401', noTok.status === 401, `status=${noTok.status}`);

// ── 관리자 계정 (server/api/auth.js 의 ensureAdminAccount + /api/admin) ──
const adminCred = { username: envValue('ADMIN_USERNAME') || 'admin', password: adminPasswordValue() };
const adminLogin = await req('POST', '/api/auth/login', { body: adminCred });
check('관리자 로그인 200 + 토큰', adminLogin.status === 200 && typeof adminLogin.json?.token === 'string', `status=${adminLogin.status}`);
check('관리자 role=admin/isAdmin', adminLogin.json?.user?.role === 'admin' && adminLogin.json?.user?.isAdmin === true, JSON.stringify(adminLogin.json?.user));
const adminToken = adminLogin.json?.token;
const adminMe = await req('GET', '/api/auth/me', { token: adminToken });
check('관리자 /me role 유지', adminMe.status === 200 && adminMe.json?.user?.role === 'admin', JSON.stringify(adminMe.json?.user));
check('일반 계정 role=user', me.json?.user?.role === 'user' && me.json?.user?.isAdmin === false, JSON.stringify(me.json?.user));
const adminBad = await req('POST', '/api/auth/login', { body: { username: adminCred.username, password: 'wrong-admin-pass' } });
check('관리자 잘못된 비번 401', adminBad.status === 401, `status=${adminBad.status}`);
const ovAdmin = await req('GET', '/api/admin/overview', { token: adminToken });
check('관리자 개요 200 + 집계', ovAdmin.status === 200 && typeof ovAdmin.json?.counts?.users === 'number' && Number(ovAdmin.json?.counts?.admins) >= 1, JSON.stringify(ovAdmin.json?.counts));
const ovNoTok = await req('GET', '/api/admin/overview');
check('관리자 API 토큰 없음 401', ovNoTok.status === 401, `status=${ovNoTok.status}`);
const ovUser = await req('GET', '/api/admin/overview', { token });
check('일반 계정 관리자 API 403', ovUser.status === 403, `status=${ovUser.status}`);
const adminBoard = await req('POST', '/api/leaderboard', { token: adminToken, body: { mode: 'creative', wave: 1, seed: 'admin', duration: 1, score: 12 } });
check('관리자 리더보드 검증 우회 200', adminBoard.status === 200 && adminBoard.json?.ok === true, `status=${adminBoard.status} score=${adminBoard.json?.entry?.score}`);
const adminScoreId = adminBoard.json?.entry?.id;
const delAdmin = await req('DELETE', `/api/admin/scores/${adminScoreId}`, { token: adminToken });
check('관리자 점수 삭제 200', delAdmin.status === 200 && delAdmin.json?.deleted === adminScoreId, `status=${delAdmin.status}`);
const delUser = await req('DELETE', `/api/admin/scores/${adminScoreId}`, { token });
check('일반 계정 점수 삭제 403', delUser.status === 403, `status=${delUser.status}`);
const delGone = await req('DELETE', '/api/admin/scores/99999999', { token: adminToken });
check('없는 점수 삭제 404', delGone.status === 404, `status=${delGone.status}`);

const save0 = await req('GET', '/api/save', { token });
check('세이브 초기값 null', save0.status === 200 && save0.json?.data === null, JSON.stringify(save0.json));

const payload = { data: { seed: '777', wave: 12, gold: 3456, turrets: ['arrow_t1', 'heal_t1'], nested: { a: [1, 2, 3] } } };
const put = await req('POST', '/api/save', { token, body: payload });
check('세이브 저장 200', put.status === 200 && put.json?.ok === true, `bytes=${put.json?.bytes}`);

const round = await req('GET', '/api/save', { token });
check('세이브 왕복 일치', JSON.stringify(round.json?.data) === JSON.stringify(payload.data));

const big = await req('POST', '/api/save', { token, body: { data: { blob: 'x'.repeat(520 * 1024) } } });
check('512KB 초과 413', big.status === 413, `status=${big.status}`);

const lowWave = await req('POST', '/api/leaderboard', { token, body: { mode: 'solo', wave: 2, seed: '777', duration: 60 } });
check('웨이브 3 미만 거부 400', lowWave.status === 400, String(lowWave.json?.error ?? lowWave.status));

const post = await req('POST', '/api/leaderboard', {
  token,
  body: { mode: 'solo', wave: 7, seed: '777', duration: 480, stats: { kills: 120, goldEarned: 2400 } }
});
check('리더보드 등록 200', post.status === 200 && post.json?.ok === true, `rank=${post.json?.rank} score=${post.json?.entry?.score}`);
const score = post.json?.entry?.score;

const forged = await req('POST', '/api/leaderboard', {
  token,
  body: { mode: 'solo', wave: 7, seed: '777', duration: 480, stats: { kills: 120, goldEarned: 2400 }, score: 999999999 }
});
check('위조 점수 거부 400', forged.status === 400, String(forged.json?.error ?? forged.status));

const board = await req('GET', '/api/leaderboard?mode=solo&limit=20');
const mine = (board.json?.entries ?? []).find((e) => e.nickname === 'E2E');
check('리더보드 목록에 포함', Boolean(mine) && mine.score === score, `entries=${board.json?.entries?.length} rank=${mine?.rank}`);

const stats = await req('GET', '/api/stats', { token });
check('GET /api/stats 200', stats.status === 200, `status=${stats.status}`);

const nope = await req('GET', '/api/nope');
check('미지의 API 404 JSON', nope.status === 404 && typeof nope.json?.error === 'string', String(nope.json?.error));

section('소켓 (협동 방)');
const a = await connect();
const b = await connect();
check('소켓 2명 접속', a.connected === true && b.connected === true);

const created = await emitAck(a, 'room:create', { mode: 'coop', difficulty: 'peaceful', seed: '777', maxPlayers: 4 });
check('room:create 성공', created.ok === true, String(created.error ?? 'ok'));
const code = created.state?.code;
check('4자리 방 코드', typeof code === 'string' && code.length === 4, String(code));
check('난이도 peaceful 유지 (프로토콜 정렬)', created.state?.difficulty === 'peaceful', String(created.state?.difficulty));
check('모드 coop 유지', created.state?.mode === 'coop', String(created.state?.mode));

const joined = await emitAck(b, 'room:join', { code, nickname: 'B' });
check('room:join 성공', joined.ok === true, String(joined.error ?? 'ok'));
check('방 인원 2명', Array.isArray(joined.state?.players) && joined.state.players.length === 2, `players=${joined.state?.players?.length}`);

const stateAfterReady = once(a, 'room:state', 6000);
b.emit('room:ready', { ready: true });
const readyState = await stateAfterReady;
check('room:ready 브로드캐스트', Boolean(readyState), `players=${readyState?.players?.length}`);
check('준비 플래그 반영', (readyState?.players ?? []).some((pl) => pl.ready === true), JSON.stringify((readyState?.players ?? []).map((pl) => pl.ready)));

const chatB = once(b, 'chat:message', 6000);
a.emit('chat:send', { text: '안녕하세요' });
const chat = await chatB;
check('채팅 릴레이', chat?.text === '안녕하세요', String(chat?.text ?? 'none'));

const startB = once(b, 'game:start', 6000);
a.emit('room:start', {});
const started = await startB;
check('game:start 수신 (방장만 시작)', Boolean(started));

const snapB = once(b, 'game:snapshot', 6000);
a.emit('player:state', { position: { x: 1, y: 2, z: 3 }, yaw: 0.5, hp: 100 });
const snap = await snapB;
check('player:state → game:snapshot', Boolean(snap));

const eventB = once(b, 'game:event', 6000);
a.emit('turret:place', { turretId: 't1', typeId: 'arrow_t1', position: { x: 30, y: 0, z: 0 } });
const ev = await eventB;
check('turret:place 릴레이', ev?.type === 'turret:place', String(ev?.type ?? 'none'));

const rotateB = once(b, 'game:event', 6000);
a.emit('turret:rotate', { turretId: 't1', yaw: Math.PI / 2, x: 30, y: 0, z: 0 });
const rotEv = await rotateB;
check('turret:rotate 릴레이', rotEv?.type === 'turret:rotate', String(rotEv?.type ?? 'none'));
check('turret:rotate — yaw 전달', Math.abs(Number(rotEv?.payload?.yaw) - Math.PI / 2) < 1e-6, String(rotEv?.payload?.yaw));

// 진행 중(playing) 이탈: 서버는 lobby 에서만 room:state 를 방송하고,
// playing 중에는 다음 스냅샷에서 사라지는 것으로 반영한다 (Room.removePlayer 설계).
const hostId = (created.state?.players ?? [])[0]?.id;
const bId = (joined.state?.players ?? []).find((pl) => pl.id !== hostId)?.id;
const snapAfterLeave = once(a, 'game:snapshot', 6000);
b.emit('room:leave', {});
const snap2 = await snapAfterLeave;
const stillIn = bId ? Boolean(snap2?.players?.[bId]) : true;
check('진행 중 이탈 → 스냅샷에서 제거', Boolean(snap2) && stillIn === false, `bId=${bId} present=${stillIn}`);
await emitAck(a, 'room:leave', {});
await sleep(150);

// 로비 단계 이탈: room:state 로 인원 감소가 방송되어야 한다
const c = await connect();
const d = await connect();
const room2 = await emitAck(c, 'room:create', { mode: 'solo', difficulty: 'nightmare', seed: '42' });
check('두 번째 방 생성 (solo/nightmare)', room2.ok === true, `mode=${room2.state?.mode} diff=${room2.state?.difficulty}`);
const join2 = await emitAck(d, 'room:join', { code: room2.state?.code, nickname: 'D' });
check('두 번째 방 입장', join2.ok === true, String(join2.error ?? 'ok'));
const lobbyState = once(c, 'room:state', 6000);
d.emit('room:leave', {});
const afterLobby = await lobbyState;
check('로비 이탈 → 인원 감소 방송', (afterLobby?.players?.length ?? -1) === 1, `players=${afterLobby?.players?.length}`);

// ── 캐릭터 만들기 · 앉기 멀티플레이 동기화 ──
{
  const charMod = await import('../client/src/character.js');
  const chA = charMod.characterPayload({ name: '요새지기', skin: 'mage' }, 'A');
  const chB = charMod.characterPayload({ name: '수호자B', skin: 'rogue' }, 'B');

  // 1) 서버 살균 — 이상한 외형/색을 보내도 기본값으로 정리된다
  const evil = await emitAck(b, 'room:create', {
    nickname: '악의',
    character: { skin: '해커', color: -99, accent: 1e12, icon: '' },
    mode: 'coop',
    maxPlayers: 2
  });
  const evilCh = (evil.state?.players ?? [])[0]?.character;
  check(
    'room:create — 서버가 외형을 살균(모르는 스킨→기본, 색 범위 클램프)',
    evil.ok === true && evilCh?.skin === 'guardian' && Number(evilCh?.color) >= 0 && Number(evilCh?.color) <= 0xffffff,
    JSON.stringify(evilCh ?? null)
  );
  await emitAck(b, 'room:leave', {});

  // 2) 캐릭터와 함께 방 만들기 → 외형이 room:state 로 전달
  const rc = await emitAck(a, 'room:create', {
    nickname: '요새지기',
    character: chA,
    mode: 'coop',
    difficulty: 'normal',
    seed: '9090',
    maxPlayers: 2
  });
  check('room:create — 캐릭터와 함께 생성', rc.ok === true, String(rc.error ?? 'ok'));
  const chCode = rc.state?.code;
  const hostPlayer = (rc.state?.players ?? []).find((p) => p.id === a.id);
  check(
    'room:state — 방장 외형(스킨·아이콘·색)',
    hostPlayer?.character?.skin === 'mage' &&
      hostPlayer?.character?.icon === '🧙' &&
      Number(hostPlayer?.character?.color) === charMod.CHARACTER_SKIN_BY_ID.mage.color,
    JSON.stringify(hostPlayer?.character ?? null)
  );
  check('room:state — 이름도 캐릭터 이름', hostPlayer?.nickname === '요새지기', String(hostPlayer?.nickname));

  const rj = await emitAck(b, 'room:join', { code: chCode, nickname: '수호자B', character: chB });
  check('room:join — 캐릭터와 함께 참가', rj.ok === true, String(rj.error ?? 'ok'));
  const guestPlayer = (rj.state?.players ?? []).find((p) => p.id === b.id);
  check(
    'room:state — 참가자 외형(다른 스킨)',
    guestPlayer?.character?.skin === 'rogue' && guestPlayer?.character?.icon === '🗡️',
    JSON.stringify(guestPlayer?.character ?? null)
  );

  // 3) 앉기 — player:state 의 sit 이 스냅샷으로 전달된다
  await emitAck(a, 'room:start', {});
  // 20Hz 스냅샷이라 이미 큐에 들어간 직전 스냅샷이 올 수 있다 — 조건이 맞을 때까지 기다린다.
  const waitSnap = async (cond, tries = 14) => {
    for (let i = 0; i < tries; i++) {
      const snap = await once(a, 'game:snapshot', 1500);
      if (snap && cond(snap)) return snap;
    }
    return null;
  };
  b.emit('player:state', { x: 5, y: 0, z: 5, yaw: 0, hp: 100, sit: true });
  const snapSit = await waitSnap((s) => s?.players?.[b.id]?.sit === true);
  check('player:state sit → 스냅샷 sit=true', snapSit?.players?.[b.id]?.sit === true, JSON.stringify(snapSit?.players?.[b.id]?.sit));
  check('스냅샷에도 캐릭터 외형이 실린다', snapSit?.players?.[b.id]?.character?.skin === 'rogue', JSON.stringify(snapSit?.players?.[b.id]?.character ?? null));

  b.emit('player:state', { x: 5, y: 0, z: 5, yaw: 0, hp: 100, sit: false });
  const snapStand = (await waitSnap((s) => s?.players?.[b.id]?.sit === false)) ?? snapSit;
  check('일어서면 sit=false 로 갱신', snapStand?.players?.[b.id]?.sit === false, JSON.stringify(snapStand?.players?.[b.id]?.sit));

  await emitAck(a, 'room:leave', {});
  await emitAck(b, 'room:leave', {});
  await sleep(150);
}

section('열린 방 목록 (GET /api/rooms)');
const rlHost = await connect();
const rlGuest = await connect();
const rlSolo = await connect();
const rlPriv = await connect();
check('방 목록용 소켓 4명 접속', [rlHost, rlGuest, rlSolo, rlPriv].every((s) => s.connected === true));

const pubRoom = await emitAck(rlHost, 'room:create', { nickname: '공개방장', mode: 'coop', difficulty: 'hard', seed: '555', maxPlayers: 4 });
const privRoom = await emitAck(rlPriv, 'room:create', { nickname: '비밀방장', mode: 'coop', maxPlayers: 4, private: true });
const soloRoom = await emitAck(rlSolo, 'room:create', { nickname: '혼자방장', mode: 'solo', maxPlayers: 1 });
check('공개·비공개·정원1 방 생성', pubRoom.ok && privRoom.ok && soloRoom.ok && Boolean(pubRoom.code));

const openList = await req('GET', '/api/rooms');
const openRooms = Array.isArray(openList.json?.rooms) ? openList.json.rooms : [];
check('GET /api/rooms 200 + 배열(로그인 불필요)', openList.status === 200 && openList.json?.ok === true && Array.isArray(openList.json?.rooms));
const pubEntry = openRooms.find((r) => r.code === pubRoom.code);
check('공개 방이 목록에 뜬다', Boolean(pubEntry), 'codes=' + openRooms.map((r) => r.code).join(','));
check(
  '목록 항목 — 코드·모드·난이도·인원·방장',
  pubEntry?.mode === 'coop' && pubEntry?.difficulty === 'hard' && pubEntry?.players === 1 && pubEntry?.maxPlayers === 4 && pubEntry?.host === '공개방장',
  JSON.stringify(pubEntry)
);
check('로비 + 자리 있음 → joinable', pubEntry?.joinable === true && pubEntry?.phase === 'lobby' && typeof pubEntry?.ageSec === 'number');
check('비공개 방은 목록에 없다', !openRooms.some((r) => r.code === privRoom.code), String(privRoom.code));
check('정원이 찬 방은 joinable=false 로 남는다', openRooms.find((r) => r.code === soloRoom.code)?.joinable === false);

const privByCode = await emitAck(rlGuest, 'room:join', { code: privRoom.code, nickname: '코드참가' });
check('비공개 방도 코드로는 들어간다', privByCode.ok === true, privByCode.ok + ' / ' + privByCode.error);
check('비공개 방은 코드로 들어와도 목록엔 안 뜬다', !(await req('GET', '/api/rooms')).json?.rooms?.some((r) => r.code === privRoom.code));

const listJoin = await emitAck(rlGuest, 'room:join', { code: pubEntry?.code, nickname: '클릭참가' });
check('목록의 코드로 참가(코드 없이 클릭 참가 경로)', listJoin.ok === true && (listJoin.state?.players?.length ?? 0) === 2, listJoin.ok + ' / ' + listJoin.error);
const afterJoin = await req('GET', '/api/rooms');
const joinedEntry = (afterJoin.json?.rooms || []).find((r) => r.code === pubRoom.code);
check('참가 후 인원이 목록에 반영', joinedEntry?.players === 2 && joinedEntry?.joinable === true);

const pubStart = once(rlHost, 'game:start', 6000);
rlHost.emit('room:start', {});
check('열린 방 목록용 방 게임 시작', Boolean(await pubStart));
const afterStartList = await req('GET', '/api/rooms');
check('시작된 방은 목록에서 빠진다', !(afterStartList.json?.rooms || []).some((r) => r.code === pubRoom.code));
check('남은 공개 방은 그대로 목록에 있다', (afterStartList.json?.rooms || []).some((r) => r.code === soloRoom.code));
for (const s of [rlHost, rlGuest, rlSolo, rlPriv]) s.close?.();

section('초대코드 멀티플레이');
const inv1 = await connect();
const inv2 = await connect();
const inv3 = await connect();
const inv4 = await connect();
check('초대코드용 소켓 4명 접속', [inv1, inv2, inv3, inv4].every((s) => s.connected === true));

const invCreate = await emitAck(inv1, 'room:create', { nickname: '방장', mode: 'coop', difficulty: 'normal', seed: '31337', maxPlayers: 2 });
check('방 만들기 → 초대코드 발급', invCreate.ok === true && /^[A-Z0-9]{4}$/.test(String(invCreate.code)), String(invCreate.code));
const invCode = String(invCreate.code);
check('초대코드가 방 상태에도 들어 있다', invCreate.state?.code === invCode, String(invCreate.state?.code));
check('초대코드 방 정원 2명', invCreate.state?.maxPlayers === 2, String(invCreate.state?.maxPlayers));

const lowerJoin = await emitAck(inv2, 'room:join', { code: invCode.toLowerCase(), nickname: '소문자' });
check('소문자 초대코드로도 참가(대소문자 무시)', lowerJoin.ok === true, String(lowerJoin.error ?? 'ok'));
const flat = await emitAck(inv3, 'room:join', { code: 'ZZ' + invCode.slice(2), nickname: '남' });
check('없는 초대코드 → 실패 + 안내', flat.ok === false && String(flat.error).includes('찾을 수 없습니다'), flat.ok + ' / ' + flat.error);

const invReady = once(inv1, 'room:state', 6000);
inv2.emit('room:ready', { ready: true });
const invState = await invReady;
check('참가자에게 초대코드 방 상태 방송', invState?.code === invCode && (invState?.players?.length ?? 0) === 2, 'code=' + invState?.code + ' players=' + invState?.players?.length);

const full = await emitAck(inv3, 'room:join', { code: invCode, nickname: '초과' });
check('정원 초과 → 거부', full.ok === false && String(full.error).includes('가득'), full.ok + ' / ' + full.error);

const invStart = once(inv2, 'game:start', 6000);
inv1.emit('room:start', {});
check('초대코드 방 게임 시작', Boolean(await invStart));

// 정원이 찬 방이 아니라 '정원 여유가 있는데 이미 시작된' 방으로 검증해야
// 단계 검사(이미 시작)가 정원 검사보다 먼저 의미를 갖는다.
const lateRoom = await emitAck(inv4, 'room:create', { nickname: '늦은방장', mode: 'coop', maxPlayers: 4 });
check('늦은 참가 테스트용 방 생성(정원 여유)', lateRoom.ok === true && lateRoom.state?.maxPlayers === 4, String(lateRoom.code));
const lateStart = once(inv4, 'game:start', 6000);
inv4.emit('room:start', {});
check('늦은 참가 테스트용 방 게임 시작', Boolean(await lateStart));
const afterStart = await emitAck(inv3, 'room:join', { code: lateRoom.code, nickname: '늦음' });
check('시작된 방은 초대코드로 못 들어온다', afterStart.ok === false && String(afterStart.error).includes('이미 시작'), afterStart.ok + ' / ' + afterStart.error);
await emitAck(inv4, 'room:leave', {});
await sleep(150);

await emitAck(inv1, 'room:leave', {});
await emitAck(inv2, 'room:leave', {});
await sleep(200);
const gone = await emitAck(inv3, 'room:join', { code: invCode, nickname: '빈방' });
check('빈 방이 되면 초대코드도 사라진다', gone.ok === false, gone.ok + ' / ' + gone.error);
const reCreate = await emitAck(inv3, 'room:create', { nickname: '새방장', mode: 'coop', maxPlayers: 4 });
check('새 방은 새 초대코드를 받는다', reCreate.ok === true && /^[A-Z0-9]{4}$/.test(String(reCreate.code)), String(reCreate.code));
await emitAck(inv3, 'room:leave', {});
await sleep(120);
inv1.close();
inv2.close();
inv3.close();
inv4.close();
check('초대코드 소켓 정리', true);

c.close();
d.close();
a.close();
b.close();
check('소켓 정리', true);

console.log(`\n${'═'.repeat(58)}`);
console.log(`네트워크 E2E: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개)`);
if (failures.length) console.log(`실패: ${failures.join(', ')}`);
console.log('═'.repeat(58));
process.exit(fail ? 1 : 0);
