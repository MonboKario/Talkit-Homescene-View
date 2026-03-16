import { APP_CONFIG } from './config/shared-config.js';
import {
    getFallbackCameraScene,
    loadCameraSceneConfig,
    resolveCameraScene,
} from './config/camera-scene-config.js';
import { initCardLayer } from './modules/card-layer.js';
import { initModelLayer } from './modules/model-layer.js';
import { createLipsyncPlayback } from './modules/lipsync-playback.js';

let activeApp = null;

function lockWindowSize(config) {
    if (!config.enabled) return () => {};

    let lockedWidth = window.outerWidth;
    let lockedHeight = window.outerHeight;

    const settleTimerId = window.setTimeout(() => {
        lockedWidth = window.outerWidth;
        lockedHeight = window.outerHeight;
    }, config.settleDelayMs);

    const handleResize = () => {
        if (window.outerWidth !== lockedWidth || window.outerHeight !== lockedHeight) {
            window.resizeTo(lockedWidth, lockedHeight);
        }
    };

    window.addEventListener('resize', handleResize);

    return () => {
        window.clearTimeout(settleTimerId);
        window.removeEventListener('resize', handleResize);
    };
}

async function buildModelConfig(baseModelConfig) {
    const defaultSceneName = baseModelConfig.camera.defaultSceneName || 'HomeScene';
    const fallbackScene = getFallbackCameraScene(baseModelConfig.camera);
    const sceneConfig = await loadCameraSceneConfig(baseModelConfig.camera);
    const initialSceneValues = resolveCameraScene(sceneConfig, defaultSceneName, fallbackScene);

    return {
        ...baseModelConfig,
        camera: {
            ...baseModelConfig.camera,
            sceneConfig,
            initialSceneName: defaultSceneName,
            initialSceneValues,
            fallbackScene,
            sceneConfigLoader: () => loadCameraSceneConfig(baseModelConfig.camera),
        },
    };
}

function matchesExitKey(event, exitKeys) {
    return exitKeys.includes(event.code) || exitKeys.includes(event.key);
}

function destroyActiveApp() {
    if (!activeApp) return;

    activeApp.destroy();
    activeApp = null;
    delete window.HomesceneApp;
}

async function boot() {
    destroyActiveApp();

    let cardLayer = null;
    let modelLayer = null;
    let unlockWindowSize = () => {};
    let removeExperienceListeners = () => {};

    try {
        cardLayer = initCardLayer(APP_CONFIG.cards);
        const modelConfig = await buildModelConfig(APP_CONFIG.model);
        const experienceConfig = APP_CONFIG.experience;
        const defaultSceneName = modelConfig.camera.initialSceneName;
        let currentExperienceState = 'default';
        let lipsyncPlayback = null;

        const transitionToState = (nextState) => {
            if (currentExperienceState === 'taking' && nextState !== 'taking') {
                lipsyncPlayback?.stop();
            }

            const targetSceneName = nextState === 'taking'
                ? experienceConfig.takingSceneName
                : defaultSceneName;

            const modelTransitionStarted = modelLayer?.transitionToScene?.(targetSceneName, {
                durationMs: experienceConfig.cameraTransitionDurationMs,
            });
            if (!modelTransitionStarted) {
                return false;
            }

            cardLayer?.transitionToState?.(nextState, {
                durationMs: experienceConfig.cardTransitionDurationMs,
            });
            currentExperienceState = nextState;
            return true;
        };

        modelLayer = initModelLayer({
            ...modelConfig,
            callbacks: {
                onModelActivate() {
                    if (currentExperienceState === 'taking') return;
                    transitionToState('taking');
                },
            },
        });
        unlockWindowSize = lockWindowSize(APP_CONFIG.windowLock);

        createLipsyncPlayback({
            audioUrl: APP_CONFIG.lipsync.audioUrl,
            timelineUrl: APP_CONFIG.lipsync.timelineUrl,
            getModel: () => modelLayer?.getModel(),
        }).then((playback) => {
            lipsyncPlayback = playback;
            modelLayer?.setLipsyncUpdate?.(() => playback.update());
        }).catch((err) => {
            console.warn('[LipSync] Failed to initialize:', err);
        });

        const handleKeydown = (event) => {
            if (currentExperienceState === 'taking' && event.code === APP_CONFIG.lipsync.triggerKey) {
                event.preventDefault();
                lipsyncPlayback?.toggle();
                return;
            }

            if (!matchesExitKey(event, experienceConfig.exitKeys)) return;
            if (currentExperienceState === 'default') return;

            event.preventDefault();
            transitionToState('default');
        };

        window.addEventListener('keydown', handleKeydown);
        removeExperienceListeners = () => {
            window.removeEventListener('keydown', handleKeydown);
        };

        let destroyed = false;
        const destroy = () => {
            if (destroyed) return;
            destroyed = true;

            removeExperienceListeners();
            unlockWindowSize();
            lipsyncPlayback?.destroy();
            lipsyncPlayback = null;
            modelLayer?.destroy?.();
            cardLayer?.destroy?.();
        };

        const homesceneApp = {
            cardLayer,
            modelLayer,
            cameraSceneApi: modelLayer.cameraSceneApi,
            cameraSceneConfig: modelConfig.camera.sceneConfig,
            transitionToState,
            destroy,
            get cameraSceneNames() {
                return modelLayer?.cameraSceneApi?.listScenes?.() ?? [];
            },
            get cameraSceneName() {
                return modelLayer?.getCurrentSceneName?.() ?? defaultSceneName;
            },
            get experienceState() {
                return currentExperienceState;
            },
        };

        activeApp = homesceneApp;
        window.HomesceneApp = homesceneApp;
    } catch (error) {
        removeExperienceListeners();
        unlockWindowSize();
        modelLayer?.destroy?.();
        cardLayer?.destroy?.();
        throw error;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
        console.error('Failed to boot HomesceneApp:', error);
    });
}, { once: true });

window.addEventListener('beforeunload', () => {
    destroyActiveApp();
});

