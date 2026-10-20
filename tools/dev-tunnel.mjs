// 요새의 수호자 — 개발 서버 + 터널 동시 실행 (npm run dev:tunnel)
//
// 왜 파이프가 아니라 "로그 파일"인가:
//   일부 환경(샌드박스·보안 정책)은 자식 프로세스의 파이프 stdio spawn 을 막는다(spawn EPERM).
//   그래서 터널 출력을 파일로 흘려보내고, 그 파일을 읽어 공개 URL 을 얻는다.
//   덕분에 터널 로그도 그대로 남아 나중에 확인할 수 있다.
//
//   실행: npm run dev:tunnel            (기본 cloudflared, PORT=3001)
//         npm run dev:tunnel -- --provider=localtunnel --port=3002
//   환경: TUNNEL=cloudflared|localtunnel, TUNNEL_CMD/TUNNEL_ARGS(JSON) 로 명령 덮어쓰기

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pollForTunnelUrl, tailText, tunnelPlan, tunnelPort, tunnelProvider } from './tunnel-info.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGV = process.argv.slice(2);
const PORT = tunnelPort(ARGV, process.env);
const PROVIDER = tunnelProvider(ARGV, process.env);
const plan = tunnelPlan({ provider: PROVIDER, port: PORT, env: process.env });
const LOG_PATH = path.join(ROOT, '.tmp', `tunnel-${PORT}.log`);
const WAIT_MS = Number(process.env.TUNNEL_WAIT_MS || 30000);
const line = (s = '') => console.log(s);

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.writeFileSync(LOG_PATH, '');
let outFd = null;
try {
  outFd = fs.openSync(LOG_PATH, 'a');
} catch (err) {
  console.error(`터널 로그 파일을 열 수 없습니다: ${err?.message || err}`);
  process.exit(1);
}
const readLog = () => {
  try {
    return fs.readFileSync(LOG_PATH, 'utf8');
  } catch {
    return '';
  }
};

line('');
line('  ╔═══════════════════════════════════════════════════════╗');
line('  ║   요새의 수호자 — 터널 모드                           ║');
line('  ╚═══════════════════════════════════════════════════════╝');
line(`  · 터널     : ${plan.name}`);
line(`  · 명령     : ${plan.cmd} ${plan.args.join(' ')}`);
line(`  · 로그     : ${path.relative(ROOT, LOG_PATH)}`);
line(`  · 주소 대기 : 최대 ${Math.round(WAIT_MS / 1000)}초`);

let child = null;
let spawnError = null;
let exitNote = null;
const alive = () => Boolean(child) && child.exitCode === null && !child.killed && !spawnError;

try {
  child = spawn(plan.cmd, plan.args, { cwd: ROOT, stdio: ['ignore', outFd, outFd], windowsHide: true });
  child.on('error', (err) => {
    spawnError = err;
    exitNote = err?.code === 'ENOENT' ? `'${plan.cmd}' 를 찾을 수 없습니다` : err?.message || String(err);
  });
  child.on('exit', (code, signal) => {
    if (exitNote == null) exitNote = `터널 프로세스 종료 (code=${code ?? '-'}${signal ? `, ${signal}` : ''})`;
  });
} catch (err) {
  spawnError = err;
  exitNote = err?.message || String(err);
}

const result = await pollForTunnelUrl({
  read: readLog,
  isAlive: alive,
  timeoutMs: WAIT_MS,
  intervalMs: 400
});

if (result.ok) {
  process.env.PUBLIC_URL = result.url;
  process.env.TUNNEL_URL = result.url;
  process.env.TUNNEL_PROVIDER = plan.provider;
  line('');
  line(`  ✅ 터널 준비 완료 (${(result.elapsedMs / 1000).toFixed(1)}초)`);
  line(`  🔗 공개 주소 : ${result.url}`);
  line('     · 이 주소를 그대로 보내면 인터넷 어디서든 접속됩니다(방화벽·공유기 설정 불필요).');
  line('     · 게임 안 메인 화면의 "열린 방" 목록에도 이 서버의 방이 그대로 보입니다.');
  line('');
} else {
  line('');
  line(`  ⚠️  터널을 띄우지 못했습니다 (${result.reason === 'exited' ? exitNote || '프로세스 종료' : '시간 초과'})`);
  line(`     · 설치: ${plan.install}`);
  line(`     · 대안: ${plan.alt}`);
  line('     · 이 창은 LAN(같은 공유기) 공유만으로 계속 진행합니다.');
  const tail = tailText(result.text, 6);
  if (tail) {
    line('     · 터널 로그:');
    tail.split('\n').forEach((l) => line(`       ${l}`));
  }
  line('');
}

const stopTunnel = () => {
  try {
    if (child && child.exitCode === null) child.kill();
  } catch {
    /* 무시 */
  }
  try {
    if (outFd != null) fs.closeSync(outFd);
  } catch {
    /* 무시 */
  }
  outFd = null;
};
process.on('SIGINT', stopTunnel);
process.on('SIGTERM', stopTunnel);
process.on('exit', stopTunnel);

// 게임 서버(+정적 서빙)는 dev.mjs 를 그대로 재사용한다 — 배너·HMR·포트 점검까지 동일.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
await import(pathToFileURL(path.join(ROOT, 'tools', 'dev.mjs')).href).catch((err) => {
  console.error('[dev-tunnel] 게임 서버 기동 실패:', err?.message || err);
  stopTunnel();
  process.exit(1);
});
