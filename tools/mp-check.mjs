// 멀티플레이 회귀 검사 — 실제 서버를 띄우고 소켓 2~3개로 계약을 확인한다.
//   실행: node tools/mp-check.mjs        (MP_PORT 로 포트 지정 가능, 기본 3137)
//   확인: 생성/참가 → 시작 → 건물 설치·회전·철거 중계 → 끊김 → 재접속 복귀 → 방장 위임
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.MP_PORT || 3137);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3500, step = 40) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

async function waitHealth(ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) return await r.json();
    } catch {
      /* 아직 부팅 중 */
    }
    await sleep(200);
  }
  return null;
}

function connectClient(nickname) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 4000,
      query: { nickname },
    });
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    socket.once('connect', () => done(resolve, socket));
    socket.once('connect_error', (err) => done(reject, err));
    setTimeout(() => done(reject, new Error('connect timeout')), 5000);
  });
}

function ack(socket, event, payload = {}, timeout = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'ack timeout' });
      }
    }, timeout);
    socket.emit(event, payload, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res && typeof res === 'object' ? res : { ok: true });
    });
  });
}

function record(socket, event) {
  const list = [];
  socket.on(event, (payload) => list.push(payload));
  return list;
}

const eventsOf = (list, type) => list.filter((e) => e?.type === type);
const close = (socket) => {
  try {
    socket?.close();
  } catch {
    /* 무시 */
  }
};

let server = null;
let host = null;
let guest = null;
let extra = null;
let rejoined = null;
let roomCode = '';
let hostToken = '';
let guestToken = '';
const hostNick = `감사-호스트-${Math.floor(Math.random() * 900 + 100)}`;
const guestNick = `감사-게스트-${Math.floor(Math.random() * 900 + 100)}`;

try {
  console.log(`\n  멀티플레이 회귀 검사 — ${BASE}\n`);
  server = spawn(process.execPath, ['server/index.js', '--prod'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*', NODE_ENV: 'production' },
    stdio: 'ignore',
    windowsHide: true,
  });
  const health = await waitHealth();
  check('검사용 서버 기동', Boolean(health?.ok), health ? `v${health.version}` : '헬스 응답 없음');
  if (!health?.ok) throw new Error('서버를 띄우지 못했습니다');

  // ── 1. 방 만들기 / 참가
  host = await connectClient(hostNick);
  guest = await connectClient(guestNick);
  const hostRoomState = record(host, 'room:state');
  const guestRoomState = record(guest, 'room:state');

  const created = await ack(host, 'room:create', {
    nickname: hostNick,
    mode: 'coop',
    seed: '',
    difficulty: 'normal',
    maxPlayers: 4,
    private: false,
    character: { skin: 'guardian', color: 0x5b8dd6 },
  });
  roomCode = String(created.code || '');
  hostToken = String(created.token || '');
  check('room:create — 4자리 코드', /^[A-Z0-9]{4}$/.test(roomCode), roomCode || String(created.error));
  check('room:create — 재접속 토큰 발급', hostToken.length >= 16, `${hostToken.length}자`);
  check('room:create — 로비 상태 동봉', created.state?.phase === 'lobby' && created.state?.players?.length === 1);
  const beforeRooms = await fetch(`${BASE}/api/rooms`).then((r) => r.json()).catch(() => ({}));
  check('공개 방 목록에 노출', Array.isArray(beforeRooms.rooms) && beforeRooms.rooms.some((r) => r.code === roomCode));

  const listing = await ack(guest, 'room:join', {
    code: roomCode.toLowerCase(),
    nickname: guestNick,
    character: { skin: 'knight' },
  });
  guestToken = String(listing.token || '');
  check('room:join — 대소문자 무시 + 토큰', Boolean(listing.ok) && guestToken.length >= 16, String(listing.error || ''));
  check('room:join — 인원 2명 반영', listing.state?.players?.length === 2);
  check('입장한 모두에게 room:state 방송', Boolean(await waitFor(() => hostRoomState.some((s) => s.players?.length === 2))));

  // ── 2. 시작
  const hostStarted = record(host, 'game:start');
  const guestStarted = record(guest, 'game:start');
  const hostSnapshots = record(host, 'game:snapshot');
  const started = await ack(host, 'room:start');
  check('room:start — 방장 성공', Boolean(started.ok), String(started.error || ''));
  const startedGuest = await waitFor(() => guestStarted[0], 2500);
  check('game:start — 참가자 전원 수신', Boolean(await waitFor(() => hostStarted[0], 2500)) && Boolean(startedGuest));
  check('game:start — 빈 시드 자동 배정', Boolean(String(startedGuest?.seed || '').trim()), String(startedGuest?.seed || '(빈 값)'));
  check('game:start — 모드/난이도 유지', startedGuest?.mode === 'coop' && startedGuest?.difficulty === 'normal');

  const snap = await waitFor(
    () => hostSnapshots.find((s) => s.phase === 'playing' && Object.keys(s.players || {}).length === 2),
    3000
  );
  check('game:snapshot 20Hz — 두 플레이어', Boolean(snap));
  check('스냅샷에 연결 상태 포함', Boolean(snap) && Object.values(snap.players).every((p) => p.connected === true));

  // ── 3. 건물 중계 (설치·회전·철거)
  const hostEvents = record(host, 'game:event');
  const guestEvents = record(guest, 'game:event');
  host.emit('turret:place', { id: 'H-1', typeId: 'arrow', x: 4, y: 0, z: 4, yaw: 0.5, ownerId: 'spoofed' });
  const placeSeen = await waitFor(() => eventsOf(guestEvents, 'turret:place')[0], 2000);
  check('turret:place — 상대에게 1회 중계', Boolean(placeSeen), placeSeen ? String(placeSeen.payload?.id) : '이벤트 없음');
  check('turret:place — 방향(yaw) 보존', Math.abs(Number(placeSeen?.payload?.yaw) - 0.5) < 1e-6, String(placeSeen?.payload?.yaw));
  check('turret:place — 소유자 위조 차단', placeSeen?.payload?.ownerId === host.id, String(placeSeen?.payload?.ownerId || ''));

  const guestPlaces = ['G-1', 'G-2', 'G-3'];
  for (const id of guestPlaces) {
    guest.emit('turret:place', { id, typeId: 'arrow', x: 6, y: 0, z: 6, yaw: 0 });
    await sleep(140);
  }
  const hostPlaces = await waitFor(() => {
    const got = eventsOf(hostEvents, 'turret:place');
    return got.length === 3 ? got : null;
  }, 2500);
  check('turret:place — 3회 설치 모두 도착', Boolean(hostPlaces), `${hostPlaces?.length ?? 0}회`);

  // 회전 리스너가 설치마다 중첩되면 여기서 N회로 불어난다(과거 버그 회귀 검사).
  guest.emit('turret:rotate', { turretId: guestPlaces[0], yaw: 1.25, x: 6, y: 0, z: 6 });
  guest.emit('turret:rotate', { turretId: guestPlaces[1], yaw: 2.5, x: 6, y: 0, z: 6 });
  await sleep(400);
  const rotates = eventsOf(hostEvents, 'turret:rotate');
  check('turret:rotate — 설치 4회 뒤에도 1:1 중계', rotates.length === 2, `${rotates.length}회 (기대 2회)`);

  const dupBefore = eventsOf(hostEvents, 'turret:place').length;
  guest.emit('turret:place', { id: guestPlaces[0], typeId: 'arrow', x: 9, y: 0, z: 9, yaw: 0 });
  await sleep(350);
  const dupAfter = eventsOf(hostEvents, 'turret:place').length;
  check('중복 id 재설치 — 재중계 없음', dupAfter === dupBefore, `${dupBefore} → ${dupAfter}`);

  guest.emit('turret:sell', { turretId: guestPlaces[1] });
  const sold = await waitFor(() => eventsOf(hostEvents, 'turret:sell')[0], 2000);
  check('turret:sell — 상대에게 중계', sold?.payload?.id === guestPlaces[1], String(sold?.payload?.id || '없음'));

  // 남의 건물 철거는 서버가 거부해야 한다 — 잠시 뒤 스냅샷에 H-1 이 남아 있는지로 확인.
  guest.emit('turret:sell', { turretId: 'H-1' });
  await sleep(450);
  const latestSnap = hostSnapshots[hostSnapshots.length - 1];
  const stillThere = latestSnap?.turrets?.some((t) => t.id === 'H-1');
  check('turret:sell — 남의 건물 철거 거부', Boolean(stillThere));

  // ── 4. 끊김 → 재접속
  const guestId = guest.id;
  guest.close();
  const disconnectState = await waitFor(
    () =>
      hostRoomState
        .slice()
        .reverse()
        .find((s) => Array.isArray(s.players) && s.players.some((p) => p.nickname === guestNick && p.connected === false)),
    4000
  );
  check('게임 중 끊김 — 좌석 유지(connected=false)', Boolean(disconnectState));
  const discMsg = await waitFor(
    () => eventsOf(hostEvents, 'system').find((e) => e.payload?.kind === 'player:disconnect'),
    2500
  );
  check('끊김 안내 시스템 이벤트', Boolean(discMsg), String(discMsg?.payload?.message || ''));

  rejoined = await connectClient(guestNick);
  const re = await ack(rejoined, 'room:rejoin', { code: roomCode, token: guestToken });
  check('room:rejoin — 45초 유예 내 복귀', Boolean(re.ok), String(re.error || ''));
  check(
    'room:rejoin — 같은 좌석/새 소켓 id',
    Boolean(re.ok) && re.snapshot?.players?.[rejoined.id]?.nickname === guestNick && rejoined.id !== guestId
  );
  check('room:rejoin — 방 상태·스냅샷 동봉', Boolean(re.state?.code) && Boolean(re.snapshot?.phase));
  const rejoinMsg = await waitFor(
    () => eventsOf(hostEvents, 'system').find((e) => e.payload?.kind === 'player:rejoin'),
    2500
  );
  check('복귀 안내 시스템 이벤트', Boolean(rejoinMsg));

  const badRejoin = await ack(rejoined, 'room:rejoin', { code: roomCode, token: 'bogus-token' });
  check('room:rejoin — 잘못된 토큰 거부', badRejoin.ok === false, String(badRejoin.error || ''));

  const rejoinSnap = await waitFor(
    () => hostSnapshots.slice().reverse().find((s) => s.players?.[rejoined.id]?.connected === true),
    3000
  );
  check('스냅샷 — 복귀 후 새 id 로 표시', Boolean(rejoinSnap), rejoinSnap ? rejoined.id : '없음');

  rejoined.emit('turret:place', { id: 'G-9', typeId: 'arrow', x: 8, y: 0, z: 8, yaw: 0 });
  const afterRejoinPlace = await waitFor(
    () => eventsOf(hostEvents, 'turret:place').find((e) => e.payload?.id === 'G-9'),
    2000
  );
  check('복귀 뒤 입력 중계', Boolean(afterRejoinPlace));

  // ── 5. 방장 위임 / 시작된 방 입장 거부 / 코드 검증
  const roomStatesForHost = record(rejoined, 'room:state');
  host.close();
  const hostChanged = await waitFor(
    () => roomStatesForHost.slice().reverse().find((s) => s.hostId === rejoined.id && s.players.some((p) => p.id === rejoined.id)),
    4500
  );
  check('방장 이탈 — 남은 사람에게 즉시 위임', Boolean(hostChanged), hostChanged ? `hostId=${String(hostChanged.hostId).slice(0, 6)}` : '');

  extra = await connectClient('감사-세번째');
  const lateJoin = await ack(extra, 'room:join', { code: roomCode, nickname: '감사-세번째' });
  check('시작된 방 입장 거부', lateJoin.ok === false && /시작된 게임/.test(String(lateJoin.error)), String(lateJoin.error || ''));

  const shortCode = await ack(extra, 'room:join', { code: 'AB', nickname: 'x' });
  check('잘못된 코드 형식 안내', shortCode.ok === false && /4자리/.test(String(shortCode.error)), String(shortCode.error || ''));

  // ── 6. 비공개 방은 목록에서 제외
  extra.close();
  extra = await connectClient('감사-비공개');
  const privCreated = await ack(extra, 'room:create', { nickname: '감사-비공개', private: true, maxPlayers: 2, seed: 'x' });
  check('비공개 방 생성', Boolean(privCreated.ok), String(privCreated.error || ''));
  const roomsNow = await fetch(`${BASE}/api/rooms`).then((r) => r.json()).catch(() => ({}));
  check('비공개 방은 목록에서 숨김', !String(roomsNow.rooms?.map((r) => r.code).join(',')).includes(String(privCreated.code)));
  check('room:state 에 private 표시', privCreated.state?.private === true);
} catch (err) {
  check('검사 실행', false, err?.stack || String(err));
} finally {
  close(host);
  close(guest);
  close(rejoined);
  close(extra);
  await sleep(200);
  try {
    server?.kill();
  } catch {
    /* 무시 */
  }
  await sleep(300);
  const total = results.length;
  const passed = total - failures;
  console.log(`\n  멀티플레이 검사: ${passed}개 통과 / ${failures}개 실패 (총 ${total}개)\n`);
  process.exit(failures === 0 ? 0 : 1);
}
