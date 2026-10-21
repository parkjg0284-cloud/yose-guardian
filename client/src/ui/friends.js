// 친구창 — 내 친구 코드 · 친구 목록 · 친구 추가(코드 입력) · 친구 서버 들어가기.
//
//  화면 구성
//    ┌ 👥 친구 ─────────────────────────────── [닫기] ┐
//    │ 내 친구 코드  ABCD-EFGH   [코드 복사]          │
//    │ [＋ 친구 추가]  [새로고침]                      │
//    │  (친구 추가를 누르면 코드 입력칸이 열린다)      │
//    │  친구 카드 — 이름 / 코드 / 상태 / [들어가기]    │
//    └─────────────────────────────────────────────────┘
//
//  친구 추가는 따로 창(같은 오버레이 안의 입력 줄)에서 친구 코드를 입력한다.
//  서버(/api/friends)에 코드를 등록해 두면 친구가 같은 서버에 있을 때
//  상대의 방 코드·접속 주소까지 자동으로 채워진다.
import { formatFriendCode, isValidFriendCode, normalizeAddress, normalizeFriendCode } from '../friends.js';
import { normalizeInviteCode } from '../utils/invite.js';

const NAME_MAX = 16;

function h(tag, cls, text) {
  const el = globalThis.document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export class FriendsOverlay {
  constructor({ game = null, friends = null } = {}) {
    this.game = game;
    this.friends = friends || safe(() => game?.friends, null) || null;
    this.root = null;
    this.openState = false;
    this.adding = false;
    this.error = '';
    this.notice = '';
    this.busy = false;
    const doc = globalThis.document;
    if (!doc) return;
    this.root = doc.getElementById('friends-root') || h('div', 'friends-overlay hidden');
    this.root.id = 'friends-root';
    if (!this.root.parentElement) doc.body.appendChild(this.root);
    this._onClick = (e) => this._handleClick(e);
    this._onKey = (e) => this._handleKey(e);
    this.root.addEventListener('click', this._onClick);
    this.root.addEventListener('keydown', this._onKey);
    this.render();
  }

  /* ── 상태 ─────────────────────────────────────────────────── */

  get isOpen() {
    return this.openState;
  }

  open() {
    if (!this.root) return;
    this.openState = true;
    this.root.classList.remove('hidden');
    this.render();
    this.refresh();
  }

  close() {
    if (!this.root) return;
    this.openState = false;
    this.adding = false;
    this.error = '';
    this.root.classList.add('hidden');
  }

  toggle() {
    if (this.openState) this.close();
    else this.open();
  }

  /** 방을 만들거나 들어갔을 때 — 서버에 내 방 코드를 알려 친구가 찾을 수 있게 한다 */
  rememberRoom(code) {
    const room = normalizeInviteCode(code);
    if (!room) return;
    this._lastRoom = room;
    this.announce();
  }

  /** 로비 방 코드 — 친구에게 알려 줄 내 방 */
  _roomCode() {
    return safe(() => String(this.game?.lobby?.room?.code ?? ''), '') || this._lastRoom || '';
  }

  _playerName() {
    return (
      safe(() => String(this.game?.playerName ?? ''), '') ||
      safe(() => String(this.game?.profile?.name ?? ''), '') ||
      safe(() => String(this.game?.lobby?.state?.nickname ?? ''), '') ||
      '플레이어'
    );
  }

  /* ── 서버 통신 ────────────────────────────────────────────── */

  async _api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  /** 내 코드를 서버에 알린다(친구가 조회할 수 있게) */
  async announce() {
    if (!this.friends) return;
    try {
      await this._api('/api/friends/register', {
        method: 'POST',
        body: JSON.stringify({ code: this.friends.code, name: this._playerName(), room: this._roomCode() })
      });
    } catch { /* 서버 없음 — 친구 코드만으로 동작 */ }
  }

  /** 친구들의 상태를 서버에서 확인해 목록을 갱신한다 */
  async refresh() {
    if (!this.friends || this.busy) return;
    this.busy = true;
    try {
      await this.announce();
      const list = this.friends.list();
      for (const f of list) {
        try {
          const r = await this._api(`/api/friends/lookup?code=${encodeURIComponent(f.code)}`);
          const got = r?.friend;
          if (got) {
            this.friends.touch(f.code, {
              name: got.name || f.name,
              room: got.online ? got.room : '',
              online: Boolean(got.online),
              address: got.online && got.origin ? got.origin : f.address,
              at: got.at || f.at
            });
          } else {
            this.friends.touch(f.code, { online: false, room: '' });
          }
        } catch {
          this.friends.touch(f.code, { online: false });
        }
      }
      this.notice = this.friends.size ? '' : '아직 친구가 없습니다 — [＋ 친구 추가] 로 코드를 넣어 보세요';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /* ── 동작 ─────────────────────────────────────────────────── */

  addFriend(code, name, address) {
    if (!this.friends) return { ok: false, error: '친구 목록을 사용할 수 없습니다' };
    const result = this.friends.add({ code, name, address });
    if (!result.ok) {
      this.error = result.error;
    } else {
      this.error = '';
      this.adding = false;
      this.notice = result.updated
        ? `친구 정보를 고쳤습니다 — ${formatFriendCode(result.friend.code)}`
        : `친구를 추가했습니다 — ${formatFriendCode(result.friend.code)}`;
      this.refresh();
    }
    this.render();
    return result;
  }

  joinFriend(code) {
    if (!this.friends) return false;
    const f = this.friends.get(code);
    if (!f) {
      this.error = '친구를 찾을 수 없습니다';
      this.render();
      return false;
    }
    let url = this.friends.serverUrl(code);
    if (!url) {
      const answer = globalThis.prompt?.(
        `${formatFriendCode(f.code)} 친구의 접속 주소(IP:포트)를 입력하세요.\n예: 192.168.0.12:3001`,
        f.address || ''
      );
      const addr = normalizeAddress(answer || '');
      if (!addr) {
        this.error = '접속 주소가 필요합니다 — 친구가 알려 준 주소를 입력하세요';
        this.render();
        return false;
      }
      this.friends.touch(code, { address: addr });
      url = this.friends.serverUrl(code);
      if (!url) {
        this.error = '친구의 방 코드를 알 수 없습니다 — 친구에게 초대코드를 받아 주세요';
        this.render();
        return false;
      }
    }
    this.error = '';
    this.notice = `친구 서버로 이동합니다 — ${formatFriendCode(f.code)}`;
    this.render();
    safe(() => globalThis.open?.(url, '_blank', 'noopener'));
    return true;
  }

  /* ── 그리기 ───────────────────────────────────────────────── */

  render() {
    if (!this.root) return;
    const doc = globalThis.document;
    const frag = doc.createDocumentFragment();

    const shell = h('div', 'friends-shell');

    // 머리말 — 제목 + 내 코드 + 닫기
    const head = h('div', 'friends-head');
    head.appendChild(h('div', 'friends-title', '👥 친구'));
    const myCode = this.friends ? this.friends.displayCode : '—';
    const codeBox = h('div', 'friends-code');
    codeBox.dataset.role = 'my-friend-code';
    codeBox.appendChild(h('span', 'friends-code-label', '내 친구 코드'));
    codeBox.appendChild(h('strong', 'friends-code-value', myCode));
    head.appendChild(codeBox);
    const copyBtn = h('button', 'btn ghost btn-ghost', '코드 복사');
    copyBtn.type = 'button';
    copyBtn.dataset.act = 'friend-copy';
    head.appendChild(copyBtn);
    const closeBtn = h('button', 'btn ghost btn-ghost', '닫기');
    closeBtn.type = 'button';
    closeBtn.dataset.act = 'friend-close';
    head.appendChild(closeBtn);
    shell.appendChild(head);

    // 도구 줄
    const tools = h('div', 'friends-tools');
    const addBtn = h('button', 'btn primary btn-primary', '＋ 친구 추가');
    addBtn.type = 'button';
    addBtn.dataset.act = 'friend-add-open';
    tools.appendChild(addBtn);
    const refreshBtn = h('button', 'btn ghost btn-ghost', '새로고침');
    refreshBtn.type = 'button';
    refreshBtn.dataset.act = 'friend-refresh';
    tools.appendChild(refreshBtn);
    const myRoom = this._roomCode();
    tools.appendChild(h('span', 'friends-room', myRoom ? `내 방 코드 ${myRoom} — 친구가 들어올 수 있습니다` : '방을 만들면 친구가 들어올 수 있습니다'));
    shell.appendChild(tools);

    // 알림/오류
    if (this.notice) shell.appendChild(h('div', 'friends-notice', this.notice));
    if (this.error) shell.appendChild(h('div', 'friends-error', this.error));

    // 친구 추가 창(코드 입력)
    if (this.adding) {
      const add = h('div', 'friends-add');
      add.dataset.role = 'friend-add-form';
      add.appendChild(h('div', 'friends-add-title', '친구 코드로 추가'));
      const codeInput = h('input', 'friends-input');
      codeInput.dataset.role = 'friend-code-input';
      codeInput.placeholder = '친구 코드 8자리 (예: ABCD-EFGH)';
      codeInput.maxLength = 12;
      codeInput.autocomplete = 'off';
      add.appendChild(codeInput);
      const nameInput = h('input', 'friends-input');
      nameInput.dataset.role = 'friend-name-input';
      nameInput.placeholder = '이름 (선택)';
      nameInput.maxLength = NAME_MAX;
      add.appendChild(nameInput);
      const addrInput = h('input', 'friends-input');
      addrInput.dataset.role = 'friend-address-input';
      addrInput.placeholder = '접속 주소 (선택 — 예: 192.168.0.12:3001)';
      add.appendChild(addrInput);
      const row = h('div', 'friends-add-row');
      const okBtn = h('button', 'btn primary btn-primary', '추가');
      okBtn.type = 'button';
      okBtn.dataset.act = 'friend-add-ok';
      row.appendChild(okBtn);
      const cancelBtn = h('button', 'btn ghost btn-ghost', '취소');
      cancelBtn.type = 'button';
      cancelBtn.dataset.act = 'friend-add-cancel';
      row.appendChild(cancelBtn);
      add.appendChild(row);
      shell.appendChild(add);
      setTimeout(() => safe(() => codeInput.focus()), 0);
    }

    // 친구 목록
    const list = this.friends ? this.friends.list() : [];
    const listWrap = h('div', 'friends-list');
    listWrap.dataset.role = 'friend-list';
    if (!list.length) {
      listWrap.appendChild(h('div', 'friends-empty', '아직 친구가 없습니다 — [＋ 친구 추가] 로 친구 코드를 넣어 보세요'));
    }
    for (const f of list) {
      const card = h('div', 'friends-card');
      card.dataset.role = 'friend-row';
      card.dataset.code = f.code;
      card.dataset.online = f.online ? '1' : '0';

      const info = h('div', 'friends-card-info');
      info.appendChild(h('span', 'friends-card-name', f.name || '이름 없음'));
      info.appendChild(h('span', 'friends-card-code', f.displayCode));
      const state = h('span', `friends-state ${f.online ? 'online' : 'offline'}`, f.online ? '접속 중' : '오프라인');
      info.appendChild(state);
      if (f.online && f.room) info.appendChild(h('span', 'friends-card-room', `방 코드 ${f.room}`));
      card.appendChild(info);

      const acts = h('div', 'friends-card-actions');
      const joinBtn = h('button', 'btn primary btn-primary', '들어가기');
      joinBtn.type = 'button';
      joinBtn.dataset.act = 'friend-join';
      joinBtn.dataset.code = f.code;
      joinBtn.disabled = !f.online && !this.friends.serverUrl(f.code);
      acts.appendChild(joinBtn);
      const addrBtn = h('button', 'btn ghost btn-ghost', '주소');
      addrBtn.type = 'button';
      addrBtn.dataset.act = 'friend-address';
      addrBtn.dataset.code = f.code;
      acts.appendChild(addrBtn);
      const delBtn = h('button', 'btn ghost btn-ghost', '삭제');
      delBtn.type = 'button';
      delBtn.dataset.act = 'friend-remove';
      delBtn.dataset.code = f.code;
      acts.appendChild(delBtn);
      card.appendChild(acts);
      listWrap.appendChild(card);
    }
    shell.appendChild(listWrap);

    const hint = h('div', 'friends-hint', 'U — 친구창 · 친구가 같은 서버에 있으면 [들어가기] 한 번으로 그 방에 들어갑니다');
    shell.appendChild(hint);

    frag.appendChild(shell);
    this.root.textContent = '';
    this.root.appendChild(frag);
  }

  /* ── 이벤트 ───────────────────────────────────────────────── */

  _handleClick(e) {
    if (e.target === this.root) {
      this.close();
      return;
    }
    const btn = e.target?.closest?.('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'friend-close') {
      this.close();
      return;
    }
    if (act === 'friend-copy') {
      const text = this.friends ? this.friends.displayCode : '';
      const done = safe(() => {
        globalThis.navigator?.clipboard?.writeText?.(text);
        return true;
      }, false);
      this.notice = done ? `친구 코드를 복사했습니다 — ${text}` : `친구 코드: ${text}`;
      this.render();
      return;
    }
    if (act === 'friend-add-open') {
      this.adding = true;
      this.error = '';
      this.render();
      return;
    }
    if (act === 'friend-add-cancel') {
      this.adding = false;
      this.error = '';
      this.render();
      return;
    }
    if (act === 'friend-add-ok') {
      const codeEl = this.root.querySelector('[data-role="friend-code-input"]');
      const nameEl = this.root.querySelector('[data-role="friend-name-input"]');
      const addrEl = this.root.querySelector('[data-role="friend-address-input"]');
      const code = normalizeFriendCode(codeEl?.value ?? '');
      if (!isValidFriendCode(code)) {
        this.error = '친구 코드 8자리를 입력하세요 (예: ABCD-EFGH)';
        this.render();
        return;
      }
      this.addFriend(code, nameEl?.value ?? '', addrEl?.value ?? '');
      return;
    }
    if (act === 'friend-refresh') {
      this.notice = '친구 상태를 확인하는 중…';
      this.render();
      this.refresh();
      return;
    }
    if (act === 'friend-join') {
      this.joinFriend(btn.dataset.code);
      return;
    }
    if (act === 'friend-address') {
      const code = btn.dataset.code;
      const f = this.friends?.get(code);
      const answer = globalThis.prompt?.(
        `${formatFriendCode(code)} 친구의 접속 주소(IP:포트)를 입력하세요.\n예: 192.168.0.12:3001`,
        f?.address || ''
      );
      if (answer == null) return;
      const addr = normalizeAddress(answer);
      if (!addr) {
        this.error = '주소 형식이 올바르지 않습니다 (예: 192.168.0.12:3001)';
        this.render();
        return;
      }
      this.friends?.touch(code, { address: addr });
      this.notice = `주소를 저장했습니다 — ${addr}`;
      this.error = '';
      this.render();
      return;
    }
    if (act === 'friend-remove') {
      const code = btn.dataset.code;
      const ok = this.friends?.remove(code);
      this.notice = ok ? `친구를 삭제했습니다 — ${formatFriendCode(code)}` : '삭제할 친구가 없습니다';
      this.render();
    }
  }

  _handleKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.adding) {
        this.adding = false;
        this.error = '';
        this.render();
      } else {
        this.close();
      }
      return;
    }
    if (e.key === 'Enter' && this.adding) {
      const inAdd = e.target?.closest?.('.friends-add');
      if (inAdd) {
        e.preventDefault();
        this._handleClick({ target: this.root.querySelector('[data-act="friend-add-ok"]') });
      }
    }
  }
}

export default FriendsOverlay;
