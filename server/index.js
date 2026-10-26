// 요새의 수호자 — 서버 진입점 (REST + Socket.io + 정적 서빙)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import cors from 'cors';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { envFilePath, isPortAvailable, MAX_PORT, MIN_PORT, normalizePort, parsePort, writeEnvPort } from './port-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

loadEnv({ path: envFilePath() });

// .env를 읽은 뒤에 process.env 의존 모듈을 불러온다 (동적 import 순서 보장)
const dbModule = await import('./db.js');
const protocol = await import('./game/protocol.js');
const { C2S, S2C, DEFAULT_MODE, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, clampNum, normalizeMode, sanitizeText, toInt } =
  protocol;
const { default: authRouter, ensureAdminAccount, requireAdmin } = await import('./api/auth.js');
const { default: saveRouter } = await import('./api/save.js');
const { default: leaderboardRouter } = await import('./api/leaderboard.js');
const { default: statsRouter } = await import('./api/stats.js');
const { default: adminRouter } = await import('./api/admin.js');
const { createFriendRegistry, registerFriendRoutes } = await import('./api/friends.js');
// 다른 사람이 접속할 수 있는 주소(초대 링크가 localhost 로 굳지 않게) — server/net-info.js
const { localShareUrls } = await import('./net-info.js');
const { RoomManager } = await import('./game/RoomManager.js');

const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
})();

const PORT = normalizePort(process.env.PORT, 3001);
const HOST = process.env.HOST || '0.0.0.0';
const isProduction =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod') || process.argv.includes('--serve');
const CLIENT_ORIGINS = String(process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigin = CLIENT_ORIGINS.length === 0 || CLIENT_ORIGINS.includes('*') ? true : CLIENT_ORIGINS;

dbModule.initDb();

// 관리자 계정 보장 (.env ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_NICKNAME)
let adminInfo = null;
try {
  adminInfo = ensureAdminAccount();
} catch (err) {
  console.error('[server] 관리자 계정 생성 실패:', err?.message || err);
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e6,
  // 끊김 감지: 10초마다 핑, 15초 무응답이면 종료(기본 25+20초 → 최대 45초 유령 방장 문제 완화).
  pingInterval: 10000,
  pingTimeout: 15000,
});
const rooms = new RoomManager({ io });

app.get('/api/health', (req, res) => {
  let users = 0;
  try {
    users = Number(dbModule.db?.prepare('SELECT COUNT(*) AS n FROM users').get()?.n ?? 0);
  } catch {
    users = 0;
  }
  res.json({
    ok: true,
    version: VERSION,
    uptime: Math.round(process.uptime()),
    users,
    rooms: rooms.count,
  });
});

// 공유 주소 — 초대 링크의 기준이 된다. 로그인 전에도 필요하므로 인증 없이 공개한다.
const shareUrls = localShareUrls({ port: PORT, protocol: 'http', publicUrl: process.env.PUBLIC_URL || null });
app.get('/api/net', (req, res) => {
  res.json({ ok: true, host: HOST, ...shareUrls });
});

// 열린 방 목록 — 메인 화면 '열린 방' 카드에서 코드 없이 클릭 참가한다(계약 §4.29).
//   비공개 방은 코드를 아는 사람만 들어올 수 있으므로 목록에서 빠진다.
app.get('/api/rooms', (req, res) => {
  res.json({ ok: true, rooms: rooms.listPublic(), count: rooms.count, now: Date.now() });
});

app.use('/api/auth', authRouter);
app.use('/api/save', saveRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);

// 친구 — 친구 코드 등록·조회. 같은 서버(같은 PC·LAN)에 있으면 코드만으로 방을 찾는다.
const friendRegistry = createFriendRegistry({ port: PORT });
registerFriendRoutes(app, friendRegistry);

// ── 서버 포트 설정 (v1.16.0) ─────────────────────────────────────────
//  GET 은 누구나 현재 포트를 볼 수 있고, POST 는 관리자만 바꿀 수 있다.
//  저장은 .env 의 PORT 한 줄만 수정한다. restart:true 면 새 포트에 새 서버를 띄운 뒤
//  이 서버를 정상 종료하고, 응답을 받은 브라우저가 새 주소로 이동한다.
let portChangeBusy = false;
app.get('/api/server/port', (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    min: MIN_PORT,
    max: MAX_PORT,
    canRestart: process.env.YOSE_NO_PORT_RESTART !== '1',
  });
});

app.post('/api/server/port', requireAdmin, async (req, res) => {
  const wanted = parsePort(req.body?.port);
  if (wanted === null) {
    return res.status(400).json({ error: `포트는 ${MIN_PORT}~${MAX_PORT} 사이의 정수여야 합니다` });
  }
  if (wanted === PORT) {
    return res.status(400).json({ error: '지금 사용 중인 포트와 같습니다' });
  }
  if (portChangeBusy) {
    return res.status(409).json({ error: '포트를 바꾸는 중입니다 — 잠시 후 다시 시도하세요' });
  }

  // 검사·저장·재시작 전체를 한 번에 잠근다 — 버튼을 연달아 눌러도 두 서버가 뜨지 않게.
  portChangeBusy = true;
  try {
    if (!(await isPortAvailable(wanted))) {
      return res.status(409).json({ error: `포트 ${wanted} 은(는) 이미 사용 중입니다` });
    }

    const restart = req.body?.restart !== false;
    try {
      writeEnvPort(wanted);
    } catch (err) {
      return res.status(500).json({ error: `설정 저장 실패: ${err?.message || err}` });
    }

    if (!restart || process.env.YOSE_NO_PORT_RESTART === '1') {
      return res.json({ ok: true, port: wanted, restarting: false, restartRequired: true });
    }

    try {
      const changed = await switchPort(wanted);
      if (!changed.ok) {
        // 새 서버가 뜨지 못했으면 .env 를 되돌리고 기존 서버를 계속 쓴다.
        try { writeEnvPort(PORT); } catch { /* 무시 */ }
        return res.status(500).json({ error: changed.error || '새 포트에서 서버를 시작하지 못했습니다' });
      }
      res.json({ ok: true, port: wanted, restarting: true, restartRequired: true });
      schedulePortShutdown();
    } catch (err) {
      try { writeEnvPort(PORT); } catch { /* 무시 */ }
      return res.status(500).json({ error: err?.message || '포트 변경에 실패했습니다' });
    }
  } finally {
    portChangeBusy = false;
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: '존재하지 않는 API 경로입니다' });
});

// ── 런처 다운로드 (/game.zip) ─────────────────────────────────────────
//  런처(launcher.ps1)가 게임 본체를 내려받는 경로. 배포판에 game.zip 이 있으면 내려준다.
const GAME_ZIP_CANDIDATES = [
  path.join(ROOT, 'game.zip'),
  path.join(ROOT, 'installer', 'game.zip'),
  path.join(ROOT, 'dist', 'game.zip')
];
app.get('/game.zip', (req, res) => {
  const found = GAME_ZIP_CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!found) return res.status(404).json({ error: '게임 패키지(game.zip)가 없습니다 — npm run release:pack 으로 만드세요' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="game.zip"');
  res.sendFile(found);
});
// 런처가 버전을 확인할 수 있게 (없으면 조용히 넘어감)
app.get('/launcher.json', (req, res) => {
  const p = path.join(ROOT, 'launcher', 'launcher.json');
  try { res.sendFile(p); } catch { res.status(404).json({ error: 'launcher.json 이 없습니다' }); }
});

if (isProduction && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false }));
  // SPA fallback — /api, /socket.io 는 제외
  app.get(/^\/(?!api(?:\/|$)|socket\.io(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'index.html을 찾을 수 없습니다' });
    });
  });
}

// JSON 파싱/본문 크기 등 express 오류를 `{error}` JSON으로 변환
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err?.status || err?.statusCode || 500;
  const type = err?.type;
  if (type === 'entity.too.large') return res.status(413).json({ error: '요청 본문이 너무 큽니다' });
  if (type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON 본문을 해석할 수 없습니다' });
  console.error('[server] 처리되지 않은 오류:', err?.message || err);
  if (res.headersSent) return;
  return res.status(status >= 400 && status < 600 ? status : 500).json({ error: '서버 오류가 발생했습니다' });
});

/** ack 콜백 안전 호출 */
function reply(ack, payload) {
  if (typeof ack !== 'function') return payload;
  try {
    ack(payload);
  } catch (err) {
    console.error('[server] ack 실패:', err?.message || err);
  }
  return payload;
}

/** ack 라우팅용 핸들러 래퍼 — 절대 throw로 죽지 않는다 */
function withAck(ack, fn) {
  try {
    const result = fn();
    return reply(ack, result && typeof result === 'object' ? result : { ok: true });
  } catch (err) {
    console.error('[server] 소켓 처리 실패:', err?.message || err);
    return reply(ack, { ok: false, error: '서버 오류가 발생했습니다' });
  }
}

/** ack 없는 이벤트용 안전 실행 */
function quietly(fn) {
  try {
    fn();
  } catch (err) {
    console.error('[server] 소켓 처리 실패:', err?.message || err);
  }
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.resumeToken = null;
  /** 간단한 토큰 버킷 — 도배/폭주만 막는다 */
  const buckets = new Map();
  const limited = (key, max, windowMs) => {
    const now = Date.now();
    const b = buckets.get(key) || { start: now, n: 0 };
    if (now - b.start > windowMs) {
      b.start = now;
      b.n = 0;
    }
    b.n += 1;
    buckets.set(key, b);
    return b.n > max;
  };

  /** 현재 방 조회 */
  const currentRoom = () => (socket.data.roomCode ? rooms.getRoom(socket.data.roomCode) : null);

  /** 현재 방에서 나간다 — 명시적 퇴장은 좌석을 바로 회수한다. */
  const leaveCurrent = () => {
    const code = socket.data.roomCode;
    socket.data.roomCode = null;
    socket.data.resumeToken = null;
    if (!code) return null;
    const room = rooms.getRoom(code);
    if (!room) return null;
    room.removePlayer(socket.id);
    if (typeof socket.leave === 'function') socket.leave(code);
    return room;
  };

  socket.on(C2S.ROOM_CREATE, (payload = {}, ack) =>
    withAck(ack, () => {
      leaveCurrent();
      const opts = payload && typeof payload === 'object' ? payload : {};
      const nickname = sanitizeText(opts.nickname, 16) || '플레이어';
      const mode = normalizeMode(opts.mode) || DEFAULT_MODE;
      const seed = sanitizeText(opts.seed, 32);
      const difficulty = DIFFICULTY_IDS.includes(sanitizeText(opts.difficulty, 24).toLowerCase())
        ? sanitizeText(opts.difficulty, 24).toLowerCase()
        : DEFAULT_DIFFICULTY;
      const maxPlayers = toInt(clampNum(opts.maxPlayers, 1, 8, 4), 4);
      const isPrivate = opts.private === true;
      const room = rooms.createRoom({ hostId: socket.id, mode, seed, difficulty, maxPlayers, private: isPrivate });
      const added = room.addPlayer(socket, nickname, opts.character);
      if (!added.ok) {
        rooms.removeRoom(room.code);
        return { ok: false, error: added.error };
      }
      socket.data.roomCode = room.code;
      socket.data.resumeToken = added.token;
      return { ok: true, code: room.code, token: added.token, state: room.serialize() };
    }),
  );

  socket.on(C2S.ROOM_JOIN, (payload = {}, ack) =>
    withAck(ack, () => {
      const opts = payload && typeof payload === 'object' ? payload : {};
      const code = sanitizeText(opts.code, 8).toUpperCase();
      if (!code) return { ok: false, error: '방 코드가 필요합니다' };
      if (!/^[A-Z0-9]{4}$/.test(code)) return { ok: false, error: '초대코드는 영문·숫자 4자리입니다' };
      // 무차별 코드 대입 방지 — 같은 소켓에서 10초에 8회까지만.
      if (limited('join', 8, 10000)) return { ok: false, error: '시도가 너무 잦습니다 — 잠시 뒤 다시 시도하세요' };
      const nickname = sanitizeText(opts.nickname, 16) || '플레이어';
      const previousCode = socket.data.roomCode;
      // 입장에 성공한 뒤에만 이전 방을 떠난다 (실패한 코드 입력으로 방에서 쫓겨나지 않도록)
      const result = rooms.joinRoom(code, socket, nickname, opts.character);
      if (!result.ok) return { ok: false, error: result.error };
      if (previousCode && previousCode !== result.room.code) {
        const previous = rooms.getRoom(previousCode);
        if (previous) previous.removePlayer(socket.id);
        if (typeof socket.leave === 'function') socket.leave(previousCode);
      }
      socket.data.roomCode = result.room.code;
      socket.data.resumeToken = result.player?.token ?? socket.data.resumeToken;
      return { ok: true, code: result.room.code, token: result.player?.token ?? null, state: result.state };
    }),
  );

  // 재접속 — 게임 중 끊겼다가 45초 안에 돌아오면 같은 좌석으로 이어서 한다.
  socket.on(C2S.ROOM_REJOIN, (payload = {}, ack) =>
    withAck(ack, () => {
      const opts = payload && typeof payload === 'object' ? payload : {};
      const code = sanitizeText(opts.code, 8).toUpperCase();
      const token = sanitizeText(opts.token, 64);
      if (!code || !token) return { ok: false, error: '재접속 정보가 없습니다' };
      if (limited('rejoin', 12, 10000)) return { ok: false, error: '시도가 너무 잦습니다 — 잠시 뒤 다시 시도하세요' };
      const room = rooms.getRoom(code);
      if (!room) return { ok: false, error: '방이 이미 정리되었습니다 — 새 방을 만들어 주세요' };
      const result = room.rejoinPlayer(token, socket);
      if (!result.ok) return result;
      socket.data.roomCode = room.code;
      socket.data.resumeToken = result.token;
      return { ok: true, code: room.code, token: result.token, state: result.state, snapshot: result.snapshot };
    }),
  );

  socket.on(C2S.ROOM_LEAVE, (payload = {}, ack) =>
    withAck(ack, () => {
      leaveCurrent();
      return { ok: true };
    }),
  );

  socket.on(C2S.ROOM_READY, (payload = {}, ack) =>
    withAck(ack, () => {
      const room = currentRoom();
      if (!room) return { ok: false, error: '방에 참여하고 있지 않습니다' };
      const opts = payload && typeof payload === 'object' ? payload : {};
      const result = room.setReady(socket.id, !!opts.ready);
      if (!result.ok) socket.emit(S2C.ROOM_ERROR, { message: result.error });
      return result;
    }),
  );

  socket.on(C2S.ROOM_START, (payload = {}, ack) =>
    withAck(ack, () => {
      const room = currentRoom();
      if (!room) return { ok: false, error: '방에 참여하고 있지 않습니다' };
      if (room.hostId !== socket.id) return { ok: false, error: '방장만 시작할 수 있습니다' };
      const result = room.start();
      if (!result.ok) socket.emit(S2C.ROOM_ERROR, { message: result.error });
      return result;
    }),
  );

  socket.on(C2S.CHAT_SEND, (payload = {}, ack) =>
    withAck(ack, () => {
      const room = currentRoom();
      if (!room) return { ok: false, error: '방에 참여하고 있지 않습니다' };
      if (limited('chat', 5, 3000)) return { ok: false, error: '채팅이 너무 빠릅니다' };
      const opts = payload && typeof payload === 'object' ? payload : {};
      const result = room.chat(socket.id, opts.text);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }),
  );

  socket.on(C2S.PLAYER_STATE, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      if (limited('state', 60, 1000)) return;
      room.setPlayerState(socket.id, payload);
    }),
  );

  socket.on(C2S.TURRET_PLACE, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      if (limited('place', 20, 2000)) return;
      const placed = room.placeTurret(socket.id, payload);
      if (placed?.created) {
        socket.to(room.code).emit(S2C.GAME_EVENT, { type: 'turret:place', payload: placed.entry, from: socket.id });
      }
    }),
  );

  // 건물 회전 — 최상위에 한 번만 등록한다(설치할 때마다 등록하면 N중계·리스너 누수가 된다).
  socket.on('turret:rotate', (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      const yaw = Number(payload?.yaw);
      if (!Number.isFinite(yaw) || !payload?.turretId) return;
      socket.to(room.code).emit(S2C.GAME_EVENT, {
        type: 'turret:rotate',
        payload: {
          turretId: String(payload.turretId),
          yaw,
          x: Number(payload.x),
          y: Number(payload.y),
          z: Number(payload.z)
        },
        from: socket.id
      });
    }),
  );

  socket.on(C2S.TURRET_SELL, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      const opts = payload && typeof payload === 'object' ? payload : {};
      const removed = room.removeTurret(socket.id, opts.turretId);
      if (removed) socket.to(room.code).emit(S2C.GAME_EVENT, { type: 'turret:sell', payload: removed, from: socket.id });
    }),
  );

  socket.on(C2S.GAME_EVENT, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      if (limited('event', 60, 2000)) return;
      const opts = payload && typeof payload === 'object' ? payload : {};
      room.applyGameEvent(socket.id, opts.type, opts.payload);
    }),
  );

  socket.on('disconnect', () => {
    quietly(() => {
      const code = socket.data.roomCode;
      socket.data.roomCode = null;
      const room = code ? rooms.getRoom(code) : null;
      // 진행 중이면 45초 유예(재접속), 로비면 즉시 정리.
      if (room) room.handleDisconnect(socket.id);
    });
  });
});

// 빈 방/끝난 방 정리용 관리자 틱 (방별 20Hz 루프와 중복 호출 안전)
const cleanupTimer = setInterval(() => rooms.tickAll(), 1000 / clampNum(protocol.TICK_HZ, 1, 120, 20));
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

/** 새 포트의 /api/health 가 응답하는지 한 번 확인한다. */
function probeHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 900 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(port, maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (await probeHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * 새 포트에 새 서버 프로세스를 띄우고 health 가 뜰 때까지 기다린다.
 * 성공하면 이 프로세스는 곧 종료되고(새 프로세스는 detached 로 남는다), 실패하면 새 프로세스를 죽인다.
 */
async function switchPort(nextPort) {
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(nextPort), NODE_ENV: 'production', YOSE_PORT_CHANGE: '1' },
  });
  child.unref();
  const ok = await waitForHealth(nextPort);
  if (!ok) {
    try { child.kill(); } catch { /* 무시 */ }
    return { ok: false, error: `새 포트 ${nextPort} 에서 서버가 응답하지 않았습니다` };
  }
  return { ok: true, port: nextPort };
}

/** 응답이 브라우저에 도착할 시간을 준 뒤 이전 서버를 정상 종료한다. */
function schedulePortShutdown() {
  setTimeout(() => {
    try { shutdown('포트 변경'); } catch { process.exit(0); }
  }, 700).unref?.();
}

let shuttingDown = false;
/** SIGINT/SIGTERM 정상 종료 */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} 수신 — 정상 종료합니다...`);
  const finish = () => {
    try { dbModule.closeDb(); } catch { /* 무시 */ }
    process.exit(0);
  };
  try { clearInterval(cleanupTimer); } catch { /* 무시 */ }
  try { io.close(); } catch { /* 무시 */ }
  try { server.close(finish); } catch { finish(); }
  setTimeout(finish, 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason?.stack || reason);
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  🛡️  요새의 수호자 — 서버 실행 중');
  console.log(`     URL      : ${url}`);
  console.log(`     Health   : ${url}/api/health`);
  console.log(`     Socket   : ${url}/socket.io`);
  shareUrls.urls.slice(0, 3).forEach((u, i) => {
    console.log(`     ${i === 0 ? '공유    ' : '        '} : ${u}  ← 다른 사람은 이 주소로 접속`);
  });
  console.log(`     DB       : ${dbModule.resolveDbPath()}`);
  console.log(`     Tick     : ${protocol.TICK_HZ}Hz  |  Mode: ${isProduction ? 'production' : 'development'}`);
  if (adminInfo) {
    console.log(`     Admin    : ${adminInfo.username} (${adminInfo.created ? '신규 생성' : '기존 계정'})  — /api/auth/login 으로 로그인`);
  }
  console.log('');
});

server.on('error', (err) => {
  console.error('[server] HTTP 서버 오류:', err?.message || err);
});

export { app, server, io, rooms };
