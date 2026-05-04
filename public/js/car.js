import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = '/models/Mclaren.glb';
const CAR_MODEL_TARGET_SIZE = 5.85;
const CAR_MODEL_FORWARD_ROTATION_Y = -Math.PI / 2;
const NGROK_REQUEST_HEADERS = {
  'ngrok-skip-browser-warning': 'true'
};

let sharedCarModelPromise = null;

function createFallbackMesh(color) {
  const group = new THREE.Group();
  group.name = 'McLarenFallbackCar';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.42,
    metalness: 0.34
  });
  const carbonMaterial = new THREE.MeshStandardMaterial({
    color: 0x070809,
    roughness: 0.58,
    metalness: 0.38
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.78,
    metalness: 0.08
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb000,
    roughness: 0.5,
    metalness: 0.42
  });

  const addPart = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(position.x, position.y, position.z);

    if (rotation) {
      mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    }

    group.add(mesh);
    return mesh;
  };

  addPart(new THREE.BoxGeometry(0.82, 0.42, 2.55), bodyMaterial, { x: 0, y: 0.52, z: -0.2 });
  addPart(
    new THREE.CylinderGeometry(0.12, 0.36, 1.75, 6),
    bodyMaterial,
    { x: 0, y: 0.48, z: 1.55 },
    { x: Math.PI / 2 }
  );
  addPart(new THREE.BoxGeometry(1.26, 0.34, 1.1), bodyMaterial, { x: 0, y: 0.45, z: -0.7 });
  addPart(new THREE.BoxGeometry(0.24, 0.58, 0.72), carbonMaterial, { x: 0, y: 0.88, z: -0.38 });
  addPart(new THREE.SphereGeometry(0.24, 12, 8), carbonMaterial, { x: 0, y: 0.92, z: 0.08 });

  [-1, 1].forEach((side) => {
    addPart(new THREE.BoxGeometry(0.34, 0.24, 1.18), bodyMaterial, { x: side * 0.58, y: 0.38, z: -0.52 });
    addPart(new THREE.BoxGeometry(0.18, 0.22, 1.02), carbonMaterial, { x: side * 0.42, y: 0.36, z: 0.34 });
  });

  addPart(new THREE.BoxGeometry(2.25, 0.11, 0.42), carbonMaterial, { x: 0, y: 0.28, z: 2.43 });
  addPart(new THREE.BoxGeometry(1.82, 0.11, 0.34), carbonMaterial, { x: 0, y: 0.92, z: -1.95 });
  addPart(new THREE.BoxGeometry(0.12, 0.68, 0.12), carbonMaterial, { x: -0.42, y: 0.66, z: -1.78 });
  addPart(new THREE.BoxGeometry(0.12, 0.68, 0.12), carbonMaterial, { x: 0.42, y: 0.66, z: -1.78 });

  [-1, 1].forEach((side) => {
    [1.18, -1.34].forEach((z) => {
      addPart(
        new THREE.CylinderGeometry(0.35, 0.35, 0.24, 18),
        tireMaterial,
        { x: side * 0.9, y: 0.34, z },
        { z: Math.PI / 2 }
      );
      addPart(
        new THREE.CylinderGeometry(0.17, 0.17, 0.26, 14),
        rimMaterial,
        { x: side * 0.9, y: 0.34, z },
        { z: Math.PI / 2 }
      );
    });
  });

  return group;
}

function cloneCarMaterial(material, color, shouldTint) {
  if (!material) {
    return material;
  }

  const nextMaterial = material.clone();
  nextMaterial.side = THREE.DoubleSide;

  if (shouldTint && nextMaterial.color) {
    nextMaterial.color = new THREE.Color(color);
    nextMaterial.roughness = Math.min(nextMaterial.roughness ?? 0.65, 0.58);
    nextMaterial.metalness = Math.max(nextMaterial.metalness ?? 0.2, 0.35);

    if (nextMaterial.emissive) {
      nextMaterial.emissive = new THREE.Color(0x000000);
      nextMaterial.emissiveIntensity = 0;
    }
  }

  nextMaterial.needsUpdate = true;
  return nextMaterial;
}

function getMaterialSearchText(material) {
  if (Array.isArray(material)) {
    return material.map((entry) => entry?.name || '').join(' ');
  }

  return material?.name || '';
}

function shouldTintCarPart(child) {
  const searchText = `${child.name || ''} ${getMaterialSearchText(child.material)}`;

  if (/tyre|tire|rubber|glass|jante|ecrou|brake|freins|harnais|sabelt|seat|baquet|cockpit|shadow/i.test(searchText)) {
    return false;
  }

  return /body|aventador|mclaren|mp4[_\s-]*27|chassis|nose|front[_\s-]*wing|rear[_\s-]*wing|deflector|fond[_\s-]*plat/i
    .test(searchText);
}

function prepareVisibleMaterials(model, color) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
    const shouldTint = shouldTintCarPart(child);

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => cloneCarMaterial(material, color, shouldTint));
      return;
    }

    if (child.material) {
      child.material = cloneCarMaterial(child.material, color, shouldTint);
    }
  });
}

function fitModelToCarSpace(model) {
  model.rotation.y = CAR_MODEL_FORWARD_ROTATION_Y;

  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = new THREE.Vector3();
  const initialCenter = new THREE.Vector3();
  initialBox.getSize(initialSize);
  initialBox.getCenter(initialCenter);

  const maxAxis = Math.max(initialSize.x || 1, initialSize.y || 1, initialSize.z || 1);
  const targetSize = CAR_MODEL_TARGET_SIZE;
  const uniformScale = targetSize / maxAxis;

  model.scale.setScalar(uniformScale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  model.position.set(-scaledCenter.x, -scaledBox.min.y + 0.11, -scaledCenter.z);
}

function loadSharedCarModel(loader) {
  if (!sharedCarModelPromise) {
    sharedCarModelPromise = new Promise((resolve, reject) => {
      loader.load(
        MODEL_URL,
        (gltf) => {
          if (!gltf.scene) {
            reject(new Error('GLTF scene is missing'));
            return;
          }

          resolve(gltf.scene);
        },
        undefined,
        reject
      );
    }).catch((error) => {
      sharedCarModelPromise = null;
      throw error;
    });
  }

  return sharedCarModelPromise;
}

export class Car3D {
  constructor(color = 0xff5533) {
    this.group = new THREE.Group();
    this.speed = 0;
    this.maxSpeed = 320;
    this.acceleration = 5;
    this.progress = 0;
    this.displayProgress = 0;
    this.color = color;

    this.fallbackMesh = createFallbackMesh(color);
    this.group.add(this.fallbackMesh);

    this.modelRoot = null;
    this.loader = new GLTFLoader();
    this.loader.setRequestHeader(NGROK_REQUEST_HEADERS);

    this.loadModel();
  }

  loadModel() {
    loadSharedCarModel(this.loader)
      .then((sourceModel) => {
        try {
          const model = sourceModel.clone(true);
          prepareVisibleMaterials(model, this.color);
          fitModelToCarSpace(model);

          if (this.fallbackMesh && this.fallbackMesh.parent === this.group) {
            this.group.remove(this.fallbackMesh);
          }

          this.modelRoot = model;
          this.group.add(this.modelRoot);
        } catch (error) {
          console.error('GLB ERROR:', error);
          this.fallbackMesh.visible = true;
        }
      })
      .catch((error) => {
        console.error('GLB ERROR:', error);
        this.fallbackMesh.visible = true;
      });
  }

  updateVisuals(_deltaTime) {
    if (this.modelRoot) {
      this.modelRoot.visible = true;
    }

    if (this.fallbackMesh) {
      this.fallbackMesh.visible = !this.modelRoot;
    }
  }
}
