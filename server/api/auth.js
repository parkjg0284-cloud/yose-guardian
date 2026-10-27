// 인증 API (/api/auth) — bcryptjs 해시 + JWT
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, resolveDbPath } from '../db.js';
import { sanitizeText } from '../game/protocol.js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const BCRYPT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;
let cachedJwtSecret = '';

/**
 * JWT 비밀키 — `.env JWT_SECRET` 우선, 없으면 DB 옆 `jwt-secret.txt` 에 한 번 만들어 보관한다.
 *  release.env 에는 관리자 해시만 넣고 JWT 키는 설치 PC마다 다르게 생성한다(공개 저장소 노출 방지).
 */
export function jwtSecret() {
  const fromEnv = String(process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? '').trim();
  if (fromEnv) return fromEnv;
  if (cachedJwtSecret) return cachedJwtSecret;
  const file = path.join(path.dirname(resolveDbPath()), 'jwt-secret.txt');
  try {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) {
      cachedJwtSecret = saved;
      return saved;
    }
  } catch {
    /* 첫 실행 — 아래에서 생성 */
  }
  cachedJwtSecret = randomBytes(32).toString('hex');
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${cachedJwtSecret}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    console.warn('[보안] JWT 비밀키 파일 저장 실패:', err?.message || err);
  }
  return cachedJwtSecret;
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

/** 생성된 관리자 비밀번호를 보관하는 파일(DB 와 같은 data 폴더). */
export function adminPasswordFile() {
  if (process.env.ADMIN_PASSWORD_FILE) return path.resolve(process.env.ADMIN_PASSWORD_FILE);
  return path.join(path.dirname(resolveDbPath()), 'admin-password.txt');
}

function readAdminPasswordFile() {
  try {
    const raw = readFileSync(adminPasswordFile(), 'utf8').trim();
    return raw.length >= 4 && raw.length <= 72 ? raw : '';
  } catch {
    return '';
  }
}

function writeAdminPasswordFile(password) {
  const file = adminPasswordFile();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
    return file;
  } catch (err) {
    console.warn('[보안] 관리자 비밀번호 파일 저장 실패:', err?.message || err);
    return '';
  }
}

/**
 * .env 의 ADMIN_* 값을 검증해 확정한다(잘못된 값은 기본값으로 되돌린다).
 *  - ADMIN_PASSWORD       : 평문(로컬 개발·기존 설치 호환)
 *  - ADMIN_PASSWORD_HASH  : bcrypt 해시(배포 game.zip — 평문을 공개하지 않기 위함)
 *  - 둘 다 없으면 data/admin-password.txt 를 읽거나 한 번만 생성한다.
 */
export function adminCredentials() {
  const rawName = String(process.env.ADMIN_USERNAME ?? "").trim();
  const rawPass = typeof process.env.ADMIN_PASSWORD === "string" ? process.env.ADMIN_PASSWORD : "";
  const rawHash = String(process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  const rawNick = sanitizeText(process.env.ADMIN_NICKNAME, 16);
  // 평문이 있으면 기존 동작을 그대로 우선한다. 배포본은 평문 없이 해시만 넣는다.
  const passwordHash = rawPass ? '' : (BCRYPT_HASH_RE.test(rawHash) ? rawHash : '');
  let password = '';
  if (!passwordHash) {
    if (rawPass.length >= 4 && rawPass.length <= 72) {
      password = rawPass;
    } else {
      // .env 에 비밀번호가 없으면 data/admin-password.txt 를 먼저 읽는다.
      // 예전에는 매 시작마다 무작위로 새로 만들어 **관리자 계정에 영영 로그인할 수 없었다**.
      const persisted = readAdminPasswordFile();
      if (persisted) {
        ADMIN_DEFAULT.password = persisted;
        password = persisted;
      } else {
        // 코드에 박힌 기본값을 쓰지 않고, 한 번만 생성해 파일에 남긴다.
        if (!ADMIN_DEFAULT.password) {
          ADMIN_DEFAULT.password = randomPassword();
          const file = writeAdminPasswordFile(ADMIN_DEFAULT.password);
          console.warn(`[보안] ADMIN_PASSWORD 가 없어 임시 비밀번호를 생성해 ${file || '저장 실패'} 에 보관했습니다.`);
          console.warn('[보안] 위 파일을 열어 비밀번호를 확인하거나, .env ADMIN_PASSWORD 로 직접 지정하세요.');
        }
        password = ADMIN_DEFAULT.password;
      }
    }
  }
  return {
    username: USERNAME_RE.test(rawName) ? rawName : ADMIN_DEFAULT.username,
    password,
    passwordHash,
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
  if (!cred.passwordHash && !cred.password) throw new Error("관리자 비밀번호가 설정되지 않았습니다");
  const row = db.prepare("SELECT id, role, password_hash FROM users WHERE username = ?").get(cred.username);
  if (row) {
    // 관리자 계정은 .env 의 비밀번호와 항상 맞춘다 — 예전 비밀번호로 로그인이 안 되는 일을 막는다.
    //  해시가 있으면 해시 문자열을 그대로 맞추고(재해시로 매번 바뀌지 않게), 평문이면 bcrypt 비교한다.
    const needReset = cred.passwordHash
      ? row.password_hash !== cred.passwordHash
      : !bcrypt.compareSync(cred.password, row.password_hash ?? "");
    if (row.role !== "admin" || needReset) {
      const nextHash = cred.passwordHash || bcrypt.hashSync(cred.password, BCRYPT_ROUNDS);
      db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?")
        .run(nextHash, row.id);
    }
    return { created: false, id: row.id, username: cred.username, role: "admin", reset: needReset };
  }
  const passwordHash = cred.passwordHash || bcrypt.hashSync(cred.password, BCRYPT_ROUNDS);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, 'admin', ?)")
    .run(cred.username, passwordHash, cred.nickname, new Date().toISOString());
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
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    // 아이디 대소문자를 잘못 입력해도 관리자 로그인이 막히지 않게 정확한 철자를 먼저 보고,
    //  정확한 계정이 없을 때만 대소문자 무시로 한 번 더 찾는다.
    ?? db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
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
