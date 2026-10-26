// 요새의 수호자 — 단일 프로세스 개발 런처 (npm run dev).
//
// 왜 concurrently 를 쓰지 않는가:
//   일부 환경(샌드박스·보안 정책)은 자식 프로세스의 파이프 stdio spawn 을 막아
//   `concurrently` 가 `spawn EPERM` 으로 즉사했다. 여기서는
//     (1) Express+Socket.io 서버를 같은 프로세스에서 import 로 띄우고(정적 서빙 포함),
//     (2) Vite 개발 서버(HMR)도 같은 프로세스에서 best-effort 로 띄운 뒤
//         실제로 /src/main.js 를 변환해 주는지 자체 점검한다.
//   Vite(esbuild)가 막히면 조용히 건너뛰므로, 어떤 환경에서도 게임 주소 하나는 확실히 뜬다.
//
//   게임(항상)   : http://localhost:3001 (기본 — .env 의 PORT 로 변경 가능)
//   HMR(가능 시) : http://localhost:5173

import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { localShareUrls } from '../server/net-info.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 설정 화면에서 바꾼 포트(.env)를 개발 런처도 따른다.
loadEnv({ path: process.env.YOSE_ENV_FILE ? path.resolve(ROOT, process.env.YOSE_ENV_FILE) : path.join(ROOT, '.env') });
const CLIENT_DIR = path.join(ROOT, 'client');
const DIST_INDEX = path.join(CLIENT_DIR, 'dist', 'index.html');
let SERVER_PORT = Number(process.env.PORT || 3001);
if (!Number.isInteger(SERVER_PORT) || SERVER_PORT < 1024 || SERVER_PORT > 65535) SERVER_PORT = 3001;
let SERVER_URL = process.env.VITE_SERVER_URL || `http://localhost:${SERVER_PORT}`;
const CLIENT_PORT = Number(process.env.CLIENT_PORT || 5173);

const buildOptions = {
  configFile: false,
  root: CLIENT_DIR,
  logLevel: 'warn',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1600 }
};

const line = (s = '') => console.log(s);

line('');
line('  ╔═══════════════════════════════════════════════════════╗');
line('  ║   요새의 수호자 — 기동                                ║');
line('  ╚═══════════════════════════════════════════════════════╝');

// ── 0) 배포본이 없으면 한 번 빌드 시도(같은 프로세스, best-effort)
if (!fs.existsSync(DIST_INDEX)) {
  line('  · client/dist 가 없어 빌드를 시도합니다...');
  try {
    const { build } = await import('vite');
    await build(buildOptions);
    line('  ✅ 빌드 완료');
  } catch (err) {
    line(`  ⚠️  빌드 실패(${err?.code || err?.message}) — Vite 개발 서버만 시도합니다.`);
  }
}

// ── 0-b) 포트 확보 — 3001 이 사용 중이면 3002·3003… 으로 자동 이동한다.
//   (예전에는 "이미 사용 중" 안내만 하고 그대로 listen 해서, 주소는 떠 있는데 접속이 안 되는 상태가 됐다)
const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
const gameAlive = async (port) => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
};
if (await gameAlive(SERVER_PORT)) {
  line(`  ℹ️  ${SERVER_PORT} 포트에서 이미 게임이 실행 중입니다 — 새로 띄우지 않습니다.`);
  line(`  🎮 게임 주소   : http://localhost:${SERVER_PORT}   ← 브라우저에서 새로고침하세요`);
  line('  (그 창을 닫으면 게임도 꺼집니다. 종료하려면 그 창에서 Ctrl+C)');
  line('');
  process.exit(0);
}
const preferredPort = SERVER_PORT;
for (let i = 0; i < 12 && !(await portFree(SERVER_PORT)); i++) SERVER_PORT += 1;
if (SERVER_PORT !== preferredPort) {
  line(`  ⚠️  ${preferredPort} 포트가 다른 프로그램이 쓰고 있어 ${SERVER_PORT} 로 시작합니다.`);
  line(`     → 게임 주소는 http://localhost:${SERVER_PORT} 입니다(아래 안내 참고).`);
}
SERVER_URL = process.env.VITE_SERVER_URL || `http://localhost:${SERVER_PORT}`;
process.env.PORT = String(SERVER_PORT);

// ── 1) Vite 개발 서버(HMR) — best-effort + 자체 점검
let vite = null;
let viteServer = null;
let viteUrl = null;
try {
  const { createServer } = await import('vite');
  viteServer = await createServer({
    ...buildOptions,
    server: {
      port: CLIENT_PORT,
      host: true,
      strictPort: false,
      proxy: {
        '/api': { target: SERVER_URL, changeOrigin: true },
        '/socket.io': { target: SERVER_URL, changeOrigin: true, ws: true }
      }
    }
  });
  await viteServer.listen();
  const url = viteServer.resolvedUrls?.local?.[0] || `http://localhost:${CLIENT_PORT}/`;
  // 자체 점검: 실제로 모듈을 변환해 주는지 확인(esbuild/자식 프로세스가 막히면 500 이 온다)
  const probe = await fetch(new URL('src/main.js', url), { signal: AbortSignal.timeout(8000) });
  if (!probe.ok) throw new Error(`/src/main.js 변환 실패 (HTTP ${probe.status})`);
  vite = viteServer;
  viteUrl = url;
} catch (err) {
  line(`  · HMR 개발 서버 없이 진행합니다 (${err?.code || err?.message || err})`);
  try {
    if (viteServer) await viteServer.close();
  } catch {
    /* 무시 */
  }
  vite = null;
  viteServer = null;
}

// ── 2) 게임 서버 + 정적 서빙(항상 켠다 → 어떤 환경에서도 플레이 가능)
// 포트가 이미 사용 중이면 친절하게 알려준다(다른 창에서 이미 실행 중인 흔한 상황).
const portInUse = await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
  probe.once('listening', () => probe.close(() => resolve(false)));
  probe.listen(Number(SERVER_PORT), '0.0.0.0');
});
if (portInUse) {
  line('');
  line(`  ⚠️  포트 ${SERVER_PORT} 이(가) 이미 사용 중입니다.`);
  line('     · 다른 창에서 이미 게임을 켜 두었다면 → 그 창의 주소를 그대로 쓰세요.');
  line(`     · 새로 띄우려면 → 이 창을 닫고 다른 포트로: set PORT=3002 && npm run dev`);
  line('');
}

process.env.NODE_ENV = 'production';
await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);

const share = localShareUrls({ port: Number(SERVER_PORT), protocol: 'http', publicUrl: process.env.PUBLIC_URL || null });
line('  ─────────────────────────────────────────────────────────');
line(`  🎮 게임 주소   : ${SERVER_URL}   ← 브라우저에서 여세요`);
share.urls.slice(0, 2).forEach((u, i) => {
  line(`  🌐 ${i === 0 ? '공유 주소  ' : '           '}: ${u}   ← 멀티플레이 초대 링크(다른 사람)`);
});
if (process.env.TUNNEL_URL) line(`  🔗 터널 주소   : ${process.env.TUNNEL_URL}   ← 인터넷(다른 네트워크)에서도 접속 (${process.env.TUNNEL_PROVIDER || 'tunnel'})`);
if (viteUrl) line(`  🔧 HMR 주소    : ${viteUrl}   (소스 수정 시 자동 반영)`);
else line('  ℹ️  HMR 없음    : 소스 수정 후에는 `npm run build` 후 새로고침');
line(`  💚 상태 확인   : ${SERVER_URL}/api/health`);
if (share.urls.length === 0) {
  line('  ⚠️  LAN 주소를 찾지 못했습니다 — 같은 네트워크에서 초대하려면 이 PC 의 IP 로 접속하세요.');
} else {
  line('  ℹ️  다른 사람이 못 들어오면 Windows 방화벽에서 Node.js 인바운드를 허용하세요:');
  line(`      netsh advfirewall firewall add rule name="요새의 수호자 ${SERVER_PORT}" dir=in action=allow protocol=TCP localport=${SERVER_PORT}`);
  if (process.env.TUNNEL_URL) {
    line(`  ℹ️  인터넷 공유   : 터널 실행 중 (${process.env.TUNNEL_PROVIDER || 'tunnel'}) — 위 터널 주소를 그대로 보내세요.`);
  } else {
    line('  ℹ️  인터넷(다른 네트워크)까지 열려면 터널: npm run dev:tunnel');
    line('      (직접 띄우려면: cloudflared tunnel --url http://localhost:' + SERVER_PORT + ')');
  }
}
line('  ⏹  종료       : Ctrl+C');
line('  ─────────────────────────────────────────────────────────');
line('');

const shutdown = async () => {
  try {
    if (vite) await vite.close();
  } catch {
    /* 무시 */
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
