function toFiniteNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

export function createEmptyCameraScene() {
    return {
        positionX: null,
        positionY: null,
        positionZ: null,
        rotationX: null,
        rotationY: null,
        rotationZ: null,
        FOV: null,
    };
}

export function getFallbackCameraScene(cameraConfig = {}) {
    return {
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        FOV: toFiniteNumber(cameraConfig.fov, 35),
    };
}

export function normalizeCameraScene(sceneValues, fallbackScene = getFallbackCameraScene()) {
    const fallback = fallbackScene || getFallbackCameraScene();
    const source = sceneValues && typeof sceneValues === 'object' ? sceneValues : {};

    return {
        positionX: toFiniteNumber(source.positionX, fallback.positionX),
        positionY: toFiniteNumber(source.positionY, fallback.positionY),
        positionZ: toFiniteNumber(source.positionZ, fallback.positionZ),
        rotationX: toFiniteNumber(source.rotationX, fallback.rotationX),
        rotationY: toFiniteNumber(source.rotationY, fallback.rotationY),
        rotationZ: toFiniteNumber(source.rotationZ, fallback.rotationZ),
        FOV: toFiniteNumber(source.FOV ?? source.fov, fallback.FOV),
    };
}

export function resolveCameraScene(sceneConfig, sceneName, fallbackScene) {
    if (!sceneConfig || typeof sceneConfig !== 'object') {
        return fallbackScene ? normalizeCameraScene(fallbackScene, fallbackScene) : null;
    }

    const rawScene = sceneConfig[sceneName];
    if (!rawScene) {
        return fallbackScene ? normalizeCameraScene(fallbackScene, fallbackScene) : null;
    }

    return normalizeCameraScene(rawScene, fallbackScene);
}

export async function loadCameraSceneConfig(cameraConfig = {}) {
    const sceneConfigUrl = cameraConfig.sceneConfigUrl;
    const defaultSceneName = cameraConfig.defaultSceneName || 'HomeScene';
    const sceneConfig = {};

    if (sceneConfigUrl) {
        try {
            const response = await fetch(sceneConfigUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            if (payload && typeof payload === 'object') {
                Object.assign(sceneConfig, payload);
            }
        } catch (error) {
            console.warn('Failed to load camera scene config JSON:', error);
        }
    }

    if (!sceneConfig[defaultSceneName]) {
        sceneConfig[defaultSceneName] = createEmptyCameraScene();
    }

    return sceneConfig;
}
