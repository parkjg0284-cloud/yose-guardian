// 성능 진단 2 — 청크 컬링이 실제로 그리는 양을 줄이는지 확인한다.
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';

function stats(world) {
  const tf = world.treeField;
  const mf = world.mineralField;
  const countDraw = (field) => {
    let meshes = 0;
    let visibleMeshes = 0;
    let instances = 0;
    let visibleInstances = 0;
    let chunks = 0;
    let visibleChunks = 0;
    for (const mesh of field._meshes ?? []) {
      meshes += 1;
      instances += mesh.count;
      if (mesh.visible !== false) {
        visibleMeshes += 1;
        visibleInstances += mesh.count;
      }
    }
    for (const c of field._chunks ?? []) {
      chunks += 1;
      if (c.on !== false) visibleChunks += 1;
    }
    return { meshes, visibleMeshes, instances, visibleInstances, chunks, visibleChunks };
  };
  return { trees: countDraw(tf), minerals: countDraw(mf) };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);

for (const quality of ['performance', 'balanced', 'unlimited']) {
  const world = createWorld({ scene, seed: 'perf', quality, rng: createRNG('perf').fork('world') });
  // 기지(중앙)에 서서 정면을 본다
  camera.position.set(0, 3, 70);
  camera.lookAt(0, 3, 0);
  world.frustumCull(camera);
  const atBase = stats(world);
  // 성능 프리셋 drawDistance 로 한 청크 거리까지 걸어간 뒤(50m) 다시 측정
  camera.position.set(0, 3, 400);
  world.frustumCull(camera);
  const away = stats(world);
  const t = atBase.trees;
  const line = (s) => `${s.visibleInstances}/${s.instances}인스턴스 · ${s.visibleMeshes}/${s.meshes}메시 · 청크 ${s.visibleChunks}/${s.chunks}`;
  console.log(`[${quality}] 나무   기지: ${line(t)}`);
  console.log(`[${quality}] 나무   외곽: ${line(away.trees)} (${Math.round((1 - away.trees.visibleInstances / Math.max(1, t.visibleInstances)) * 100)}% 감소)`);
  console.log(`[${quality}] 광물   기지: ${line(atBase.minerals)}`);
  console.log(`[${quality}] 광물   외곽: ${line(away.minerals)}`);
  world.dispose();
}
