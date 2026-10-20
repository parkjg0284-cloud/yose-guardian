// 성능 진단 — 씬에 실제로 올라가는 광원/메시/삼각형 수를 센다.
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { spawnEnemy } from '../client/src/systems/enemies.js';

const scene = new THREE.Scene();
const world = createWorld({ scene, seed: 'perf', quality: 'balanced', rng: createRNG('perf').fork('world') });

const count = () => {
  let lights = 0;
  let pointLights = 0;
  let visiblePointLights = 0;
  let meshes = 0;
  let instanced = 0;
  let tris = 0;
  let drawCalls = 0;
  scene.traverse((o) => {
    if (o.isLight) {
      lights += 1;
      if (o.isPointLight) {
        pointLights += 1;
        if (o.visible !== false) visiblePointLights += 1;
      }
    }
    if (o.isMesh || o.isInstancedMesh) {
      meshes += 1;
      if (o.isInstancedMesh) {
        instanced += o.count;
        const g = o.geometry;
        const t = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        tris += t * o.count;
      } else {
        const g = o.geometry;
        const t = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
        tris += t;
      }
      if (o.visible !== false) drawCalls += 1;
    }
  });
  return { lights, pointLights, visiblePointLights, meshes, instanced, tris: Math.round(tris), drawCalls };
};

console.log('나무', world.trees.length, '· 광물', world.minerals.length);
console.log('기본 씬:', JSON.stringify(count()));

const list = [];
for (let i = 0; i < 140; i++) {
  const e = spawnEnemy({ scene, world, wave: 20, typeId: i % 5 === 0 ? 'orc' : 'imp', position: new THREE.Vector3((i % 14) * 4 - 26, 0, 120 + Math.floor(i / 14) * 4) });
  if (e) list.push(e);
}
console.log('적', list.length, '마리 스폰 후:', JSON.stringify(count()));
console.log('  → 적 1마리당 광원', ((count().visiblePointLights - 3) / list.length).toFixed(2), '개(보이는 기준)');
