// 통계 API (/api/stats) — 유저당 JSON 블롭 1행 UPSERT
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from './auth.js';

/** 통계 페이로드 상한 (256KB) */
export const STATS_MAX_BYTES = 256 * 1024;

const handle = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      console.error('[api/stats]', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다' });
    });
};

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

const router = express.Router();
router.use(requireAuth);

router.get('/', handle((req, res) => {
  const row = db.prepare('SELECT data, updated_at FROM stats WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ stats: {}, updatedAt: null });
  let stats = {};
  try { stats = JSON.parse(row.data); } catch { stats = {}; }
  return res.json({ stats: stats && typeof stats === 'object' ? stats : {}, updatedAt: row.updated_at || null });
}));

router.post('/', handle((req, res) => {
  const stats = asObject(req.body?.stats) ?? asObject(req.body?.data);
  if (!stats) return res.status(400).json({ error: 'stats 객체가 필요합니다' });
  let json;
  try { json = JSON.stringify(stats); } catch { return res.status(400).json({ error: '직렬화할 수 없는 데이터입니다' }); }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > STATS_MAX_BYTES) {
    return res.status(413).json({ error: `통계 데이터가 너무 큽니다 (최대 ${STATS_MAX_BYTES} bytes)` });
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO stats (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(req.user.id, json, now);
  return res.json({ ok: true, updatedAt: now, bytes });
}));

export default router;
