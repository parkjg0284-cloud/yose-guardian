// 요새의 수호자 — 서버 진입점 (REST + Socket.io + 정적 서빙)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import cors from 'cors';
import express from 'express';
import { Server as SocketServer } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

loadEnv({ path: path.join(ROOT, '.env') });

// .env를 읽은 뒤에 process.env 의존 모듈을 불러온다 (동적 import 순서 보장)
const dbModule = await import('./db.js');
const protocol = await import('./game/protocol.js');
const { C2S, S2C, DEFAULT_MODE, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, clampNum, normalizeMode, sanitizeText, toInt } =
  protocol;
const { default: authRouter, ensureAdminAccount } = await import('./api/auth.js');
const { default: saveRouter } = await import('./api/save.js');
const { default: leaderboardRouter } = await import('./api/leaderboard.js');
const { default: statsRouter } = await import('./api/stats.js');
const { default: adminRouter } = await import('./api/admin.js');
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

const PORT = toInt(clampNum(process.env.PORT, 1, 65535, 3001), 3001);
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
  pingTimeout: 20000,
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

  /** 현재 방 조회 */
  const currentRoom = () => (socket.data.roomCode ? rooms.getRoom(socket.data.roomCode) : null);

  /** 현재 방에서 나간다 */
  const leaveCurrent = () => {
    const code = socket.data.roomCode;
    socket.data.roomCode = null;
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
      return { ok: true, code: room.code, state: room.serialize() };
    }),
  );

  socket.on(C2S.ROOM_JOIN, (payload = {}, ack) =>
    withAck(ack, () => {
      const opts = payload && typeof payload === 'object' ? payload : {};
      const code = sanitizeText(opts.code, 8).toUpperCase();
      if (!code) return { ok: false, error: '방 코드가 필요합니다' };
      const nickname = sanitizeText(opts.nickname, 16) || '플레이어';
      const previousCode = socket.data.roomCode;
      // 입장에 성공한 뒤에만 이전 방을 떠난다 (실패한 코드 입력으로 방에서 쫓겨나지 않도록)
      const result = rooms.joinRoom(code, socket, nickname, opts.character);
      if (!result.ok) {
        socket.emit(S2C.ROOM_ERROR, { message: result.error });
        return { ok: false, error: result.error };
      }
      if (previousCode && previousCode !== result.room.code) {
        const previous = rooms.getRoom(previousCode);
        if (previous) previous.removePlayer(socket.id);
        if (typeof socket.leave === 'function') socket.leave(previousCode);
      }
      socket.data.roomCode = result.room.code;
      return { ok: true, state: result.state };
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
      const opts = payload && typeof payload === 'object' ? payload : {};
      const result = room.chat(socket.id, opts.text);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }),
  );

  socket.on(C2S.PLAYER_STATE, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      room.setPlayerState(socket.id, payload);
    }),
  );

  socket.on(C2S.TURRET_PLACE, (payload = {}) =>
    quietly(() => {
      const room = currentRoom();
      if (!room) return;
      const turret = room.placeTurret(socket.id, payload);
      if (turret) socket.to(room.code).emit(S2C.GAME_EVENT, { type: 'turret:place', payload: turret, from: socket.id });
      // 건물 회전 — 같은 방의 다른 클라이언트에 방향만 중계한다(위치로도 찾을 수 있게 좌표 동봉).
      socket.on('turret:rotate', (payload = {}) => {
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
      const opts = payload && typeof payload === 'object' ? payload : {};
      room.applyGameEvent(socket.id, opts.type, opts.payload);
    }),
  );

  socket.on('disconnect', () => {
    quietly(() => {
      const code = socket.data.roomCode;
      socket.data.roomCode = null;
      const room = code ? rooms.getRoom(code) : null;
      if (room) room.removePlayer(socket.id);
    });
  });
});

// 빈 방/끝난 방 정리용 관리자 틱 (방별 20Hz 루프와 중복 호출 안전)
const cleanupTimer = setInterval(() => rooms.tickAll(), 1000 / clampNum(protocol.TICK_HZ, 1, 120, 20));
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

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
