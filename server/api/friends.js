// 친구 API — 친구 코드 등록·조회 (메모리 레지스트리).
//
//  같은 서버(같은 PC·LAN)에 접속한 플레이어끼리는 친구 코드만으로
//  상대의 방 코드와 접속 주소를 알 수 있다.
//    POST /api/friends/register  { code, name, room }  → 등록/갱신
//    POST /api/friends/leave     { code }              → 오프라인 표시
//    GET  /api/friends/lookup?code=XXXXXXXX            → 친구 한 명
//    GET  /api/friends/online                          → 접속 중인 친구 수
import { buildShareUrls } from '../net-info.js';

/** 친구 코드 — 헷갈리는 글자(0/O/1/I)를 뺀 8자리 */
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const ROOM_RE = /^[A-Z0-9]{4}$/;
/** 30분 동안 갱신이 없으면 오프라인으로 본다 */
const STALE_MS = 30 * 60 * 1000;

export function createFriendRegistry({ now = () => Date.now(), port = 3001 } = {}) {
  const players = new Map(); // code → { code, name, room, origin, at }

  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  // 하이픈·공백이 섞여 들어와도 코드만 뽑는다 (ABCD-EFGH → ABCDEFGH)
  const cleanCode = (v) => clean(v, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');

  return {
    register({ code, name, room, origin } = {}) {
      const c = cleanCode(code);
      if (!CODE_RE.test(c)) return { ok: false, error: '친구 코드가 올바르지 않습니다' };
      const r = clean(room, 8).toUpperCase();
      const entry = {
        code: c,
        name: clean(name, 16) || '플레이어',
        room: ROOM_RE.test(r) ? r : '',
        origin: clean(origin, 120),
        at: now()
      };
      players.set(c, entry);
      return { ok: true, friend: entry };
    },

    leave({ code } = {}) {
      const c = cleanCode(code);
      const had = players.delete(c);
      return { ok: had };
    },

    lookup(code) {
      const c = cleanCode(code);
      if (!CODE_RE.test(c)) return { ok: false, error: '친구 코드 형식이 아닙니다' };
      const f = players.get(c);
      if (!f) return { ok: true, friend: null };
      const online = now() - f.at < STALE_MS;
      return {
        ok: true,
        friend: {
          code: f.code,
          name: f.name,
          room: online ? f.room : '',
          origin: online ? f.origin : '',
          online,
          at: f.at
        }
      };
    },

    count() {
      let n = 0;
      for (const f of players.values()) if (now() - f.at < STALE_MS) n++;
      return n;
    },

    /** 등록된 주소가 없을 때 알려 줄 이 서버의 LAN 주소 */
    lanOrigin() {
      try {
        const urls = buildShareUrls({ port });
        if (Array.isArray(urls) && urls.length) return String(urls[0]).replace(/\/+$/, '');
      } catch { /* 네트워크 정보 없음 */ }
      return '';
    }
  };
}

/** Express 라우터 등록 */
export function registerFriendRoutes(app, registry) {
  app.post('/api/friends/register', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const requestOrigin = `${req.protocol}://${req.get('host') || 'localhost'}`;
    const origin = String(body.origin || req.get('origin') || '').replace(/\/+$/, '') || registry.lanOrigin() || requestOrigin;
    const result = registry.register({ ...body, origin });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/friends/leave', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.json(registry.leave(body));
  });

  app.get('/api/friends/lookup', (req, res) => {
    const result = registry.lookup(req.query?.code);
    res.status(result.ok ? 200 : 400).json({ ...result, now: Date.now() });
  });

  app.get('/api/friends/online', (req, res) => {
    res.json({ ok: true, count: registry.count(), lan: registry.lanOrigin() });
  });
}

export default { createFriendRegistry, registerFriendRoutes };
