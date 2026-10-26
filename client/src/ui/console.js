// ui/console.js — 관리자 콘솔(명령어 입력). 순수 DOM/CSS 조작만 한다 (three import 금지).
// 계약 §4.22: 관리자 계정(role === 'admin')만 연다. 명령 실행은 systems/admin-commands.js 가 담당.
import { auth } from '../net.js';
import { ADMIN_COMMANDS, ADMIN_LABEL, isAdminUser, requestPanels, runAdminCommand } from '../systems/admin-commands.js';

/** 이 시간(ms)을 넘긴 명령은 콘솔에 계측값을 남긴다 */
const SLOW_COMMAND_MS = 8;

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const MAX_LOG = 60;
const HISTORY_MAX = 40;

/** 키를 눌러도 게임 입력으로 새지 않게 하는 태그 */
function isTypingTarget(el) {
  if (!el) return false;
  const tag = String(el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
}

export class AdminConsole {
  constructor({ game = null, user = null } = {}) {
    this.game = game;
    this.user = user;
    this.root = null;
    this.input = null;
    this.logRoot = null;
    this.hintRoot = null;
    this._log = [];
    this._history = [];
    this._historyIndex = -1;
    this._open = false;
    this._disposed = false;
    this._build();
  }

  /** 서버 로그인 정보 기준 관리자 여부 */
  isAdmin() {
    return isAdminUser(this.user ?? auth?.user ?? null);
  }

  get isOpen() {
    return this._open;
  }

  get lineCount() {
    return this._log.length;
  }

  get history() {
    return [...this._history];
  }

  /* --------------------------------------------------------------- DOM */
  _build() {
    if (typeof document === 'undefined' || !document.body) return;
    // 관리자 계정에만 DOM 을 만든다 — 일반 계정 화면에는 콘솔 요소가 아예 생기지 않는다.
    if (!this.isAdmin()) return;
    const root = document.createElement('div');
    root.className = 'hud-console';
    root.dataset.role = 'admin-console';
    root.hidden = true;

    const log = document.createElement('div');
    log.className = 'hud-console-log';
    log.dataset.role = 'console-log';
    root.appendChild(log);
    this.logRoot = log;

    const hint = document.createElement('div');
    hint.className = 'hud-console-hint';
    hint.textContent = `${ADMIN_LABEL} — ${ADMIN_COMMANDS.map((c) => c.usage).join('  ')}`;
    hint.hidden = true;
    root.appendChild(hint);
    this.hintRoot = hint;

    const row = document.createElement('div');
    row.className = 'hud-console-row';

    const caret = document.createElement('span');
    caret.className = 'hud-console-caret';
    caret.textContent = '/';
    row.appendChild(caret);

    const input = document.createElement('input');
    input.className = 'hud-console-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '관리자 명령어 — /도움말 (예: /돈 100000)';
    input.dataset.role = 'console-input';
    input.addEventListener('keydown', (e) => this._onKeyDown(e));
    row.appendChild(input);
    this.input = input;

    root.appendChild(row);
    document.body.appendChild(root);
    this.root = root;
  }

  _onKeyDown(e) {
    const key = e?.key;
    if (key === 'Enter') {
      e.preventDefault?.();
      this.submit(this.input?.value ?? '');
      return;
    }
    if (key === 'Escape') {
      e.preventDefault?.();
      this.close();
      return;
    }
    if (key === 'ArrowUp') {
      e.preventDefault?.();
      this._recall(1);
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault?.();
      this._recall(-1);
      return;
    }
    if (key === 'Tab') {
      // 탭 자동완성 — 첫 토큰이 명령어면 전체 사용법으로 채운다
      e.preventDefault?.();
      this._complete();
    }
  }

  _recall(dir) {
    if (!this._history.length || !this.input) return;
    const last = this._history.length - 1;
    if (dir > 0) this._historyIndex = Math.min(last, (this._historyIndex < 0 ? last + 1 : this._historyIndex) - 1);
    else this._historyIndex = Math.min(last, this._historyIndex + 1);
    this.input.value = this._history[Math.max(0, this._historyIndex)] ?? '';
  }

  _complete() {
    if (!this.input) return;
    const value = String(this.input.value ?? '').trim();
    const head = value.split(/\s+/)[0].toLowerCase();
    if (!head) {
      this.input.value = '/';
      return;
    }
    const def = ADMIN_COMMANDS.find((c) => c.usage.toLowerCase().startsWith(head) || c.name === head || c.aliases.some((a) => a.toLowerCase() === head));
    if (def) this.input.value = `${def.usage.split(' ')[0]} `;
  }

  /* ------------------------------------------------------------ 동작 */
  toggle() {
    if (this._open) {
      this.close();
      return false;
    }
    return this.open();
  }

  open() {
    if (this._disposed) return false;
    // 관리자 계정에만 — 일반 계정은 키를 눌러도 조용히 무시한다(안내 토스트도 띄우지 않는다).
    if (!this.isAdmin()) return false;
    // 앱 시작 뒤에 관리자로 로그인한 경우를 위해, 처음 열 때 DOM 을 만든다.
    if (!this.root) this._build();
    if (!this.root) return false;
    this._open = true;
    this.root.hidden = false;
    this.root.classList.add('is-open');
    if (this.hintRoot) this.hintRoot.hidden = false;
    this.log(`${ADMIN_LABEL} — /도움말 로 명령어 목록`, 'info');
    this.game?.input?.exitPointerLock?.();
    try {
      this.input?.focus?.();
    } catch {
      /* 무시 */
    }
    return true;
  }

  close() {
    if (!this._open) return false;
    this._open = false;
    if (this.root) {
      this.root.classList.remove('is-open');
      this.root.hidden = true;
    }
    try {
      this.input?.blur?.();
    } catch {
      /* 무시 */
    }
    // 콘솔을 닫으면 시점 조작을 위해 포인터를 다시 잠근다(패널이 열려 있으면 정책이 알아서 유지한다).
    this.game?._syncPointerLock?.();
    return true;
  }

  /** 명령 실행 + 로그 */
  submit(text) {
    // 이중 방어: 관리자 계정이 아니면 명령을 아예 실행하지 않는다(H-96).
    if (!this.isAdmin()) {
      this.game?.notify?.('관리자 계정으로 로그인해야 명령어를 쓸 수 있습니다', 'warn');
      return { ok: false, message: '관리자 전용입니다 (계정 role: admin)', lines: [], changed: false };
    }
    const value = String(text ?? '').trim();
    if (!value) return null;
    this._history.push(value.startsWith('/') ? value : `/${value}`);
    this._historyIndex = -1;
    const t0 = nowMs();
    const result = runAdminCommand(value, { game: this.game, user: this.user ?? auth?.user ?? null });
    const ms = nowMs() - t0;
    this.log(`> ${value}`, 'input');
    this.log(result.message, result.ok ? 'ok' : 'error');
    for (const line of result.lines ?? []) this.log(`  ${line}`, 'dim');
    if (ms >= SLOW_COMMAND_MS) this.log(`⏱ 명령 처리 ${ms.toFixed(1)}ms — 화면 갱신은 다음 프레임에 반영됩니다`, 'dim');
    if (this.input) this.input.value = '';
    if (result.ok && result.changed) requestPanels(this.game);
    if (this.game?.perf) this.game.perf.lastCommand = { text: value, ms, ok: result.ok !== false };
    // 콘솔이 열려 있으면 게임 입력이 콘솔로 가므로 조작이 먹지 않는다 — 멈춘 것으로 오해하지 않게 알려 준다.
    // 명령을 실행했으면 콘솔을 닫아 게임 조작을 되돌려준다 — '멈춤'의 실제 원인(H-96).
    if (this.game?.state === 'playing' && result.ok !== false) {
      this.log('콘솔을 닫습니다 — 게임으로 돌아갑니다', 'dim');
      setTimeout(() => this.close(), 0);
    }
    if (this.game?.state === 'playing') this.log('ESC · ` 로 콘솔을 닫으면 게임이 계속됩니다', 'dim');
    return result;
  }

  _refreshPanels() {
    // 즉시 렌더 대신 다음 프레임으로 미룬다(계약 §4.47).
    try {
      requestPanels(this.game);
    } catch {
      /* 무시 */
    }
  }

  log(text, type = 'info') {
    const line = { text: String(text ?? ''), type };
    this._log.push(line);
    if (this._log.length > MAX_LOG) this._log.splice(0, this._log.length - MAX_LOG);
    if (!this.logRoot) return line;
    const node = document.createElement('div');
    node.className = `hud-console-line is-${type}`;
    node.textContent = line.text;
    this.logRoot.appendChild(node);
    let guard = 0;
    while (this.logRoot.childNodes && this.logRoot.childNodes.length > MAX_LOG && guard++ < MAX_LOG * 2) {
      const first = this.logRoot.firstChild;
      if (!first) break;
      this.logRoot.removeChild(first);
    }
    return line;
  }

  get lines() {
    return this._log.map((l) => l.text);
  }

  update() {
    /* 예약 — 지금은 매 프레임 할 일이 없다 */
  }

  /** 관리자 권한이 사라졌을 때(로그아웃) — 닫고 DOM 도 지운다. 다시 관리자가 되면 open 이 새로 만든다. */
  revoke() {
    this.close();
    const parent = this.root?.parentNode ?? this.root?.parent ?? null;
    if (parent && typeof parent.removeChild === 'function') parent.removeChild(this.root);
    else this.root?.remove?.();
    this.root = null;
    this.input = null;
    this.logRoot = null;
    this.hintRoot = null;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.revoke();
  }
}

export { isTypingTarget };
export default AdminConsole;
