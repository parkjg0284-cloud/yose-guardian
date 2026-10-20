// Sky, lights and atmosphere. Cheap: gradient shader dome + Points stars + drifting planes.
import * as THREE from 'three';
import { MAP } from '../data.js';

const SKY_RADIUS = 1400;

const SKY_VERT = `
varying vec3 vWorldPosition;
void main() {
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
varying vec3 vWorldPosition;
void main() {
  float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
  float t = pow(clamp(h, 0.0, 1.0), exponent);
  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
  #include <colorspace_fragment>
}`;

const SUN_DIR = new THREE.Vector3(0.45, 0.72, 0.28).normalize();
const CLOUD_COUNT = 6;

function shadowMapSize(preset) {
  const pr = preset?.pixelRatio ?? 1;
  if (pr >= 2) return 2048;
  if (pr >= 1.5) return 1024;
  return 512;
}

export function createSky({ scene = null, preset = null, seed = 'fortress', rng = null } = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  group.matrixAutoUpdate = false;
  group.updateMatrix();

  // ── gradient dome + stars (follow the camera so the dome never clips) ──
  const celestial = new THREE.Group();
  celestial.name = 'sky.celestial';
  celestial.matrixAutoUpdate = true;

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(MAP.skyTop) },
      bottomColor: { value: new THREE.Color(MAP.skyBottom) },
      offset: { value: 120 },
      exponent: { value: 0.75 }
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.name = 'sky.dome';
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  celestial.add(skyMesh);

  const starCount = Math.max(0, Math.round(360 * (preset?.particles ?? 0.75)));
  let stars = null;
  if (starCount > 0) {
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // upper hemisphere only; golden-ratio fallback stays deterministic without an rng
      const u = rng ? rng.next() : (i * 0.6180339887) % 1;
      const v = rng ? rng.next() : (i * 0.3819660113) % 1;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(0.08 + v * 0.92);
      const r = SKY_RADIUS * 0.94;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false
    });
    stars = new THREE.Points(starGeo, starMat);
    stars.name = 'sky.stars';
    stars.frustumCulled = false;
    stars.renderOrder = -999;
    celestial.add(stars);
  }
  group.add(celestial);

  // ── lights ──
  const sun = new THREE.DirectionalLight(MAP.sunColor, MAP.sunIntensity);
  sun.name = 'sky.sun';
  sun.castShadow = !!preset?.shadow;
  sun.shadow.mapSize.set(shadowMapSize(preset), shadowMapSize(preset));
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1400;
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.4;
  sun.position.copy(SUN_DIR).multiplyScalar(600);
  sun.target.position.set(0, 0, 0);
  group.add(sun);
  group.add(sun.target);

  const hemi = new THREE.HemisphereLight(MAP.skyBottom, 0x33402a, 0.45);
  hemi.name = 'sky.hemi';
  group.add(hemi);

  const ambient = new THREE.AmbientLight(MAP.ambientColor, MAP.ambientIntensity);
  ambient.name = 'sky.ambient';
  group.add(ambient);

  // ── cheap drifting clouds ──
  const clouds = new THREE.Group();
  clouds.name = 'sky.clouds';
  clouds.matrixAutoUpdate = false;
  const cloudGeo = new THREE.PlaneGeometry(240, 130);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    fog: false
  });
  const cloudSprites = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = (rng ? rng.range(0, Math.PI * 2) : i * 0.7);
    const px = rng ? rng.range(-900, 900) : (i - 3) * 300;
    const pz = rng ? rng.range(-900, 900) : ((i * 137) % 800) - 400;
    const py = rng ? rng.range(150, 230) : 180;
    mesh.position.set(px, py, pz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.scale.setScalar(rng ? rng.range(0.7, 1.6) : 1);
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    clouds.add(mesh);
    cloudSprites.push({ mesh, speed: 3 + (i % 3) * 1.6 });
  }
  group.add(clouds);

  const sky = {
    group,
    sun,
    ambient,
    hemi,
    skyMesh,
    stars,
    clouds,
    celestial,
    scene,
    preset,
    seed,
    fogEnabled: true,
    time: 0,
    update(dt, camera) {
      const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
      this.time += step;
      // keep the dome + stars centred on the viewer
      if (camera && camera.position) celestial.position.copy(camera.position);
      // keep the shadow frustum on the viewer so a 5000m map still gets shadows
      if (camera && camera.position) {
        const cx = camera.position.x;
        const cz = camera.position.z;
        const cy = camera.position.y || 0;
        sun.position.set(cx + SUN_DIR.x * 600, cy + SUN_DIR.y * 600, cz + SUN_DIR.z * 600);
        sun.target.position.set(cx, cy, cz);
        sun.target.updateMatrixWorld();
      }
      for (let i = 0; i < cloudSprites.length; i++) {
        const c = cloudSprites[i];
        c.mesh.position.x += c.speed * step;
        if (c.mesh.position.x > 1500) c.mesh.position.x = -1500;
        c.mesh.updateMatrix();
      }
      if (stars) stars.rotation.y = this.time * 0.004;
    },
    setFogEnabled(enabled) {
      this.fogEnabled = !!enabled;
      if (this.scene && this.scene.fog) this.scene.fog.far = enabled ? (this.preset?.fog?.far ?? MAP.fogFar) : 1e6;
      return this.fogEnabled;
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      skyGeo.dispose();
      skyMat.dispose();
      if (stars) {
        stars.geometry.dispose();
        stars.material.dispose();
      }
      cloudGeo.dispose();
      cloudMat.dispose();
      sun.shadow.map?.dispose();
      sun.dispose?.();
      hemi.dispose?.();
      ambient.dispose?.();
      while (group.children.length) group.remove(group.children[0]);
    }
  };

  // the dome lives inside a group that follows the camera; see update()
  return sky;
}

// Apply a FRAME_PRESETS entry live: shadows / fog / stars without rebuilding the sky.
export function applySkyQuality(sky, preset) {
  if (!sky || !preset) return sky;
  sky.preset = preset;

  const sun = sky.sun;
  if (sun) {
    sun.castShadow = !!preset.shadow;
    const size = shadowMapSize(preset);
    if (sun.shadow.mapSize.width !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }
  if (sky.stars) sky.stars.visible = (preset.particles ?? 0.5) > 0.3;
  if (sky.scene && sky.scene.fog && preset.fog) {
    sky.scene.fog.near = preset.fog.near;
    sky.scene.fog.far = sky.fogEnabled === false ? 1e6 : preset.fog.far;
    if (sky.scene.fog.color && preset.fog.color) sky.scene.fog.color.setHex(preset.fog.color);
  }
  return sky;
}

export default { createSky, applySkyQuality };
