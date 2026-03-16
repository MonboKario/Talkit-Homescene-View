import * as THREE from '../three/three.module.js';
import { GLTFLoader } from '../three/GLTFLoader.js';
import { createCameraDebugPanel } from './camera-debug-panel.js';
import { createCameraSceneStore } from './camera-scene-store.js';
import { applyExternalAnimation, rebindDetachedMeshesToAnimationChain } from './model-animation.js';
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
            const applied = cameraSceneStore.applySceneByName(
                sceneName || cameraSceneStore.getDefaultSceneName()
            );

            if (applied) {
                cameraSceneStore.applyTuningToCamera();
                cameraDebugPanel.refresh();
            }

            return applied;
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
            cameraSceneStore.applySceneByName(cameraSceneStore.getDefaultSceneName());
            cameraSceneStore.applyTuningToCamera();
            cameraDebugPanel.refresh();
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
        target.closest('.camera-debug-panel')
    );
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
    let mixer = null;
    let animationFrameId = 0;
    let destroyed = false;
    let activeSceneName = config.camera.initialSceneName || config.camera.defaultSceneName || 'HomeScene';
    let cameraTween = null;
    let lipsyncUpdateFn = null;

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

    function replaceMixer(nextMixer) {
        if (mixer && model) {
            mixer.stopAllAction();
            mixer.uncacheRoot(model);
        }

        mixer = nextMixer;
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
        if (mixer) {
            mixer.update(deltaSeconds);
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
            activeSceneName = config.camera.initialSceneName || cameraSceneStore.getDefaultSceneName();

            lights.keyLight.target.position.copy(model.position);

            applyExternalAnimation({
                loader,
                animationUrl: config.animationUrl,
                targetModel: model,
                onMixerReady(nextMixer) {
                    if (destroyed) {
                        nextMixer.stopAllAction();
                        nextMixer.uncacheRoot(model);
                        return;
                    }

                    replaceMixer(nextMixer);
                },
            });
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
            removeDebugGlobals();
            lipsyncUpdateFn = null;

            if (mixer && model) {
                mixer.stopAllAction();
                mixer.uncacheRoot(model);
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
        setLipsyncUpdate(fn) {
            lipsyncUpdateFn = fn || null;
        },
    };
}
