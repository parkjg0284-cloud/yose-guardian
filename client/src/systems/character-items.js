// 요세의 수호자 — 캐릭터 전용 아이템 시스템 (v1.2.0).
// 순수 로직: THREE / DOM 을 import 하지 않는다(헤드리스 검증 가능).
//
//  · 외형(스킨)마다 전용 아이템이 하나씩 있고, **그 캐릭터로 플레이할 때만** 사고 쓸 수 있다.
//  · 보너스는 가죽 장비와 같은 키(비율)를 돌려준다 — 실제 적용은 main.js 가 담당한다.
//  · 한 번에 하나만 착용한다. 다른 캐릭터로 바꾸면 자동으로 해제된다.

import { CHARACTER_ITEMS, CHARACTER_ITEM_BY_ID, characterItemForSkin } from '../data.js';
import { characterSkin, DEFAULT_SKIN_ID } from '../character.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const CHARACTER_ITEMS_STORAGE_KEY = 'fortress.charItems.v1';

function money(value) {
  return Math.floor(num(value, 0)).toLocaleString('ko-KR');
}

export class CharacterItemSystem {
  constructor({ storage = null, persist = true } = {}) {
    this.storage = persist ? (storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)) : null;
    this.owned = new Set();
    this.equippedId = null;
    this._load();
  }

  /* ── 저장 ───────────────────────────────────────────── */
  _load() {
    try {
      const raw = this.storage?.getItem?.(CHARACTER_ITEMS_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const id of Array.isArray(data?.owned) ? data.owned : []) {
        if (CHARACTER_ITEM_BY_ID[id]) this.owned.add(id);
      }
      if (CHARACTER_ITEM_BY_ID[data?.equippedId]) this.equippedId = data.equippedId;
    } catch {
      this.owned = new Set();
      this.equippedId = null;
    }
  }

  _save() {
    try {
      this.storage?.setItem?.(CHARACTER_ITEMS_STORAGE_KEY, JSON.stringify({ owned: [...this.owned], equippedId: this.equippedId }));
    } catch {
      /* 저장 실패는 무시(사생활 보호 모드) */
    }
  }

  /* ── 조회 ───────────────────────────────────────────── */
  /** 현재 캐릭터 스킨 id (없으면 기본 스킨) */
  static skinOf(character) {
    return characterSkin(character?.skin)?.id ?? DEFAULT_SKIN_ID;
  }

  /** 그 아이템을 이 캐릭터가 쓸 수 있나 */
  canUse(itemId, character) {
    const item = CHARACTER_ITEM_BY_ID[itemId];
    if (!item) return false;
    return item.skin === CharacterItemSystem.skinOf(character);
  }

  has(itemId) {
    return this.owned.has(itemId);
  }

  isEquipped(itemId) {
    return this.equippedId === itemId;
  }

  /** 현재 캐릭터의 전용 아이템 */
  forCharacter(character) {
    return characterItemForSkin(CharacterItemSystem.skinOf(character));
  }

  /** 인벤토리 카드용 목록 — 잠금 여부·보유·착용 포함 */
  list(character) {
    const skin = CharacterItemSystem.skinOf(character);
    return CHARACTER_ITEMS.map((item) => {
      const usable = item.skin === skin;
      return {
        ...item,
        usable,
        owned: this.owned.has(item.id),
        equipped: this.equippedId === item.id,
        costText: `${money(item.cost?.gold)} G`
      };
    });
  }

  /** 착용한 아이템의 보너스(현재 캐릭터와 맞을 때만) — 없으면 null */
  bonus(character) {
    if (!this.equippedId) return null;
    const item = CHARACTER_ITEM_BY_ID[this.equippedId];
    if (!item) return null;
    if (item.skin !== CharacterItemSystem.skinOf(character)) return null;
    return { ...(item.bonus || {}) };
  }

  /* ── 구매 / 착용 ────────────────────────────────────── */
  /**
   * 구매 — 그 캐릭터만 살 수 있다.
   * @returns {{ok:boolean, message:string, item?:object, spent?:number}}
   */
  buy(itemId, { character = null, gold = 0, spend = null } = {}) {
    const item = CHARACTER_ITEM_BY_ID[itemId];
    if (!item) return { ok: false, message: '없는 아이템입니다' };
    if (item.skin !== CharacterItemSystem.skinOf(character)) {
      return { ok: false, message: `${item.name} 은(는) ${item.skin} 캐릭터 전용입니다 — 그 캐릭터로 바꿔야 살 수 있습니다` };
    }
    if (this.owned.has(itemId)) return { ok: false, message: '이미 보유하고 있습니다' };
    const price = num(item.cost?.gold, 0);
    if (num(gold, 0) < price) return { ok: false, message: `골드가 부족합니다 — ${money(price)} G 필요` };
    if (typeof spend === 'function') {
      const paid = spend(price);
      if (!paid) return { ok: false, message: `골드가 부족합니다 — ${money(price)} G 필요` };
    }
    this.owned.add(itemId);
    this.equippedId = itemId;
    this._save();
    return { ok: true, message: `${item.name} 을(를) 구매해 착용했습니다`, item, spent: price };
  }

  /** 착용 — 보유 + 그 캐릭터 전용일 때만 */
  equip(itemId, { character = null } = {}) {
    const item = CHARACTER_ITEM_BY_ID[itemId];
    if (!item) return { ok: false, message: '없는 아이템입니다' };
    if (!this.owned.has(itemId)) return { ok: false, message: '먼저 구매해야 합니다' };
    if (item.skin !== CharacterItemSystem.skinOf(character)) {
      return { ok: false, message: `${item.name} 은(는) ${item.skin} 캐릭터 전용입니다` };
    }
    this.equippedId = itemId;
    this._save();
    return { ok: true, message: `${item.name} 을(를) 착용했습니다`, item };
  }

  unequip() {
    const was = this.equippedId;
    this.equippedId = null;
    if (was) this._save();
    return { ok: Boolean(was), message: was ? '전용 아이템을 해제했습니다' : '착용한 전용 아이템이 없습니다' };
  }

  /** 캐릭터가 바뀌었을 때 — 그 캐릭터 전용이 아니면 자동 해제 */
  syncCharacter(character) {
    if (!this.equippedId) return null;
    const item = CHARACTER_ITEM_BY_ID[this.equippedId];
    if (item && item.skin === CharacterItemSystem.skinOf(character)) return null;
    const name = item?.name ?? '전용 아이템';
    this.equippedId = null;
    this._save();
    return name;
  }

  /** 저장 파일에서 온 값과 합치기(디버그/관리자) */
  grant(itemId) {
    if (!CHARACTER_ITEM_BY_ID[itemId]) return false;
    this.owned.add(itemId);
    this._save();
    return true;
  }
}

/** 데이터 무결성 — 스모크 테스트가 호출 */
export function validateCharacterItemData() {
  const errors = [];
  if (CHARACTER_ITEMS.length !== 9) errors.push(`전용 아이템이 9종이 아니다(${CHARACTER_ITEMS.length})`);
  const ids = new Set();
  const skins = new Set();
  for (const item of CHARACTER_ITEMS) {
    if (!item.id || ids.has(item.id)) errors.push(`${item.id}: id 누락/중복`);
    ids.add(item.id);
    if (!characterSkin(item.skin)) errors.push(`${item.id}: 모르는 스킨(${item.skin})`);
    if (skins.has(item.skin)) errors.push(`${item.skin}: 스킨이 중복 지정됨`);
    skins.add(item.skin);
    if (!item.name || !item.glyph) errors.push(`${item.id}: 이름/아이콘 누락`);
    if (!(num(item.cost?.gold, 0) > 0)) errors.push(`${item.id}: 가격이 0 이하`);
    if (!item.bonus || !Object.keys(item.bonus).length) errors.push(`${item.id}: 보너스 없음`);
    for (const v of Object.values(item.bonus || {})) {
      if (!Number.isFinite(Number(v)) || Number(v) <= 0) errors.push(`${item.id}: 보너스 값이 이상(${v})`);
    }
  }
  if (skins.size !== 9) errors.push(`스킨 9종에 하나씩 배정되지 않았다(${skins.size})`);
  return errors;
}

export default CharacterItemSystem;