// 요세의 수호자 — Electron 데스크톱 앱
const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3001);
let serverProc = null;
let win = null;

const logFile = path.join(app.getPath('userData'), 'app-log.txt');
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; try { fs.appendFileSync(logFile, line + '\r\n'); } catch { } console.log(m); };

function probe(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

async function waitServer(maxMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await probe(`http://127.0.0.1:${PORT}/api/health`)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startServer() {
  if (await probe(`http://127.0.0.1:${PORT}/api/health`)) { log('기존 서버 재사용'); return true; }
  log('서버 시작...');
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: '1' },
  });
  const ok = await waitServer();
  log(ok ? '서버 준비 완료' : '서버 응답 없음');
  return ok;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1920, height: 1080, minWidth: 1024, minHeight: 640, useContentSize: true,
    backgroundColor: '#05060c',
    title: '요세의 수호자',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  log('앱 시작');
  const ok = await startServer();
  if (!ok) {
    dialog.showMessageBox({ type: 'warning', title: '요세의 수호자', message: '서버를 시작하지 못했습니다. 게임 화면을 그대로 열어봅니다.' });
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProc) { try { serverProc.kill(); } catch { } }
  app.quit();
});
app.on('before-quit', () => { if (serverProc) { try { serverProc.kill(); } catch { } } });