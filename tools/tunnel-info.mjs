// 터널 자동 실행(npm run dev:tunnel)용 순수 유틸 (계약 §4.30)
//
// 왜 순수 모듈인가:
//   터널 실행은 실제 프로세스 spawn 이 필요해 자동 테스트가 어렵다.
//   그래서 "어떤 명령을 어떤 인자로 띄울지"와 "출력에서 공개 URL 을 어떻게 뽑을지"를
//   여기 모아 두고, tools/dev-tunnel.mjs 는 이 결과를 그대로 실행만 한다.

/** 지원하는 터널 제공자 */
export const TUNNEL_PROVIDERS = Object.freeze({
  cloudflared: {
    id: 'cloudflared',
    name: 'Cloudflare Quick Tunnel',
    cmd: () => 'cloudflared',
    args: ({ port }) => ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'],
    host: 'trycloudflare.com',
    install: 'winget install --id Cloudflare.cloudflared',
    alt: 'https://github.com/cloudflare/cloudflared/releases 에서 cloudflared-windows-amd64.exe 를 받아 PATH 에 두어도 됩니다.',
    note: '계정·로그인 없이 임시 https 주소를 바로 발급합니다(프로세스를 끄면 주소도 사라집니다).'
  },
  localtunnel: {
    id: 'localtunnel',
    name: 'localtunnel (npx)',
    cmd: (platform) => (platform === 'win32' ? 'npx.cmd' : 'npx'),
    args: ({ port }) => ['--yes', 'localtunnel', '--port', String(port)],
    host: 'loca.lt',
    install: 'npm i -g localtunnel',
    alt: 'npx --yes localtunnel --port 3001 로도 실행됩니다.',
    note: '첫 실행은 npx 다운로드 때문에 수십 초 걸릴 수 있고, 접속 시 비밀번호 페이지가 뜰 수 있습니다.'
  }
});

/** 무료 터널이 발급하는 도메인 — 로그에서 이걸 먼저 찾는다 */
export const FREE_TUNNEL_HOSTS = Object.freeze([
  'trycloudflare.com',
  'loca.lt',
  'localhost.run',
  'lhr.life',
  'ngrok-free.app',
  'ngrok-free.dev',
  'ngrok.io',
  'serveo.net',
  'bore.pub',
  'githubpreview.dev'
]);

/** 로그에 섞여 나오는 문서/다운로드 링크 — 공개 주소로 오해하면 안 된다 */
const DOC_LINK = /(cloudflare\.com\/|cfargotunnel\.com\/|developers\.|github\.com|api\.|static\.|support\.|npmjs\.|nodejs\.org|schema\.|json-schema)/i;

const TRAILING = /[.,)\]|"'`]+$/;

/**
 * 터널 프로세스 출력에서 **공개 접속 주소**를 뽑는다.
 * 1) 알려진 무료 터널 도메인을 우선(가장 확실), 2) 그 외 https 주소(문서 링크 제외).
 * 못 찾으면 빈 문자열.
 */
export function parseTunnelUrl(text) {
  const all = String(text || '').match(/https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g) || [];
  const clean = all.map((u) => u.replace(TRAILING, ''));
  for (const u of clean) {
    if (FREE_TUNNEL_HOSTS.some((host) => u.includes(host))) return u;
  }
  for (const u of clean) {
    if (!DOC_LINK.test(u)) return u;
  }
  return '';
}

/** 제공자 id 목록 */
export function providerIds() {
  return Object.keys(TUNNEL_PROVIDERS);
}

/** `TUNNEL=localtunnel` / `--provider=localtunnel` / `--tunnel localtunnel` 인자 해석 */
export function tunnelProvider(argv = [], env = {}) {
  const fromEnv = String(env.TUNNEL || env.TUNNEL_PROVIDER || '').trim().toLowerCase();
  let id = TUNNEL_PROVIDERS[fromEnv] ? fromEnv : '';
  const list = Array.isArray(argv) ? argv.map(String) : [];
  for (let i = 0; i < list.length && !id; i += 1) {
    const a = list[i];
    const m = /^--(?:provider|tunnel)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const value = String(m[1] ?? list[i + 1] ?? '').trim().toLowerCase();
    if (TUNNEL_PROVIDERS[value]) id = value;
  }
  return id || 'cloudflared';
}

/** `--port 3002` / `PORT=3002` */
export function tunnelPort(argv = [], env = {}) {
  const list = Array.isArray(argv) ? argv.map(String) : [];
  for (let i = 0; i < list.length; i += 1) {
    const m = /^--port(?:=(.*))?$/.exec(list[i]);
    if (m) {
      const n = Number(m[1] ?? list[i + 1]);
      if (Number.isFinite(n) && n >= 1 && n <= 65535) return Math.floor(n);
    }
  }
  const fromEnv = Number(env.PORT);
  return Number.isFinite(fromEnv) && fromEnv >= 1 && fromEnv <= 65535 ? Math.floor(fromEnv) : 3001;
}

/**
 * 실제로 실행할 명령/인자/안내문. `TUNNEL_CMD`·`TUNNEL_ARGS`(JSON 배열) 로 덮어쓸 수 있다
 * (자동 테스트에서 가짜 터널 스크립트를 물릴 때 쓴다).
 */
export function tunnelPlan({ provider = 'cloudflared', port = 3001, platform = process.platform, env = {} } = {}) {
  const def = TUNNEL_PROVIDERS[provider] || TUNNEL_PROVIDERS.cloudflared;
  const custom = String(env.TUNNEL_CMD || '').trim();
  let args = def.args({ port });
  if (env.TUNNEL_ARGS) {
    try {
      const parsed = JSON.parse(String(env.TUNNEL_ARGS));
      if (Array.isArray(parsed)) args = parsed.map((a) => String(a).replace(/\{port\}/g, String(port)));
    } catch {
      /* 잘못된 값은 기본 인자를 쓴다 */
    }
  }
  return {
    provider: def.id,
    name: def.name,
    cmd: custom || def.cmd(platform),
    args,
    custom: Boolean(custom),
    url: `http://localhost:${port}`,
    host: def.host,
    install: def.install,
    alt: def.alt,
    note: def.note
  };
}

/**
 * 로그 파일을 폴링해 공개 URL 을 기다린다(파이프 stdio 를 못 쓰는 환경에서도 안전).
 * 부수효과(타이머)는 주입받은 sleep 으로만 만들므로 그대로 테스트할 수 있다.
 *
 * @returns {Promise<{ok:boolean,url:string,reason:'found'|'exited'|'timeout',text:string,elapsedMs:number}>}
 */
export async function pollForTunnelUrl({
  read,
  timeoutMs = 30000,
  intervalMs = 500,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  isAlive = () => true,
  now = () => Date.now()
} = {}) {
  const started = now();
  const deadline = started + Math.max(0, Number(timeoutMs) || 0);
  const readText = () => {
    try {
      return String(read?.() ?? '');
    } catch {
      return '';
    }
  };
  for (;;) {
    const text = readText();
    const url = parseTunnelUrl(text);
    if (url) return { ok: true, url, reason: 'found', text, elapsedMs: now() - started };
    if (!isAlive()) return { ok: false, url: '', reason: 'exited', text, elapsedMs: now() - started };
    if (now() >= deadline) return { ok: false, url: '', reason: 'timeout', text, elapsedMs: now() - started };
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}

/** 로그 꼬리(실패 안내용) */
export function tailText(text, maxLines = 12) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return lines.slice(-Math.max(1, maxLines)).join('\n');
}

export default { parseTunnelUrl, tunnelPlan, tunnelProvider, tunnelPort, pollForTunnelUrl, providerIds, tailText, TUNNEL_PROVIDERS, FREE_TUNNEL_HOSTS };
