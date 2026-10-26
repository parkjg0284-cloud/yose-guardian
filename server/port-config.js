// 요세의 수호자 — 서버 포트 설정 (.env 의 PORT 한 줄)
//  · 서버·앱 런처·VBS·run.cmd 가 모두 같은 .env 를 읽어 포트를 맞춘다.
//  · 비밀 값(관리자/JWT)은 건드리지 않고 PORT 줄만 바꾼다.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PORT = 3001;
export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

export function envFilePath(root = ROOT) {
  const override = String(process.env.YOSE_ENV_FILE || '').trim();
  return override ? path.resolve(root, override) : path.join(root, '.env');
}

/** 엄격한 포트 검사 — 정수 1024~65535 만 허용한다. */
export function parsePort(value) {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isInteger(n) || n < MIN_PORT || n > MAX_PORT) return null;
  return n;
}

export function normalizePort(value, fallback = DEFAULT_PORT) {
  return parsePort(value) ?? fallback;
}

/** .env 에서 PORT=... 를 읽는다. 없거나 잘못되면 null. */
export function readEnvPort(file = envFilePath()) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    let found = null;
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*PORT\s*=\s*(.*?)\s*$/i.exec(line);
      if (m) found = parsePort(m[1].replace(/^['"]|['"]$/g, ''));
    }
    return found;
  } catch {
    return null;
  }
}

/**
 * .env 의 PORT 줄만 바꾼다.
 *  · 기존 PORT 줄이 여러 개면 하나로 합친다(마지막 값 기준).
 *  · 다른 줄(주석·관리자 비밀번호 등)은 그대로 둔다.
 *  · 임시 파일에 쓴 뒤 rename 해서 중간에 깨진 .env 가 남지 않게 한다.
 */
export function writeEnvPort(port, file = envFilePath()) {
  const value = parsePort(port);
  if (value === null) throw new Error(`허용되지 않는 포트입니다: ${port}`);
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    raw = '';
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let replaced = false;
  const lines = [];
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*PORT\s*=/i.test(line)) {
      if (!replaced) lines.push(`PORT=${value}`);
      replaced = true;
      continue;
    }
    lines.push(line);
  }
  if (!replaced) lines.push(`PORT=${value}`);
  let next = lines.join(eol);
  if (!next.endsWith(eol)) next += eol;
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, next, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    try { fs.rmSync(temp, { force: true }); } catch { /* 무시 */ }
    throw err;
  }
  return value;
}

/** 새 포트를 실제로 바인딩해 사용 가능한지 확인한다(닫은 뒤 true). */
export function isPortAvailable(port, host = '0.0.0.0') {
  const value = parsePort(port);
  if (value === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    const probe = net.createServer();
    const done = (ok) => {
      try { probe.close(); } catch { /* 무시 */ }
      resolve(ok);
    };
    probe.once('error', () => done(false));
    probe.once('listening', () => done(true));
    try {
      probe.listen({ port: value, host, exclusive: true });
    } catch {
      done(false);
    }
  });
}
