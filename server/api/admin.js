// 관리자 전용 API (/api/admin) — requireAdmin 을 통과한 요청만 처리한다.
// 구경/운영용 읽기 + 점수 정리(삭제)만 제공한다. 게임 진행에는 관여하지 않는다.
import express from 'express';
import { db } from '../db.js';
import { requireAdmin } from './auth.js';
import { clampNum, toInt } from '../game/protocol.js';

const handle = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      console.error('[api/admin]', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다' });
    });
};

/** COUNT(*) 안전 조회 */
const count = (sql) => {
  try {
    return Number(db.prepare(sql).get()?.n ?? 0);
  } catch {
    return 0;
  }
};

const toScoreEntry = (row) => ({
  id: row.id,
  userId: row.user_id,
  nickname: row.nickname,
  mode: row.mode,
  score: row.score,
  wave: row.wave,
  seed: row.seed,
  duration: row.duration,
  createdAt: row.created_at
});

const router = express.Router();

// 이 아래 모든 경로는 관리자 토큰 필요 (401/403 은 requireAdmin 이 처리)
router.use(requireAdmin);

/** 관리자 개요 — 계정/세이브/점수 집계 + 최근 가입 + 상위 점수 */
router.get('/overview', handle((req, res) => {
  const users = db
    .prepare('SELECT id, username, nickname, role, created_at FROM users ORDER BY id DESC LIMIT 20')
    .all()
    .map((r) => ({
      id: r.id,
      username: r.username,
      nickname: r.nickname,
      role: r.role === 'admin' ? 'admin' : 'user',
      createdAt: r.created_at
    }));
  const scores = db
    .prepare('SELECT * FROM scores ORDER BY score DESC, created_at ASC LIMIT 10')
    .all()
    .map(toScoreEntry);
  res.json({
    ok: true,
    admin: { id: req.user.id, username: req.user.username, nickname: req.user.nickname },
    counts: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      admins: count("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
      saves: count('SELECT COUNT(*) AS n FROM saves'),
      scores: count('SELECT COUNT(*) AS n FROM scores')
    },
    users,
    scores,
    uptime: Math.round(process.uptime())
  });
}));

/** 계정 목록 */
router.get('/users', handle((req, res) => {
  const limit = toInt(clampNum(req.query.limit, 1, 200, 50), 50);
  const rows = db
    .prepare('SELECT id, username, nickname, role, created_at FROM users ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json({
    ok: true,
    limit,
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      nickname: r.nickname,
      role: r.role === 'admin' ? 'admin' : 'user',
      createdAt: r.created_at
    }))
  });
}));

/** 점수 한 건 삭제(운영/정리용) */
router.delete('/scores/:id', handle((req, res) => {
  const id = toInt(clampNum(req.params.id, 0, Number.MAX_SAFE_INTEGER, 0), 0);
  if (!id) return res.status(400).json({ error: '점수 id 가 필요합니다' });
  const row = db.prepare('SELECT id FROM scores WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '해당 점수를 찾을 수 없습니다' });
  db.prepare('DELETE FROM scores WHERE id = ?').run(id);
  return res.json({ ok: true, deleted: id });
}));

export default router;
