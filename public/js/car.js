import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = '/models/f1.glb';
const NGROK_REQUEST_HEADERS = {
  'ngrok-skip-browser-warning': 'true'
};

function createFallbackMesh(color) {
  const geometry = new THREE.BoxGeometry(1.6, 0.8, 3.2);
  const material = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(0, 0.45, 0);
  return mesh;
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
  }

  nextMaterial.needsUpdate = true;
  return nextMaterial;
}

function prepareVisibleMaterials(model, color) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
    const shouldTint = /body|aventador/i.test(child.name || '');

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
  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = new THREE.Vector3();
  const initialCenter = new THREE.Vector3();
  initialBox.getSize(initialSize);
  initialBox.getCenter(initialCenter);

  const maxAxis = Math.max(initialSize.x || 1, initialSize.y || 1, initialSize.z || 1);
  const targetSize = 3.5;
  const uniformScale = targetSize / maxAxis;

  model.scale.setScalar(uniformScale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  model.position.set(-scaledCenter.x, -scaledBox.min.y + 0.11, -scaledCenter.z);
  model.rotation.y = 0;
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
    this.loader.load(
      MODEL_URL,
      (gltf) => {
        try {
          const model = gltf.scene;
          if (!model) {
            throw new Error('GLTF scene is missing');
          }

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
      },
      undefined,
      (error) => {
        console.error('GLB ERROR:', error);
        this.fallbackMesh.visible = true;
      }
    );
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
