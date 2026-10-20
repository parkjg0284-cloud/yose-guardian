// 계약 §4.46 — 🎯 미니게임 화면 전환(오버레이)
//  · 본편 위에 iframe(/mini-game.html)을 덮어 "화면이 넘어간" 것처럼 보이게 한다(새 탭 아님).
//  · 여는 동안 본편은 멈추고(진행 중이었다면 pause), 닫으면 원래 상태로 되돌린다.
//  · 미니게임 안에서 '돌아가기' 또는 ESC 를 누르면 postMessage({type:'minigame:exit'}) 로 닫는다.
const OVERLAY_ID = 'mini-game-overlay';
const PAGE = '/mini-game.html';

let overlay = null;
let onMessage = null;
let onKey = null;
let restore = null;

export const isMiniGameOpen = () => Boolean(overlay);
export const miniGameElement = () => overlay;

export function openMiniGame(game) {
  if (overlay) return true;                                  // 이미 열려 있으면 그대로 둔다
  const root = document.getElementById?.('app') ?? document.body;
  if (!root || typeof document.createElement !== 'function') return false;

  const box = document.createElement('div');
  box.id = OVERLAY_ID;
  box.className = 'mini-game-overlay';
  box.dataset.role = 'mini-game';

  const bar = document.createElement('div');
  bar.className = 'mini-game-bar';

  const title = document.createElement('span');
  title.className = 'mini-game-title';
  title.textContent = '🎯 미니게임 — 피하기';

  const hint = document.createElement('span');
  hint.className = 'mini-game-hint';
  hint.textContent = 'WASD / 방향키 · 화면 드래그 · ESC 로 돌아가기';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn mini-game-back';
  back.dataset.act = 'minigame-back';
  back.textContent = '← 게임으로 돌아가기';
  back.addEventListener('click', () => closeMiniGame(game));

  bar.appendChild(title);
  bar.appendChild(hint);
  bar.appendChild(back);

  const frame = document.createElement('iframe');
  frame.className = 'mini-game-frame';
  frame.title = '미니게임 — 피하기';
  frame.setAttribute('src', PAGE);
  frame.setAttribute('allow', 'autoplay');

  box.appendChild(bar);
  box.appendChild(frame);
  root.appendChild(box);

  // 본편 입력을 멈춘다(진행 중이었을 때만 — 메뉴 화면이면 건드리지 않는다).
  restore = { state: game?.state ?? null };
  if (restore.state === 'playing') { try { game.pause(); } catch { /* 무시 */ } }
  else { try { game?.input?.exitPointerLock?.(); } catch { /* 무시 */ } }

  // 우리 iframe 이 보낸 메시지만 받는다(출처 + 발신 창 신원 둘 다 확인).
  onMessage = (event) => {
    const fromFrame = Boolean(frame.contentWindow) && event?.source === frame.contentWindow;
    const sameOrigin = !event?.origin || event.origin === location.origin;
    if (!fromFrame && !sameOrigin) return;
    if (event?.data?.type === 'minigame:exit') closeMiniGame(game);
  };
  window.addEventListener('message', onMessage);

  // ESC 는 오버레이가 먼저 먹는다(뒤에서 일시정지 메뉴가 같이 열리지 않도록 캡처 단계).
  onKey = (event) => {
    if (event?.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();   // 본편 ESC(일시정지/재개)까지 함께 동작하지 않도록
    event.stopPropagation?.();
    closeMiniGame(game);
  };
  window.addEventListener('keydown', onKey, true);

  overlay = box;
  try { back.focus?.(); } catch { /* 무시 */ }
  return true;
}

export function closeMiniGame(game) {
  if (!overlay) return false;
  const box = overlay;
  overlay = null;

  if (onMessage) { window.removeEventListener?.('message', onMessage); onMessage = null; }
  if (onKey) { window.removeEventListener?.('keydown', onKey, true); onKey = null; }
  try { box.remove?.(); } catch { /* 무시 */ }

  const was = restore?.state;
  restore = null;
  if (was === 'playing') { try { game?.resume?.(); } catch { /* 무시 */ } }
  else { try { game?._syncPointerLock?.(); } catch { /* 무시 */ } }
  return true;
}

export function toggleMiniGame(game) {
  return overlay ? closeMiniGame(game) : openMiniGame(game);
}
