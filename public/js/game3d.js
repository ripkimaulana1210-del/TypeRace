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
const MODEL_CURVE_BINS = 260;
const MODEL_CURVE_MIN_POINTS = 32;
const MODEL_MAIN_RACE_START_INDEX = 0;
const MODEL_RACE_DECOR_Y_OFFSET = 0.22;
const MODEL_AUTO_ROUTE_GUIDE_SAMPLES = 540;
const MODEL_AUTO_ROUTE_FORK_GATE_INFLUENCE_DISTANCE = 68;
const MODEL_AUTO_ROUTE_MAX_FORK_GATE_DISTANCE = 46;
const MODEL_AUTO_ROUTE_SOFT_FORK_GATE_DISTANCE = 16;
const MODEL_AUTO_ROUTE_MIN_FORK_GATE_COVERAGE = 0.86;
const MODEL_AUTO_ROUTE_MAX_MISSED_FORK_GATES = 1;
const MODEL_AUTO_ROUTE_MAX_FORK_GATE_BACKTRACK = 18;
const MODEL_AUTO_ROUTE_MIN_CONFIDENCE = 0.74;
const MODEL_AUTO_ROUTE_GUIDED_MIN_RAW_CONFIDENCE = 0.38;
const MODEL_AUTO_ROUTE_GUIDED_BLEND_START = 8;
const MODEL_AUTO_ROUTE_GUIDED_BLEND_END = 42;
const MODEL_AUTO_ROUTE_GUIDED_MAX_SHIFT = 0.82;
const MODEL_AUTO_ROUTE_MIN_LENGTH_RATIO = 0.7;
const MODEL_AUTO_ROUTE_MAX_LENGTH_RATIO = 1.35;
const SURFACE_SNAP_MAX_DISTANCE = 18;
const ROUTE_CORRIDOR_RADIUS = 21;
const ROUTE_CORRIDOR_SURFACE_RADIUS = 24;
const MODEL_BLOCKED_ROUTE_SAMPLE_COUNT = 520;
const MODEL_BLOCKED_ROUTE_MAX_SNAP_DISTANCE = 24;
const MODEL_RAW_ROUTE_MAX_SNAP_DISTANCE = 16;
const MODEL_CENTER_SNAP_SEARCH_RADIUS = 18;
const MODEL_CENTER_SNAP_MIN_SAMPLES = 4;
const MODEL_CENTER_SNAP_MAX_VERTICAL_DISTANCE = 5.5;
const MODEL_ROUTE_SAMPLE_VERTICAL_WEIGHT = 8;
const MODEL_OFFICIAL_RACING_LINE_PATTERN = /racing[\s_-]*line|race[\s_-]*line|main[\s_-]*(race|route|path)|route[\s_-]*main/i;
const ROUTE_DEBUG_QUERY_PARAM = 'debugRoute';
const CAMERA_COLLISION_NEAR = 0.8;
const CAMERA_COLLISION_PADDING = 1.35;
const CAMERA_COLLISION_LIFT = 1.9;
const CAMERA_MODE_STORAGE_KEY = 'f1TypingBattle.cameraMode.v2';
const LITE_FRAME_INTERVAL_MS = 1000 / 45;
const CAMERA_MODE_SETTINGS = {
  far: {
    offset: new THREE.Vector3(0, 6.4, -18.4),
    lookAhead: new THREE.Vector3(0, 1.55, 15.5),
    fovBoost: 6.5
  },
  close: {
    offset: new THREE.Vector3(0, 4.6, -10.8),
    lookAhead: new THREE.Vector3(0, 1.35, 10.5),
    fovBoost: 7.5
  },
  hood: {
    offset: new THREE.Vector3(0, 2.25, 1.15),
    lookAhead: new THREE.Vector3(0, 1.05, 18.0),
    fovBoost: 4.5
  },
  cinematic: {
    offset: new THREE.Vector3(5.2, 6.0, -16.0),
    lookAhead: new THREE.Vector3(0, 1.65, 16.5),
    fovBoost: 8.5
  }
};

function getPerformanceProfile() {
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const smallViewport = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 720;
  const lite = Boolean(isCoarsePointer || prefersReducedMotion || lowMemory || smallViewport);

  return {
    lite,
    antialias: !lite,
    shadows: !lite,
    maxPixelRatio: lite ? 1 : 1.35,
    frameIntervalMs: lite ? LITE_FRAME_INTERVAL_MS : 0,
    decorUpdateInterval: lite ? 0.14 : 0,
    speedLineCount: lite ? 12 : 32,
    skybox: !lite,
    trackLifeDecor: !lite
  };
}
const MODEL_ROUTE_BLOCK_ZONES = [
  {
    name: 'right-loop shortcut',
    center: new THREE.Vector3(205, 0, -132),
    radius: 42
  }
];
const MODEL_AUTO_ROUTE_REPAIR_SEGMENTS = [
  {
    rawStart: 0.18,
    rawEnd: 0.42,
    guideStart: 0.26,
    guideEnd: 0.52
  }
];
const MODEL_MANUAL_FORK_GATES = [
  { index: 0 },
  { index: 7, influenceDistance: 92, maxDistance: 40, minBlend: 0.72, strict: true },
  { index: 8, influenceDistance: 92, maxDistance: 40, minBlend: 0.82, strict: true },
  { index: 10, influenceDistance: 90, maxDistance: 38, minBlend: 0.82, strict: true },
  { index: 11, influenceDistance: 90, maxDistance: 38, minBlend: 0.9, strict: true },
  { index: 12, influenceDistance: 82, maxDistance: 40, minBlend: 0.72, strict: true },
  { index: 14, influenceDistance: 62, maxDistance: 28, minBlend: 0.72, strict: true },
  { index: 15, influenceDistance: 62, maxDistance: 28, minBlend: 0.88, strict: true },
  { index: 16, influenceDistance: 62, maxDistance: 28, minBlend: 0.92, strict: true },
  { index: 17, influenceDistance: 66, maxDistance: 28, minBlend: 0.92, strict: true },
  { index: 18, influenceDistance: 62, maxDistance: 28, minBlend: 0.92, strict: true },
  { index: 19, influenceDistance: 62, maxDistance: 28, minBlend: 0.88, strict: true },
  { index: 20, influenceDistance: 58, maxDistance: 30, minBlend: 0.82, strict: true },
  { index: 23 },
  { index: 34 },
  { index: 40 },
  { index: 45 },
  { index: 48 }
];
const MODEL_START_HINTS = [
  new THREE.Vector3(42.6, 0, 155.7),
  new THREE.Vector3(106.0, 0, 155.7),
  new THREE.Vector3(24.8, 0, 149.0),
  new THREE.Vector3(-109.8, 0, 63.1),
  new THREE.Vector3(107.0, 0, -178.8),
  new THREE.Vector3(127.7, 0, 155.1)
];
const MODEL_MAIN_RACE_POINTS = [
  [42.6, 8.1, 155.7],
  [106.0, 11.4, 155.7],
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
  [-10.0, 4.2, 146.0],
  [18.0, 6.2, 152.0]
];
const SERVER_DISTANCE_SCALE = 0.08;
const VISUAL_MIN_CRUISE_SPEED = 38;
const PROGRESS_SNAP_EPSILON = 0.00003;
const FINAL_SECTOR_PROGRESS_START = 0.9;
const FINAL_SECTOR_MIN_LEAD = 0.0025;
const FINAL_APPROACH_TYPED_START = 0.97;
const FINAL_APPROACH_VISUAL_SPAN = 0.16;
const FINAL_APPROACH_EASE_POWER = 2.2;
const FINISH_ROLL_PROGRESS = 0.018;
const SURFACE_CACHE_PROGRESS_EPSILON = 0.000005;
const SURFACE_POSE_CACHE_PROGRESS_EPSILON = 0.00075;
const SURFACE_POSE_SMOOTH_PROGRESS_WINDOW = 0.012;
const SURFACE_HEIGHT_SMOOTHING = 0.36;
const SURFACE_NORMAL_SMOOTHING = 0.28;
const SURFACE_MAX_SMOOTH_VERTICAL_STEP = 3.2;
const SURFACE_LATERAL_SEARCH_OFFSETS = [0];
const SURFACE_FORWARD_SEARCH_OFFSETS = [0];
const REMOTE_LANE_OFFSETS = [0.2, -0.2, 0.3, -0.3, 0.38, -0.38];

const REMOTE_CAR_COLORS = [
  0x2f80ed,
  0xf2c94c,
  0x27ae60,
  0xbb6bd9,
  0xeb5757,
  0x56ccf2
];
const SKYBOX_URLS = [];
const CAR_MARKER_Y = 3.15;
const SUPPORT_CREW_CLUSTERS = [
  {
    name: 'PitCrewStartBoxA',
    origin: [132.8, 10.25, 181.0],
    facing: Math.PI,
    teamColor: 0xeb5757,
    accentColor: 0xffffff
  },
  {
    name: 'PitCrewStartBoxB',
    origin: [160.4, 10.25, 180.8],
    facing: Math.PI,
    teamColor: 0x2f80ed,
    accentColor: 0xf2c94c
  },
  {
    name: 'SupportCrewBackBoxA',
    origin: [94.0, 4.85, -139.0],
    facing: 0,
    teamColor: 0x27ae60,
    accentColor: 0xffffff
  },
  {
    name: 'SupportCrewBackBoxB',
    origin: [120.4, 4.85, -139.2],
    facing: 0,
    teamColor: 0xff8f32,
    accentColor: 0x111827
  }
];
const MARSHAL_POSTS = [
  {
    name: 'FinishMarshal',
    position: [118.4, 9.5, 171.6],
    facing: Math.PI,
    flag: 'checkered'
  },
  {
    name: 'LakeTurnMarshal',
    position: [214.8, 5.8, 82.5],
    facing: -1.35,
    flag: 'green'
  },
  {
    name: 'HairpinMarshal',
    position: [236.2, 5.3, -76.5],
    facing: -2.35,
    flag: 'yellow'
  },
  {
    name: 'BackStraightMarshal',
    position: [91.0, 8.7, -170.5],
    facing: 0.08,
    flag: 'green'
  },
  {
    name: 'WestStandMarshal',
    position: [-119.8, 7.5, 61.5],
    facing: 1.15,
    flag: 'yellow'
  },
  {
    name: 'FinalSectorMarshal',
    position: [-22.6, 4.1, 139.0],
    facing: 2.9,
    flag: 'green'
  }
];
const TRACKSIDE_BRAND_SIGNS = [
  {
    name: 'MainStraightBrand',
    label: 'TYPE RACE GP',
    subLabel: 'PIT WALL',
    position: [111, 10.4, 169.4],
    facing: Math.PI,
    width: 16,
    height: 2.8
  },
  {
    name: 'DrsZoneBrand',
    label: 'DRS ZONE',
    subLabel: 'KEEP TYPING',
    position: [224, 6.6, 89],
    facing: -1.48,
    width: 12,
    height: 2.35,
    accent: 0x19e68c
  },
  {
    name: 'FinalSectorBrand',
    label: 'FINAL SECTOR',
    subLabel: 'PUSH NOW',
    position: [-31, 3.8, 133],
    facing: 2.82,
    width: 12.5,
    height: 2.35,
    accent: 0xffcc22
  },
  {
    name: 'BackStraightBrand',
    label: 'TYPE RACE',
    subLabel: 'CARBON SPEED',
    position: [104, 8.5, -170],
    facing: 0.03,
    width: 14,
    height: 2.55,
    accent: 0x39a8ff
  }
];
const FINISH_CEREMONY_PARTICLE_COUNT = 190;
const FINISH_CEREMONY_DURATION = 7.2;
const FINISH_CEREMONY_COLORS = [
  0xff4b32,
  0xffb23f,
  0x42e88d,
  0x58c7ff,
  0xf5f7f2
];

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
const _centerSnapPoint = new THREE.Vector3();
const _cameraRayOrigin = new THREE.Vector3();
const _cameraRayDirection = new THREE.Vector3();
const _cameraResolvedPosition = new THREE.Vector3();

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

function getBlockedRouteZone(point) {
  return MODEL_ROUTE_BLOCK_ZONES.find((zone) => (
    horizontalDistanceSquared(point, zone.center) <= zone.radius * zone.radius
  )) || null;
}

function countBlockedRoutePoints(points) {
  return points.reduce((count, point) => (
    getBlockedRouteZone(point) ? count + 1 : count
  ), 0);
}

function isRouteDebugEnabled() {
  try {
    return new URLSearchParams(window.location.search).has(ROUTE_DEBUG_QUERY_PARAM);
  } catch (_error) {
    return false;
  }
}

function getLoopProgressDistance(a = 0, b = 0) {
  const distance = Math.abs(getTrackSampleProgress(a) - getTrackSampleProgress(b));
  return Math.min(distance, 1 - distance);
}

function getStoredCameraMode() {
  try {
    const storedMode = window.localStorage.getItem(CAMERA_MODE_STORAGE_KEY);
    return CAMERA_MODE_SETTINGS[storedMode] ? storedMode : 'close';
  } catch (_error) {
    return 'close';
  }
}

const MODEL_START_FORWARD_HINT = new THREE.Vector3(106.0, 0, 155.7);

function ensureGeneratedRouteDirection(points) {
  if (!Array.isArray(points) || points.length < MODEL_CURVE_MIN_POINTS) {
    return points;
  }

  const rotated = rotatePointsToStartHint(points);
  const start = rotated[0];
  const next = rotated[1];
  const previous = rotated[rotated.length - 1];

  if (!start || !next || !previous) {
    return rotated;
  }

  const nextScore = horizontalDistanceSquared(next, MODEL_START_FORWARD_HINT);
  const previousScore = horizontalDistanceSquared(previous, MODEL_START_FORWARD_HINT);

  // Pada model Three.js ini, arah UV road mesh kebaca kebalik:
  // dari garis start mobil masuk cabang kiri dulu. Jadi route perlu dibalik
  // supaya dari start mobil bergerak ke kanan menuju jalur utama.
  if (previousScore < nextScore) {
    console.log('Generated route direction reversed to follow main track');
    return [start.clone(), ...rotated.slice(1).reverse().map((point) => point.clone())];
  }

  return rotated;
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
  const points = routePoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));

  const curvePath = new THREE.CurvePath();
  curvePath.name = 'LockedMainRaceRoute';

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    curvePath.add(new THREE.LineCurve3(current, next));
  }

  curvePath.arcLengthDivisions = Math.max(720, points.length * 18);
  curvePath.updateArcLengths();

  return curvePath;
}

function getMainRaceRoutePoints() {
  return MODEL_MAIN_RACE_POINTS
    .slice(MODEL_MAIN_RACE_START_INDEX)
    .concat(MODEL_MAIN_RACE_POINTS.slice(0, MODEL_MAIN_RACE_START_INDEX));
}

function getRouteLength(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  let length = 0;

  for (let index = 0; index < points.length; index += 1) {
    length += points[index].distanceTo(points[(index + 1) % points.length]);
  }

  return length;
}

function createMainRaceGuide() {
  const routePoints = getMainRaceRoutePoints();
  const curve = createClosedRouteCurve(routePoints);
  const samples = [];

  for (let index = 0; index < MODEL_AUTO_ROUTE_GUIDE_SAMPLES; index += 1) {
    samples.push(curve.getPointAt(index / MODEL_AUTO_ROUTE_GUIDE_SAMPLES));
  }

  return {
    curve,
    samples,
    length: curve.getLength()
  };
}

function getNearestPointMatch(point, points) {
  let bestDistanceSq = Infinity;
  let bestIndex = 0;

  points.forEach((sample, index) => {
    const dx = point.x - sample.x;
    const dz = point.z - sample.z;
    const distanceSq = (dx * dx) + (dz * dz);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = index;
    }
  });

  return {
    distance: Math.sqrt(bestDistanceSq),
    index: bestIndex
  };
}

function getNearestGuideMatch(point, guideSamples) {
  return getNearestPointMatch(point, guideSamples);
}

function createManualForkGates() {
  const routePoints = getMainRaceRoutePoints()
    .map(([x, y, z]) => new THREE.Vector3(x, y, z));

  return MODEL_MANUAL_FORK_GATES
    .map((gate, order) => {
      const point = routePoints[gate.index];

      if (!point) {
        return null;
      }

      return {
        id: `fork-${order + 1}`,
        point: point.clone(),
        influenceDistance: gate.influenceDistance || MODEL_AUTO_ROUTE_FORK_GATE_INFLUENCE_DISTANCE,
        maxDistance: gate.maxDistance || MODEL_AUTO_ROUTE_MAX_FORK_GATE_DISTANCE,
        minBlend: gate.minBlend || 0,
        strict: Boolean(gate.strict)
      };
    })
    .filter(Boolean);
}

function getUnwrappedLoopProgress(loopIndex, startLoopIndex, loopSize, previousProgress) {
  let progress = (
    loopIndex - startLoopIndex + loopSize
  ) % loopSize;

  if (
    previousProgress !== null
    && previousProgress > loopSize * 0.72
    && progress < loopSize * 0.28
  ) {
    progress += loopSize;
  }

  return progress;
}

function createGuidedAutoRoutePoints(points) {
  const guide = createMainRaceGuide();
  const forkGates = createManualForkGates();
  const forkGatePoints = forkGates.map((gate) => gate.point);

  return points.map((point) => {
    const gateMatch = getNearestPointMatch(point, forkGatePoints);
    const gate = forkGates[gateMatch.index];

    if (!gate || gateMatch.distance > gate.influenceDistance) {
      return point.clone();
    }

    const guideMatch = getNearestGuideMatch(point, guide.samples);
    const guidePoint = guide.samples[guideMatch.index];
    const gateInfluence = 1 - THREE.MathUtils.clamp(
      gateMatch.distance / gate.influenceDistance,
      0,
      1
    );
    const guideCorrection = THREE.MathUtils.clamp(
      (guideMatch.distance - MODEL_AUTO_ROUTE_GUIDED_BLEND_START)
        / Math.max(MODEL_AUTO_ROUTE_GUIDED_BLEND_END - MODEL_AUTO_ROUTE_GUIDED_BLEND_START, 0.0001),
      0,
      MODEL_AUTO_ROUTE_GUIDED_MAX_SHIFT
    );
    const blend = Math.max(guideCorrection, gate.minBlend) * gateInfluence;

    return point.clone().lerp(guidePoint, blend);
  });
}

function validateGeneratedMainRoute(points) {
  if (!Array.isArray(points) || points.length < MODEL_CURVE_MIN_POINTS) {
    return {
      accepted: false,
      confidence: 0,
      reason: 'not enough generated points'
    };
  }

  const guide = createMainRaceGuide();
  const forkGates = createManualForkGates();
  const softLimit = MODEL_AUTO_ROUTE_SOFT_FORK_GATE_DISTANCE;
  const blockedPointCount = countBlockedRoutePoints(points);
  let coveredGates = 0;
  let missedGates = 0;
  let missedStrictGates = 0;
  let maxRouteProgress = 0;
  let maxBacktrack = 0;
  let distanceScore = 0;
  let startRouteIndex = null;
  let previousRouteProgress = null;
  let maxGateDistance = 0;

  for (const gate of forkGates) {
    const routeMatch = getNearestPointMatch(gate.point, points);
    const distance = routeMatch.distance;
    const hardLimit = gate.maxDistance;
    maxGateDistance = Math.max(maxGateDistance, distance);

    if (startRouteIndex === null) {
      startRouteIndex = routeMatch.index;
    }

    const routeProgress = getUnwrappedLoopProgress(
      routeMatch.index,
      startRouteIndex,
      points.length,
      previousRouteProgress
    );
    const backtrack = maxRouteProgress - routeProgress;

    if (backtrack > 0) {
      maxBacktrack = Math.max(maxBacktrack, backtrack);
    } else {
      maxRouteProgress = routeProgress;
    }
    previousRouteProgress = routeProgress;

    if (distance <= hardLimit) {
      coveredGates += 1;
    } else {
      missedGates += 1;

      if (gate.strict) {
        missedStrictGates += 1;
      }
    }

    distanceScore += THREE.MathUtils.clamp(
      (hardLimit - distance) / Math.max(hardLimit - softLimit, 0.0001),
      0,
      1
    );
  }

  const gateCoverage = coveredGates / forkGates.length;
  const routeLength = getRouteLength(points);
  const lengthRatio = routeLength / Math.max(guide.length, 0.0001);
  const lengthScore = THREE.MathUtils.clamp(
    1 - Math.abs(1 - lengthRatio) / 0.35,
    0,
    1
  );
  const gateScore = distanceScore / forkGates.length;
  const progressScore = 1 - THREE.MathUtils.clamp(
    maxBacktrack / MODEL_AUTO_ROUTE_MAX_FORK_GATE_BACKTRACK,
    0,
    1
  );
  const confidence = (gateCoverage * 0.48)
    + (gateScore * 0.3)
    + (lengthScore * 0.14)
    + (progressScore * 0.08);

  if (blockedPointCount > 0) {
    return {
      accepted: false,
      confidence,
      reason: `blocked side route samples ${blockedPointCount}`
    };
  }

  if (gateCoverage < MODEL_AUTO_ROUTE_MIN_FORK_GATE_COVERAGE) {
    return {
      accepted: false,
      confidence,
      reason: `fork gate coverage ${Math.round(gateCoverage * 100)}%`
    };
  }

  if (missedGates > MODEL_AUTO_ROUTE_MAX_MISSED_FORK_GATES) {
    return {
      accepted: false,
      confidence,
      reason: `missed fork gates ${missedGates}`
    };
  }

  if (missedStrictGates > 0) {
    return {
      accepted: false,
      confidence,
      reason: `missed strict fork gates ${missedStrictGates}`
    };
  }

  if (
    lengthRatio < MODEL_AUTO_ROUTE_MIN_LENGTH_RATIO
    || lengthRatio > MODEL_AUTO_ROUTE_MAX_LENGTH_RATIO
  ) {
    return {
      accepted: false,
      confidence,
      reason: `length ratio ${lengthRatio.toFixed(2)}`
    };
  }

  if (maxBacktrack > MODEL_AUTO_ROUTE_MAX_FORK_GATE_BACKTRACK) {
    return {
      accepted: false,
      confidence,
      reason: `fork gate backtrack ${maxBacktrack}`
    };
  }

  if (confidence < MODEL_AUTO_ROUTE_MIN_CONFIDENCE) {
    return {
      accepted: false,
      confidence,
      reason: `confidence ${Math.round(confidence * 100)}%`
    };
  }

  return {
    accepted: true,
    confidence,
    reason: `validated against ${forkGates.length} fork gates`,
    forkGateCount: forkGates.length,
    maxForkGateDistance: maxGateDistance
  };
}

function createMainRaceTrackCurve() {
  const routePoints = getMainRaceRoutePoints();
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

function seededUnit(index, salt = 0) {
  const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makeSupportMaterial(color, roughness = 0.68) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04
  });
}

function createSupportCrewMember(materials, suitMaterial, accentMaterial, position, rotationY, poseIndex) {
  const member = new THREE.Group();
  member.name = 'SupportCrewMember';
  member.position.set(position.x, position.y, position.z);
  member.rotation.y = rotationY;

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8),
    suitMaterial
  );
  torso.position.y = 0.65;
  torso.castShadow = true;
  member.add(torso);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    accentMaterial
  );
  helmet.position.y = 1.22;
  helmet.castShadow = true;
  member.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.09, 0.04),
    materials.dark
  );
  visor.position.set(0, 1.24, -0.25);
  member.add(visor);

  const armAngle = poseIndex % 2 === 0 ? 0.16 : -0.16;
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.58, 0.12),
      suitMaterial
    );
    arm.position.set(side * 0.36, 0.68, -0.02);
    arm.rotation.z = side * (0.22 + armAngle);
    arm.castShadow = true;
    member.add(arm);

    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.5, 0.14),
      suitMaterial
    );
    leg.position.set(side * 0.14, 0.17, 0.02);
    leg.rotation.z = side * 0.06;
    leg.castShadow = true;
    member.add(leg);
  });

  return member;
}

function addSupportToolCart(clusterGroup, materials, x, z, accentMaterial) {
  const cart = new THREE.Group();
  cart.name = 'SupportToolCart';
  cart.position.set(x, 0.18, z);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 0.72), materials.cart);
  base.position.y = 0.26;
  base.castShadow = true;
  cart.add(base);

  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.52), accentMaterial);
  tray.position.y = 0.62;
  tray.castShadow = true;
  cart.add(tray);

  [-0.45, 0.45].forEach((wheelX) => {
    [-0.31, 0.31].forEach((wheelZ) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), materials.dark);
      wheel.position.set(wheelX, 0.08, wheelZ);
      wheel.rotation.z = Math.PI / 2;
      cart.add(wheel);
    });
  });

  clusterGroup.add(cart);
}

function addPitBoard(clusterGroup, materials, x, z, accentMaterial, facing) {
  const board = new THREE.Group();
  board.name = 'SupportPitBoard';
  board.position.set(x, 0, z);
  board.rotation.y = facing;

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.08), materials.dark);
  pole.position.y = 0.72;
  pole.castShadow = true;
  board.add(pole);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.58, 0.08), accentMaterial);
  panel.position.y = 1.38;
  panel.castShadow = true;
  board.add(panel);

  clusterGroup.add(board);
}

function createCheckeredFlagMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const columns = 6;
  const rows = 4;
  const tileWidth = canvas.width / columns;
  const tileHeight = canvas.height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? '#f5f7f2' : '#111312';
      context.fillRect(column * tileWidth, row * tileHeight, tileWidth, tileHeight);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    roughness: 0.62,
    metalness: 0.02
  });
}

function createMarshalFlagMaterial(flagType) {
  if (flagType === 'checkered') {
    return createCheckeredFlagMaterial();
  }

  const color = flagType === 'yellow' ? 0xffd447 : 0x42e88d;

  return new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.02
  });
}

function createMarshalPost(config, materials, dynamicFlags) {
  const post = new THREE.Group();
  post.name = config.name || 'MarshalPost';
  post.position.set(config.position[0], config.position[1], config.position[2]);
  post.rotation.y = config.facing || 0;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.82, 0.18, 12), materials.platform);
  base.position.y = 0.09;
  base.castShadow = true;
  base.receiveShadow = true;
  post.add(base);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.86, 8), materials.marshalSuit);
  body.position.y = 0.62;
  body.castShadow = true;
  post.add(body);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), materials.marshalHelmet);
  helmet.position.y = 1.15;
  helmet.castShadow = true;
  post.add(helmet);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.08), materials.marshalVest);
  vest.position.set(0, 0.76, -0.29);
  vest.castShadow = true;
  post.add(vest);

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.11), materials.marshalSuit);
    arm.position.set(side * 0.34, 0.68, -0.02);
    arm.rotation.z = side * 0.36;
    arm.castShadow = true;
    post.add(arm);

    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.14), materials.marshalSuit);
    leg.position.set(side * 0.13, 0.2, 0.01);
    leg.castShadow = true;
    post.add(leg);
  });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.35, 8), materials.flagPole);
  pole.position.set(0.46, 1.62, -0.08);
  pole.rotation.z = -0.12;
  pole.castShadow = true;
  post.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.76, 5, 1),
    createMarshalFlagMaterial(config.flag)
  );
  flag.name = 'DynamicMarshalFlag';
  flag.position.set(1.08, 2.55, -0.09);
  flag.rotation.y = Math.PI * 0.5;
  flag.userData.baseRotationY = flag.rotation.y;
  flag.userData.baseRotationZ = flag.rotation.z;
  flag.userData.phase = seededUnit(dynamicFlags.length, post.position.x) * Math.PI * 2;
  flag.userData.speed = 1.55 + seededUnit(dynamicFlags.length, post.position.z) * 0.8;
  dynamicFlags.push(flag);
  post.add(flag);

  return post;
}

function createMarshalPosts(materials, dynamicFlags) {
  const group = new THREE.Group();
  group.name = 'MarshalPosts';

  MARSHAL_POSTS.forEach((postConfig) => {
    group.add(createMarshalPost(postConfig, materials, dynamicFlags));
  });

  return group;
}

function createTracksideSignMaterial(label, subLabel, accent = 0xf01818) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  const accentColor = `#${accent.toString(16).padStart(6, '0')}`;

  context.fillStyle = '#07090a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accentColor;
  context.fillRect(0, 0, canvas.width, 16);
  context.fillRect(0, canvas.height - 16, canvas.width * 0.62, 16);

  for (let column = 0; column < 16; column += 1) {
    context.fillStyle = column % 2 === 0 ? '#f5f7f2' : '#111312';
    context.fillRect(canvas.width - 128 + column * 8, canvas.height - 18, 8, 18);
  }

  context.fillStyle = '#f5f7f2';
  context.font = '900 48px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(label || 'TYPE RACE').toUpperCase(), canvas.width / 2, 72);

  context.fillStyle = accentColor;
  context.font = '800 22px Arial, sans-serif';
  context.fillText(String(subLabel || 'GRAND PRIX').toUpperCase(), canvas.width / 2, 116);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.58,
    metalness: 0.08
  });
}

function createTracksideBrandSign(config, materials) {
  const group = new THREE.Group();
  group.name = config.name || 'TracksideBrandSign';
  group.position.set(config.position[0], config.position[1], config.position[2]);
  group.rotation.y = config.facing || 0;

  const width = config.width || 12;
  const height = config.height || 2.4;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.18),
    createTracksideSignMaterial(config.label, config.subLabel, config.accent || 0xf01818)
  );
  panel.position.y = height * 0.72;
  panel.castShadow = true;
  panel.receiveShadow = true;
  group.add(panel);

  [-width * 0.42, width * 0.42].forEach((x) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, height * 1.45, 0.18), materials.flagPole);
    post.position.set(x, height * 0.02, 0.08);
    post.castShadow = true;
    group.add(post);
  });

  return group;
}

function createTracksideBranding(materials) {
  const group = new THREE.Group();
  group.name = 'TracksideBranding';

  TRACKSIDE_BRAND_SIGNS.forEach((signConfig) => {
    group.add(createTracksideBrandSign(signConfig, materials));
  });

  return group;
}

function createSupportCrewCluster(config, materials) {
  const cluster = new THREE.Group();
  cluster.name = config.name;
  cluster.position.set(config.origin[0], config.origin[1], config.origin[2]);
  cluster.rotation.y = config.facing;

  const suitMaterial = makeSupportMaterial(config.teamColor);
  const accentMaterial = makeSupportMaterial(config.accentColor, 0.58);
  const crewOffsets = [
    [-3.6, 0, -1.0],
    [-2.0, 0, 0.9],
    [-0.4, 0, -1.25],
    [1.25, 0, 0.75],
    [2.85, 0, -0.95],
    [4.1, 0, 0.8]
  ];

  crewOffsets.forEach((offset, index) => {
    const member = createSupportCrewMember(
      materials,
      suitMaterial,
      accentMaterial,
      new THREE.Vector3(offset[0], 0, offset[2]),
      (seededUnit(index, config.origin[0]) - 0.5) * 0.55,
      index
    );
    cluster.add(member);
  });

  addSupportToolCart(cluster, materials, -4.8, 1.0, accentMaterial);
  addSupportToolCart(cluster, materials, 3.4, 1.25, accentMaterial);
  addPitBoard(cluster, materials, -5.8, -1.55, accentMaterial, 0);
  addPitBoard(cluster, materials, 5.0, -1.6, accentMaterial, 0);

  return cluster;
}

function createTrackLifeDecor() {
  const group = new THREE.Group();
  group.name = 'TrackLifeDecor';
  group.position.y = TRACK_MODEL_Y_OFFSET;
  group.userData.dynamicFlags = [];

  const materials = {
    dark: makeSupportMaterial(0x111827, 0.62),
    cart: makeSupportMaterial(0x30363d, 0.55),
    platform: makeSupportMaterial(0x30363d, 0.58),
    marshalSuit: makeSupportMaterial(0xff8f32, 0.66),
    marshalHelmet: makeSupportMaterial(0xf5f7f2, 0.54),
    marshalVest: makeSupportMaterial(0xffd447, 0.56),
    flagPole: makeSupportMaterial(0x9aa5a2, 0.45)
  };

  SUPPORT_CREW_CLUSTERS.forEach((clusterConfig) => {
    group.add(createSupportCrewCluster(clusterConfig, materials));
  });

  group.add(createMarshalPosts(materials, group.userData.dynamicFlags));
  group.add(createTracksideBranding(materials));

  return group;
}

function createFinishCeremony(curve) {
  const group = new THREE.Group();
  group.name = 'FinishCeremony';
  group.visible = false;

  if (!curve) {
    return group;
  }

  const basis = getCurveBasis(curve, 0, 2.1);
  const positions = new Float32Array(FINISH_CEREMONY_PARTICLE_COUNT * 3);
  const colors = new Float32Array(FINISH_CEREMONY_PARTICLE_COUNT * 3);
  const origins = [];
  const velocities = [];
  const color = new THREE.Color();

  for (let index = 0; index < FINISH_CEREMONY_PARTICLE_COUNT; index += 1) {
    const lateral = (seededUnit(index, 81) - 0.5) * 31;
    const forward = (seededUnit(index, 82) - 0.5) * 9;
    const height = 2.2 + seededUnit(index, 83) * 8.5;
    const origin = basis.point.clone()
      .addScaledVector(basis.right, lateral)
      .addScaledVector(basis.tangent, forward)
      .addScaledVector(WORLD_UP, height);

    origins.push(origin);
    velocities.push(new THREE.Vector3(
      (seededUnit(index, 84) - 0.5) * 2.3,
      2.4 + seededUnit(index, 85) * 3.1,
      (seededUnit(index, 86) - 0.5) * 2.1
    ));

    positions[index * 3] = origin.x;
    positions[index * 3 + 1] = origin.y;
    positions[index * 3 + 2] = origin.z;

    color.setHex(FINISH_CEREMONY_COLORS[index % FINISH_CEREMONY_COLORS.length]);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const confettiGeometry = new THREE.BufferGeometry();
  confettiGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  confettiGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const confetti = new THREE.Points(
    confettiGeometry,
    new THREE.PointsMaterial({
      size: 0.62,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    })
  );
  confetti.name = 'FinishConfetti';
  confetti.renderOrder = 7;
  confetti.userData.origins = origins;
  confetti.userData.velocities = velocities;
  group.userData.confetti = confetti;
  group.userData.duration = FINISH_CEREMONY_DURATION;
  group.userData.startedAt = 0;
  group.userData.active = false;
  group.add(confetti);

  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(8.2, 0.08, 8, 72),
    new THREE.MeshBasicMaterial({
      color: 0xffb23f,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    })
  );
  glow.name = 'FinishCeremonyGlow';
  glow.position.copy(basis.point).addScaledVector(WORLD_UP, 4.4);
  glow.quaternion.copy(basis.quaternion);
  glow.rotation.x += Math.PI * 0.5;
  glow.renderOrder = 6;
  group.userData.glow = glow;
  group.add(glow);

  return group;
}

function getRouteDebugZoneY(zone) {
  const routePoints = getMainRaceRoutePoints()
    .map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const nearest = getNearestPointMatch(zone.center, routePoints);
  return (routePoints[nearest.index]?.y || 0) + MODEL_RACE_DECOR_Y_OFFSET + 0.65;
}

function createRouteDebugOverlay(curve) {
  const group = new THREE.Group();
  group.name = 'RouteDebugOverlay';
  group.renderOrder = 20;

  const routePositions = [];
  const routeSamples = 720;

  for (let index = 0; index <= routeSamples; index += 1) {
    const sampleProgress = index / routeSamples;
    const point = curve.getPointAt(sampleProgress >= 1 ? 0 : sampleProgress);
    routePositions.push(point.x, point.y + 1.05, point.z);
  }

  const routeGeometry = new THREE.BufferGeometry();
  routeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(routePositions, 3));

  const routeLine = new THREE.Line(
    routeGeometry,
    new THREE.LineBasicMaterial({
      color: 0x00ff70,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    })
  );
  routeLine.name = 'DebugMainRaceLine';
  routeLine.renderOrder = 21;
  group.add(routeLine);

  createManualForkGates().forEach((gate) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(gate.strict ? 1.9 : 1.35, 10, 8),
      new THREE.MeshBasicMaterial({
        color: gate.strict ? 0xffd447 : 0x4fb9ff,
        transparent: true,
        opacity: 0.88,
        depthTest: false
      })
    );
    marker.name = gate.strict ? 'DebugStrictCheckpoint' : 'DebugCheckpoint';
    marker.position.copy(gate.point);
    marker.position.y += 1.25;
    marker.renderOrder = 22;
    group.add(marker);
  });

  MODEL_ROUTE_BLOCK_ZONES.forEach((zone) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(zone.radius * 0.92, zone.radius, 72),
      new THREE.MeshBasicMaterial({
        color: 0xff3d55,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false
      })
    );
    ring.name = `DebugBlockedZone_${zone.name}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zone.center.x, getRouteDebugZoneY(zone), zone.center.z);
    ring.renderOrder = 22;
    group.add(ring);
  });

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

function collectRoadMeshRouteSamples(mesh) {
  const geometry = mesh?.geometry;
  const position = geometry?.attributes?.position;

  if (!position) {
    return [];
  }

  const samples = [];

  for (let index = 0; index < position.count; index += 1) {
    _roadSamplePoint.fromBufferAttribute(position, index);
    mesh.localToWorld(_roadSamplePoint);

    if (!getBlockedRouteZone(_roadSamplePoint)) {
      samples.push(_roadSamplePoint.clone());
    }
  }

  return samples;
}

function getNearestRouteSampleMatch(point, samples) {
  let bestDistanceSq = Infinity;
  let bestSample = null;

  samples.forEach((sample) => {
    const dx = point.x - sample.x;
    const dz = point.z - sample.z;
    const dy = point.y - sample.y;
    const distanceSq = (dx * dx)
      + (dz * dz)
      + (dy * dy * MODEL_ROUTE_SAMPLE_VERTICAL_WEIGHT);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestSample = sample;
    }
  });

  return {
    distance: Math.sqrt(bestDistanceSq),
    sample: bestSample
  };
}

function getCenteredRouteSampleMatch(point, samples) {
  const radiusSq = MODEL_CENTER_SNAP_SEARCH_RADIUS * MODEL_CENTER_SNAP_SEARCH_RADIUS;
  let candidateCount = 0;
  let totalWeight = 0;

  _centerSnapPoint.set(0, 0, 0);

  samples.forEach((sample) => {
    const dx = point.x - sample.x;
    const dz = point.z - sample.z;
    const dy = Math.abs(point.y - sample.y);
    const distanceSq = (dx * dx) + (dz * dz);

    if (distanceSq > radiusSq || dy > MODEL_CENTER_SNAP_MAX_VERTICAL_DISTANCE) {
      return;
    }

    const weight = 1 / (1 + distanceSq * 0.025 + dy * 0.45);
    _centerSnapPoint.addScaledVector(sample, weight);
    totalWeight += weight;
    candidateCount += 1;
  });

  if (candidateCount >= MODEL_CENTER_SNAP_MIN_SAMPLES && totalWeight > 0) {
    const centeredSample = _centerSnapPoint.clone().divideScalar(totalWeight);

    return {
      distance: horizontalDistance(point, centeredSample),
      sample: centeredSample,
      centered: true,
      sampleCount: candidateCount
    };
  }

  return getNearestRouteSampleMatch(point, samples);
}

function buildCurveResult(routePoints, validation, extras = {}) {
  const curve = new THREE.CatmullRomCurve3(routePoints, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = Math.max(1800, routePoints.length * 14);
  curve.updateArcLengths();

  return {
    curve,
    length: curve.getLength(),
    confidence: validation.confidence,
    forkGateCount: validation.forkGateCount,
    maxForkGateDistance: validation.maxForkGateDistance,
    ...extras
  };
}

function buildRaceRouteFromNamedObject(routeObject) {
  const geometry = routeObject?.geometry;
  const position = geometry?.attributes?.position;

  if (!position || position.count < MODEL_CURVE_MIN_POINTS) {
    return null;
  }

  let points = [];

  for (let index = 0; index < position.count; index += 1) {
    _modelCurvePoint.fromBufferAttribute(position, index);
    routeObject.localToWorld(_modelCurvePoint);

    if (!getBlockedRouteZone(_modelCurvePoint)) {
      const previous = points[points.length - 1];

      if (!previous || horizontalDistance(previous, _modelCurvePoint) > 0.5) {
        points.push(_modelCurvePoint.clone());
      }
    }
  }

  if (points.length < MODEL_CURVE_MIN_POINTS) {
    return null;
  }

  if (points[0].distanceTo(points[points.length - 1]) < 4) {
    points = points.slice(0, -1);
  }

  points = rotatePointsToStartHint(points);
  points = ensureGeneratedRouteDirection(points);
  const validation = validateGeneratedMainRoute(points);

  if (!validation.accepted) {
    console.warn(`Official racing line rejected for ${routeObject.name || 'route object'}: ${validation.reason}`);
    return null;
  }

  return buildCurveResult(points, validation, {
    official: true,
    guided: true
  });
}

function buildOfficialRaceRouteFromModel(model) {
  let officialRoute = null;

  model?.traverse?.((child) => {
    if (
      officialRoute
      || !MODEL_OFFICIAL_RACING_LINE_PATTERN.test(child.name || '')
      || !child.geometry?.attributes?.position
    ) {
      return;
    }

    officialRoute = buildRaceRouteFromNamedObject(child);
  });

  return officialRoute;
}

function getRepairSegmentForProgress(progress) {
  return MODEL_AUTO_ROUTE_REPAIR_SEGMENTS.find((segment) => (
    progress >= segment.rawStart
    && progress <= segment.rawEnd
  )) || null;
}

function getRepairedGuideProgress(progress, segment) {
  const segmentProgress = THREE.MathUtils.clamp(
    (progress - segment.rawStart) / Math.max(segment.rawEnd - segment.rawStart, 0.0001),
    0,
    1
  );

  return THREE.MathUtils.lerp(segment.guideStart, segment.guideEnd, segmentProgress);
}

function createRawRouteCurve(rawRoutePoints) {
  if (!Array.isArray(rawRoutePoints) || rawRoutePoints.length < MODEL_CURVE_MIN_POINTS) {
    return null;
  }

  const curve = new THREE.CatmullRomCurve3(rawRoutePoints, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = Math.max(1800, rawRoutePoints.length * 14);
  curve.updateArcLengths();
  return curve;
}

function buildBlockedAutoMainRoute(mesh, rawRoutePoints = null) {
  const surfaceSamples = collectRoadMeshRouteSamples(mesh);

  if (surfaceSamples.length < MODEL_CURVE_MIN_POINTS) {
    return null;
  }

  const guide = createMainRaceGuide();
  const rawCurve = createRawRouteCurve(rawRoutePoints);
  const routePoints = [];
  let snappedSamples = 0;
  let maxSnapDistance = 0;

  for (let index = 0; index < MODEL_BLOCKED_ROUTE_SAMPLE_COUNT; index += 1) {
    const progress = index / MODEL_BLOCKED_ROUTE_SAMPLE_COUNT;
    const repairSegment = getRepairSegmentForProgress(progress);
    const sourcePoint = repairSegment
      ? guide.curve.getPointAt(getRepairedGuideProgress(progress, repairSegment))
      : rawCurve
        ? rawCurve.getPointAt(progress)
        : guide.curve.getPointAt(progress);
    const match = getCenteredRouteSampleMatch(sourcePoint, surfaceSamples);
    const maxAllowedSnapDistance = repairSegment || !rawCurve
      ? MODEL_BLOCKED_ROUTE_MAX_SNAP_DISTANCE
      : MODEL_RAW_ROUTE_MAX_SNAP_DISTANCE;

    if (match.sample && match.distance <= maxAllowedSnapDistance) {
      routePoints.push(match.sample.clone());
      snappedSamples += 1;
      maxSnapDistance = Math.max(maxSnapDistance, match.distance);
    } else {
      routePoints.push(sourcePoint.clone());
    }
  }

  const smoothedPoints = smoothClosedPoints(smoothClosedPoints(routePoints));
  const validation = validateGeneratedMainRoute(smoothedPoints);

  if (!validation.accepted) {
    console.warn(`Blocked auto route rejected: ${validation.reason}`);
    return null;
  }

  return buildCurveResult(smoothedPoints, validation, {
    constrained: true,
    checkpointed: true,
    guided: true,
    snapCoverage: snappedSamples / MODEL_BLOCKED_ROUTE_SAMPLE_COUNT,
    maxSnapDistance
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

  points = smoothClosedPoints(smoothClosedPoints(points));
  points = rotatePointsToStartHint(points);
  points = ensureGeneratedRouteDirection(points);
  points = removeRouteKinks(points);
  points = rotatePointsToStartHint(smoothClosedPoints(points));
  points = ensureGeneratedRouteDirection(points);

  let routePoints = points;
  let validation = validateGeneratedMainRoute(routePoints);
  let wasGuided = false;

  if (
    validation.accepted
    || validation.confidence >= MODEL_AUTO_ROUTE_GUIDED_MIN_RAW_CONFIDENCE
  ) {
    const guidedPoints = createGuidedAutoRoutePoints(points);
    const guidedValidation = validateGeneratedMainRoute(guidedPoints);

    if (
      guidedValidation.accepted
      && (
        !validation.accepted
        || guidedValidation.confidence > validation.confidence + 0.015
      )
    ) {
      routePoints = guidedPoints;
      validation = guidedValidation;
      wasGuided = true;
    }
  }

  if (!validation.accepted) {
    console.warn(
      `Generated route rejected for ${mesh.name || mesh.parent?.name || 'road mesh'}: ${validation.reason}`
    );
    return buildBlockedAutoMainRoute(mesh, points);
  }

  return buildCurveResult(routePoints, validation, {
    guided: wasGuided
  });
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

function createCarVisibilityMarker(color, isLocal = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const accent = colorToCss(color);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.strokeStyle = '#f5f7f2';
  context.lineWidth = isLocal ? 8 : 6;
  context.beginPath();
  context.moveTo(64, 18);
  context.lineTo(106, 72);
  context.lineTo(80, 72);
  context.lineTo(80, 108);
  context.lineTo(48, 108);
  context.lineTo(48, 72);
  context.lineTo(22, 72);
  context.closePath();
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(5, 8, 9, 0.86)';
  context.fillRect(50, 72, 28, 25);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  }));

  sprite.name = isLocal ? 'LocalCarVisibilityMarker' : 'RemoteCarVisibilityMarker';
  sprite.position.set(0, CAR_MARKER_Y, 0);
  sprite.scale.set(isLocal ? 1.42 : 1.16, isLocal ? 1.42 : 1.16, 1);
  sprite.renderOrder = isLocal ? 13 : 12;
  return sprite;
}

function disposePlayerLabel(sprite) {
  if (!sprite) {
    return;
  }

  sprite.material?.map?.dispose();
  sprite.material?.dispose();
}

function getRaceRouteSourceLabel(generatedRoadTrack) {
  if (!generatedRoadTrack) {
    return 'Race route source: manual fallback points';
  }

  if (generatedRoadTrack.official) {
    return `Race route source: official GLB racing line (${Math.round(generatedRoadTrack.confidence * 100)}% confidence, ${generatedRoadTrack.forkGateCount} checkpoints)`;
  }

  if (generatedRoadTrack.constrained) {
    return `Race route source: checkpointed blocked auto GLB main loop (${Math.round(generatedRoadTrack.confidence * 100)}% confidence, ${Math.round((generatedRoadTrack.snapCoverage || 0) * 100)}% center snaps)`;
  }

  return `Race route source: ${generatedRoadTrack.guided ? 'fork-guided ' : ''}validated GLB main loop (${Math.round(generatedRoadTrack.confidence * 100)}% confidence, ${generatedRoadTrack.forkGateCount} fork gates)`;
}

function getRaceRouteTelemetry(generatedRoadTrack, curve) {
  const source = generatedRoadTrack?.official
    ? 'official'
    : generatedRoadTrack?.constrained
      ? 'checkpointed'
      : generatedRoadTrack
        ? 'validated'
        : 'manual';

  const samples = [];
  const sampleCount = 180;
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  if (curve) {
    for (let index = 0; index < sampleCount; index += 1) {
      const point = curve.getPointAt(index / sampleCount);
      samples.push({ x: point.x, z: point.z });
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    bounds.minX = -1;
    bounds.maxX = 1;
    bounds.minZ = -1;
    bounds.maxZ = 1;
  }

  return {
    source,
    confidence: generatedRoadTrack?.confidence || 0,
    forkGateCount: generatedRoadTrack?.forkGateCount || createManualForkGates().length,
    snapCoverage: generatedRoadTrack?.snapCoverage || 0,
    maxSnapDistance: generatedRoadTrack?.maxSnapDistance || 0,
    official: Boolean(generatedRoadTrack?.official),
    constrained: Boolean(generatedRoadTrack?.constrained),
    blockedZoneCount: MODEL_ROUTE_BLOCK_ZONES.length,
    blockedZones: MODEL_ROUTE_BLOCK_ZONES.map((zone) => ({
      x: zone.center.x,
      z: zone.center.z,
      radius: zone.radius
    })),
    samples,
    bounds
  };
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
    this.performanceProfile = getPerformanceProfile();
    this.baseFov = 54;
    this.cameraOffset = new THREE.Vector3(0, 5.2, -13.2);
    this.cameraLookAhead = new THREE.Vector3(0, 1.35, 12.5);
    this.cameraMode = getStoredCameraMode();
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
    this.routeLockedForRace = false;
    this.mainRaceDecor = null;
    this.trackLifeDecor = null;
    this.finishCeremonyGroup = null;
    this.finishReplayUntil = 0;
    this.routeDebugGroup = null;
    this.routeDebugEnabled = isRouteDebugEnabled();
    this.routeTelemetry = getRaceRouteTelemetry(null, null);
    this.routeGuardCorrections = 0;
    this.lastCameraCollision = false;
    this.trackSurfaceMeshes = [];
    this.roadSurfaceSamples = [];
    this.surfaceRaycaster = new THREE.Raycaster(
      new THREE.Vector3(),
      RAY_DOWN,
      0,
      SURFACE_RAY_DISTANCE
    );
    this.cameraCollisionRaycaster = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
      CAMERA_COLLISION_NEAR,
      100
    );
    this.surfaceCandidate = new THREE.Vector3();
    this.remoteCars = new Map();
    this.remoteLaneOffsets = new Map();
    this.nextRemoteLaneIndex = 0;
    this.localCarVisibilityMarker = null;

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
      position: 11,
      rotation: 8.5,
      camera: 7.5
    };

    // Remote cars smooth interpolation
    this.remoteCarPreviousPoses = new Map();
    this.remoteCarTargetPoses = new Map();

    this.maxDeltaTime = 1 / 30;
    this.lastRenderTime = null;
    this.decorUpdateAccumulator = 0;
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
        antialias: this.performanceProfile.antialias,
        powerPreference: this.performanceProfile.lite ? 'default' : 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.performanceProfile.maxPixelRatio));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = this.performanceProfile.shadows;
      if (this.performanceProfile.shadows) {
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

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
      directionalLight.castShadow = this.performanceProfile.shadows;
      if (this.performanceProfile.shadows) {
        directionalLight.shadow.mapSize.set(1024, 1024);
        directionalLight.shadow.camera.near = 1;
        directionalLight.shadow.camera.far = 130;
        directionalLight.shadow.camera.left = -85;
        directionalLight.shadow.camera.right = 85;
        directionalLight.shadow.camera.top = 85;
        directionalLight.shadow.camera.bottom = -85;
      }
      this.scene.add(directionalLight);
    } catch (error) {
      console.error('Failed to add lights:', error);
    }
  }

  loadSkybox() {
    try {
      this.scene.background = new THREE.Color(0x6fa8dc);

      if (!SKYBOX_URLS.length || !this.performanceProfile.skybox) {
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
      this.routeTelemetry = getRaceRouteTelemetry(null, this.trackCurve);
      this.circuitFallback = this.track.group;
      this.scene.add(this.circuitFallback);
      this.setRouteDebugOverlay(this.trackCurve);
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
    this.setFinishCeremony(curve);
  }

  setTrackLifeDecor() {
    if (this.trackLifeDecor) {
      this.scene.remove(this.trackLifeDecor);
      disposeObject3D(this.trackLifeDecor);
      this.trackLifeDecor = null;
    }

    if (!this.scene || !this.circuitModel || !this.performanceProfile.trackLifeDecor) {
      return;
    }

    this.trackLifeDecor = createTrackLifeDecor();
    this.scene.add(this.trackLifeDecor);
  }

  setFinishCeremony(curve) {
    if (this.finishCeremonyGroup) {
      this.scene.remove(this.finishCeremonyGroup);
      disposeObject3D(this.finishCeremonyGroup);
      this.finishCeremonyGroup = null;
    }

    if (!this.scene || !curve) {
      return;
    }

    this.finishCeremonyGroup = createFinishCeremony(curve);
    this.scene.add(this.finishCeremonyGroup);
  }

  setRouteDebugOverlay(curve) {
    if (this.routeDebugGroup) {
      this.scene.remove(this.routeDebugGroup);
      disposeObject3D(this.routeDebugGroup);
      this.routeDebugGroup = null;
    }

    if (!this.routeDebugEnabled || !this.scene || !curve) {
      return;
    }

    this.routeDebugGroup = createRouteDebugOverlay(curve);
    this.scene.add(this.routeDebugGroup);
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

            if (this.routeLockedForRace) {
              disposeObject3D(model);
              this.completeTrackLoad({
                success: false,
                deferred: true,
                reason: 'race-route-locked'
              });
              return;
            }

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
            const generatedRoadTrack = buildOfficialRaceRouteFromModel(model)
              || buildCurveFromTrackSurfaceMeshes(this.trackSurfaceMeshes);
            const modelTrack = generatedRoadTrack || createMainRaceTrackCurve();

            console.log(getRaceRouteSourceLabel(generatedRoadTrack));

            if (modelTrack) {
              this.trackCurve = modelTrack.curve;
              this.trackLength = modelTrack.length;
              this.routeTelemetry = getRaceRouteTelemetry(generatedRoadTrack, modelTrack.curve);
              this.setMainRaceDecor(modelTrack.curve);
              this.setTrackLifeDecor();
              this.setRouteDebugOverlay(modelTrack.curve);
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
      this.localCar.finished = false;
      this.localCarVisibilityMarker = createCarVisibilityMarker(0xff5533, true);
      this.localCar.group.add(this.localCarVisibilityMarker);
      this.scene.add(this.localCar.group);
      this.snapLocalCarToProgress(0);
    } catch (error) {
      console.error('Failed to add car:', error);
    }
  }

  addSpeedLines() {
    try {
      const lineCount = this.performanceProfile.speedLineCount;
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

  getFinishedVisualProgress() {
    return this.getMaxVisualProgress() + FINISH_ROLL_PROGRESS;
  }

  getFinalApproachVisualProgress(typedProgress) {
    const maxProgress = this.getMaxVisualProgress();
    const baseProgress = typedProgress * maxProgress;

    if (typedProgress < FINAL_APPROACH_TYPED_START) {
      return baseProgress;
    }

    const finalAmount = THREE.MathUtils.clamp(
      (typedProgress - FINAL_APPROACH_TYPED_START)
        / Math.max(1 - FINAL_APPROACH_TYPED_START, 0.0001),
      0,
      1
    );
    const easedAmount = 1 - Math.pow(1 - finalAmount, FINAL_APPROACH_EASE_POWER);
    const approachStart = Math.max(0, maxProgress - FINAL_APPROACH_VISUAL_SPAN);

    return Math.max(
      baseProgress,
      THREE.MathUtils.lerp(approachStart, maxProgress, easedAmount)
    );
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
    this.routeLockedForRace = true;
    this.startTime = startTime;
    this.sound?.setLobbyMusicActive(false);
    this.sound?.startEngineLoop();
    this.resetFinishCeremony();

    if (this.localCar) {
      this.localCar.speed = Math.max(this.localCar.speed || 0, VISUAL_MIN_CRUISE_SPEED);
      this.localCar.progress = 0;
      this.localCar.targetProgress = 0;
      this.localCar.displayProgress = 0;
      this.localCar.finished = false;
      this.localSurfaceCache = { hit: null, progress: -1 };
      this.snapLocalCarToProgress(0);
    }

    this.remoteCars.forEach((remoteCar, playerId) => {
      remoteCar.speed = Math.max(remoteCar.speed || 0, VISUAL_MIN_CRUISE_SPEED);
      remoteCar.targetProgress = 0;
      remoteCar.displayProgress = 0;
      remoteCar.lastServerProgress = 0;
      remoteCar.finished = false;
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
    this.routeLockedForRace = false;
  }

  setRacePaused(paused) {
    this.raceRunning = !paused;
  }

  async resumeAudio() {
    await this.sound?.unlock();
  }

  setLobbyMusicActive(active) {
    this.sound?.setLobbyMusicActive(active);
  }

  async setResultsMusicActive(active) {
    await this.sound?.setResultsMusicActive(active);
  }

  setAudioVolumes(volumes = {}) {
    if (Number.isFinite(Number(volumes.bgm))) {
      this.sound?.setBgmVolume(Number(volumes.bgm));
    }

    if (Number.isFinite(Number(volumes.sfx))) {
      this.sound?.setSfxVolume(Number(volumes.sfx));
    }
  }

  playCountdownTick(count) {
    this.sound?.playCountdownTick(count);
  }

  getCameraMode() {
    return this.cameraMode;
  }

  setCameraMode(mode) {
    if (!CAMERA_MODE_SETTINGS[mode]) {
      return this.cameraMode;
    }

    this.cameraMode = mode;

    try {
      window.localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
    } catch (_error) {}

    if (this.localCar) {
      this.snapCameraToLocalCar();
    }

    return this.cameraMode;
  }

  getCameraSettings() {
    return CAMERA_MODE_SETTINGS[this.cameraMode] || CAMERA_MODE_SETTINGS.far;
  }

  getFinalSectorCameraAmount() {
    if (performance.now() < (this.finishReplayUntil || 0)) {
      return 1;
    }

    const progress = this.localCar?.displayProgress || this.localCar?.progress || 0;
    const maxProgress = Math.max(this.getMaxVisualProgress(), 0.0001);

    return THREE.MathUtils.clamp(
      ((progress / maxProgress) - 0.86) / 0.14,
      0,
      1
    );
  }

  getRouteTelemetry() {
    return {
      ...this.routeTelemetry,
      progress: getTrackSampleProgress(this.localCar?.displayProgress || this.localCar?.progress || 0),
      cameraMode: this.cameraMode,
      guardCorrections: this.routeGuardCorrections,
      cameraCollision: this.lastCameraCollision
    };
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
    this.triggerFinishCeremony();
  }

  playRaceEvent(type) {
    if (type === 'drs') {
      this.sound?.playDrs?.();
      return;
    }

    if (type === 'grip_loss') {
      this.sound?.playGripLoss?.();
      return;
    }

    if (type === 'final_push') {
      this.sound?.playFinalPush?.();
      return;
    }

    if (type === 'finish') {
      this.playFinish();
    }
  }

  startFinishReplay(durationMs = 1800) {
    this.finishReplayUntil = performance.now() + durationMs;
    this.triggerFinishCeremony();
  }

  triggerFinishCeremony() {
    if (!this.finishCeremonyGroup) {
      return;
    }

    const now = performance.now() * 0.001;
    const confetti = this.finishCeremonyGroup.userData.confetti;

    if (confetti) {
      const positions = confetti.geometry.attributes.position.array;
      const origins = confetti.userData.origins || [];

      origins.forEach((origin, index) => {
        positions[index * 3] = origin.x;
        positions[index * 3 + 1] = origin.y;
        positions[index * 3 + 2] = origin.z;
      });

      confetti.geometry.attributes.position.needsUpdate = true;
      confetti.material.opacity = 0.95;
    }

    this.finishCeremonyGroup.visible = true;
    this.finishCeremonyGroup.userData.active = true;
    this.finishCeremonyGroup.userData.startedAt = now;
  }

  resetFinishCeremony() {
    if (!this.finishCeremonyGroup) {
      return;
    }

    this.finishCeremonyGroup.visible = false;
    this.finishCeremonyGroup.userData.active = false;
  }

  prepareRaceGrid() {
    this.raceRunning = false;
    this.routeLockedForRace = true;
    this.resetFinishCeremony();

    if (this.localCar) {
      this.localCar.speed = 0;
      this.localCar.progress = 0;
      this.localCar.targetProgress = 0;
      this.localCar.displayProgress = 0;
      this.localCar.finished = false;
      this.localSurfaceCache = { hit: null, progress: -1 };
      this.snapLocalCarToProgress(0);
    }

    this.remoteCars.forEach((remoteCar, playerId) => {
      remoteCar.speed = 0;
      remoteCar.targetProgress = 0;
      remoteCar.displayProgress = 0;
      remoteCar.finished = false;
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

      this.localCar.finished = this.isPlayerFinished(localPlayer);
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
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.performanceProfile.maxPixelRatio));
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

  isPlayerFinished(player) {
    return Boolean(
      player?.finished
      || player?.finishedAt
      || Number(player?.progress) >= 100
      || Number(player?.progressExact) >= 100
    );
  }

  getVisualProgressLimit(allowFinish = false) {
    const maxProgress = this.getMaxVisualProgress();

    if (allowFinish) {
      return this.getFinishedVisualProgress();
    }

    if (!this.raceRunning) {
      return maxProgress;
    }

    return Math.max(0, maxProgress - 0.012);
  }

  getCruisingProgressTarget(authoritativeProgress, currentProgress, speed, deltaTime, allowFinish = false) {
    if (!this.raceRunning) {
      return authoritativeProgress;
    }

    const maxProgress = this.getVisualProgressLimit(allowFinish);
    const visualSpeed = this.getVisualSpeed(speed);
    const step = this.getSpeedProgressStep(visualSpeed, deltaTime);
    const baseMaxLead = Math.max(0.008, this.getSpeedProgressStep(visualSpeed, 0.45));
    const finalSectorAmount = THREE.MathUtils.clamp(
      ((authoritativeProgress / Math.max(maxProgress, 0.0001)) - FINAL_SECTOR_PROGRESS_START)
        / (1 - FINAL_SECTOR_PROGRESS_START),
      0,
      1
    );
    const maxLead = THREE.MathUtils.lerp(baseMaxLead, FINAL_SECTOR_MIN_LEAD, finalSectorAmount);
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

    if (this.isPlayerFinished(player) || typedProgress >= 1) {
      return this.getFinishedVisualProgress();
    }

    const typedLapProgress = this.getFinalApproachVisualProgress(typedProgress);
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
        const marker = createCarVisibilityMarker(color, false);

        car.group.add(marker);
        car.group.add(label);
        this.scene.add(car.group);

        remoteCar = {
          car,
          label,
          marker,
          color,
          name: player.name || 'Pembalap',
          laneOffset: this.getRemoteLaneOffset(player.id),
          targetProgress: 0,
          displayProgress: 0,
          speed: 0,
          finished: false,
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
      remoteCar.finished = this.isPlayerFinished(player);
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
      disposePlayerLabel(remoteCar.marker);
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

  getRouteCorridorCenter(sampleProgress = 0) {
    const samples = this.routeTelemetry?.samples || [];

    if (!samples.length) {
      return null;
    }

    const index = Math.min(samples.length - 1, Math.floor(getTrackSampleProgress(sampleProgress) * samples.length));
    return samples[index] || null;
  }

  clampPointToRouteCorridor(point, sampleProgress = 0, radius = ROUTE_CORRIDOR_RADIUS) {
    const center = this.getRouteCorridorCenter(sampleProgress);

    if (!center || !point) {
      return false;
    }

    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const distance = Math.hypot(dx, dz);

    if (distance <= radius || distance < 0.0001) {
      return false;
    }

    const scale = radius / distance;
    point.x = center.x + dx * scale;
    point.z = center.z + dz * scale;
    this.routeGuardCorrections += 1;
    return true;
  }

  getNearestRoadSample(point, sampleProgress = null) {
    if (!this.roadSurfaceSamples.length || !point) {
      return null;
    }

    let bestSample = null;
    let bestScore = Infinity;
    const corridorCenter = sampleProgress === null
      ? null
      : this.getRouteCorridorCenter(sampleProgress);

    for (const sample of this.roadSurfaceSamples) {
      if (corridorCenter) {
        const corridorDistance = Math.hypot(
          sample.position.x - corridorCenter.x,
          sample.position.z - corridorCenter.z
        );

        if (corridorDistance > ROUTE_CORRIDOR_SURFACE_RADIUS) {
          continue;
        }
      }

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
    const safeLaneOffset = THREE.MathUtils.clamp(Number(laneOffset) || 0, -0.32, 0.32);
  
    const centerPoint = this.trackCurve.getPointAt(sampleProgress).clone();
    const rawTangent = this.trackCurve.getTangentAt(sampleProgress).clone();
  
    let flatTangent = _fp.copy(rawTangent).projectOnPlane(WORLD_UP);
  
    if (flatTangent.lengthSq() < 0.0001) {
      flatTangent.copy(rawTangent);
    }
  
    if (flatTangent.lengthSq() < 0.0001) {
      flatTangent.set(0, 0, 1);
    }
  
    flatTangent.normalize();
  
    let right = _rp.crossVectors(WORLD_UP, flatTangent).normalize();
  
    if (right.lengthSq() < 0.0001) {
      right.set(1, 0, 0);
    }
  
    const position = centerPoint.clone().addScaledVector(right, safeLaneOffset);

    if (getBlockedRouteZone(position) && this.routeTelemetry?.samples?.length) {
      const routeSamples = this.routeTelemetry.samples;
      const routeSample = routeSamples[
        Math.min(routeSamples.length - 1, Math.floor(sampleProgress * routeSamples.length))
      ];

      if (routeSample) {
        position.x = routeSample.x;
        position.z = routeSample.z;
        this.routeGuardCorrections += 1;
      }
    }

    this.clampPointToRouteCorridor(position, sampleProgress);

    const cachedSurface = cache?.surface || null;
    const hasReusableSurface = Boolean(
      cachedSurface
      && getLoopProgressDistance(sampleProgress, cachedSurface.progress) <= SURFACE_POSE_CACHE_PROGRESS_EPSILON
    );
    let surfaceHit = hasReusableSurface ? null : this.getSurfaceHit(position);
    let snappedSurfaceSample = null;
    let detectedSurfaceY = Number.isFinite(cachedSurface?.y) ? cachedSurface.y : centerPoint.y;
    let detectedSurfaceNormal = cachedSurface?.normal?.clone() || WORLD_UP.clone();
  
    if (!hasReusableSurface && !surfaceHit) {
      const nearestSample = this.getNearestRoadSample(position, sampleProgress);

      if (nearestSample) {
        const dx = nearestSample.position.x - position.x;
        const dz = nearestSample.position.z - position.z;
        const horizontalDistance = Math.hypot(dx, dz);

        if (horizontalDistance <= SURFACE_SNAP_MAX_DISTANCE) {
          position.copy(nearestSample.position);
          this.clampPointToRouteCorridor(position, sampleProgress, ROUTE_CORRIDOR_RADIUS);
          snappedSurfaceSample = nearestSample;
          detectedSurfaceNormal = nearestSample.normal?.clone() || WORLD_UP.clone();
          surfaceHit = this.getSurfaceHit(position);
          this.routeGuardCorrections += 1;
        }
      }
    }
  
    if (hasReusableSurface) {
      detectedSurfaceY = cachedSurface.y;
      detectedSurfaceNormal = cachedSurface.normal?.clone() || WORLD_UP.clone();
    } else if (surfaceHit) {
      detectedSurfaceNormal = getHitWorldNormal(surfaceHit);
  
      if (!detectedSurfaceNormal || detectedSurfaceNormal.lengthSq() < 0.0001) {
        detectedSurfaceNormal = WORLD_UP.clone();
      }
  
      detectedSurfaceNormal.normalize();
      detectedSurfaceY = surfaceHit.point.y;
    } else if (snappedSurfaceSample) {
      detectedSurfaceNormal.normalize();
      detectedSurfaceY = snappedSurfaceSample.position.y;
    } else {
      detectedSurfaceNormal.normalize();
      detectedSurfaceY = centerPoint.y;
    }

    let surfaceY = detectedSurfaceY;
    let surfaceNormal = detectedSurfaceNormal.clone().normalize();

    if (cache && !hasReusableSurface) {
      const canSmoothSurface = Boolean(
        cachedSurface
        && getLoopProgressDistance(sampleProgress, cachedSurface.progress) <= SURFACE_POSE_SMOOTH_PROGRESS_WINDOW
        && Math.abs(detectedSurfaceY - cachedSurface.y) <= SURFACE_MAX_SMOOTH_VERTICAL_STEP
      );

      if (canSmoothSurface) {
        surfaceY = THREE.MathUtils.lerp(cachedSurface.y, detectedSurfaceY, SURFACE_HEIGHT_SMOOTHING);
        surfaceNormal = cachedSurface.normal
          .clone()
          .lerp(detectedSurfaceNormal, SURFACE_NORMAL_SMOOTHING)
          .normalize();
      }

      cache.surface = {
        y: surfaceY,
        normal: surfaceNormal.clone(),
        progress: sampleProgress
      };
    }

    position.y = surfaceY + CAR_SURFACE_CLEARANCE;
  
    let forward = _tempForward.copy(flatTangent).addScaledVector(
      surfaceNormal,
      -flatTangent.dot(surfaceNormal)
    );
  
    if (forward.lengthSq() < 0.0001) {
      forward.copy(flatTangent);
    }
  
    forward.normalize();
  
    let surfaceRight = _tempRight.crossVectors(surfaceNormal, forward).normalize();
  
    if (surfaceRight.lengthSq() < 0.0001) {
      surfaceRight.copy(right);
    }
  
    forward.crossVectors(surfaceRight, surfaceNormal).normalize();
  
    const rotationMatrix = _tempMat4.makeBasis(surfaceRight, surfaceNormal, forward);
    const quaternion = _tempQuat.setFromRotationMatrix(rotationMatrix);
  
    if (cache) {
      cache.hit = null;
      cache.progress = sampleProgress;
    }
  
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

  resolveCameraPosition(carPosition, desiredPosition) {
    this.lastCameraCollision = false;

    if (!this.circuitModel || !this.cameraCollisionRaycaster) {
      return desiredPosition;
    }

    _cameraRayOrigin.copy(carPosition).addScaledVector(WORLD_UP, 1.35);
    _cameraRayDirection.copy(desiredPosition).sub(_cameraRayOrigin);
    const distance = _cameraRayDirection.length();

    if (distance <= CAMERA_COLLISION_NEAR + CAMERA_COLLISION_PADDING) {
      return desiredPosition;
    }

    _cameraRayDirection.divideScalar(distance);
    this.cameraCollisionRaycaster.near = CAMERA_COLLISION_NEAR;
    this.cameraCollisionRaycaster.far = distance;
    this.cameraCollisionRaycaster.set(_cameraRayOrigin, _cameraRayDirection);

    const hit = this.cameraCollisionRaycaster
      .intersectObject(this.circuitModel, true)
      .find((candidate) => (
        candidate.distance > CAMERA_COLLISION_NEAR
        && !isTrackSurfaceMesh(candidate.object)
      ));

    if (!hit) {
      return desiredPosition;
    }

    this.lastCameraCollision = true;
    _cameraResolvedPosition.copy(hit.point)
      .addScaledVector(_cameraRayDirection, -CAMERA_COLLISION_PADDING)
      .addScaledVector(WORLD_UP, CAMERA_COLLISION_LIFT);

    return _cameraResolvedPosition;
  }

  snapCameraToLocalCar() {
    if (!this.camera || !this.localCar) {
      return;
    }

    const speedRatio = THREE.MathUtils.clamp((this.localCar.speed || 0) / Math.max(1, this.localCar.maxSpeed || 320), 0, 1);
    const carPosition = this.localCar.group.position;
    const cameraSettings = this.getCameraSettings();
    const finalSectorAmount = this.getFinalSectorCameraAmount();
    const forward = this.forwardDirection.lengthSq() > 0.001
      ? this.forwardDirection
      : _tempForward.set(0, 0, 1);
    const right = this.rightDirection.lengthSq() > 0.001
      ? this.rightDirection
      : _tempRight.set(1, 0, 0);

    this.cameraPositionTarget.copy(carPosition)
      .addScaledVector(right, cameraSettings.offset.x)
      .addScaledVector(WORLD_UP, cameraSettings.offset.y + speedRatio * 0.35 + finalSectorAmount * 1.25)
      .addScaledVector(forward, cameraSettings.offset.z - speedRatio * 1.5 - finalSectorAmount * 2.2);
    this.cameraPositionTarget.copy(this.resolveCameraPosition(carPosition, this.cameraPositionTarget));
    this.camera.position.copy(this.cameraPositionTarget);

    this.lookTarget.copy(carPosition)
      .addScaledVector(WORLD_UP, cameraSettings.lookAhead.y + finalSectorAmount * 0.7)
      .addScaledVector(forward, cameraSettings.lookAhead.z + speedRatio * 3.2 + finalSectorAmount * 3.4);
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

  getSmoothedProgress(currentProgress, serverProgress, speed, deltaTime, rate, allowFinish = false) {
    const maxProgress = this.getVisualProgressLimit(allowFinish);
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

      const allowFinish = Boolean(this.localCar.finished);
      const targetProgress = THREE.MathUtils.clamp(
        this.localCar.targetProgress ?? this.localCar.progress ?? 0,
        0,
        this.getVisualProgressLimit(allowFinish)
      );
      const currentProgress = Number.isFinite(this.localCar.displayProgress)
        ? this.localCar.displayProgress
        : targetProgress;
      const cruisingTargetProgress = this.getCruisingProgressTarget(
        targetProgress,
        currentProgress,
        this.localCar.speed || 0,
        deltaTime,
        allowFinish
      );
      const rate = this.raceRunning ? 12 : 7;
      let smoothedProgress = this.getSmoothedProgress(
        currentProgress,
        cruisingTargetProgress,
        this.localCar.speed || 0,
        deltaTime,
        rate,
        allowFinish
      );

      if ((!this.raceRunning || allowFinish) && Math.abs(smoothedProgress - targetProgress) < PROGRESS_SNAP_EPSILON) {
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
        const allowFinish = Boolean(remoteCar.finished);
        const currentProgress = Number.isFinite(remoteCar.displayProgress)
          ? remoteCar.displayProgress
          : remoteCar.targetProgress;
        const cruisingTargetProgress = this.getCruisingProgressTarget(
          remoteCar.targetProgress,
          currentProgress,
          remoteCar.speed || 0,
          deltaTime,
          allowFinish
        );

        remoteCar.displayProgress = this.getSmoothedProgress(
          currentProgress,
          cruisingTargetProgress,
          remoteCar.speed || 0,
          deltaTime,
          this.raceRunning ? 10 : 6,
          allowFinish
        );

        if ((!this.raceRunning || allowFinish) && Math.abs(remoteCar.displayProgress - remoteCar.targetProgress) < PROGRESS_SNAP_EPSILON) {
          remoteCar.displayProgress = remoteCar.targetProgress;
        }

        const cache = this.remoteSurfaceCaches.get(playerId);

        const targetPose = this.getTrackPoseForRemote(remoteCar.displayProgress, remoteCar.laneOffset, cache);
        this.remoteCarTargetPoses.set(playerId, targetPose);

        const prevPose = this.remoteCarPreviousPoses.get(playerId) || {};
        prevPose.position = remoteCar.car.group.position.clone();
        prevPose.quaternion = remoteCar.car.group.quaternion.clone();
        this.remoteCarPreviousPoses.set(playerId, prevPose);

        const posLerpFactor = 1 - Math.exp(-7.5 * deltaTime);
        remoteCar.car.group.position.lerp(targetPose.position, posLerpFactor);

        const rotLerpFactor = 1 - Math.exp(-6.5 * deltaTime);
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
      const cameraSettings = this.getCameraSettings();
      const finalSectorAmount = this.getFinalSectorCameraAmount();
      const forward = this.forwardDirection.lengthSq() > 0.001
        ? this.forwardDirection
        : _tempForward.set(0, 0, 1);
      const right = this.rightDirection.lengthSq() > 0.001
        ? this.rightDirection
        : _tempRight.set(1, 0, 0);

      this.cameraPositionTarget.copy(carPosition)
        .addScaledVector(right, cameraSettings.offset.x)
        .addScaledVector(WORLD_UP, cameraSettings.offset.y + speedRatio * 0.35 + finalSectorAmount * 1.25)
        .addScaledVector(forward, cameraSettings.offset.z - speedRatio * 1.5 - finalSectorAmount * 2.2);
      this.cameraPositionTarget.copy(this.resolveCameraPosition(carPosition, this.cameraPositionTarget));

      const cameraPosLerpFactor = 1 - Math.exp(-deltaTime * this.localCarSmoothRates.camera);
      this.camera.position.lerp(this.cameraPositionTarget, cameraPosLerpFactor);

      const shakeStrength = speedRatio * 0.0012;
      const shakeTime = performance.now() * 0.004;
      this.camera.position.addScaledVector(right, Math.sin(shakeTime * 0.6) * shakeStrength);
      this.camera.position.addScaledVector(WORLD_UP, Math.cos(shakeTime * 0.8) * shakeStrength * 0.2);

      this.lookTarget.copy(carPosition)
        .addScaledVector(WORLD_UP, cameraSettings.lookAhead.y + finalSectorAmount * 0.7)
        .addScaledVector(forward, cameraSettings.lookAhead.z + speedRatio * 3.2 + finalSectorAmount * 3.4);

      const cameraLookLerpFactor = 1 - Math.exp(-deltaTime * 9);
      this.cameraTarget.lerp(this.lookTarget, cameraLookLerpFactor);
      this.camera.lookAt(this.cameraTarget);

      const targetFov = this.baseFov + speedRatio * cameraSettings.fovBoost + finalSectorAmount * 2.5;
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
      const visible = speedRatio > 0.035;
      this.speedLines.visible = visible;
      this.speedLines.material.opacity = 0.16 + speedRatio * 0.98;

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

  updateTrackLifeDecor(deltaTime) {
    if (!this.trackLifeDecor) {
      return;
    }

    const now = performance.now() * 0.001;
    const windPulse = this.raceRunning ? 1.22 : 0.72;

    (this.trackLifeDecor.userData.dynamicFlags || []).forEach((flag, index) => {
      const phase = flag.userData.phase || 0;
      const speed = flag.userData.speed || 1.6;
      const wave = Math.sin(now * speed * windPulse + phase);
      const flutter = Math.sin(now * (speed * 2.7) + phase * 0.7);

      flag.rotation.y = flag.userData.baseRotationY + wave * 0.18;
      flag.rotation.z = flag.userData.baseRotationZ + flutter * 0.055;
      flag.scale.x = 1 + wave * 0.055;
      flag.position.y = 2.55 + Math.sin(now * 1.1 + index) * 0.025;
    });

  }

  updateFinishCeremony(deltaTime) {
    const group = this.finishCeremonyGroup;

    if (!group?.userData.active) {
      return;
    }

    const now = performance.now() * 0.001;
    const elapsed = now - group.userData.startedAt;
    const duration = group.userData.duration || FINISH_CEREMONY_DURATION;
    const confetti = group.userData.confetti;

    if (elapsed >= duration) {
      group.visible = false;
      group.userData.active = false;
      return;
    }

    if (confetti) {
      const positions = confetti.geometry.attributes.position.array;
      const origins = confetti.userData.origins || [];
      const velocities = confetti.userData.velocities || [];
      const gravity = 3.8;

      origins.forEach((origin, index) => {
        const velocity = velocities[index] || WORLD_UP;
        const localElapsed = Math.max(0, elapsed - seededUnit(index, 91) * 0.7);
        const sway = Math.sin((elapsed * 2.6) + index) * 0.34;

        positions[index * 3] = origin.x + velocity.x * localElapsed + sway;
        positions[index * 3 + 1] = origin.y + velocity.y * localElapsed - gravity * localElapsed * localElapsed;
        positions[index * 3 + 2] = origin.z + velocity.z * localElapsed + Math.cos((elapsed * 2.1) + index) * 0.24;
      });

      confetti.geometry.attributes.position.needsUpdate = true;
      confetti.material.opacity = THREE.MathUtils.clamp((duration - elapsed) / 1.4, 0, 0.95);
    }

    if (group.userData.glow) {
      group.userData.glow.rotation.z += deltaTime * 0.75;
      group.userData.glow.material.opacity = 0.18 + Math.sin(elapsed * 5.2) * 0.08;
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

    if (this.performanceProfile.frameIntervalMs > 0 && timestamp - this.lastRenderTime < this.performanceProfile.frameIntervalMs) {
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
      this.decorUpdateAccumulator += deltaTime;
      if (!this.performanceProfile.lite || this.decorUpdateAccumulator >= this.performanceProfile.decorUpdateInterval) {
        this.updateTrackLifeDecor(this.decorUpdateAccumulator);
        this.decorUpdateAccumulator = 0;
      }
      this.updateFinishCeremony(deltaTime);
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
