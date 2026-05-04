import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Car3D } from './car.js';
import { EngineSoundController } from './sound.js';
import { TRACK_MODEL_URL, TRACK_MODEL_Y_OFFSET, createTrack } from './track.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const RAY_DOWN = new THREE.Vector3(0, -1, 0);
const SURFACE_RAY_HEIGHT = 80;
const SURFACE_RAY_DISTANCE = 200;
const CAR_SURFACE_CLEARANCE = 0.32;
const MODEL_SURFACE_FALLBACK_Y = 0.42;
const TRACK_MODEL_FALLBACK_TIMEOUT_MS = 4500;
const NGROK_REQUEST_HEADERS = {
  'ngrok-skip-browser-warning': 'true'
};
const VISUAL_LAP_DISTANCE_SCALE = 0.92;
const LONG_TEXT_LAP_THRESHOLD = 320;
const TEXT_CHARS_PER_VISUAL_LAP = 220;
const MIN_LONG_TEXT_LAPS = 3;
const MIN_VISUAL_LAPS = 1;
const MAX_VISUAL_LAPS = 5;
const MODEL_CURVE_BINS = 180;
const MODEL_CURVE_MIN_POINTS = 32;
const MODEL_MAIN_RACE_START_INDEX = 61;
const MODEL_RACE_DECOR_Y_OFFSET = 0.22;
const MODEL_START_HINTS = [
  new THREE.Vector3(42.6, 0, 155.7),
  new THREE.Vector3(106.0, 0, 155.7),
  new THREE.Vector3(24.8, 0, 149.0),
  new THREE.Vector3(-109.8, 0, 63.1),
  new THREE.Vector3(107.0, 0, -178.8),
  new THREE.Vector3(127.7, 0, 155.1)
];
const MODEL_MAIN_RACE_POINTS = [
  [127.7, 11.9, 155.1],
  [147.6, 11.8, 158.9],
  [172.8, 11.3, 170.6],
  [199.1, 10.5, 168.2],
  [221.5, 9.2, 152.1],
  [238.1, 9.2, 150.2],
  [236.9, 7.3, 100.3],
  [233.3, 6.6, 81.2],
  [232.8, 4.8, 62.3],
  [198.4, 4.8, 35.4],
  [205.0, 4.5, 10.0],
  [213.6, 4.4, -27.3],
  [229.6, 5.0, -69.4],
  [232.8, 4.8, -62.3],
  [260.3, 5.8, -121.9],
  [315.4, 7.9, -128.8],
  [355.8, 8.3, -159.4],
  [338.9, 6.9, -176.2],
  [294.7, 5.9, -185.9],
  [229.5, 4.8, -186.0],
  [194.9, 5.4, -189.7],
  [164.6, 6.1, -179.1],
  [129.4, 6.9, -189.6],
  [103.6, 7.5, -179.0],
  [75.0, 8.0, -178.9],
  [42.3, 8.5, -178.6],
  [10.0, 8.6, -174.0],
  [-18.3, 8.6, -169.2],
  [-50.0, 7.8, -155.0],
  [-76.5, 7.3, -145.1],
  [-105.0, 7.8, -150.0],
  [-133.5, 8.3, -158.4],
  [-160.0, 9.2, -166.0],
  [-192.9, 10.2, -173.0],
  [-210.0, 10.6, -150.0],
  [-220.3, 11.0, -120.3],
  [-225.0, 12.0, -90.0],
  [-231.3, 13.1, -58.6],
  [-231.0, 14.0, -30.0],
  [-227.5, 14.8, -2.5],
  [-205.0, 13.3, 10.0],
  [-175.9, 12.1, 22.3],
  [-150.0, 11.0, 35.0],
  [-123.8, 9.9, 51.5],
  [-100.0, 8.5, 70.0],
  [-78.4, 7.0, 91.7],
  [-60.0, 4.8, 115.0],
  [-39.5, 2.3, 137.4],
  [-60.0, -0.9, 161.1],
  [-82.6, -1.9, 167.5],
  [-95.6, -4.0, 142.8],
  [-94.2, -3.7, 115.8],
  [-61.3, -0.6, 62.8],
  [-28.1, 1.5, 12.7],
  [29.0, 1.2, -7.2],
  [83.6, 0.3, 18.9],
  [113.9, -0.4, 64.5],
  [61.5, 3.4, 97.5],
  [8.8, 7.7, 128.2],
  [10.4, 7.3, 141.5],
  [24.8, 7.1, 149.0],
  [42.6, 8.1, 155.7],
  [106.0, 11.4, 155.7]
];
const SERVER_DISTANCE_SCALE = 0.08;
const VISUAL_MIN_CRUISE_SPEED = 38;
const PROGRESS_SNAP_EPSILON = 0.00003;
const SURFACE_CACHE_PROGRESS_EPSILON = 0.000005;
const SURFACE_LATERAL_SEARCH_OFFSETS = [0, -0.65, 0.65, -1.35, 1.35, -2.1, 2.1];
const SURFACE_FORWARD_SEARCH_OFFSETS = [0, -0.75, 0.75];
const REMOTE_LANE_OFFSETS = [0.8, -0.8, 1.35, -1.35, 1.9, -1.9];
const REMOTE_CAR_COLORS = [
  0x2f80ed,
  0xf2c94c,
  0x27ae60,
  0xbb6bd9,
  0xeb5757,
  0x56ccf2
];
const SKYBOX_URLS = [];

const _normalMatrix = new THREE.Matrix3();
const _tempNormal = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempMat4 = new THREE.Matrix4();
const _tempRight = new THREE.Vector3();
const _tempForward = new THREE.Vector3();
const _candidate = new THREE.Vector3();
const _surfaceRayOrigin = new THREE.Vector3();
const _fp = new THREE.Vector3();
const _rp = new THREE.Vector3();
const _sp = new THREE.Vector3();
const _modelCurvePoint = new THREE.Vector3();
const _roadSamplePoint = new THREE.Vector3();
const _roadSampleNormal = new THREE.Vector3();

function damp(current, target, rate, deltaTime) {
  const factor = 1 - Math.exp(-rate * deltaTime);
  return THREE.MathUtils.lerp(current, target, factor);
}

function getVisualLapCountForText(text = '') {
  const length = String(text || '').replace(/\s+/g, ' ').trim().length;

  if (length <= LONG_TEXT_LAP_THRESHOLD) {
    return 1;
  }

  return THREE.MathUtils.clamp(
    Math.ceil(length / TEXT_CHARS_PER_VISUAL_LAP),
    MIN_LONG_TEXT_LAPS,
    MAX_VISUAL_LAPS
  );
}

function normalizeVisualLapCount(value) {
  const lapCount = Number(value);

  if (!Number.isFinite(lapCount)) {
    return null;
  }

  return Math.round(THREE.MathUtils.clamp(lapCount, MIN_VISUAL_LAPS, MAX_VISUAL_LAPS));
}

function getTrackSampleProgress(progress = 0) {
  const value = Number.isFinite(progress) ? progress : 0;
  return ((value % 1) + 1) % 1;
}

function cloneTrackMaterial(material) {
  if (!material) {
    return material;
  }

  const nextMaterial = material.clone();
  nextMaterial.side = THREE.DoubleSide;

  if (nextMaterial.map) {
    nextMaterial.map.colorSpace = THREE.SRGBColorSpace;
    nextMaterial.map.anisotropy = 4;
  }

  nextMaterial.needsUpdate = true;
  return nextMaterial;
}

function prepareCircuitModel(model) {
  const materialCache = new Map();
  const getPreparedMaterial = (material) => {
    if (!material) {
      return material;
    }

    if (!materialCache.has(material)) {
      materialCache.set(material, cloneTrackMaterial(material));
    }

    return materialCache.get(material);
  };

  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (Array.isArray(child.material)) {
      child.material = child.material.map(getPreparedMaterial);
      return;
    }

    child.material = getPreparedMaterial(child.material);
  });
}

function getHitWorldNormal(hit) {
  if (!hit?.face || !hit.object) {
    return WORLD_UP.clone();
  }

  _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  _tempNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize();

  if (_tempNormal.dot(WORLD_UP) < 0) {
    _tempNormal.negate();
  }

  return _tempNormal.clone();
}

function getMaterialNames(material) {
  if (Array.isArray(material)) {
    return material.map((entry) => entry?.name || '').join(' ');
  }

  return material?.name || '';
}

function getSurfaceSearchText(mesh) {
  return [
    mesh?.name || '',
    mesh?.parent?.name || '',
    getMaterialNames(mesh?.material)
  ].join(' ');
}

function isTrackSurfaceMesh(mesh) {
  return /(^|[\s_-])(road|asphalt|bitumen|kerb|curb|trkline|trkasph|trkbasph|trkcasph|trkkerb)([\s_-]|$)|road_marking/i
    .test(getSurfaceSearchText(mesh));
}

function isPreferredCurveMesh(mesh) {
  return /(^|[\s_-])road([\s_-]|$)|road_mat/i.test(getSurfaceSearchText(mesh));
}

function smoothClosedPoints(points) {
  if (points.length < 3) {
    return points;
  }

  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];

    return new THREE.Vector3(
      (previous.x + point.x * 2 + next.x) * 0.25,
      (previous.y + point.y * 2 + next.y) * 0.25,
      (previous.z + point.z * 2 + next.z) * 0.25
    );
  });
}

function horizontalDistanceSquared(point, hint) {
  const dx = point.x - hint.x;
  const dz = point.z - hint.z;
  return dx * dx + dz * dz;
}

function horizontalDistance(pointA, pointB) {
  return Math.sqrt(horizontalDistanceSquared(pointA, pointB));
}

function getHorizontalTurnAngle(previous, point, next) {
  const inX = point.x - previous.x;
  const inZ = point.z - previous.z;
  const outX = next.x - point.x;
  const outZ = next.z - point.z;
  const inLength = Math.hypot(inX, inZ);
  const outLength = Math.hypot(outX, outZ);

  if (inLength < 0.0001 || outLength < 0.0001) {
    return 0;
  }

  const dot = ((inX * outX) + (inZ * outZ)) / (inLength * outLength);
  return Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
}

function removeRouteKinks(points) {
  const cleaned = points.slice();
  let changed = true;

  while (changed && cleaned.length >= MODEL_CURVE_MIN_POINTS) {
    changed = false;

    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = cleaned[(index - 1 + cleaned.length) % cleaned.length];
      const point = cleaned[index];
      const next = cleaned[(index + 1) % cleaned.length];
      const previousLength = horizontalDistance(previous, point);
      const nextLength = horizontalDistance(point, next);
      const directLength = horizontalDistance(previous, next);
      const turnAngle = getHorizontalTurnAngle(previous, point, next);
      const hasShortLink = Math.min(previousLength, nextLength) < 10;
      const isHardBacktrack = turnAngle > THREE.MathUtils.degToRad(105);
      const isDetour = previousLength + nextLength > directLength * 1.16;

      if (hasShortLink && isHardBacktrack && isDetour) {
        cleaned.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return cleaned;
}

function rotatePointsToStartHint(points) {
  if (points.length < MODEL_CURVE_MIN_POINTS) {
    return points;
  }

  let bestIndex = 0;
  let bestScore = Infinity;

  for (const hint of MODEL_START_HINTS) {
    points.forEach((point, index) => {
      const score = horizontalDistanceSquared(point, hint);

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestScore < 40 * 40) {
      break;
    }
  }

  if (bestIndex <= 0) {
    return points;
  }

  return points.slice(bestIndex).concat(points.slice(0, bestIndex));
}

function createClosedRouteCurve(routePoints) {
  const points = removeRouteKinks(
    routePoints.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  );
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.45);

  curve.arcLengthDivisions = Math.max(720, points.length * 18);
  curve.updateArcLengths();

  return curve;
}

function createMainRaceTrackCurve() {
  const routePoints = MODEL_MAIN_RACE_POINTS
    .slice(MODEL_MAIN_RACE_START_INDEX)
    .concat(MODEL_MAIN_RACE_POINTS.slice(0, MODEL_MAIN_RACE_START_INDEX));
  const curve = createClosedRouteCurve(routePoints);

  return {
    curve,
    length: curve.getLength()
  };
}

function getCurveBasis(curve, progress = 0, verticalOffset = MODEL_RACE_DECOR_Y_OFFSET) {
  const sampleProgress = getTrackSampleProgress(progress);
  const point = curve.getPointAt(sampleProgress).clone();
  const tangent = curve.getTangentAt(sampleProgress).normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, tangent).normalize();

  if (right.lengthSq() < 0.0001) {
    right.set(1, 0, 0);
  }

  const forward = tangent.clone().projectOnPlane(WORLD_UP).normalize();
  if (forward.lengthSq() < 0.0001) {
    forward.copy(tangent);
  }

  point.y += verticalOffset;

  return {
    point,
    tangent,
    right,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(
      _tempMat4.makeBasis(right, WORLD_UP, forward.normalize())
    )
  };
}

function addStartFinishLine(group, curve) {
  const basis = getCurveBasis(curve, 0, MODEL_RACE_DECOR_Y_OFFSET + 0.03);
  const lineGroup = new THREE.Group();
  lineGroup.name = 'MainRaceStartFinishLine';
  lineGroup.position.copy(basis.point);
  lineGroup.quaternion.copy(basis.quaternion);

  const tileCount = 18;
  const tileWidth = 1.25;
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f3e8, roughness: 0.55 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111312, roughness: 0.62 });

  for (let index = 0; index < tileCount; index += 1) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(tileWidth, 0.08, 1.65),
      index % 2 === 0 ? whiteMaterial : darkMaterial
    );
    tile.position.set((index - (tileCount - 1) / 2) * tileWidth, 0, 0);
    tile.receiveShadow = false;
    lineGroup.add(tile);
  }

  group.add(lineGroup);
}

function addStartGantry(group, curve) {
  const basis = getCurveBasis(curve, 0.004, MODEL_RACE_DECOR_Y_OFFSET);
  const gantry = new THREE.Group();
  gantry.name = 'MainRaceStartGantry';
  gantry.position.copy(basis.point);
  gantry.quaternion.copy(basis.quaternion);

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x202522,
    metalness: 0.35,
    roughness: 0.45
  });
  const signMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8f32,
    emissive: 0xff5a24,
    emissiveIntensity: 0.16,
    roughness: 0.5
  });
  const lightOffMaterial = new THREE.MeshStandardMaterial({
    color: 0x211110,
    emissive: 0x5b0502,
    emissiveIntensity: 0.45
  });

  const postGeometry = new THREE.BoxGeometry(0.52, 7.2, 0.52);
  [-11.8, 11.8].forEach((x) => {
    const post = new THREE.Mesh(postGeometry, metalMaterial);
    post.position.set(x, 3.55, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    gantry.add(post);
  });

  const bar = new THREE.Mesh(new THREE.BoxGeometry(25.0, 0.62, 0.62), metalMaterial);
  bar.position.set(0, 7.05, 0);
  bar.castShadow = true;
  gantry.add(bar);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(13.6, 1.45, 0.28), signMaterial);
  sign.position.set(0, 6.18, -0.1);
  gantry.add(sign);

  for (let index = 0; index < 5; index += 1) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), lightOffMaterial);
    light.position.set((index - 2) * 1.08, 5.45, -0.42);
    gantry.add(light);
  }

  group.add(gantry);
}

function createMainRaceDecor(curve) {
  const group = new THREE.Group();
  group.name = 'MainRaceDecor';

  addStartFinishLine(group, curve);
  addStartGantry(group, curve);

  return group;
}

function disposeObject3D(object) {
  object?.traverse?.((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else if (child.material) {
      child.material.dispose();
    }
  });
}

function buildCurveFromRoadMesh(mesh) {
  const geometry = mesh?.geometry;
  const position = geometry?.attributes?.position;
  const uv = geometry?.attributes?.uv;

  if (!position || !uv || position.count < MODEL_CURVE_MIN_POINTS || uv.count !== position.count) {
    return null;
  }

  let minV = Infinity;
  let maxV = -Infinity;

  for (let index = 0; index < uv.count; index += 1) {
    const v = uv.getY(index);

    if (!Number.isFinite(v)) {
      continue;
    }

    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || Math.abs(maxV - minV) < 0.0001) {
    return null;
  }

  const bins = Array.from({ length: MODEL_CURVE_BINS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    weight: 0,
    count: 0
  }));

  for (let index = 0; index < position.count; index += 1) {
    const u = uv.getX(index);
    const v = uv.getY(index);

    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      continue;
    }

    const binIndex = Math.max(
      0,
      Math.min(
        MODEL_CURVE_BINS - 1,
        Math.floor(((v - minV) / (maxV - minV)) * (MODEL_CURVE_BINS - 1))
      )
    );
    const centerWeight = 1 / (0.08 + Math.abs(u - 0.5));
    const bin = bins[binIndex];

    _modelCurvePoint.fromBufferAttribute(position, index);
    mesh.localToWorld(_modelCurvePoint);

    bin.x += _modelCurvePoint.x * centerWeight;
    bin.y += _modelCurvePoint.y * centerWeight;
    bin.z += _modelCurvePoint.z * centerWeight;
    bin.weight += centerWeight;
    bin.count += 1;
  }

  let points = bins
    .filter((bin) => bin.weight > 0 && bin.count >= 2)
    .map((bin) => new THREE.Vector3(
      bin.x / bin.weight,
      bin.y / bin.weight,
      bin.z / bin.weight
    ));

  if (points.length < MODEL_CURVE_MIN_POINTS) {
    return null;
  }

  if (points[0].distanceTo(points[points.length - 1]) < 12) {
    points = points.slice(0, -1);
  }

  points = rotatePointsToStartHint(smoothClosedPoints(smoothClosedPoints(points)));

  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  return {
    curve,
    length: curve.getLength()
  };
}

function buildCurveFromTrackSurfaceMeshes(surfaceMeshes) {
  const candidates = surfaceMeshes
    .filter((mesh) => mesh?.geometry?.attributes?.position && mesh.geometry.attributes.uv)
    .sort((a, b) => {
      const preferredDelta = Number(isPreferredCurveMesh(b)) - Number(isPreferredCurveMesh(a));

      if (preferredDelta !== 0) {
        return preferredDelta;
      }

      return b.geometry.attributes.position.count - a.geometry.attributes.position.count;
    });

  for (const mesh of candidates) {
    const curve = buildCurveFromRoadMesh(mesh);

    if (curve) {
      return curve;
    }
  }

  return null;
}

function buildRoadSurfaceSamples(surfaceMeshes) {
  const samples = [];
  const candidates = surfaceMeshes.filter((mesh) => (
    isPreferredCurveMesh(mesh)
    && mesh?.geometry?.attributes?.position
  ));

  candidates.forEach((mesh) => {
    const position = mesh.geometry.attributes.position;
    const normal = mesh.geometry.attributes.normal;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

    for (let index = 0; index < position.count; index += 1) {
      _roadSamplePoint.fromBufferAttribute(position, index);
      mesh.localToWorld(_roadSamplePoint);

      if (normal) {
        _roadSampleNormal.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix).normalize();
        if (_roadSampleNormal.dot(WORLD_UP) < 0) {
          _roadSampleNormal.negate();
        }
      } else {
        _roadSampleNormal.copy(WORLD_UP);
      }

      samples.push({
        position: _roadSamplePoint.clone(),
        normal: _roadSampleNormal.clone()
      });
    }
  });

  return samples;
}

function colorToCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function updatePlayerLabel(sprite, name, color) {
  const canvas = sprite.userData.canvas;
  const context = canvas.getContext('2d');
  const label = String(name || 'Pembalap').slice(0, 18);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(5, 10, 18, 0.82)';
  context.strokeStyle = colorToCss(color);
  context.lineWidth = 8;
  context.beginPath();

  if (typeof context.roundRect === 'function') {
    context.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 22);
  } else {
    context.rect(10, 10, canvas.width - 20, canvas.height - 20);
  }

  context.fill();
  context.stroke();
  context.font = 'bold 34px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f6fbff';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);

  sprite.material.map.needsUpdate = true;
  sprite.userData.label = label;
}

function createPlayerLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 92;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 2.25, 0);
  sprite.scale.set(4.6, 1.32, 1);
  sprite.userData.canvas = canvas;
  updatePlayerLabel(sprite, name, color);
  return sprite;
}

function disposePlayerLabel(sprite) {
  if (!sprite) {
    return;
  }

  sprite.material?.map?.dispose();
  sprite.material?.dispose();
}

export class Game3D {
  constructor({ canvas, getLocalPlayerId }) {
    this.canvas = canvas;
    this.getLocalPlayerId = getLocalPlayerId;
    this.players = [];
    this.raceRunning = false;
    this.startTime = null;
    this.animationFrameId = null;
    this.clock = new THREE.Clock();
    this.baseFov = 54;
    this.cameraOffset = new THREE.Vector3(0, 5.2, -13.2);
    this.cameraLookAhead = new THREE.Vector3(0, 1.35, 12.5);
    this.cameraTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.forwardDirection = new THREE.Vector3(0, 0, 1);
    this.rightDirection = new THREE.Vector3(1, 0, 0);
    this.cameraPositionTarget = new THREE.Vector3();
    this.speedLineOffsets = [];
    this.speedLineDrift = [];
    this.track = null;
    this.trackCurve = null;
    this.trackLength = 0;
    this.raceTextLength = 0;
    this.visualLapCount = 1;
    this.circuitModel = null;
    this.circuitFallback = null;
    this.trackLoadFallbackTimer = null;
    this.mainRaceDecor = null;
    this.trackSurfaceMeshes = [];
    this.roadSurfaceSamples = [];
    this.surfaceRaycaster = new THREE.Raycaster(
      new THREE.Vector3(),
      RAY_DOWN,
      0,
      SURFACE_RAY_DISTANCE
    );
    this.surfaceCandidate = new THREE.Vector3();
    this.remoteCars = new Map();
    this.remoteLaneOffsets = new Map();
    this.nextRemoteLaneIndex = 0;

    // ========== SMOOTH PATH-FOLLOWING INTERPOLATION ==========
    // Local car interpolation rates are frame-rate independent damping rates.
    this.localCarPreviousPose = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0)
    };
    this.localCarTargetPose = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0)
    };
    this.localCarSmoothRates = {
      position: 14,
      rotation: 12,
      camera: 9
    };

    // Remote cars smooth interpolation
    this.remoteCarPreviousPoses = new Map();
    this.remoteCarTargetPoses = new Map();

    this.maxDeltaTime = 1 / 30;
    this.lastRenderTime = null;
    this.localSurfaceCache = { hit: null, progress: -1 };
    this.remoteSurfaceCaches = new Map();

    try {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x6fa8dc);
      this.scene.fog = new THREE.Fog(0x101820, 60, 400);

      this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, 1500);
      this.camera.position.set(47, 4, -20);
      this.camera.lookAt(47, 0, 0);
      this.sound = new EngineSoundController(this.camera);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.loadSkybox();
      this.addLights();
      this.addCircuit();
      this.addCar();
      this.addSpeedLines();

      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      this.animationFrameId = requestAnimationFrame(this.animate);
    } catch (error) {
      console.error('Game3D initialization failed:', error);
    }
  }

  addLights() {
    try {
      const ambientLight = new THREE.AmbientLight(0xcfdcff, 0.75);
      this.scene.add(ambientLight);

      const hemisphereLight = new THREE.HemisphereLight(0xaed4ff, 0x19321f, 1.15);
      this.scene.add(hemisphereLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 3.1);
      directionalLight.position.set(28, 46, 16);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.set(1024, 1024);
      directionalLight.shadow.camera.near = 1;
      directionalLight.shadow.camera.far = 130;
      directionalLight.shadow.camera.left = -85;
      directionalLight.shadow.camera.right = 85;
      directionalLight.shadow.camera.top = 85;
      directionalLight.shadow.camera.bottom = -85;
      this.scene.add(directionalLight);
    } catch (error) {
      console.error('Failed to add lights:', error);
    }
  }

  loadSkybox() {
    try {
      this.scene.background = new THREE.Color(0x6fa8dc);

      if (!SKYBOX_URLS.length) {
        return;
      }

      const loader = new THREE.CubeTextureLoader();
      loader.setPath('/skybox/');
      loader.load(
        SKYBOX_URLS,
        (texture) => {
          this.scene.background = texture;
        },
        undefined,
        () => {
          this.scene.background = new THREE.Color(0x6fa8dc);
        }
      );
    } catch (error) {
      console.error('Failed to load skybox:', error);
      this.scene.background = new THREE.Color(0x6fa8dc);
    }
  }

  addCircuit() {
    try {
      this.track = createTrack();
      this.trackCurve = this.track.curve;
      this.trackLength = this.track.length;
      this.circuitFallback = this.track.group;
      this.scene.add(this.circuitFallback);
      this.loadCircuitModel();
    } catch (error) {
      console.error('Failed to add circuit:', error);
    }
  }

  setMainRaceDecor(curve) {
    if (!this.scene || !curve) {
      return;
    }

    if (this.mainRaceDecor) {
      this.scene.remove(this.mainRaceDecor);
      disposeObject3D(this.mainRaceDecor);
      this.mainRaceDecor = null;
    }

    this.mainRaceDecor = createMainRaceDecor(curve);
    this.scene.add(this.mainRaceDecor);
  }

  loadCircuitModel() {
    try {
      const loader = new GLTFLoader();
      loader.setRequestHeader(NGROK_REQUEST_HEADERS);
      this.scheduleTrackLoadFallback();
      loader.load(
        TRACK_MODEL_URL,
        (gltf) => {
          try {
            const model = gltf.scene;
            if (!model) {
              throw new Error('Track GLTF scene is missing');
            }

            prepareCircuitModel(model);
            model.name = 'TrackGLBCircuit';
            model.position.y += TRACK_MODEL_Y_OFFSET;
            this.scene.add(model);
            model.updateMatrixWorld(true);
            this.circuitModel = model;
            this.trackSurfaceMeshes = [];

            const trackBox = new THREE.Box3();
            model.traverse((child) => {
              if (child.isMesh) {
                if (child.geometry && !child.geometry.boundingSphere) {
                  child.geometry.computeBoundingSphere();
                }
                trackBox.expandByObject(child);
                if (isTrackSurfaceMesh(child)) {
                  this.trackSurfaceMeshes.push(child);
                }
              }
            });

            const trackSize = new THREE.Vector3();
            trackBox.getSize(trackSize);
            const maxDim = Math.max(trackSize.x, trackSize.z);
            const shadowHalf = Math.max(maxDim * 0.65, 100);
            this.roadSurfaceSamples = buildRoadSurfaceSamples(this.trackSurfaceMeshes);
            const modelTrack = createMainRaceTrackCurve();

            if (modelTrack) {
              this.trackCurve = modelTrack.curve;
              this.trackLength = modelTrack.length;
              this.setMainRaceDecor(modelTrack.curve);
              this.localSurfaceCache = { hit: null, progress: -1 };
              this.remoteSurfaceCaches.forEach((cache) => {
                cache.hit = null;
                cache.progress = -1;
              });

              if (this.localCar) {
                this.localCar.progress = THREE.MathUtils.clamp(this.localCar.progress || 0, 0, this.getMaxVisualProgress());
                this.localCar.targetProgress = this.localCar.progress;
                this.localCar.displayProgress = this.localCar.progress;
                if (this.raceRunning) {
                  this.positionLocalCarOnCircuit(this.localCar.displayProgress);
                } else {
                  this.snapLocalCarToProgress(this.localCar.displayProgress);
                }
              }

              this.remoteCars.forEach((remoteCar, playerId) => {
                const cache = this.remoteSurfaceCaches.get(playerId);
                this.positionCarOnCircuit(remoteCar.car, remoteCar.displayProgress || 0, remoteCar.laneOffset, false, cache);
              });
            } else {
              console.warn('Track GLB loaded, but no usable road curve could be generated. Using fallback circuit path.');
            }

            if (this.camera && maxDim > 0) {
              this.camera.far = Math.max(this.camera.far, maxDim * 3);
              this.camera.updateProjectionMatrix();
            }

            if (this.scene && maxDim > 0) {
              this.scene.fog = new THREE.Fog(0x101820, Math.max(maxDim * 0.18, 80), Math.max(maxDim * 1.45, 650));
            }

            this.scene.traverse((child) => {
              if (child.isDirectionalLight && child.castShadow) {
                child.shadow.camera.left = -shadowHalf;
                child.shadow.camera.right = shadowHalf;
                child.shadow.camera.top = shadowHalf;
                child.shadow.camera.bottom = -shadowHalf;
                child.shadow.camera.far = Math.max(trackSize.y + 120, 220);
                child.shadow.camera.updateProjectionMatrix();
              }
            });

            if (modelTrack && this.circuitFallback) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (this.circuitFallback) {
                    this.circuitFallback.visible = false;
                  }
                });
              });
            }

            this.completeTrackLoad({
              success: Boolean(modelTrack),
              trackLength: Math.round(this.trackLength || 0)
            });
          } catch (error) {
            console.error('Failed to prepare track.glb:', error);
            if (this.circuitFallback) {
              this.circuitFallback.visible = true;
            }
            this.completeTrackLoad({ success: false });
          }
        },
        undefined,
        (error) => {
          console.error('Failed to load track.glb:', error);
          if (this.circuitFallback) {
            this.circuitFallback.visible = true;
          }
          this.completeTrackLoad({ success: false });
        }
      );
    } catch (error) {
      console.error('Failed to start track.glb load:', error);
      if (this.circuitFallback) {
        this.circuitFallback.visible = true;
      }
      this.completeTrackLoad({ success: false });
    }
  }

  scheduleTrackLoadFallback() {
    if (this.trackLoadFallbackTimer) {
      window.clearTimeout(this.trackLoadFallbackTimer);
    }

    this.trackLoadFallbackTimer = window.setTimeout(() => {
      this.trackLoadFallbackTimer = null;

      if (this.circuitModel) {
        return;
      }

      if (this.circuitFallback) {
        this.circuitFallback.visible = true;
      }

      this.dispatchTrackLoaded({
        success: false,
        pending: true,
        reason: 'timeout'
      });
    }, TRACK_MODEL_FALLBACK_TIMEOUT_MS);
  }

  completeTrackLoad(detail = {}) {
    if (this.trackLoadFallbackTimer) {
      window.clearTimeout(this.trackLoadFallbackTimer);
      this.trackLoadFallbackTimer = null;
    }

    this.dispatchTrackLoaded(detail);
  }

  dispatchTrackLoaded(detail = {}) {
    window.dispatchEvent(new CustomEvent('trackLoaded', {
      detail: {
        success: Boolean(detail.success),
        trackLength: Math.round(this.trackLength || this.track?.length || 0),
        ...detail
      }
    }));
  }

  addCar() {
    try {
      this.localCar = new Car3D(0xff5533);
      this.scene.add(this.localCar.group);
      this.snapLocalCarToProgress(0);
    } catch (error) {
      console.error('Failed to add car:', error);
    }
  }

  addSpeedLines() {
    try {
      const lineCount = 32;
      const positions = new Float32Array(lineCount * 2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xdff6ff,
        transparent: true,
        opacity: 0
      });

      this.speedLines = new THREE.LineSegments(geometry, material);
      this.speedLines.visible = false;
      this.scene.add(this.speedLines);

      for (let i = 0; i < lineCount; i += 1) {
        this.speedLineOffsets.push({
          x: (Math.random() - 0.5) * 5.2,
          y: (Math.random() - 0.5) * 2.4,
          z: 1.5 + Math.random() * 18
        });
        this.speedLineDrift.push(0.6 + Math.random() * 1.5);
      }
    } catch (error) {
      console.error('Failed to add speed lines:', error);
    }
  }

  setRaceText(text, lapCount = 1) {
    this.raceTextLength = String(text || '').replace(/\s+/g, ' ').trim().length;

    const normalizedLapCount = Math.round(Number(lapCount) || 1);

    this.visualLapCount = THREE.MathUtils.clamp(
      normalizedLapCount,
      1,
      5
    );
  }

  setVisualLapCount(lapCount) {
    const nextLapCount = normalizeVisualLapCount(lapCount);

    if (nextLapCount) {
      this.visualLapCount = nextLapCount;
    }
  }

  getVisualLapCount() {
    return this.visualLapCount || 1;
  }

  getMaxVisualProgress() {
    return Math.max(1, this.visualLapCount || 1);
  }

  getLapInfoForProgress(progressPercent = 0) {
    const totalLaps = this.getVisualLapCount();
    const normalizedProgress = THREE.MathUtils.clamp(Number(progressPercent) / 100, 0, 1);
    const absoluteProgress = normalizedProgress * totalLaps;

    const completedLaps = normalizedProgress >= 1
      ? totalLaps
      : Math.max(0, Math.min(totalLaps, Math.floor(absoluteProgress)));

    const currentLap = normalizedProgress >= 1
      ? totalLaps
      : Math.min(totalLaps, completedLaps + 1);

    const lapProgress = normalizedProgress >= 1
      ? 100
      : Math.round((absoluteProgress - completedLaps) * 100);

    return {
      completedLaps,
      currentLap,
      totalLaps,
      lapProgress
    };
  }

  getCircuitProfile() {
    return {
      id: this.circuitModel ? 'track-glb' : 'procedural-circuit',
      trackLength: Math.round(this.trackLength || 0)
    };
  }

  startRace(startTime) {
    this.raceRunning = true;
    this.startTime = startTime;
    this.sound?.setLobbyMusicActive(false);

    if (this.localCar) {
      this.localCar.speed = Math.max(this.localCar.speed || 0, VISUAL_MIN_CRUISE_SPEED);
      this.localCar.progress = 0;
      this.localCar.targetProgress = 0;
      this.localCar.displayProgress = 0;
      this.localSurfaceCache = { hit: null, progress: -1 };
      this.snapLocalCarToProgress(0);
    }

    this.remoteCars.forEach((remoteCar, playerId) => {
      remoteCar.speed = Math.max(remoteCar.speed || 0, VISUAL_MIN_CRUISE_SPEED);
      remoteCar.targetProgress = 0;
      remoteCar.displayProgress = 0;
      remoteCar.lastServerProgress = 0;
      remoteCar.car.speed = remoteCar.speed;
      remoteCar.car.progress = 0;
      this.remoteSurfaceCaches.set(playerId, { hit: null, progress: -1 });
      this.positionCarOnCircuit(remoteCar.car, 0, remoteCar.laneOffset, false, this.remoteSurfaceCaches.get(playerId));

      // Reset smooth interpolation poses for remote car
      const prevPose = this.remoteCarPreviousPoses.get(playerId) || {};
      prevPose.position = remoteCar.car.group.position.clone();
      prevPose.quaternion = remoteCar.car.group.quaternion.clone();
      this.remoteCarPreviousPoses.set(playerId, prevPose);

      const targetPose = this.remoteCarTargetPoses.get(playerId) || {};
      targetPose.position = remoteCar.car.group.position.clone();
      targetPose.quaternion = remoteCar.car.group.quaternion.clone();
      this.remoteCarTargetPoses.set(playerId, targetPose);
    });
  }

  stopRace() {
    this.raceRunning = false;
  }

  async resumeAudio() {
    await this.sound?.unlock();
  }

  setLobbyMusicActive(active) {
    this.sound?.setLobbyMusicActive(active);
  }

  playCountdownTick(count) {
    this.sound?.playCountdownTick(count);
  }

  playRaceStart() {
    this.sound?.playRaceStart();
  }

  playCorrectInput() {
    this.sound?.playCorrectKey();
  }

  playSegmentComplete() {
    this.sound?.playSegmentComplete();
  }

  playMistakeInput() {
    this.sound?.playMistake();
  }

  playFinish() {
    this.sound?.playFinish();
  }

  prepareRaceGrid() {
    this.raceRunning = false;

    if (this.localCar) {
      this.localCar.speed = 0;
      this.localCar.progress = 0;
      this.localCar.targetProgress = 0;
      this.localCar.displayProgress = 0;
      this.localSurfaceCache = { hit: null, progress: -1 };
      this.snapLocalCarToProgress(0);
    }

    this.remoteCars.forEach((remoteCar, playerId) => {
      remoteCar.speed = 0;
      remoteCar.targetProgress = 0;
      remoteCar.displayProgress = 0;
      remoteCar.car.speed = 0;
      remoteCar.car.progress = 0;
      this.remoteSurfaceCaches.set(playerId, { hit: null, progress: -1 });
      this.positionCarOnCircuit(remoteCar.car, 0, remoteCar.laneOffset, false, this.remoteSurfaceCaches.get(playerId));

      // Reset smooth interpolation poses for remote car
      const prevPose = this.remoteCarPreviousPoses.get(playerId) || {};
      prevPose.position = remoteCar.car.group.position.clone();
      prevPose.quaternion = remoteCar.car.group.quaternion.clone();
      this.remoteCarPreviousPoses.set(playerId, prevPose);

      const targetPose = this.remoteCarTargetPoses.get(playerId) || {};
      targetPose.position = remoteCar.car.group.position.clone();
      targetPose.quaternion = remoteCar.car.group.quaternion.clone();
      this.remoteCarTargetPoses.set(playerId, targetPose);
    });
  }

  updatePlayers(players) {
    this.players = Array.isArray(players) ? players : [];

    try {
      if (!this.localCar) {
        return;
      }

      const localPlayerId = this.getLocalPlayerId?.();
      const localPlayer = this.players.find((player) => player.id === localPlayerId) || this.players[0];
      if (!localPlayer) {
        return;
      }

      const nextProgress = this.getPlayerTargetProgress(localPlayer);
      this.localCar.speed = this.getVisualSpeed(localPlayer.speed || 0);

      if (nextProgress < this.localCar.progress && nextProgress < 0.02) {
        this.localCar.displayProgress = nextProgress;
      }

      this.localCar.progress = nextProgress;
      this.localCar.targetProgress = nextProgress;
      this.syncRemoteCars(this.players, localPlayerId);
    } catch (error) {
      console.error('Failed to sync local player state:', error);
    }
  }

  handleResize() {
    try {
      if (!this.renderer || !this.camera || !this.canvas) {
        return;
      }

      const width = this.canvas.clientWidth || window.innerWidth || 1;
      const height = this.canvas.clientHeight || window.innerHeight || 1;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    } catch (error) {
      console.error('Resize handling failed:', error);
    }
  }

  getVisualSpeed(speed = 0) {
    const normalizedSpeed = Number.isFinite(Number(speed)) ? Number(speed) : 0;

    if (!this.raceRunning) {
      return Math.max(0, normalizedSpeed);
    }

    return Math.max(VISUAL_MIN_CRUISE_SPEED, normalizedSpeed);
  }

  getVisualProgressLimit() {
    const maxProgress = this.getMaxVisualProgress();

    if (!this.raceRunning) {
      return maxProgress;
    }

    return Math.max(0, maxProgress - 0.012);
  }

  getCruisingProgressTarget(authoritativeProgress, currentProgress, speed, deltaTime) {
    if (!this.raceRunning) {
      return authoritativeProgress;
    }

    const maxProgress = this.getVisualProgressLimit();
    const visualSpeed = this.getVisualSpeed(speed);
    const step = this.getSpeedProgressStep(visualSpeed, deltaTime);
    const maxLead = Math.max(0.008, this.getSpeedProgressStep(visualSpeed, 0.45));
    const predictedProgress = currentProgress + step;

    return THREE.MathUtils.clamp(
      Math.max(authoritativeProgress, predictedProgress),
      0,
      Math.min(maxProgress, authoritativeProgress + maxLead)
    );
  }

  getPlayerTargetProgress(player) {
    const progressPercent = Number.isFinite(player?.progressExact)
      ? player.progressExact
      : player?.progress || 0;

    const typedProgress = THREE.MathUtils.clamp(progressPercent / 100, 0, 1);
    const maxProgress = this.getMaxVisualProgress();

    if (typedProgress >= 1) {
      return maxProgress;
    }

    const typedLapProgress = typedProgress * maxProgress;
    const visualLimit = this.getVisualProgressLimit();

    return THREE.MathUtils.clamp(typedLapProgress, 0, visualLimit);
  }

  getRemoteLaneOffset(playerId) {
    if (!this.remoteLaneOffsets.has(playerId)) {
      const laneOffset = REMOTE_LANE_OFFSETS[this.nextRemoteLaneIndex % REMOTE_LANE_OFFSETS.length];
      this.remoteLaneOffsets.set(playerId, laneOffset);
      this.nextRemoteLaneIndex += 1;
    }

    return this.remoteLaneOffsets.get(playerId);
  }

  syncRemoteCars(players, localPlayerId) {
    const activeRemoteIds = new Set();

    players.forEach((player) => {
      if (!player?.id || player.id === localPlayerId) {
        return;
      }

      activeRemoteIds.add(player.id);
      let remoteCar = this.remoteCars.get(player.id);

      if (!remoteCar) {
        const color = REMOTE_CAR_COLORS[this.remoteCars.size % REMOTE_CAR_COLORS.length];
        const car = new Car3D(color);
        const label = createPlayerLabel(player.name, color);

        car.group.add(label);
        this.scene.add(car.group);

        remoteCar = {
          car,
          label,
          color,
          name: player.name || 'Pembalap',
          laneOffset: this.getRemoteLaneOffset(player.id),
          targetProgress: 0,
          displayProgress: 0,
          speed: 0,
          lastServerProgress: 0
        };

        this.remoteCars.set(player.id, remoteCar);
        this.remoteSurfaceCaches.set(player.id, { hit: null, progress: -1 });

        this.positionCarOnCircuit(
          car,
          remoteCar.displayProgress,
          remoteCar.laneOffset,
          false,
          this.remoteSurfaceCaches.get(player.id)
        );

        this.remoteCarPreviousPoses.set(player.id, {
          position: car.group.position.clone(),
          quaternion: car.group.quaternion.clone()
        });

        this.remoteCarTargetPoses.set(player.id, {
          position: car.group.position.clone(),
          quaternion: car.group.quaternion.clone()
        });
      }

      const nextProgress = this.getPlayerTargetProgress(player);

      if (nextProgress < remoteCar.targetProgress && nextProgress < 0.02) {
        remoteCar.displayProgress = nextProgress;
      }

      remoteCar.targetProgress = nextProgress;
      remoteCar.lastServerProgress = nextProgress;
      remoteCar.speed = this.getVisualSpeed(player.speed || 0);
      remoteCar.car.speed = remoteCar.speed;
      remoteCar.car.progress = nextProgress;

      if ((player.name || 'Pembalap') !== remoteCar.name) {
        remoteCar.name = player.name || 'Pembalap';
        updatePlayerLabel(remoteCar.label, remoteCar.name, remoteCar.color);
      }
    });

    this.remoteCars.forEach((remoteCar, playerId) => {
      if (activeRemoteIds.has(playerId)) {
        return;
      }

      this.scene.remove(remoteCar.car.group);
      disposePlayerLabel(remoteCar.label);
      this.remoteCars.delete(playerId);
      this.remoteLaneOffsets.delete(playerId);
      this.remoteSurfaceCaches.delete(playerId);
      this.remoteCarPreviousPoses.delete(playerId);
      this.remoteCarTargetPoses.delete(playerId);
    });
  }

  getSurfaceHit(position) {
    if (!this.trackSurfaceMeshes.length) {
      return null;
    }

    const rayOriginY = Number.isFinite(position?.y)
      ? Math.max(SURFACE_RAY_HEIGHT, position.y + SURFACE_RAY_HEIGHT * 0.5)
      : SURFACE_RAY_HEIGHT;

    _surfaceRayOrigin.set(position.x, rayOriginY, position.z);
    this.surfaceRaycaster.far = Math.max(
      SURFACE_RAY_DISTANCE,
      Math.abs(rayOriginY - (Number.isFinite(position?.y) ? position.y : 0)) + SURFACE_RAY_HEIGHT
    );
    this.surfaceRaycaster.set(_surfaceRayOrigin, RAY_DOWN);
    const hits = this.surfaceRaycaster.intersectObjects(this.trackSurfaceMeshes, false);

    if (!hits.length) {
      return null;
    }

    if (!Number.isFinite(position?.y)) {
      return hits[0];
    }

    return hits.reduce((bestHit, hit) => {
      const bestDelta = Math.abs(bestHit.point.y - position.y);
      const nextDelta = Math.abs(hit.point.y - position.y);
      return nextDelta < bestDelta ? hit : bestHit;
    }, hits[0]);
  }

  getSurfaceY(position, fallbackY) {
    const hit = this.getSurfaceHit(position);

    if (hit) {
      return hit.point.y;
    }

    return this.circuitModel
      ? Math.max(fallbackY, MODEL_SURFACE_FALLBACK_Y)
      : fallbackY;
  }

  getNearestRoadSample(point) {
    if (!this.roadSurfaceSamples.length || !point) {
      return null;
    }

    let bestSample = null;
    let bestScore = Infinity;

    for (const sample of this.roadSurfaceSamples) {
      const dx = sample.position.x - point.x;
      const dz = sample.position.z - point.z;
      const dy = sample.position.y - point.y;
      const score = (dx * dx) + (dz * dz) + Math.abs(dy) * 0.4;

      if (score < bestScore) {
        bestScore = score;
        bestSample = sample;
      }
    }

    return bestSample;
  }

  findBestSurfaceHit(point, tangent, right, laneOffset = 0) {
    if (!this.trackSurfaceMeshes.length) {
      return null;
    }

    const lanePoint = point.clone().addScaledVector(right, laneOffset);
    let bestHit = null;
    let bestScore = Infinity;

    for (const forwardOffset of SURFACE_FORWARD_SEARCH_OFFSETS) {
      for (const lateralOffset of SURFACE_LATERAL_SEARCH_OFFSETS) {
        _candidate.copy(point)
          .addScaledVector(tangent, forwardOffset)
          .addScaledVector(right, laneOffset + lateralOffset);
        const hit = this.getSurfaceHit(_candidate);

        if (hit) {
          const dx = hit.point.x - lanePoint.x;
          const dz = hit.point.z - lanePoint.z;
          const dy = hit.point.y - lanePoint.y;
          const score = (dx * dx)
            + (dz * dz)
            + Math.abs(dy) * 0.25
            + Math.abs(forwardOffset) * 0.2
            + Math.abs(lateralOffset) * 0.45;

          if (score < bestScore) {
            bestScore = score;
            bestHit = hit;
          }
        }
      }
    }

    if (!bestHit) {
      return null;
    }

    return {
      point: bestHit.point.clone(),
      normal: getHitWorldNormal(bestHit),
      face: bestHit.face,
      object: bestHit.object
    };
  }

  getTrackPose(progress, laneOffset = 0, cache = null) {
    const sampleProgress = getTrackSampleProgress(progress);

    if (cache && Math.abs(cache.progress - sampleProgress) < SURFACE_CACHE_PROGRESS_EPSILON) {
      const hit = cache.hit;

      if (hit) {
        const surfaceNormal = hit.normal || getHitWorldNormal(hit);
        const position = _sp.copy(hit.point).addScaledVector(surfaceNormal, CAR_SURFACE_CLEARANCE);
        const tangent = this.trackCurve.getTangentAt(sampleProgress).normalize();
        let forward = _fp.copy(tangent).addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal));

        if (forward.lengthSq() < 0.0001) {
          forward.copy(tangent);
        }

        forward.normalize();
        const surfaceRight = _rp.crossVectors(surfaceNormal, forward).normalize();
        forward.crossVectors(surfaceRight, surfaceNormal).normalize();
        const rotationMatrix = _tempMat4.makeBasis(surfaceRight, surfaceNormal, forward);
        const quaternion = _tempQuat.setFromRotationMatrix(rotationMatrix);

        return {
          position: position.clone(),
          tangent: forward.clone(),
          right: surfaceRight.clone(),
          quaternion: quaternion.clone()
        };
      }
    }

    const point = this.trackCurve.getPointAt(sampleProgress);
    const tangent = this.trackCurve.getTangentAt(sampleProgress).normalize();
    const right = _rp.crossVectors(WORLD_UP, tangent).normalize();
    const position = point.clone().addScaledVector(right, laneOffset);
    const surfaceHit = this.findBestSurfaceHit(point, tangent, right, laneOffset);
    const nearestRoadSample = surfaceHit ? null : this.getNearestRoadSample(position);
    let surfaceNormal = surfaceHit
      ? surfaceHit.normal || getHitWorldNormal(surfaceHit)
      : nearestRoadSample?.normal?.clone() || WORLD_UP.clone();

    if (surfaceHit) {
      if (cache) {
        cache.hit = surfaceHit;
        cache.progress = sampleProgress;
      }
      position.copy(surfaceHit.point).addScaledVector(surfaceNormal, CAR_SURFACE_CLEARANCE);
    } else if (nearestRoadSample) {
      position.copy(nearestRoadSample.position).addScaledVector(surfaceNormal, CAR_SURFACE_CLEARANCE);
      if (cache) {
        cache.hit = null;
        cache.progress = sampleProgress;
      }
    } else {
      position.y = this.getSurfaceY(position, point.y) + CAR_SURFACE_CLEARANCE;
      if (cache) {
        cache.hit = null;
        cache.progress = sampleProgress;
      }
    }

    let forward = _fp.copy(tangent).addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal));

    if (forward.lengthSq() < 0.0001) {
      forward.copy(tangent);
    }

    forward.normalize();
    const surfaceRight = _rp.crossVectors(surfaceNormal, forward).normalize();
    forward.crossVectors(surfaceRight, surfaceNormal).normalize();

    const rotationMatrix = _tempMat4.makeBasis(surfaceRight, surfaceNormal, forward);
    const quaternion = _tempQuat.setFromRotationMatrix(rotationMatrix);

    return {
      position: position.clone(),
      tangent: forward.clone(),
      right: surfaceRight.clone(),
      quaternion: quaternion.clone()
    };
  }

  positionCarOnCircuit(car, progress, laneOffset = 0, updatesCameraBasis = false, cache = null) {
    if (!this.trackCurve || !car) {
      return;
    }

    const pose = this.getTrackPose(progress, laneOffset, cache);

    car.group.position.copy(pose.position);
    car.group.quaternion.copy(pose.quaternion);

    if (updatesCameraBasis) {
      this.forwardDirection.copy(pose.tangent);
      this.rightDirection.copy(pose.right);
    }
  }

  positionLocalCarOnCircuit(progress) {
    const sampleProgress = getTrackSampleProgress(progress);
    const pose = this.getTrackPose(progress, 0, this.localSurfaceCache);

    this.localCarTargetPose.position.copy(pose.position);
    this.localCarTargetPose.quaternion.copy(pose.quaternion);
    this.localCarTargetPose.tangent.copy(pose.tangent);
    this.localCarTargetPose.right.copy(pose.right);

    this.forwardDirection.copy(pose.tangent);
    this.rightDirection.copy(pose.right);
    this.localSurfaceCache.progress = sampleProgress;
  }

  snapCameraToLocalCar() {
    if (!this.camera || !this.localCar) {
      return;
    }

    const speedRatio = THREE.MathUtils.clamp((this.localCar.speed || 0) / Math.max(1, this.localCar.maxSpeed || 320), 0, 1);
    const carPosition = this.localCar.group.position;
    const forward = this.forwardDirection.lengthSq() > 0.001
      ? this.forwardDirection
      : _tempForward.set(0, 0, 1);
    const right = this.rightDirection.lengthSq() > 0.001
      ? this.rightDirection
      : _tempRight.set(1, 0, 0);

    this.cameraPositionTarget.copy(carPosition)
      .addScaledVector(right, this.cameraOffset.x)
      .addScaledVector(WORLD_UP, this.cameraOffset.y + speedRatio * 0.35)
      .addScaledVector(forward, this.cameraOffset.z - speedRatio * 1.5);
    this.camera.position.copy(this.cameraPositionTarget);

    this.lookTarget.copy(carPosition)
      .addScaledVector(WORLD_UP, this.cameraLookAhead.y)
      .addScaledVector(forward, this.cameraLookAhead.z + speedRatio * 3.2);
    this.cameraTarget.copy(this.lookTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  snapLocalCarToProgress(progress = 0) {
    if (!this.localCar || !this.trackCurve) {
      return;
    }

    this.positionLocalCarOnCircuit(progress);
    this.localCar.group.position.copy(this.localCarTargetPose.position);
    this.localCar.group.quaternion.copy(this.localCarTargetPose.quaternion);
    this.localCarPreviousPose.position.copy(this.localCar.group.position);
    this.localCarPreviousPose.quaternion.copy(this.localCar.group.quaternion);
    this.localCarTargetPose.position.copy(this.localCar.group.position);
    this.localCarTargetPose.quaternion.copy(this.localCar.group.quaternion);
    this.snapCameraToLocalCar();
  }

  getSpeedProgressStep(speed = 0, deltaTime = 0) {
    if (!this.trackLength || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(deltaTime) || deltaTime <= 0) {
      return 0;
    }

    return (speed * deltaTime * SERVER_DISTANCE_SCALE) / (this.trackLength * VISUAL_LAP_DISTANCE_SCALE);
  }

  getSmoothedProgress(currentProgress, serverProgress, speed, deltaTime, rate) {
    const maxProgress = this.getVisualProgressLimit();
    const current = THREE.MathUtils.clamp(Number.isFinite(currentProgress) ? currentProgress : serverProgress, 0, maxProgress);
    const authoritative = THREE.MathUtils.clamp(Number.isFinite(serverProgress) ? serverProgress : current, 0, maxProgress);

    if (!this.raceRunning) {
      return damp(current, authoritative, rate, deltaTime);
    }

    if (authoritative < current && authoritative < 0.02) {
      return authoritative;
    }

    const next = damp(current, authoritative, rate, deltaTime);

    if (authoritative >= current) {
      return THREE.MathUtils.clamp(next, current, authoritative);
    }

    const maxBackwardStep = Math.max(
      this.getSpeedProgressStep(speed, deltaTime) * 2,
      deltaTime * 0.16
    );
    const minAllowed = Math.max(0, current - maxBackwardStep, authoritative);

    return THREE.MathUtils.clamp(next, minAllowed, current);
  }

  updateCarOnCircuit(deltaTime) {
    try {
      if (!this.localCar || !this.trackCurve) {
        return;
      }

      const targetProgress = THREE.MathUtils.clamp(
        this.localCar.targetProgress ?? this.localCar.progress ?? 0,
        0,
        this.getVisualProgressLimit()
      );
      const currentProgress = Number.isFinite(this.localCar.displayProgress)
        ? this.localCar.displayProgress
        : targetProgress;
      const cruisingTargetProgress = this.getCruisingProgressTarget(
        targetProgress,
        currentProgress,
        this.localCar.speed || 0,
        deltaTime
      );
      const rate = this.raceRunning ? 12 : 7;
      let smoothedProgress = this.getSmoothedProgress(
        currentProgress,
        cruisingTargetProgress,
        this.localCar.speed || 0,
        deltaTime,
        rate
      );

      if (!this.raceRunning && Math.abs(smoothedProgress - targetProgress) < PROGRESS_SNAP_EPSILON) {
        smoothedProgress = targetProgress;
      }

      this.localCar.displayProgress = smoothedProgress;

      this.positionLocalCarOnCircuit(smoothedProgress);

      this.localCarPreviousPose.position.copy(this.localCar.group.position);
      this.localCarPreviousPose.quaternion.copy(this.localCar.group.quaternion);

      const posLerpFactor = 1 - Math.exp(-this.localCarSmoothRates.position * deltaTime);
      this.localCar.group.position.lerp(this.localCarTargetPose.position, posLerpFactor);

      const rotLerpFactor = 1 - Math.exp(-this.localCarSmoothRates.rotation * deltaTime);
      this.localCar.group.quaternion.slerp(this.localCarTargetPose.quaternion, rotLerpFactor);

      this.forwardDirection.copy(this.localCarTargetPose.tangent);
      this.rightDirection.copy(this.localCarTargetPose.right);
    } catch (error) {
      console.error('Circuit car update failed:', error);
    }
  }

  updateRemoteCars(deltaTime) {
    try {
      this.remoteCars.forEach((remoteCar, playerId) => {
        const currentProgress = Number.isFinite(remoteCar.displayProgress)
          ? remoteCar.displayProgress
          : remoteCar.targetProgress;
        const cruisingTargetProgress = this.getCruisingProgressTarget(
          remoteCar.targetProgress,
          currentProgress,
          remoteCar.speed || 0,
          deltaTime
        );

        remoteCar.displayProgress = this.getSmoothedProgress(
          currentProgress,
          cruisingTargetProgress,
          remoteCar.speed || 0,
          deltaTime,
          this.raceRunning ? 10 : 6,
        );

        if (!this.raceRunning && Math.abs(remoteCar.displayProgress - remoteCar.targetProgress) < PROGRESS_SNAP_EPSILON) {
          remoteCar.displayProgress = remoteCar.targetProgress;
        }

        const cache = this.remoteSurfaceCaches.get(playerId);

        const targetPose = this.getTrackPoseForRemote(remoteCar.displayProgress, remoteCar.laneOffset, cache);
        this.remoteCarTargetPoses.set(playerId, targetPose);

        const prevPose = this.remoteCarPreviousPoses.get(playerId) || {};
        prevPose.position = remoteCar.car.group.position.clone();
        prevPose.quaternion = remoteCar.car.group.quaternion.clone();
        this.remoteCarPreviousPoses.set(playerId, prevPose);

        const posLerpFactor = 1 - Math.exp(-9 * deltaTime);
        remoteCar.car.group.position.lerp(targetPose.position, posLerpFactor);

        const rotLerpFactor = 1 - Math.exp(-8 * deltaTime);
        remoteCar.car.group.quaternion.slerp(targetPose.quaternion, rotLerpFactor);

        remoteCar.car.updateVisuals(deltaTime);
      });
    } catch (error) {
      console.error('Remote car update failed:', error);
    }
  }

  // Helper method to get track pose for remote cars
  getTrackPoseForRemote(progress, laneOffset = 0, cache = null) {
    if (!this.trackCurve) {
      return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        tangent: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0)
      };
    }

    const pose = this.getTrackPose(progress, laneOffset, cache);
    return {
      position: pose.position.clone(),
      quaternion: pose.quaternion.clone(),
      tangent: pose.tangent.clone(),
      right: pose.right.clone()
    };
  }

  updateCamera(deltaTime) {
    try {
      if (!this.camera || !this.localCar) {
        return;
      }

      const speedRatio = THREE.MathUtils.clamp((this.localCar.speed || 0) / Math.max(1, this.localCar.maxSpeed || 320), 0, 1);
      const carPosition = this.localCar.group.position;
      const forward = this.forwardDirection.lengthSq() > 0.001
        ? this.forwardDirection
        : _tempForward.set(0, 0, 1);
      const right = this.rightDirection.lengthSq() > 0.001
        ? this.rightDirection
        : _tempRight.set(1, 0, 0);

      this.cameraPositionTarget.copy(carPosition)
        .addScaledVector(right, this.cameraOffset.x)
        .addScaledVector(WORLD_UP, this.cameraOffset.y + speedRatio * 0.35)
        .addScaledVector(forward, this.cameraOffset.z - speedRatio * 1.5);

      const cameraPosLerpFactor = 1 - Math.exp(-deltaTime * this.localCarSmoothRates.camera);
      this.camera.position.lerp(this.cameraPositionTarget, cameraPosLerpFactor);

      const shakeStrength = speedRatio * 0.0012;
      const shakeTime = performance.now() * 0.004;
      this.camera.position.addScaledVector(right, Math.sin(shakeTime * 0.6) * shakeStrength);
      this.camera.position.addScaledVector(WORLD_UP, Math.cos(shakeTime * 0.8) * shakeStrength * 0.2);

      this.lookTarget.copy(carPosition)
        .addScaledVector(WORLD_UP, this.cameraLookAhead.y)
        .addScaledVector(forward, this.cameraLookAhead.z + speedRatio * 3.2);

      const cameraLookLerpFactor = 1 - Math.exp(-deltaTime * 9);
      this.cameraTarget.lerp(this.lookTarget, cameraLookLerpFactor);
      this.camera.lookAt(this.cameraTarget);

      const targetFov = this.baseFov + speedRatio * 7;
      this.camera.fov = damp(this.camera.fov, targetFov, 8, deltaTime);
      this.camera.updateProjectionMatrix();
    } catch (error) {
      console.error('Camera update failed:', error);
    }
  }

  updateSpeedLines() {
    try {
      if (!this.speedLines || !this.localCar || !this.camera) {
        return;
      }

      const speedRatio = THREE.MathUtils.clamp((this.localCar.speed || 0) / Math.max(1, this.localCar.maxSpeed || 320), 0, 1);
      const visible = speedRatio > 0.08;
      this.speedLines.visible = visible;
      this.speedLines.material.opacity = speedRatio * 0.9;

      if (!visible) {
        return;
      }

      const positions = this.speedLines.geometry.attributes.position.array;
      const now = performance.now() * 0.001;
      const ox = this.localCar.group.position.x;
      const oy = this.localCar.group.position.y + 1.05;
      const oz = this.localCar.group.position.z;
      const fx = this.forwardDirection.x;
      const fy = this.forwardDirection.y;
      const fz = this.forwardDirection.z;
      const rx = this.rightDirection.x;
      const ry = this.rightDirection.y;
      const rz = this.rightDirection.z;

      for (let i = 0; i < this.speedLineOffsets.length; i += 1) {
        const offset = this.speedLineOffsets[i];
        const drift = this.speedLineDrift[i];
        const depth = ((now * (18 + speedRatio * 52) * drift) + i * 0.7) % 22;
        const lateral = offset.x + Math.sin(now * drift + i) * 0.15;
        const vertical = offset.y + Math.cos(now * drift * 1.3 + i) * 0.08;
        const lineLength = 1.8 + speedRatio * 4.5;

        const startX = ox + rx * lateral + fx * (-depth - offset.z);
        const startY = oy + ry * lateral + fy * (-depth - offset.z) + vertical;
        const startZ = oz + rz * lateral + fz * (-depth - offset.z);
        const endX = startX + fx * lineLength;
        const endY = startY + fy * lineLength;
        const endZ = startZ + fz * lineLength;
        const index = i * 6;

        positions[index] = startX;
        positions[index + 1] = startY;
        positions[index + 2] = startZ;
        positions[index + 3] = endX;
        positions[index + 4] = endY;
        positions[index + 5] = endZ;
      }

      this.speedLines.geometry.attributes.position.needsUpdate = true;
    } catch (error) {
      console.error('Speed line update failed:', error);
    }
  }

  getTurnSoundAmount() {
    if (!this.trackCurve || !this.localCar || !this.raceRunning) {
      return 0;
    }

    const progress = getTrackSampleProgress(this.localCar.displayProgress || 0);
    const sampleAhead = (progress + 0.012) % 1;
    const currentTangent = this.trackCurve.getTangentAt(progress).normalize();
    const nextTangent = this.trackCurve.getTangentAt(sampleAhead).normalize();
    const angle = currentTangent.angleTo(nextTangent);

    return THREE.MathUtils.clamp(angle / 0.22, 0, 1);
  }

  animate = (timestamp = 0) => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    if (this.lastRenderTime === null) {
      this.lastRenderTime = timestamp;
      return;
    }

    const deltaTime = Math.min(
      Math.max((timestamp - this.lastRenderTime) / 1000, 0),
      this.maxDeltaTime
    );
    this.lastRenderTime = timestamp;

    try {
      this.updateCarOnCircuit(deltaTime);
      this.localCar?.updateVisuals(deltaTime);
      this.updateRemoteCars(deltaTime);
      this.updateCamera(deltaTime);
      this.updateSpeedLines();
      this.sound?.update(
        this.localCar?.speed || 0,
        this.localCar?.maxSpeed || 320,
        this.raceRunning,
        { turnAmount: this.getTurnSoundAmount() }
      );
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      console.error('Render loop failed:', error);
    }
  };
}
