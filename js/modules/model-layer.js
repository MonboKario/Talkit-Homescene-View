import * as THREE from '../three/three.module.js';
import { GLTFLoader } from '../three/GLTFLoader.js';
import { createCameraDebugPanel } from './camera-debug-panel.js';
import { applyCelShadingToModel } from './cel-shader.js';
import { createCameraSceneStore } from './camera-scene-store.js';
import { createLightingDebugPanel } from './lighting-debug-panel.js';
import { createModelAnimationController, rebindDetachedMeshesToAnimationChain } from './model-animation.js';
import { createModelInteraction } from './model-interaction.js';
import { applyMaterialTuning, disposeModelResources, fitObjectToCamera, orientModelTowardCamera } from './model-layout.js';
import { createModelRuntime } from './model-runtime.js';

function lerp(start, end, progress) {
    return start + (end - start) * progress;
}

function easeInOutCubic(progress) {
    if (progress < 0.5) {
        return 4 * progress * progress * progress;
    }

    return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function interpolateSceneValues(startValues, endValues, progress) {
    return {
        positionX: lerp(startValues.positionX, endValues.positionX, progress),
        positionY: lerp(startValues.positionY, endValues.positionY, progress),
        positionZ: lerp(startValues.positionZ, endValues.positionZ, progress),
        rotationX: lerp(startValues.rotationX, endValues.rotationX, progress),
        rotationY: lerp(startValues.rotationY, endValues.rotationY, progress),
        rotationZ: lerp(startValues.rotationZ, endValues.rotationZ, progress),
        FOV: lerp(startValues.FOV, endValues.FOV, progress),
    };
}

function createCameraSceneApi(cameraSceneStore, cameraDebugPanel, transitionToScene, getCurrentSceneName) {
    return {
        ready() {
            return Promise.resolve(cameraSceneStore.listScenes());
        },
        listScenes() {
            return cameraSceneStore.listScenes();
        },
        getScene(sceneName) {
            const scene = cameraSceneStore.getScene(sceneName);
            return scene ? { ...scene } : null;
        },
        setScene(sceneName, sceneValues) {
            return cameraSceneStore.setScene(sceneName, sceneValues);
        },
        applyScene(sceneName) {
            return transitionToScene(
                sceneName || cameraSceneStore.getDefaultSceneName(),
                { durationMs: 0 }
            );
        },
        transitionToScene(sceneName, options) {
            return transitionToScene(sceneName, options);
        },
        getCurrent() {
            return { ...cameraSceneStore.getCurrentSceneValues() };
        },
        getCurrentSceneName() {
            return getCurrentSceneName();
        },
        getDefaultSceneName() {
            return cameraSceneStore.getDefaultSceneName();
        },
        async reloadFromJson() {
            const sceneNames = await cameraSceneStore.reloadFromSource();
            transitionToScene(cameraSceneStore.getDefaultSceneName(), { durationMs: 0 });
            return sceneNames;
        },
    };
}

function exposeDebugGlobals(cameraTuning, cameraSceneApi) {
    if (typeof window === 'undefined') {
        return () => {};
    }

    window.__TAKI_CAMERA_TUNING__ = cameraTuning;
    window.__CAMERA_SCENE_API__ = cameraSceneApi;

    return () => {
        if (window.__TAKI_CAMERA_TUNING__ === cameraTuning) {
            delete window.__TAKI_CAMERA_TUNING__;
        }
        if (window.__CAMERA_SCENE_API__ === cameraSceneApi) {
            delete window.__CAMERA_SCENE_API__;
        }
    };
}

function shouldIgnoreModelEvent(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest('.card') ||
        target.closest('.gyro-button') ||
        target.closest('.talking-mic-button') ||
        target.closest('.camera-debug-panel')
    );
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function resolveShadowColorArray(shadowColor) {
    if (Array.isArray(shadowColor) && shadowColor.length >= 3) {
        return shadowColor.slice(0, 3).map((value, index) => {
            const next = Number(value);
            if (!Number.isFinite(next)) {
                return index === 0 ? 0.72 : index === 1 ? 0.76 : 0.84;
            }

            return clamp(next, 0, 1);
        });
    }

    return [0.72, 0.76, 0.84];
}

function resolveNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

export function initModelLayer(config) {
    const container = document.getElementById(config.containerId);
    if (!container) {
        console.error(`Model layer: container #${config.containerId} not found.`);
        return {
            destroy() {},
            getModel() {
                return null;
            },
            cameraSceneApi: null,
            transitionToScene() {
                return false;
            },
        };
    }

    const runtime = createModelRuntime(container, config);
    const { scene, camera, renderer, lights } = runtime;
    const loader = new GLTFLoader();
    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let model = null;
    let animationController = null;
    let pendingAnimationState = config.animations?.defaultState || 'idle';
    let animationFrameId = 0;
    let destroyed = false;
    let activeSceneName = config.camera.initialSceneName || config.camera.defaultSceneName || 'HomeScene';
    let cameraTween = null;
    let lipsyncUpdateFn = null;
    const baseShadowColor = resolveShadowColorArray(config.celShading?.shadowColor);
    const lightShaderTuning = {
        mainLight: {
            x: lights.keyLight.position.x,
            y: lights.keyLight.position.y,
            z: lights.keyLight.position.z,
            intensity: resolveNumber(lights.keyLight.intensity, resolveNumber(config.lights?.keyIntensity, 2.5)),
        },
        ambientLight: {
            intensity: resolveNumber(lights.ambientLight.intensity, resolveNumber(config.lights?.ambientIntensity, 1.5)),
        },
        celShader: {
            threshold: resolveNumber(config.celShading?.threshold, 0.5),
            softness: resolveNumber(config.celShading?.softness, 0.02),
            shadowColor: resolveNumber(config.celShading?.shadowColorStrength, 1),
            specularStrength: resolveNumber(config.celShading?.specularStrength, 0.08),
        },
    };

    const cameraSceneStore = createCameraSceneStore({
        camera,
        cameraConfig: config.camera,
        sceneConfig: config.camera.sceneConfig,
        defaultSceneName: config.camera.initialSceneName,
        initialSceneValues: config.camera.initialSceneValues,
        sceneConfigLoader: config.camera.sceneConfigLoader,
    });

    const cameraDebugPanel = createCameraDebugPanel({
        container,
        cameraTuning: cameraSceneStore.cameraTuning,
        enabled: config.debug?.enabled !== false,
        toggleKey: config.debug?.toggleKey || 'Numpad0',
        onTuningChange() {
            cameraTween = null;
            cameraSceneStore.applyTuningToCamera();
        },
    });

    function getCelShadingOptions() {
        const shadowColorScale = clamp(Number(lightShaderTuning.celShader.shadowColor) || 0, 0, 2);
        return {
            ...config.celShading,
            threshold: clamp(Number(lightShaderTuning.celShader.threshold) || 0, 0, 1),
            softness: clamp(Number(lightShaderTuning.celShader.softness) || 0, 0, 1),
            shadowColor: baseShadowColor.map((value) => clamp(value * shadowColorScale, 0, 1)),
            specularStrength: clamp(Number(lightShaderTuning.celShader.specularStrength) || 0, 0, 1),
        };
    }

    function applyLightShaderTuning() {
        lights.keyLight.position.set(
            lightShaderTuning.mainLight.x,
            lightShaderTuning.mainLight.y,
            lightShaderTuning.mainLight.z
        );
        lights.keyLight.intensity = clamp(resolveNumber(lightShaderTuning.mainLight.intensity, lights.keyLight.intensity), 0, 10);
        lights.ambientLight.intensity = clamp(resolveNumber(lightShaderTuning.ambientLight.intensity, lights.ambientLight.intensity), 0, 10);
        lights.keyLight.updateMatrixWorld();

        if (model) {
            applyCelShadingToModel(model, getCelShadingOptions());
        }
    }

    const lightingDebugPanel = createLightingDebugPanel({
        container,
        tuningState: lightShaderTuning,
        enabled: config.debug?.enabled !== false,
        toggleKey: config.debug?.lightingToggleKey || 'Numpad1',
        onTuningChange() {
            applyLightShaderTuning();
        },
    });
    applyLightShaderTuning();

    function getCurrentSceneName() {
        return activeSceneName;
    }

    function transitionToScene(sceneName, options = {}) {
        const targetSceneName = sceneName || cameraSceneStore.getDefaultSceneName();
        const targetSceneValues = cameraSceneStore.getScene(targetSceneName);
        if (!targetSceneValues) {
            console.warn(`Camera scene "${targetSceneName}" not found.`);
            return false;
        }

        const durationMs = Math.max(0, Number(options.durationMs) || 0);
        const startValues = cameraSceneStore.getCurrentSceneValues();

        if (durationMs === 0) {
            cameraTween = null;
            cameraSceneStore.applySceneValues(targetSceneValues);
            cameraSceneStore.applyTuningToCamera();
            cameraDebugPanel.refresh();
            activeSceneName = targetSceneName;
            return true;
        }

        cameraTween = {
            sceneName: targetSceneName,
            durationMs,
            startTime: performance.now(),
            startValues,
            targetValues: targetSceneValues,
        };
        activeSceneName = targetSceneName;
        return true;
    }

    const cameraSceneApi = createCameraSceneApi(
        cameraSceneStore,
        cameraDebugPanel,
        transitionToScene,
        getCurrentSceneName
    );
    const removeDebugGlobals = exposeDebugGlobals(cameraSceneStore.cameraTuning, cameraSceneApi);

    function updatePointer(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function hitTest(event) {
        if (!model) return [];
        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObject(model, true);
    }

    const interaction = createModelInteraction({
        eventTarget: window,
        getModel() {
            return model;
        },
        hitTest,
        onModelClick() {
            config.callbacks?.onModelActivate?.();
        },
        shouldIgnoreEvent: shouldIgnoreModelEvent,
    });

    async function playCharacterAnimation(stateName, options) {
        if (!stateName) return false;

        pendingAnimationState = stateName;
        if (!animationController || destroyed) {
            return false;
        }

        return animationController.play(stateName, options);
    }

    function updateCameraTween(now) {
        if (!cameraTween) return;

        const elapsed = now - cameraTween.startTime;
        const linearProgress = Math.min(1, elapsed / cameraTween.durationMs);
        const easedProgress = easeInOutCubic(linearProgress);
        const nextValues = interpolateSceneValues(
            cameraTween.startValues,
            cameraTween.targetValues,
            easedProgress
        );

        cameraSceneStore.applySceneValues(nextValues);
        cameraDebugPanel.refresh();

        if (linearProgress >= 1) {
            cameraTween = null;
        }
    }

    function resize() {
        runtime.resize();
        if (model) {
            cameraSceneStore.applyTuningToCamera();
        }
    }

    function animate(now) {
        if (destroyed) return;

        animationFrameId = requestAnimationFrame(animate);

        const frameNow = now || performance.now();
        const deltaSeconds = Math.min(clock.getDelta(), 0.05);
        if (animationController) {
            animationController.update(deltaSeconds);
        }

        updateCameraTween(frameNow);
        lipsyncUpdateFn?.();

        if (model) {
            cameraSceneStore.applyTuningToCamera();
        }

        renderer.render(scene, camera);
    }

    loader.load(
        config.modelUrl,
        (gltf) => {
            if (destroyed) return;

            model = gltf.scene;
            model.scale.set(1, 1, 1);
            model.updateMatrixWorld(true);

            applyMaterialTuning(model, config.materialTuning);
            applyCelShadingToModel(model, getCelShadingOptions());
            scene.add(model);
            rebindDetachedMeshesToAnimationChain(model);

            fitObjectToCamera({
                object: model,
                camera,
                cameraConfig: config.camera,
            });
            orientModelTowardCamera(model, camera);

            cameraSceneStore.syncFromCamera();
            cameraSceneStore.applySceneByName(config.camera.initialSceneName);
            cameraSceneStore.applyTuningToCamera();
            cameraDebugPanel.refresh();
            lightingDebugPanel.refresh();
            activeSceneName = config.camera.initialSceneName || cameraSceneStore.getDefaultSceneName();

            lights.keyLight.target.position.copy(model.position);
            applyLightShaderTuning();

            animationController = createModelAnimationController({
                loader,
                targetModel: model,
                animationStates: config.animations?.states,
            });
            playCharacterAnimation(pendingAnimationState);
            animationController.preload(
                Object.keys(config.animations?.states || {}).filter((stateName) => stateName !== pendingAnimationState)
            );
        },
        undefined,
        (error) => {
            console.warn('Failed to load GLB:', error);
        }
    );

    window.addEventListener('resize', resize);
    resize();
    animate();

    return {
        destroy() {
            if (destroyed) return;
            destroyed = true;

            window.removeEventListener('resize', resize);

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = 0;
            }

            interaction.destroy();
            cameraDebugPanel.destroy();
            lightingDebugPanel.destroy();
            removeDebugGlobals();
            lipsyncUpdateFn = null;

            if (animationController) {
                animationController.destroy();
                animationController = null;
            }

            if (model) {
                scene.remove(model);
                disposeModelResources(model);
            }

            runtime.destroy();
        },
        getModel() {
            return model;
        },
        getCurrentSceneName,
        transitionToScene,
        cameraSceneApi,
        playCharacterAnimation,
        setLipsyncUpdate(fn) {
            lipsyncUpdateFn = fn || null;
        },
    };
}
