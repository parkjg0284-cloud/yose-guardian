// 요새의 수호자 — 자동 재시작 감시자 (run.cmd 가 이걸 띄운다)
//  · 게임 서버(tools/dev.mjs)와 다운로드 서버(tools/dl-server.mjs)를 함께 감시한다.
//  · 크래시(비정상 종료)면 몇 초 뒤 다시 띄운다 — "갑자기 접속이 안 되는" 상황을 자동 복구한다.
//  · 정상 종료(코드 0: 예를 들어 이미 게임이 떠 있어 새로 띄우지 않은 경우)면 재시작하지 않는다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, '.tmp');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* 무시 */ }

const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(LOG_DIR, 'supervise.log'), line + '\n'); } catch { /* 무시 */ }
};

let stopping = false;
const jobs = [
  { name: '게임 서버', file: 'tools/dev.mjs', restarts: 0, child: null },
  { name: '다운로드 서버', file: 'tools/dl-server.mjs', restarts: 0, child: null }
];

const start = (job) => {
  if (stopping) return;
  job.child = spawn(process.execPath, [job.file], { cwd: ROOT, stdio: 'inherit', env: process.env });
  log(`${job.name} 시작 (PID ${job.child.pid})`);
  job.child.on('error', (err) => log(`⚠️  ${job.name} 실행 실패: ${err?.message || err}`));
  job.child.on('exit', (code, signal) => {
    if (stopping) return;
    if (code === 0) {
      log(`${job.name} 가 정상 종료했습니다 — 재시작하지 않습니다.`);
      return;
    }
    job.restarts += 1;
    const wait = Math.min(10, 2 + job.restarts);
    log(`⚠️  ${job.name} 비정상 종료(code ${code ?? '-'}, ${signal || '-'}) — ${wait}초 뒤 자동 재시작 (${job.restarts}회)`);
    const timer = setTimeout(() => start(job), wait * 1000);
    if (typeof timer.unref === 'function') timer.unref();
  });
};

const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  log(`${signal} — 서버들을 종료합니다...`);
  for (const job of jobs) { try { job.child?.kill(); } catch { /* 무시 */ } }
  setTimeout(() => process.exit(0), 600);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

log('감시 시작 — 창을 닫거나 Ctrl+C 하면 함께 종료됩니다.');
for (const job of jobs) start(job);
