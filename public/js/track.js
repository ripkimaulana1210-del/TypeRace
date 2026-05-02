import * as THREE from 'three';

export const TRACK_MODEL_URL = '/models/track.glb';
export const TRACK_MODEL_Y_OFFSET = 0.95;
export const DRIVE_LINE_Y = 0.08;

const ASPHALT_TEXTURE_URL = '';
const TRACK_WIDTH = 8.2;
const SHOULDER_WIDTH = 10.2;
const RIBBON_SEGMENTS = 240;

function createFallbackAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext('2d');
  context.fillStyle = '#303238';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1800; i += 1) {
    const shade = 45 + Math.floor(Math.random() * 46);
    context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      2,
      2
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 28);
  return texture;
}

function createRoadMaterial() {
  const fallbackTexture = createFallbackAsphaltTexture();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: fallbackTexture,
    roughness: 0.92,
    metalness: 0.03
  });

  const loader = new THREE.TextureLoader();
  if (ASPHALT_TEXTURE_URL) {
    loader.load(
      ASPHALT_TEXTURE_URL,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 28);
        texture.anisotropy = 8;
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  }

  return material;
}

export function createCircuitCurve() {
  const controlPoints = [
    new THREE.Vector3(47.2, DRIVE_LINE_Y, -23.8),
    new THREE.Vector3(47.5, DRIVE_LINE_Y, -10.4),
    new THREE.Vector3(47.2, DRIVE_LINE_Y, 3.4),
    new THREE.Vector3(46.8, DRIVE_LINE_Y, 14.7),
    new THREE.Vector3(43.2, DRIVE_LINE_Y, 23.5),
    new THREE.Vector3(36.2, DRIVE_LINE_Y, 30.4),
    new THREE.Vector3(28.8, DRIVE_LINE_Y, 29.1),
    new THREE.Vector3(21.6, DRIVE_LINE_Y, 27.0),
    new THREE.Vector3(15.4, DRIVE_LINE_Y, 28.1),
    new THREE.Vector3(9.2, DRIVE_LINE_Y, 34.5),
    new THREE.Vector3(1.2, DRIVE_LINE_Y, 40.8),
    new THREE.Vector3(-8.6, DRIVE_LINE_Y, 42.2),
    new THREE.Vector3(-18.8, DRIVE_LINE_Y, 38.4),
    new THREE.Vector3(-24.4, DRIVE_LINE_Y, 30.2),
    new THREE.Vector3(-23.4, DRIVE_LINE_Y, 21.8),
    new THREE.Vector3(-15.6, DRIVE_LINE_Y, 13.0),
    new THREE.Vector3(-20.2, DRIVE_LINE_Y, 7.4),
    new THREE.Vector3(-27.2, DRIVE_LINE_Y, 0.2),
    new THREE.Vector3(-25.6, DRIVE_LINE_Y, -10.4),
    new THREE.Vector3(-19.4, DRIVE_LINE_Y, -18.6),
    new THREE.Vector3(-16.2, DRIVE_LINE_Y, -28.2),
    new THREE.Vector3(-10.2, DRIVE_LINE_Y, -37.4),
    new THREE.Vector3(1.0, DRIVE_LINE_Y, -43.5),
    new THREE.Vector3(12.6, DRIVE_LINE_Y, -43.2),
    new THREE.Vector3(25.5, DRIVE_LINE_Y, -39.9),
    new THREE.Vector3(37.6, DRIVE_LINE_Y, -34.2),
    new THREE.Vector3(46.8, DRIVE_LINE_Y, -26.5)
  ];

  return new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.38);
}

function createRibbonGeometry(curve, width, segments = RIBBON_SEGMENTS, yOffset = 0) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const sample = t >= 1 ? 0 : t;
    const point = curve.getPointAt(sample);
    tangent.copy(curve.getTangentAt(sample)).normalize();
    right.set(tangent.z, 0, -tangent.x).normalize();

    const leftPoint = point.clone().addScaledVector(right, -width * 0.5);
    const rightPoint = point.clone().addScaledVector(right, width * 0.5);
    leftPoint.y += yOffset;
    rightPoint.y += yOffset;

    positions.push(leftPoint.x, leftPoint.y, leftPoint.z);
    positions.push(rightPoint.x, rightPoint.y, rightPoint.z);
    uvs.push(0, t * 28);
    uvs.push(1, t * 28);
  }

  for (let i = 0; i < segments; i += 1) {
    const baseIndex = i * 2;
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createStartGrid(curve) {
  const group = new THREE.Group();
  const startPoint = curve.getPointAt(0);
  const tangent = curve.getTangentAt(0).normalize();
  const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x151515 });
  const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf3f5ef });
  const cellWidth = TRACK_WIDTH / 6;
  const cellDepth = 0.65;
  const cellGeometry = new THREE.BoxGeometry(cellWidth, 0.025, cellDepth);

  group.position.copy(startPoint);
  group.position.y += 0.045;
  group.rotation.y = Math.atan2(tangent.x, tangent.z);

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const material = (row + column) % 2 === 0 ? whiteMaterial : blackMaterial;
      const cell = new THREE.Mesh(cellGeometry, material);
      cell.position.set(
        (column - 2.5) * cellWidth,
        0,
        (row - 0.5) * cellDepth
      );
      group.add(cell);
    }
  }

  return group;
}

export function createTrack() {
  const curve = createCircuitCurve();
  const group = new THREE.Group();
  group.name = 'ProceduralCircuitFallback';

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(92, 96),
    new THREE.MeshStandardMaterial({
      color: 0x173120,
      roughness: 1
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  group.add(ground);

  const shoulder = new THREE.Mesh(
    createRibbonGeometry(curve, SHOULDER_WIDTH, RIBBON_SEGMENTS, -0.025),
    new THREE.MeshStandardMaterial({
      color: 0xd8dde1,
      roughness: 0.82,
      metalness: 0.03
    })
  );
  shoulder.receiveShadow = true;
  group.add(shoulder);

  const road = new THREE.Mesh(
    createRibbonGeometry(curve, TRACK_WIDTH, RIBBON_SEGMENTS, 0),
    createRoadMaterial()
  );
  road.receiveShadow = true;
  group.add(road);

  const centerLine = new THREE.Mesh(
    createRibbonGeometry(curve, 0.22, RIBBON_SEGMENTS, 0.035),
    new THREE.MeshBasicMaterial({
      color: 0xf3f5ef
    })
  );
  centerLine.receiveShadow = false;
  group.add(centerLine);

  group.add(createStartGrid(curve));

  return {
    group,
    curve,
    length: curve.getLength()
  };
}
