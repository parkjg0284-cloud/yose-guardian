// 인증 API (/api/auth) — bcryptjs 해시 + JWT
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { sanitizeText } from '../game/protocol.js';
import { randomBytes } from 'node:crypto';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const BCRYPT_ROUNDS = 10;

/** JWT 비밀키 (.env) */
export function jwtSecret() {
  return process.env.JWT_SECRET || 'fortress_guardian_dev_secret_change_me';
}

/** `{id, username}` 페이로드로 토큰 발급 */
export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role === 'admin' ? 'admin' : 'user' },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES || '30d' },
  );
}

/** Authorization: Bearer 토큰 추출 */
export function bearerToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1].trim() : '';
}

/** Bearer 인증 미들웨어 — 실패 시 401 `{error}` */
export function requireAuth(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: '인증이 필요합니다' });
    const payload = jwt.verify(token, jwtSecret());
    const id = Number(payload?.id);
    if (!Number.isFinite(id)) return res.status(401).json({ error: '토큰이 올바르지 않습니다' });
    const row = db?.prepare('SELECT id, username, nickname, role FROM users WHERE id = ?').get(id);
    if (!row) return res.status(401).json({ error: '사용자를 찾을 수 없습니다' });
    const isAdmin = row.role === 'admin';
    req.user = { id: row.id, username: row.username, nickname: row.nickname, role: isAdmin ? 'admin' : 'user', isAdmin };
    return next();
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return res.status(401).json({ error: expired ? '토큰이 만료되었습니다' : '인증에 실패했습니다' });
  }
}

/** 관리자 전용 미들웨어 — 관리자가 아니면 403 `{error}` */
export function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.user?.isAdmin !== true) return res.status(403).json({ error: '관리자 권한이 필요합니다' });
    return next();
  });
}

/** 라우트 핸들러를 감싸 예외를 `{error}` 응답으로 바꾼다. */
const handle = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      console.error('[api/auth]', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다' });
    });
};

const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

/** 외부로 내보내는 사용자 정보 (role/isAdmin 포함) */
const publicUser = (row) => {
  const isAdmin = row?.role === 'admin';
  return { id: row.id, username: row.username, nickname: row.nickname, role: isAdmin ? 'admin' : 'user', isAdmin };
};

// 관리자 계정 기본값 — .env 로 반드시 덮어쓴다.
//  비밀번호 기본값을 코드에 두면 공개 저장소에서 그대로 노출되므로,
//  .env 가 없을 때는 무작위로 생성하고 콘솔에 한 번만 알려 준다(보안).
function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  // ESM — require 대신 정적 import 를 쓴다.
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}
export const ADMIN_DEFAULT = { username: 'admin', password: null, nickname: '관리자' };

/** .env 의 ADMIN_* 값을 검증해 확정한다(잘못된 값은 기본값으로 되돌린다). */
export function adminCredentials() {
  const rawName = String(process.env.ADMIN_USERNAME ?? "").trim();
  const rawPass = typeof process.env.ADMIN_PASSWORD === "string" ? process.env.ADMIN_PASSWORD : "";
  const rawNick = sanitizeText(process.env.ADMIN_NICKNAME, 16);
  return {
    username: USERNAME_RE.test(rawName) ? rawName : ADMIN_DEFAULT.username,
    password: (() => {
      if (rawPass.length >= 4 && rawPass.length <= 72) return rawPass;
      // .env 에 비밀번호가 없으면 무작위 생성 — 코드에 박힌 기본값을 쓰지 않는다.
      if (!ADMIN_DEFAULT.password) {
        ADMIN_DEFAULT.password = randomPassword();
        console.warn(`[보안] ADMIN_PASSWORD 가 없어 임시 비밀번호를 생성했습니다: ${ADMIN_DEFAULT.password}`);
        console.warn('[보안] .env 에 ADMIN_PASSWORD 를 설정하면 이 값이 유지됩니다.');
      }
      return ADMIN_DEFAULT.password;
    })(),
    nickname: rawNick || ADMIN_DEFAULT.nickname
  };
}

/**
 * 관리자 계정을 보장한다(서버 시작 시 1회 호출).
 * - 없으면 만든다(비밀번호는 bcrypt 해시로 저장)
 * - 이미 있으면 role 만 admin 으로 승격한다(기존 비밀번호는 건드리지 않는다)
 */
export function ensureAdminAccount(opts = {}) {
  const cred = { ...adminCredentials(), ...opts };
  const row = db.prepare("SELECT id, role, password_hash FROM users WHERE username = ?").get(cred.username);
  if (row) {
    // 관리자 계정은 .env 의 비밀번호와 항상 맞춘다 — 예전 비밀번호로 로그인이 안 되는 일을 막는다.
    const needReset = !bcrypt.compareSync(cred.password, row.password_hash ?? "");
    if (row.role !== "admin" || needReset) {
      db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?")
        .run(bcrypt.hashSync(cred.password, BCRYPT_ROUNDS), row.id);
    }
    return { created: false, id: row.id, username: cred.username, role: "admin", reset: needReset };
  }
  const info = db
    .prepare("INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, 'admin', ?)")
    .run(cred.username, bcrypt.hashSync(cred.password, BCRYPT_ROUNDS), cred.nickname, new Date().toISOString());
  return { created: true, id: Number(info.lastInsertRowid), username: cred.username, role: "admin" };
}

const router = express.Router();

router.post('/register', handle((req, res) => {
  const body = bodyOf(req);
  const username = String(body.username ?? '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: '아이디는 3~20자의 영문/숫자/밑줄만 사용할 수 있습니다' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 최소 4자 이상이어야 합니다' });
  }
  if (password.length > 72) {
    return res.status(400).json({ error: '비밀번호는 72자 이하여야 합니다' });
  }
  const nickname = sanitizeText(body.nickname, 16) || username;
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });

  const now = new Date().toISOString();
  let info;
  try {
    info = db
      .prepare('INSERT INTO users (username, password_hash, nickname, created_at) VALUES (?, ?, ?, ?)')
      .run(username, bcrypt.hashSync(password, BCRYPT_ROUNDS), nickname, now);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return res.status(409).json({ error: '이미 사용 중인 아이디입니다 (아이디는 고유, 닉네임은 중복 가능)' });
    throw err;
  }
  const user = { id: Number(info.lastInsertRowid), username, nickname };
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', handle((req, res) => {
  const body = bodyOf(req);
  const username = String(body.username ?? '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }
  return res.json({ token: signToken(row), user: publicUser(row) });
}));

router.get('/me', requireAuth, handle((req, res) => {
  res.json({ user: publicUser(req.user) });
}));

/** 닉네임 변경 — 로그인한 본인 계정만(계약 §4.54) */
router.post('/nickname', requireAuth, handle((req, res) => {
  const body = bodyOf(req);
  const nickname = sanitizeText(body.nickname, 16);
  if (!nickname) return res.status(400).json({ error: '닉네임은 1~16자로 입력하세요' });
  // 닉네임은 **중복을 허용**한다 — 고유 제약도, 중복 검사도 두지 않는다(계약 §4.54).
  //  · 같은 이름을 여러 계정이 써도 저장되고, 멀티에서는 그대로 표시된다.
  //  · 로그인 식별자는 username(고유)이고 닉네임은 표시용이다.
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, req.user.id);
  return res.json({ user: publicUser({ ...req.user, nickname }) });
}));

export default router;
