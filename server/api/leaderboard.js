// 리더보드 API (/api/leaderboard) — 서버 재검증 점수만 저장
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from './auth.js';
import { clampNum, normalizeMode, sanitizeText, toInt } from '../game/protocol.js';

/** 리더보드 최소 웨이브 (.env LEADERBOARD_MIN_WAVE, 기본 3) */
export const MIN_WAVE = clampNum(process.env.LEADERBOARD_MIN_WAVE, 0, 10000, 3);

/** 서버 점수 상한 (비정상 값 방어) */
export const MAX_SCORE = 1_000_000_000;

const handle = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      console.error('[api/leaderboard]', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다' });
    });
};

const toEntry = (row, rank = 0) => ({
  rank,
  id: row.id,
  nickname: row.nickname,
  score: row.score,
  wave: row.wave,
  mode: row.mode,
  seed: row.seed,
  duration: row.duration,
  createdAt: row.created_at,
});

const router = express.Router();

router.get('/', handle((req, res) => {
  const mode = sanitizeText(req.query.mode, 24).toLowerCase();
  const limit = toInt(clampNum(req.query.limit, 1, 100, 100), 100);
  const rows = mode
    ? db.prepare('SELECT * FROM scores WHERE mode = ? ORDER BY score DESC, created_at ASC, id ASC LIMIT ?').all(mode, limit)
    : db.prepare('SELECT * FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ?').all(limit);
  return res.json({ entries: rows.map((row, i) => toEntry(row, i + 1)) });
}));

router.post('/', requireAuth, handle((req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const mode = normalizeMode(body.mode);
  const wave = toInt(clampNum(body.wave, 0, 1_000_000, 0), 0);
  const isAdmin = req.user?.isAdmin === true; // 관리자는 검증을 우회한다(운영·테스트용)
  if (wave < MIN_WAVE && !isAdmin) {
    return res.status(400).json({ error: `웨이브 ${MIN_WAVE} 이상만 리더보드에 등록할 수 있습니다` });
  }
  const duration = toInt(clampNum(body.duration, 0, 86_400, 0), 0);
  const seed = sanitizeText(body.seed, 32);
  const stats = body.stats && typeof body.stats === 'object' && !Array.isArray(body.stats) ? body.stats : null;
  const kills = toInt(clampNum(stats?.kills ?? body.kills, 0, 1_000_000_000, 0), 0);
  const gold = toInt(clampNum(stats?.goldEarned ?? stats?.gold ?? body.gold, 0, 1_000_000_000_000, 0), 0);
  const recomputed = Math.floor(wave * 1000 + kills * 10 + gold / 10);
  const submitted = Number.isFinite(Number(body.score)) ? Math.trunc(Number(body.score)) : null;

  let finalScore;
  if (submitted === null) {
    finalScore = recomputed;
  } else if (submitted > recomputed) {
    // stats가 있으면 서버 공식보다 큰 점수는 위조로 간주해 거부한다(관리자는 예외).
    if (stats && !isAdmin) return res.status(400).json({ error: '점수 검증에 실패했습니다 (서버 재계산 값 초과)' });
    finalScore = clampNum(submitted, 0, MAX_SCORE, recomputed);
  } else {
    finalScore = stats ? recomputed : submitted;
  }
  finalScore = toInt(clampNum(finalScore, 0, MAX_SCORE, 0), 0);

  const nickname = sanitizeText(req.user.nickname || req.user.username, 16) || '플레이어';
  const existing = db
    .prepare('SELECT * FROM scores WHERE user_id = ? AND mode = ? ORDER BY score DESC, created_at ASC LIMIT 1')
    .get(req.user.id, mode);

  let row;
  if (existing && existing.score >= finalScore) {
    row = existing;
  } else {
    const now = new Date().toISOString();
    db.prepare('DELETE FROM scores WHERE user_id = ? AND mode = ?').run(req.user.id, mode);
    const info = db
      .prepare(`INSERT INTO scores (user_id, nickname, mode, score, wave, seed, duration, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, nickname, mode, finalScore, wave, seed, duration, now);
    row = db.prepare('SELECT * FROM scores WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  const rank = Number(db
    .prepare(`SELECT COUNT(*) AS n FROM scores
              WHERE mode = ? AND (score > ? OR (score = ? AND created_at < ?))`)
    .get(mode, row.score, row.score, row.created_at)?.n ?? 0) + 1;

  return res.json({ ok: true, rank, entry: toEntry(row, rank) });
}));

export default router;
