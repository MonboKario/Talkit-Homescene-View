import * as THREE from '../three/three.module.js';
import { getFallbackCameraScene, normalizeCameraScene } from '../config/camera-scene-config.js';

function toFiniteNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

export function createCameraSceneStore({
    camera,
    cameraConfig,
    sceneConfig,
    defaultSceneName,
    initialSceneValues,
    sceneConfigLoader,
}) {
    const resolvedDefaultSceneName = defaultSceneName || cameraConfig.defaultSceneName || 'HomeScene';
    const fallbackScene = normalizeCameraScene(
        initialSceneValues || getFallbackCameraScene(cameraConfig),
        getFallbackCameraScene(cameraConfig)
    );

    let currentSceneConfig = sceneConfig && typeof sceneConfig === 'object'
        ? { ...sceneConfig }
        : {};

    if (!currentSceneConfig[resolvedDefaultSceneName]) {
        currentSceneConfig[resolvedDefaultSceneName] = { ...fallbackScene };
    }

    const cameraTuning = {
        position: { x: 0, y: 0, z: 0 },
        rotationDeg: { x: 0, y: 0, z: 0 },
        fov: camera.fov,
    };

    function syncFromCamera() {
        cameraTuning.position.x = camera.position.x;
        cameraTuning.position.y = camera.position.y;
        cameraTuning.position.z = camera.position.z;

        cameraTuning.rotationDeg.x = THREE.MathUtils.radToDeg(camera.rotation.x);
        cameraTuning.rotationDeg.y = THREE.MathUtils.radToDeg(camera.rotation.y);
        cameraTuning.rotationDeg.z = THREE.MathUtils.radToDeg(camera.rotation.z);
        cameraTuning.fov = camera.fov;
    }

    function applyTuningToCamera() {
        camera.position.set(
            toFiniteNumber(cameraTuning.position.x, camera.position.x),
            toFiniteNumber(cameraTuning.position.y, camera.position.y),
            toFiniteNumber(cameraTuning.position.z, camera.position.z)
        );

        camera.rotation.set(
            THREE.MathUtils.degToRad(toFiniteNumber(cameraTuning.rotationDeg.x, 0)),
            THREE.MathUtils.degToRad(toFiniteNumber(cameraTuning.rotationDeg.y, 0)),
            THREE.MathUtils.degToRad(toFiniteNumber(cameraTuning.rotationDeg.z, 0))
        );

        const nextFov = THREE.MathUtils.clamp(
            toFiniteNumber(cameraTuning.fov, camera.fov),
            1,
            179
        );

        if (Math.abs(nextFov - camera.fov) > 0.0001) {
            camera.fov = nextFov;
            camera.updateProjectionMatrix();
        }
    }

    function getCurrentSceneValues() {
        return {
            positionX: cameraTuning.position.x,
            positionY: cameraTuning.position.y,
            positionZ: cameraTuning.position.z,
            rotationX: cameraTuning.rotationDeg.x,
            rotationY: cameraTuning.rotationDeg.y,
            rotationZ: cameraTuning.rotationDeg.z,
            FOV: cameraTuning.fov,
        };
    }

    function applySceneValues(sceneValues, fallbackValues = getCurrentSceneValues()) {
        const normalized = normalizeCameraScene(sceneValues, fallbackValues);

        cameraTuning.position.x = normalized.positionX;
        cameraTuning.position.y = normalized.positionY;
        cameraTuning.position.z = normalized.positionZ;
        cameraTuning.rotationDeg.x = normalized.rotationX;
        cameraTuning.rotationDeg.y = normalized.rotationY;
        cameraTuning.rotationDeg.z = normalized.rotationZ;
        cameraTuning.fov = normalized.FOV;

        return normalized;
    }

    function getScene(sceneName) {
        const key = sceneName || resolvedDefaultSceneName;
        const rawScene = currentSceneConfig[key];
        if (!rawScene) return null;
        return normalizeCameraScene(rawScene, getCurrentSceneValues());
    }

    function applySceneByName(sceneName) {
        const scene = getScene(sceneName);
        if (!scene) return false;
        applySceneValues(scene);
        return true;
    }

    function setScene(sceneName, sceneValues) {
        const key = sceneName || resolvedDefaultSceneName;
        const normalized = normalizeCameraScene(sceneValues, getCurrentSceneValues());
        currentSceneConfig[key] = { ...normalized };
        return { ...normalized };
    }

    async function reloadFromSource() {
        if (typeof sceneConfigLoader !== 'function') {
            return Object.keys(currentSceneConfig);
        }

        const nextSceneConfig = await sceneConfigLoader();
        currentSceneConfig = nextSceneConfig && typeof nextSceneConfig === 'object'
            ? { ...nextSceneConfig }
            : {};

        if (!currentSceneConfig[resolvedDefaultSceneName]) {
            currentSceneConfig[resolvedDefaultSceneName] = { ...fallbackScene };
        }

        return Object.keys(currentSceneConfig);
    }

    return {
        cameraTuning,
        syncFromCamera,
        applyTuningToCamera,
        getCurrentSceneValues,
        applySceneValues,
        getScene,
        applySceneByName,
        setScene,
        listScenes() {
            return Object.keys(currentSceneConfig);
        },
        getDefaultSceneName() {
            return resolvedDefaultSceneName;
        },
        reloadFromSource,
    };
}
