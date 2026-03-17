const CARD_ASSETS = Object.freeze([
    'assets/Card1.png',
    'assets/Card2.png',
    'assets/Card3.png',
    'assets/Card4.png',
    'assets/Card5.png',
]);

const CARD_ITEMS = Object.freeze(
    Array.from({ length: 20 }, (_, index) => Object.freeze({
        id: `card-${index}`,
        imageUrl: CARD_ASSETS[index % CARD_ASSETS.length],
        alt: `Card ${index + 1}`,
    }))
);

const LEFT_PEEK_RATIOS = Object.freeze([0, 0.45, 0.35, 0.25, 0.18]);

export const APP_CONFIG = Object.freeze({
    cards: Object.freeze({
        stageSelector: '#stage',
        containerSelector: '.slider-container',
        gyroscopeButtonSelector: '#gyro-btn',
        items: CARD_ITEMS,
        layout: Object.freeze({
            baseTranslateY: '-7vh',
            baseScale: 0.86,
            hiddenOffsetViewportMultiplier: 1.15,
            activeTranslateZ: 200,
            rightScale: 1.15,
            rightSpacingMultiplier: 1.15,
            gapRatio: 0.04,
            leftBaseScale: 0.8,
            leftScaleFalloff: 0.05,
            leftMinScale: 0.1,
            leftPeekRatios: LEFT_PEEK_RATIOS,
            leftPeekFallback: 0.1,
            maxVisibleDepth: 4,
            blurStep: 2,
            rotationStepDeg: 4,
            rightZStart: 300,
            rightZStep: 30,
            leftZStep: 100,
        }),
        interaction: Object.freeze({
            dragThreshold: 40,
            clickSlop: 5,
            maxTilt: 16,
            tiltIntensity: 0.7,
            tiltEasing: 0.1,
        }),
        clickAnimation: Object.freeze({
            durationMs: 700,
            frequency: 2.2,
            decay: 3.5,
            scaleDip: 0.12,
            rotateXDeg: 7,
            rotateYDeg: 9,
            rotateZDeg: 3,
        }),
        dust: Object.freeze({
            count: 25,
            minSize: 0.8,
            maxSize: 15,
            minSpeed: 0.08,
            maxSpeed: 0.6,
            minOpacity: 0.15,
            maxOpacity: 0.45,
            color: '255,255,255',
        }),
    }),
    model: Object.freeze({
        containerId: 'glb-viewer',
        modelUrl: 'assets/GLB/TakiGLB.glb',
        animations: Object.freeze({
            defaultState: 'idle',
            states: Object.freeze({
                idle: Object.freeze({
                    url: 'assets/GLB/Taki-Idle.glb',
                    loop: 'repeat',
                }),
                intoTalking: Object.freeze({
                    url: 'assets/GLB/Taki-IntoTalking.glb',
                    loop: 'once',
                }),
                talking: Object.freeze({
                    url: 'assets/GLB/Taki-Talking.glb',
                    loop: 'repeat',
                }),
            }),
        }),
        camera: Object.freeze({
            fov: 35,
            near: 0.1,
            far: 100,
            fitDistanceMultiplier: 1.9,
            pitchDeg: 8,
            height: 1.2,
            fitYOffsetRatio: 1,
            sceneConfigUrl: 'assets/config/camera-scenes.json',
            defaultSceneName: 'HomeScene',
        }),
        renderer: Object.freeze({
            toneMappingExposure: 1.0,
            useAlpha: true,
            clearColor: 0x000000,
            clearAlpha: 0,
        }),
        lights: Object.freeze({
            ambientColor: [1, 1, 1],
            ambientIntensity: 0.5,
            keyColor: 0xffffff,
            keyIntensity: 1.0,
            keyPosition: Object.freeze([-2.5, 3, 3]),
            keyPitchDeg: 45,
            keyYawDeg: 45,
            keyDistance: 4,
            fillSkyColor: 0xffffff,
            fillGroundColor: 0x223344,
            fillIntensity: 0.65,
        }),
        materialTuning: Object.freeze({
            maxMetalness: 0.2,
            minRoughness: 0.65,
        }),
        celShading: Object.freeze({
            enabled: true,
            threshold: 0.1,
            softness: 0.01,
            shadowColor: Object.freeze([0.72, 0.76, 0.84]),
            shadowColorStrength: 1.0,
            specularStrength: 0.0,
        }),
        debug: Object.freeze({
            enabled: true,
            toggleKey: 'Numpad0',
            lightingToggleKey: 'Numpad1',
        }),
    }),
    windowLock: Object.freeze({
        enabled: true,
        settleDelayMs: 500,
    }),
    lipsync: Object.freeze({
        audioUrl: 'assets/audio/SequelProQuickLook0.mp3',
        timelineUrl: 'assets/config/lipsync-timeline.json',
        triggerKey: 'Space',
    }),
    experience: Object.freeze({
        cameraTransitionDurationMs: 900,
        cardTransitionDurationMs: 900,
        takingSceneName: 'Taking',
        exitKeys: Object.freeze(['Escape']),
    }),
});

