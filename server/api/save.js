// 클라우드 세이브 API (/api/save) — 유저당 1행 UPSERT
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from './auth.js';

/** 세이브 페이로드 상한 (512KB) */
export const SAVE_MAX_BYTES = 512 * 1024;

const handle = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      console.error('[api/save]', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다' });
    });
};

const router = express.Router();
router.use(requireAuth);

router.get('/', handle((req, res) => {
  const row = db.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ data: null, updatedAt: null });
  let data = null;
  try { data = JSON.parse(row.data); } catch { data = null; }
  return res.json({ data, updatedAt: row.updated_at || null });
}));

router.post('/', handle((req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'data 객체가 필요합니다' });
  }
  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'data는 객체여야 합니다' });
  }
  let json;
  try { json = JSON.stringify(data); } catch { return res.status(400).json({ error: '직렬화할 수 없는 데이터입니다' }); }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > SAVE_MAX_BYTES) {
    return res.status(413).json({ error: `세이브 데이터가 너무 큽니다 (최대 ${SAVE_MAX_BYTES} bytes)` });
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(req.user.id, json, now);
  return res.json({ ok: true, updatedAt: now, bytes });
}));

export default router;
