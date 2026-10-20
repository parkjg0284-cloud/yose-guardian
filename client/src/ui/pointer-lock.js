// 마우스 포인터 정책 — UI(패널·관리자 콘솔)가 열려 있으면 포인터 잠금을 풀어 OS 커서를 보이게 하고,
// 전부 닫히면 시점 조작을 위해 다시 잠근다.
//
// 왜 필요한가: 포인터가 잠겨 있는 동안 브라우저는 커서를 숨기고 마우스 이벤트를 캔버스로 보낸다.
// 그래서 제작/인벤/건설 패널을 열어도 커서가 없어 버튼을 누를 수 없었다(휠·숫자키로만 조작 가능).
//
// 계약:
//  · state 가 'playing' 일 때만 손댄다 — 메뉴/일시정지/게임오버는 각자 잠금을 관리한다.
//  · 이미 원하는 상태면 아무것도 호출하지 않는다(중복 요청으로 인한 브라우저 경고 방지).
//  · 반환값은 실제로 시도한 동작('unlock' | 'lock') 또는 null — 호출부와 테스트가 결과를 알 수 있게 한다.
export function syncPointerLock({ state = null, input = null, panels = null, admin = null } = {}) {
  if (state !== 'playing' || !input) return null;
  const uiOpen = Boolean(panels?.hasOpen?.() || admin?.isOpen);
  if (uiOpen) {
    if (!input.locked) return null;
    input.exitPointerLock?.();
    return 'unlock';
  }
  if (input.locked) return null;
  input.requestPointerLock?.();
  return 'lock';
}

export default syncPointerLock;
