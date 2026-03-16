import * as THREE from '../three/three.module.js';

export function applyMaterialTuning(root, materialTuning) {
    root.traverse((object) => {
        if (!object.isMesh || !object.material) return;

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
            if ('metalness' in material && typeof material.metalness === 'number') {
                material.metalness = Math.min(material.metalness, materialTuning.maxMetalness);
            }
            if ('roughness' in material && typeof material.roughness === 'number') {
                material.roughness = Math.max(material.roughness, materialTuning.minRoughness);
            }
            material.needsUpdate = true;
        });
    });
}

export function fitObjectToCamera({ object, camera, cameraConfig }) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    object.position.sub(center);
    object.position.y -= size.y * cameraConfig.fitYOffsetRatio;

    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const fovRadians = camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDimension / 2 / Math.tan(fovRadians / 2));
    cameraDistance *= cameraConfig.fitDistanceMultiplier;

    const cameraPitchRadians = THREE.MathUtils.degToRad(cameraConfig.pitchDeg);
    const eyeHeight = object.position.y + cameraConfig.height;
    const pitchOffsetY = Math.tan(cameraPitchRadians) * cameraDistance;

    camera.position.set(0, eyeHeight, cameraDistance);
    camera.near = Math.max(0.01, cameraDistance / 100);
    camera.far = cameraDistance * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(object.position.x, eyeHeight - pitchOffsetY, object.position.z));
}

export function orientModelTowardCamera(object, camera) {
    object.lookAt(new THREE.Vector3(camera.position.x, object.position.y, camera.position.z));
}

export function disposeModelResources(root) {
    root.traverse((object) => {
        if (object.geometry?.dispose) {
            object.geometry.dispose();
        }

        if (!object.material) return;

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
            material.dispose?.();
        });
    });
}
