// SQLite (node:sqlite 내장) 초기화 및 스키마 정의
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 현재 열린 DB 인스턴스 (initDb 호출 전에는 null) */
export let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  role TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  nickname TEXT,
  mode TEXT,
  score INTEGER,
  wave INTEGER,
  seed TEXT,
  duration INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores(mode, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scores_user_mode ON scores(user_id, mode);
`;

/** DB 경로를 절대경로로 변환 (상대 경로는 저장소 루트 기준) */
export function resolveDbPath(dbPath) {
  const target = dbPath || process.env.DB_PATH || './server/data/game.db';
  return path.isAbsolute(target) ? target : path.resolve(ROOT, target);
}

/** 디렉터리를 만들고 DB를 열어 테이블을 생성한 뒤 인스턴스를 반환한다. */
export function initDb(dbPath) {
  const abs = resolveDbPath(dbPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (db) {
    try { db.close(); } catch { /* 이미 닫힘 */ }
    db = null;
  }
  const instance = new DatabaseSync(abs);
  instance.exec('PRAGMA journal_mode = WAL;');
  instance.exec('PRAGMA foreign_keys = ON;');
  instance.exec('PRAGMA busy_timeout = 5000;');
  instance.exec(SCHEMA);
  // 마이그레이션: role 컬럼이 없던 예전 DB 도 그대로 쓸 수 있게 한다.
  try {
    const cols = instance.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!cols.includes('role')) instance.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  } catch (err) {
    console.error('[db] role 컬럼 마이그레이션 실패:', err?.message || err);
  }
  db = instance;
  return db;
}

/** DB를 닫는다. */
export function closeDb() {
  if (!db) return;
  try { db.close(); } catch { /* 무시 */ }
  db = null;
}
