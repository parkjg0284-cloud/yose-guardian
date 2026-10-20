// LAN 공유 주소 탐지 — 순수 로직(os.networkInterfaces() 결과를 받아 계산만 한다).
//
// 왜 필요한가: 초대 링크를 `location.origin` 으로만 만들면 서버를 켠 PC 에서는
// `http://localhost:3001` 이 되어 **다른 사람에게는 쓸모없는 주소**가 된다(그 사람의 PC 를 가리킨다).
// 그래서 서버가 자기 LAN 주소를 알려주고(`GET /api/net`), 클라이언트가 그 주소로 초대 링크를 만든다.
//
// `PUBLIC_URL`(예: cloudflared/ngrok 터널 주소, 포트포워딩한 도메인)을 주면 그 주소가 대표가 된다.

import os from 'node:os';

/** 가상 어댑터 이름 — 실제 랜카드가 있으면 뒤로 밀린다(VMware/VirtualBox/WSL/tailscale 등). */
const VIRTUAL_HINTS = /(virtual|vmware|vbox|virtualbox|hyper-?v|vethernet|loopback|docker|wsl|tailscale|zerotier|radmin|hamachi|bluetooth|tap|tun)/i;

/** IPv4 여부(문자열 'IPv4' · 숫자 4 모두) */
export function isIPv4(family) {
  return family === 'IPv4' || family === 4;
}

/** 남에게 알려줄 수 있는 주소인가 — 루프백·미지정·링크로컬·멀티캐스트 제외 */
export function isUsableIPv4(address, { family = 'IPv4', internal = false } = {}) {
  if (!isIPv4(family) || internal) return false;
  const a = String(address ?? '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return false;
  const [b1, b2] = a.split('.').map(Number);
  if (b1 === 127 || b1 === 0) return false;
  if (b1 === 169 && b2 === 254) return false; // APIPA(링크로컬) — 같은 공유기에서도 못 쓴다
  if (b1 >= 224) return false; // 멀티캐스트·예약
  return true;
}

/** 사설망 우선순위 — 작을수록 좋다(같은 공유기에서 가장 잘 통하는 대역이 1순위). */
export function scoreAddress(address, name = '') {
  const [b1, b2] = String(address ?? '').split('.').map(Number);
  let score;
  if (b1 === 192 && b2 === 168) score = 0;
  else if (b1 === 10) score = 1;
  else if (b1 === 172 && b2 >= 16 && b2 <= 31) score = 2;
  else score = 3; // 공인 IP 등
  if (VIRTUAL_HINTS.test(String(name ?? ''))) score += 10; // 가상 어댑터는 실제 랜카드 뒤로
  return score;
}

/** os.networkInterfaces() 결과 → 쓸 만한 후보(좋은 순) */
export function listLanCandidates(interfaces = null) {
  const ifaces = interfaces || os.networkInterfaces() || {};
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of Array.isArray(list) ? list : []) {
      if (!isUsableIPv4(info?.address, info || {})) continue;
      out.push({ name: String(name), address: String(info.address), score: scoreAddress(info.address, name) });
    }
  }
  out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return out;
}

/** 대표 LAN IPv4(없으면 null) — { name, address, score } */
export function pickLanAddress(interfaces = null) {
  return listLanCandidates(interfaces)[0] || null;
}

/** LAN IPv4 문자열 목록(좋은 순) */
export function listLanAddresses(interfaces = null) {
  return listLanCandidates(interfaces).map((c) => c.address);
}

/**
 * 클라이언트에 내려줄 공유 정보.
 * urls[0] 이 대표(primary) — PUBLIC_URL 이 있으면 항상 그것이 대표가 된다.
 */
export function buildShareUrls({ port = 3001, protocol = 'http', addresses = [], publicUrl = null } = {}) {
  const p = Number(port) > 0 && Number.isFinite(Number(port)) ? Number(port) : 3001;
  const scheme = String(protocol || 'http').replace(/:+$/, '') || 'http';
  const urls = [];
  const pub = publicUrl ? String(publicUrl).trim().replace(/\/+$/, '') : '';
  if (pub) urls.push(pub);
  for (const addr of Array.isArray(addresses) ? addresses : []) {
    if (!addr) continue;
    const u = `${scheme}://${String(addr)}:${p}`;
    if (!urls.includes(u)) urls.push(u);
  }
  return { port: p, protocol: scheme, urls, primary: urls[0] || null, publicUrl: pub || null };
}

/** 이 PC 의 공유 정보를 바로 만든다(서버 시작 로그·/api/net 용) */
export function localShareUrls({ port = 3001, protocol = 'http', publicUrl = null } = {}) {
  return buildShareUrls({ port, protocol, publicUrl, addresses: listLanAddresses() });
}

export default { isIPv4, isUsableIPv4, scoreAddress, listLanCandidates, pickLanAddress, listLanAddresses, buildShareUrls, localShareUrls };
