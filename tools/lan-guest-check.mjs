// 요새의 수호자 — "다른 사람(다른 기기)" 접속 점검 (npm run lancheck)
//
// 서버를 켜 둔 상태에서 실행한다. 서버가 알려준 공유 주소(`GET /api/net`)로 **두 번째 클라이언트**를 붙여
//   초대 링크 열기 → 코드로 참가 → 방장 시작 → game:start 수신
// 까지 실제 경로를 확인한다. (다른 PC 대신 같은 서버의 LAN 인터페이스를 쓴다.)
//
// 사용: npm run dev  (다른 창에서)  →  npm run lancheck
import { io } from 'socket.io-client';

const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '');
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n── 다른 기기 접속 점검 (LAN 공유 주소 · 초대 링크) ─────────');

// ① 서버가 알려주는 "남에게 보낼 주소"
let info = null;
try {
  const res = await fetch(`${BASE}/api/net`, { signal: AbortSignal.timeout(6000) });
  info = await res.json();
} catch (err) {
  console.error(`\n  ⚠️  서버에 연결하지 못했습니다 (${BASE}) — 먼저 \`npm run dev\` 로 서버를 켜세요.`);
  console.error(`     ${err?.message || err}\n`);
  process.exit(1);
}
const lan = info?.primary;
ok('서버가 공유 주소를 알려준다', Boolean(lan), String(lan ?? '없음'));
if (!lan) {
  console.log('\n  ⚠️  LAN 주소를 찾지 못했습니다(네트워크 어댑터 없음) — 같은 네트워크 초대는 불가능합니다.');
  console.log('     인터넷 공유는 터널을 쓰세요: cloudflared tunnel --url http://localhost:3001\n');
  process.exit(fail === 0 ? 0 : 1);
}
ok('공유 주소가 localhost 가 아니다(localhost 링크는 남에게 쓸모없다)', !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(String(lan)), String(lan));

// ② 초대 링크(게스트가 받는 그 주소)로 게임 페이지가 열린다
const page = await fetch(`${lan}/?room=TEST`, { signal: AbortSignal.timeout(8000) });
const html = await page.text();
ok('초대 링크로 게임 페이지가 열린다(200 + game-canvas)', page.status === 200 && html.includes('game-canvas'), `status=${page.status}`);

// ③ 두 명이 LAN 주소로 접속 (호스트 PC + 다른 기기)
const connect = (nick) =>
  new Promise((resolve, reject) => {
    const s = io(lan, { transports: ['websocket'], timeout: 6000, query: { nickname: nick } });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(`connect_error: ${e?.message}`)));
    setTimeout(() => reject(new Error('연결 시간 초과(방화벽 확인)')), 8000);
  });
const ack = (sock, evt, payload) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${evt} 응답 없음`)), 6000);
    sock.emit(evt, payload, (res) => {
      clearTimeout(t);
      resolve(res ?? { ok: false, error: '빈 응답' });
    });
  });

const host = await connect('호스트PC');
const guest = await connect('다른기기');
ok('LAN 주소로 두 명 접속(다른 기기 경로)', host.connected === true && guest.connected === true, String(lan));

// ④ 방 만들기 → 초대 링크
const created = await ack(host, 'room:create', { mode: 'coop', difficulty: 'normal', seed: 'LAN1', maxPlayers: 4 });
ok('호스트가 방을 만든다', created.ok === true, String(created.error ?? 'ok'));
const code = created.state?.code;
const inviteLink = `${lan}/?room=${code}`;
console.log(`  🔗 초대 링크: ${inviteLink}`);

// ⑤ 게스트가 링크의 코드로 참가
const joined = await ack(guest, 'room:join', { code, nickname: '게스트' });
ok('초대 링크의 코드로 게스트가 참가', joined.ok === true, String(joined.error ?? 'ok'));
ok('방 인원 2명', joined.state?.players?.length === 2, `players=${joined.state?.players?.length}`);

// ⑥ 준비 → 방장 시작 → 게스트가 game:start 를 받는다
const started = new Promise((resolve) => {
  guest.once('game:start', (payload) => resolve(payload));
  setTimeout(() => resolve(null), 6000);
});
guest.emit('room:ready', { ready: true });
await sleep(250);
const startRes = await ack(host, 'room:start', {});
ok('방장이 게임을 시작한다', startRes.ok === true, String(startRes.error ?? 'ok'));
ok('게스트가 game:start 를 받는다(같은 요새)', Boolean(await started));

// ⑦ 정리
try {
  await ack(host, 'room:leave', {});
} catch {
  /* 이미 끝났으면 무시 */
}
guest.disconnect();
host.disconnect();

console.log(`\n다른 기기 접속 점검: ${pass}개 통과 / ${fail}개 실패`);
if (fail) console.log('  실패 목록은 위 ❌ 를 보세요. 방화벽 인바운드(3001)와 같은 네트워크 여부를 확인하세요.\n');
process.exit(fail === 0 ? 0 : 1);
