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
        const micButton = document.getElementById('talking-mic-btn');
        const defaultSceneName = modelConfig.camera.initialSceneName;
        let currentExperienceState = 'default';
        let lipsyncPlayback = null;
        let suppressIdleAnimation = false;
        let micRevealTimerId = 0;

        const setMicTransitionDuration = (durationMs) => {
            if (!micButton) return;

            const resolvedDurationMs = Math.max(0, Number(durationMs) || 0);
            const resolvedOpacityMs = resolvedDurationMs === 0
                ? 0
                : Math.max(180, Math.round(resolvedDurationMs * 0.72));

            micButton.style.setProperty('--talking-mic-transition-ms', `${resolvedDurationMs}ms`);
            micButton.style.setProperty('--talking-mic-opacity-ms', `${resolvedOpacityMs}ms`);
        };

        const setMicPlaybackState = (isPlaying) => {
            if (!micButton) return;

            micButton.classList.toggle('is-speaking', isPlaying);
            micButton.setAttribute('aria-pressed', String(isPlaying));
        };

        const setMicButtonVisibility = (
            isVisible,
            durationMs = experienceConfig.cardTransitionDurationMs
        ) => {
            if (!micButton) return;

            setMicTransitionDuration(durationMs);
            micButton.classList.toggle('is-visible', isVisible);
            micButton.disabled = !isVisible;
            micButton.tabIndex = isVisible ? 0 : -1;
            micButton.setAttribute('aria-hidden', String(!isVisible));

            if (!isVisible) {
                setMicPlaybackState(false);
            }
        };

        const clearMicRevealTimer = () => {
            if (micRevealTimerId === 0) return;

            window.clearTimeout(micRevealTimerId);
            micRevealTimerId = 0;
        };

        const scheduleMicButtonVisibility = (
            isVisible,
            {
                durationMs = experienceConfig.cardTransitionDurationMs,
                delayMs = 0,
            } = {}
        ) => {
            clearMicRevealTimer();

            if (!isVisible) {
                setMicButtonVisibility(false, durationMs);
                return;
            }

            setMicButtonVisibility(false, 0);

            if (delayMs <= 0) {
                setMicButtonVisibility(true, durationMs);
                return;
            }

            micRevealTimerId = window.setTimeout(() => {
                micRevealTimerId = 0;

                if (currentExperienceState !== 'taking') return;
                setMicButtonVisibility(true, durationMs);
            }, delayMs);
        };

        setMicButtonVisibility(false, 0);

        const transitionToState = (nextState) => {
            const isExitingTaking = currentExperienceState === 'taking' && nextState !== 'taking';
            if (isExitingTaking) {
                suppressIdleAnimation = true;
                lipsyncPlayback?.stop();
                suppressIdleAnimation = false;
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
            scheduleMicButtonVisibility(nextState === 'taking', {
                delayMs: nextState === 'taking' ? 500 : 0,
            });

            if (nextState === 'taking') {
                modelLayer?.playCharacterAnimation?.('intoTalking', { nextState: 'idle' });
                return true;
            }

            if (isExitingTaking) {
                modelLayer?.playCharacterAnimation?.('intoTalking', { nextState: 'idle' });
                return true;
            }

            modelLayer?.playCharacterAnimation?.('idle');
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
            onStart() {
                setMicPlaybackState(true);
                modelLayer?.playCharacterAnimation?.('talking');
            },
            onStop() {
                setMicPlaybackState(false);
                if (suppressIdleAnimation) return;
                modelLayer?.playCharacterAnimation?.('idle');
            },
            onEnded() {
                setMicPlaybackState(false);
                if (suppressIdleAnimation) return;
                modelLayer?.playCharacterAnimation?.('idle');
            },
        }).then((playback) => {
            lipsyncPlayback = playback;
            modelLayer?.setLipsyncUpdate?.(() => playback.update());
        }).catch((err) => {
            console.warn('[LipSync] Failed to initialize:', err);
        });

        const handleMicButtonClick = (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (currentExperienceState !== 'taking') return;
            lipsyncPlayback?.toggle();
        };

        const handleKeydown = (event) => {
            const isMicButtonTarget = event.target instanceof HTMLElement
                && Boolean(event.target.closest('#talking-mic-btn'));

            if (
                currentExperienceState === 'taking'
                && event.code === APP_CONFIG.lipsync.triggerKey
                && !isMicButtonTarget
            ) {
                event.preventDefault();
                lipsyncPlayback?.toggle();
                return;
            }

            if (!matchesExitKey(event, experienceConfig.exitKeys)) return;
            if (currentExperienceState === 'default') return;

            event.preventDefault();
            transitionToState('default');
        };

        micButton?.addEventListener('click', handleMicButtonClick);
        window.addEventListener('keydown', handleKeydown);
        removeExperienceListeners = () => {
            micButton?.removeEventListener('click', handleMicButtonClick);
            window.removeEventListener('keydown', handleKeydown);
        };

        let destroyed = false;
        const destroy = () => {
            if (destroyed) return;
            destroyed = true;

            removeExperienceListeners();
            unlockWindowSize();
            clearMicRevealTimer();
            lipsyncPlayback?.destroy();
            lipsyncPlayback = null;
            setMicButtonVisibility(false, 0);
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
