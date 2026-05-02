import * as THREE from 'three';

export class ChaseCameraController {
  constructor(camera) {
    this.camera = camera;
    this.offset = new THREE.Vector3(0, 3, -6);
    this.lookAtOffset = new THREE.Vector3(0, 1, 3.2);
    this.targetPosition = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.shakeTime = 0;
  }

  update(carObject, tangent, speed, deltaTime) {
    const forward = tangent.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    this.targetPosition.copy(carObject.position)
      .addScaledVector(right, this.offset.x)
      .addScaledVector(up, this.offset.y)
      .addScaledVector(forward, this.offset.z);

    const zoomOffset = THREE.MathUtils.lerp(0, -4, speed / 320);
    this.targetPosition.addScaledVector(forward, zoomOffset);

    this.camera.position.lerp(this.targetPosition, Math.min(1, deltaTime * 4.8));

    this.lookTarget.copy(carObject.position)
      .addScaledVector(forward, this.lookAtOffset.z)
      .addScaledVector(up, this.lookAtOffset.y);

    this.shakeTime += deltaTime * (1 + speed / 100);
    const shakeAmount = (speed / 320) * 0.08;
    const shakeX = Math.sin(this.shakeTime * 38) * shakeAmount;
    const shakeY = Math.cos(this.shakeTime * 44) * shakeAmount * 0.6;

    this.camera.position.addScaledVector(right, shakeX);
    this.camera.position.addScaledVector(up, shakeY);
    this.camera.lookAt(this.lookTarget);
  }
}
