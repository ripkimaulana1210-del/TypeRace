import * as THREE from 'three';
import { Car3D } from './car.js';

export const LIVERIES = [
  { id: 'mclaren', name: 'McLaren Racing', team: 'Papaya Orange', color: '#ff6600', hexNum: 0xff6600 },
  { id: 'ferrari', name: 'Scuderia Ferrari', team: 'Rosso Corsa', color: '#ef1a2d', hexNum: 0xef1a2d },
  { id: 'mercedes', name: 'Mercedes-AMG', team: 'Silver Arrow Cyan', color: '#00d2be', hexNum: 0x00d2be },
  { id: 'redbull', name: 'Oracle Red Bull', team: 'Midnight Navy', color: '#1e40af', hexNum: 0x1e40af },
  { id: 'aston', name: 'Aston Martin', team: 'British Racing Green', color: '#047857', hexNum: 0x047857 },
  { id: 'alpine', name: 'Alpine Cyber', team: 'Electric Violet', color: '#8b5cf6', hexNum: 0x8b5cf6 }
];

export class MenuGarage {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.car = null;
    this.carPivot = null;
    this.neonRingMaterial = null;
    this.animationFrameId = null;

    // Interaction state
    this.isDragging = false;
    this.prevPointerX = 0;
    this.prevPointerY = 0;
    this.angularVelocity = 0.005;
    this.targetRotationY = 0;
    this.currentRotationY = 0;
    this.lastInteractionTime = 0;
    this.autoRotateSpeed = 0.004;

    this.selectedColor = localStorage.getItem('typerace_car_color') || '#ff6600';
  }

  init(containerId = 'menuGarageContainer') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      return false;
    }

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width || 420, 280);
    const height = Math.max(rect.height || 360, 240);

    // Setup Scene
    this.scene = new THREE.Scene();

    // Setup Camera (high-end studio angle)
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(0, 2.3, 7.8);
    this.camera.lookAt(0, 0.35, 0);

    // Setup Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'garage-canvas';
    this.canvas.setAttribute('aria-label', '3D Car Showcase Viewport');
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    // Setup Lights
    this.setupLighting();

    // Setup Turntable Podium
    this.setupPodium();

    // Setup Car
    this.setupCar();

    // Setup Event Listeners
    this.bindEvents();

    // Start render loop
    this.animate();

    return true;
  }

  setupLighting() {
    // Ambient soft fill
    const ambientLight = new THREE.AmbientLight(0x1a2230, 1.4);
    this.scene.add(ambientLight);

    // Main Key Light (front-top-right)
    const keyLight = new THREE.DirectionalLight(0xfff5eb, 2.8);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Signature F1 Cyan Rim Light (back-left edge highlight)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 3.2);
    rimLight.position.set(-6, 4.5, -5);
    this.scene.add(rimLight);

    // Soft warm secondary fill (low-front)
    const fillLight = new THREE.DirectionalLight(0xffecd2, 1.0);
    fillLight.position.set(0, 1.5, 4.5);
    this.scene.add(fillLight);

    // Overhead subtle spot
    const spotLight = new THREE.SpotLight(0xffffff, 2.0, 15, Math.PI / 4, 0.35, 1);
    spotLight.position.set(0, 6, 0);
    spotLight.target.position.set(0, 0, 0);
    this.scene.add(spotLight);
    this.scene.add(spotLight.target);
  }

  setupPodium() {
    this.carPivot = new THREE.Group();
    this.scene.add(this.carPivot);

    // Turntable Base Disc
    const baseGeo = new THREE.CylinderGeometry(3.3, 3.5, 0.18, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0c1015,
      roughness: 0.38,
      metalness: 0.85
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.09;
    baseMesh.receiveShadow = true;
    this.carPivot.add(baseMesh);

    // Glowing Neon Perimeter Ring
    const ringColor = new THREE.Color(this.selectedColor);
    const ringGeo = new THREE.TorusGeometry(3.38, 0.04, 16, 64);
    this.neonRingMaterial = new THREE.MeshStandardMaterial({
      color: ringColor,
      emissive: ringColor,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.9
    });
    const ringMesh = new THREE.Mesh(ringGeo, this.neonRingMaterial);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.005;
    this.carPivot.add(ringMesh);

    // Inner Concentric Accent Ring (Gold)
    const innerRingGeo = new THREE.TorusGeometry(2.15, 0.02, 16, 64);
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.7
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.rotation.x = Math.PI / 2;
    innerRingMesh.position.y = 0.006;
    this.carPivot.add(innerRingMesh);

    // Grid markings on podium (subtle high-tech radial ticks)
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x223040 });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const tickGeo = new THREE.BoxGeometry(0.24, 0.002, 0.04);
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(Math.cos(angle) * 2.75, 0.005, Math.sin(angle) * 2.75);
      tick.rotation.y = -angle;
      this.carPivot.add(tick);
    }
  }

  setupCar() {
    const hexColor = parseInt(this.selectedColor.replace('#', '0x'), 16) || 0xff6600;
    this.car = new Car3D(hexColor);
    this.car.group.position.set(0, 0.08, 0);
    // Face car slightly towards camera at default angle (45 degrees)
    this.currentRotationY = -0.55;
    this.targetRotationY = -0.55;
    this.carPivot.rotation.y = this.currentRotationY;
    this.carPivot.add(this.car.group);
  }

  setLivery(hexString, triggerEvent = true) {
    this.selectedColor = hexString;
    localStorage.setItem('typerace_car_color', hexString);

    if (this.car) {
      this.car.setColor(hexString);
    }

    if (this.neonRingMaterial) {
      const color = new THREE.Color(hexString);
      this.neonRingMaterial.color = color;
      this.neonRingMaterial.emissive = color;
      this.neonRingMaterial.needsUpdate = true;
    }

    // Update UI Elements
    const activeLivery = LIVERIES.find((l) => l.color.toLowerCase() === hexString.toLowerCase()) || {
      name: 'Custom Team',
      team: 'Custom Livery'
    };

    const teamLabel = document.getElementById('garageTeamLabel');
    if (teamLabel) {
      teamLabel.textContent = activeLivery.name;
    }

    const liveryLabel = document.getElementById('garageLiveryLabel');
    if (liveryLabel) {
      liveryLabel.textContent = activeLivery.team;
    }

    // Update active swatch buttons
    const buttons = document.querySelectorAll('.livery-swatch[data-color]');
    buttons.forEach((btn) => {
      const btnColor = btn.dataset.color?.toLowerCase();
      btn.classList.toggle('active', btnColor === hexString.toLowerCase());
    });

    if (triggerEvent) {
      window.dispatchEvent(new CustomEvent('typerace:liverychange', { detail: { color: hexString } }));
    }
  }

  bindEvents() {
    // Window Resize Observer
    const resizeObserver = new ResizeObserver(() => this.handleResize());
    if (this.container) {
      resizeObserver.observe(this.container);
    }

    // Pointer Drag Interaction
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      window.addEventListener('pointermove', (e) => this.onPointerMove(e));
      window.addEventListener('pointerup', () => this.onPointerUp());
      window.addEventListener('pointercancel', () => this.onPointerUp());
    }

    // Livery Swatches in HTML
    const swatches = document.querySelectorAll('.livery-swatch[data-color]');
    swatches.forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        const color = swatch.dataset.color;
        if (color) {
          this.setLivery(color);
        }
      });
    });

    // Set initial active state for swatch
    this.setLivery(this.selectedColor, false);
  }

  onPointerDown(e) {
    this.isDragging = true;
    this.prevPointerX = e.clientX;
    this.prevPointerY = e.clientY;
    this.angularVelocity = 0;
    this.lastInteractionTime = performance.now();
  }

  onPointerMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.prevPointerX;
    this.prevPointerX = e.clientX;
    this.prevPointerY = e.clientY;

    const dragSensitivity = 0.007;
    this.angularVelocity = deltaX * dragSensitivity;
    this.currentRotationY += this.angularVelocity;
    this.lastInteractionTime = performance.now();
  }

  onPointerUp() {
    this.isDragging = false;
  }

  handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width || 380, 260);
    const height = Math.max(rect.height || 340, 220);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    // ONLY render when screen is 'menu' (or initial loading) to conserve 100% GPU during race
    const currentScreen = document.body.dataset.screen;
    if (currentScreen && currentScreen !== 'menu') {
      return;
    }

    const now = performance.now();

    // Smooth inertia / auto-rotation
    if (!this.isDragging) {
      if (now - this.lastInteractionTime > 1800) {
        // Return to gentle auto-rotate
        this.angularVelocity = THREE.MathUtils.lerp(this.angularVelocity, this.autoRotateSpeed, 0.05);
      } else {
        // Friction damping
        this.angularVelocity *= 0.94;
      }
      this.currentRotationY += this.angularVelocity;
    }

    if (this.carPivot) {
      this.carPivot.rotation.y = this.currentRotationY;
    }

    if (this.car) {
      this.car.updateVisuals(0.016);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
