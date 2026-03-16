function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function addListener(cleanups, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => {
        target.removeEventListener(type, handler, options);
    });
}

function lerp(start, end, progress) {
    return start + (end - start) * progress;
}

function easeInOutCubic(progress) {
    if (progress < 0.5) {
        return 4 * progress * progress * progress;
    }

    return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export function createCardSlider({
    stage,
    layout,
    interaction,
    clickAnimation,
    gyroscopeButton,
}) {
    const cleanups = [];
    let cards = [];
    let currentIndex = 0;
    let cardWidth = 0;
    let stageWidth = 0;
    let gap = 0;
    let isAnimatingCard = false;
    let tiltAnimationFrameId = 0;
    let presentationState = 'default';
    let presentationOffsetY = 0;
    let presentationTween = null;
    let interactionLocked = false;

    const dragState = {
        active: false,
        pointerId: null,
        startX: 0,
        deltaX: 0,
    };

    const tiltState = {
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
    };

    function resolvePresentationOffset(state) {
        return state === 'taking'
            ? -window.innerHeight * layout.hiddenOffsetViewportMultiplier
            : 0;
    }

    function getBaseStageTransform(rotateX = tiltState.currentX, rotateY = tiltState.currentY) {
        return [
            `translateY(calc(${layout.baseTranslateY} + ${presentationOffsetY.toFixed(2)}px))`,
            `scale(${layout.baseScale})`,
            `rotateX(${rotateX}deg)`,
            `rotateY(${rotateY}deg)`,
        ].join(' ');
    }

    function measure() {
        if (cards.length === 0) return false;

        stageWidth = stage.offsetWidth;
        cardWidth = cards[0].offsetWidth;
        gap = stageWidth * layout.gapRatio;

        return stageWidth > 0 && cardWidth > 0;
    }

    function getTransform(relativeIndex) {
        if (relativeIndex === 0) {
            return {
                x: 0,
                scale: 1,
                zIndex: 100,
                opacity: 1,
                blur: 0,
                rotate: 0,
                z: layout.activeTranslateZ,
            };
        }

        if (relativeIndex > 0) {
            const step = cardWidth * layout.rightSpacingMultiplier + gap;
            const x = (
                cardWidth / 2 +
                gap * 1.5 +
                (cardWidth * layout.rightSpacingMultiplier) / 2 +
                (relativeIndex - 1) * step
            );

            return {
                x,
                scale: layout.rightScale,
                zIndex: 200 - relativeIndex,
                opacity: 0.4,
                blur: relativeIndex * layout.blurStep,
                rotate: relativeIndex * layout.rotationStepDeg,
                z: layout.rightZStart - relativeIndex * layout.rightZStep,
            };
        }

        const depth = -relativeIndex;
        const scales = [1];

        for (let offset = 1; offset <= depth; offset += 1) {
            scales[offset] = scales[offset - 1] * Math.max(
                layout.leftMinScale,
                layout.leftBaseScale - offset * layout.leftScaleFalloff
            );
        }

        let leftEdge = -cardWidth / 2;
        let x = 0;

        for (let offset = 1; offset <= depth; offset += 1) {
            const width = cardWidth * scales[offset];
            const peekRatio = layout.leftPeekRatios[offset] ?? layout.leftPeekFallback;
            leftEdge -= width * peekRatio;
            x = leftEdge + width / 2;
        }

        return {
            x,
            scale: scales[depth],
            zIndex: 50 - depth,
            opacity: depth > layout.maxVisibleDepth ? 0 : 1,
            blur: depth * layout.blurStep,
            rotate: -depth * layout.rotationStepDeg,
            z: -depth * layout.leftZStep,
        };
    }

    function getCardElementFromPoint(clientX, clientY) {
        return document.elementFromPoint(clientX, clientY)?.closest?.('.card') ?? null;
    }

    function applyLayout(animate) {
        if (!measure()) return;

        cards.forEach((card, index) => {
            const relativeIndex = index - currentIndex;
            const { x, scale, zIndex, opacity, blur, rotate, z } = getTransform(relativeIndex);

            card.style.transition = animate
                ? 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease, filter 0.35s ease'
                : 'none';
            card.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale}) rotate(${rotate}deg)`;
            card.style.zIndex = String(zIndex);
            card.style.opacity = String(opacity);
            card.style.filter = blur > 0 ? `blur(${blur}px)` : '';

            const fogOverlay = card.querySelector('.fog-overlay');
            if (fogOverlay) {
                const fogOpacity = relativeIndex < 0 ? Math.min(0.7, -relativeIndex * 0.15) : 0;
                fogOverlay.style.background = `rgba(255, 255, 255, ${fogOpacity})`;
            }
        });
    }

    function triggerCardClick(card) {
        if (isAnimatingCard || interactionLocked) return;

        isAnimatingCard = true;
        card.style.transition = 'none';

        const highlightOverlay = card.querySelector('.highlight-overlay');
        if (highlightOverlay) {
            highlightOverlay.style.transition = 'none';
            highlightOverlay.style.background = 'rgba(255, 255, 255, 0.35)';

            requestAnimationFrame(() => {
                highlightOverlay.style.transition = 'background 1.2s ease-out';
                highlightOverlay.style.background = 'rgba(255, 255, 255, 0)';
            });
        }

        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / clickAnimation.durationMs);
            const envelope = Math.exp(-clickAnimation.decay * progress);
            const wave = Math.sin(clickAnimation.frequency * Math.PI * progress) * envelope;

            const scale = 1 - clickAnimation.scaleDip * Math.abs(wave);
            const rotateX = clickAnimation.rotateXDeg * wave;
            const rotateY = clickAnimation.rotateYDeg * -wave;
            const rotateZ = clickAnimation.rotateZDeg * wave;

            card.style.transform = [
                'translateX(0px)',
                `translateZ(${layout.activeTranslateZ}px)`,
                `scale(${scale})`,
                `rotateX(${rotateX}deg)`,
                `rotateY(${rotateY}deg)`,
                `rotateZ(${rotateZ}deg)`,
            ].join(' ');

            if (progress < 1) {
                requestAnimationFrame(tick);
                return;
            }

            isAnimatingCard = false;
            applyLayout(false);
        }

        requestAnimationFrame(tick);
    }

    function beginPresentationTransition(targetState, durationMs = 0) {
        const targetOffsetY = resolvePresentationOffset(targetState);
        presentationState = targetState;
        interactionLocked = true;

        if (durationMs <= 0) {
            presentationOffsetY = targetOffsetY;
            presentationTween = null;
            interactionLocked = targetState !== 'default';
            return true;
        }

        presentationTween = {
            startOffsetY: presentationOffsetY,
            targetOffsetY,
            startTime: performance.now(),
            durationMs,
            targetState,
        };

        return true;
    }

    function updatePresentationState(now) {
        if (!presentationTween) return;

        const elapsed = now - presentationTween.startTime;
        const linearProgress = Math.min(1, elapsed / presentationTween.durationMs);
        const easedProgress = easeInOutCubic(linearProgress);
        presentationOffsetY = lerp(
            presentationTween.startOffsetY,
            presentationTween.targetOffsetY,
            easedProgress
        );

        if (linearProgress >= 1) {
            presentationState = presentationTween.targetState;
            interactionLocked = presentationState !== 'default';
            presentationTween = null;
        }
    }

    function handlePointerDown(event) {
        if (isAnimatingCard || interactionLocked) return;
        if (event.button !== undefined && event.button !== 0) return;

        dragState.active = true;
        dragState.pointerId = event.pointerId ?? 'mouse';
        dragState.startX = event.clientX;
        dragState.deltaX = 0;

        if (typeof stage.setPointerCapture === 'function' && event.pointerId !== undefined) {
            stage.setPointerCapture(event.pointerId);
        }

        event.preventDefault();
    }

    function handlePointerMove(event) {
        if (!dragState.active || event.pointerId !== dragState.pointerId) return;
        dragState.deltaX = event.clientX - dragState.startX;
    }

    function handlePointerUp(event) {
        if (!dragState.active || event.pointerId !== dragState.pointerId) return;

        const clientX = event.clientX;
        const clientY = event.clientY;
        const deltaX = dragState.deltaX;

        dragState.active = false;
        dragState.pointerId = null;

        if (typeof stage.releasePointerCapture === 'function' && event.pointerId !== undefined) {
            try {
                stage.releasePointerCapture(event.pointerId);
            } catch (error) {
                // Pointer capture may already be released; ignore.
            }
        }

        if (Math.abs(deltaX) < interaction.clickSlop) {
            const card = getCardElementFromPoint(clientX, clientY);
            if (card) {
                const cardIndex = cards.indexOf(card);
                if (cardIndex === currentIndex) {
                    triggerCardClick(card);
                }
            }
            return;
        }

        if (deltaX < -interaction.dragThreshold && currentIndex < cards.length - 1) {
            currentIndex += 1;
        } else if (deltaX > interaction.dragThreshold && currentIndex > 0) {
            currentIndex -= 1;
        }

        applyLayout(true);
    }

    function handleMouseMove(event) {
        const rect = stage.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = (event.clientX - centerX) / (rect.width / 2 || 1);
        const deltaY = (event.clientY - centerY) / (rect.height / 2 || 1);

        tiltState.targetY = clamp(deltaX, -1, 1) * interaction.maxTilt * interaction.tiltIntensity;
        tiltState.targetX = clamp(-deltaY, -1, 1) * interaction.maxTilt * interaction.tiltIntensity;
    }

    function resetTilt() {
        tiltState.targetX = 0;
        tiltState.targetY = 0;
    }

    function startGyroscope() {
        let baseBeta = null;
        let baseGamma = null;

        const handleOrientation = (event) => {
            if (event.beta == null && event.gamma == null) return;

            const beta = event.beta || 0;
            const gamma = event.gamma || 0;

            if (baseBeta === null) {
                baseBeta = beta;
                baseGamma = gamma;
            }

            tiltState.targetX = clamp(-(beta - baseBeta) / 3, -interaction.maxTilt, interaction.maxTilt);
            tiltState.targetY = clamp((gamma - baseGamma) / 3, -interaction.maxTilt, interaction.maxTilt);
        };

        addListener(cleanups, window, 'deviceorientation', handleOrientation);
    }

    function setupGyroscope() {
        try {
            const needsPermission = typeof DeviceOrientationEvent !== 'undefined' &&
                typeof DeviceOrientationEvent.requestPermission === 'function';

            if (needsPermission) {
                if (!gyroscopeButton) return;

                const handleGyroClick = () => {
                    DeviceOrientationEvent.requestPermission()
                        .then((state) => {
                            if (state === 'granted') {
                                startGyroscope();
                                gyroscopeButton.textContent = 'Gyroscope Enabled';
                                gyroscopeButton.classList.add('is-hidden');
                            } else {
                                gyroscopeButton.textContent = 'Permission Denied';
                            }
                        })
                        .catch(() => {
                            gyroscopeButton.textContent = 'Permission Failed';
                        });
                };

                addListener(cleanups, gyroscopeButton, 'click', handleGyroClick);
                return;
            }

            if (typeof DeviceOrientationEvent !== 'undefined' || 'ondeviceorientation' in window) {
                if (gyroscopeButton) {
                    gyroscopeButton.classList.add('is-hidden');
                }
                startGyroscope();
            }
        } catch (error) {
            console.warn('Failed to initialize gyroscope controls:', error);
        }
    }

    function handleResize() {
        if (!presentationTween) {
            presentationOffsetY = resolvePresentationOffset(presentationState);
        }
        applyLayout(false);
    }

    function animateTilt(now) {
        const frameNow = now || performance.now();
        updatePresentationState(frameNow);

        tiltState.currentX += (tiltState.targetX - tiltState.currentX) * interaction.tiltEasing;
        tiltState.currentY += (tiltState.targetY - tiltState.currentY) * interaction.tiltEasing;

        if (Math.abs(tiltState.currentX) < 0.01 && tiltState.targetX === 0) {
            tiltState.currentX = 0;
        }
        if (Math.abs(tiltState.currentY) < 0.01 && tiltState.targetY === 0) {
            tiltState.currentY = 0;
        }

        stage.style.transform = getBaseStageTransform();
        tiltAnimationFrameId = requestAnimationFrame(animateTilt);
    }

    function ensureImagesMeasured(attempt = 0) {
        applyLayout(false);

        if (measure() || attempt >= 20) return;

        requestAnimationFrame(() => {
            ensureImagesMeasured(attempt + 1);
        });
    }

    function start() {
        cards = Array.from(stage.querySelectorAll('.card'));
        if (cards.length === 0) {
            console.error('CardSlider: no cards found in stage.');
            return;
        }

        presentationOffsetY = resolvePresentationOffset(presentationState);
        stage.style.transform = getBaseStageTransform();

        cards.forEach((card) => {
            const image = card.querySelector('img');
            if (!image) return;

            addListener(cleanups, image, 'load', () => {
                applyLayout(false);
            }, { once: true });
        });

        addListener(cleanups, stage, 'pointerdown', handlePointerDown);
        addListener(cleanups, window, 'pointermove', handlePointerMove);
        addListener(cleanups, window, 'pointerup', handlePointerUp);
        addListener(cleanups, window, 'pointercancel', handlePointerUp);
        addListener(cleanups, document, 'mousemove', handleMouseMove);
        addListener(cleanups, document, 'mouseleave', resetTilt);
        addListener(cleanups, window, 'resize', handleResize);

        setupGyroscope();
        ensureImagesMeasured();
        animateTilt();
    }

    function destroy() {
        cleanups.splice(0).forEach((cleanup) => cleanup());

        if (tiltAnimationFrameId) {
            cancelAnimationFrame(tiltAnimationFrameId);
            tiltAnimationFrameId = 0;
        }

        stage.style.transform = '';

        cards.forEach((card) => {
            card.style.transition = '';
            card.style.transform = '';
            card.style.opacity = '';
            card.style.filter = '';
            card.style.zIndex = '';
        });

        cards = [];
        currentIndex = 0;
        isAnimatingCard = false;
        dragState.active = false;
        dragState.pointerId = null;
        presentationTween = null;
        presentationState = 'default';
        presentationOffsetY = 0;
        interactionLocked = false;
    }

    return {
        start,
        destroy,
        transitionToState(state, options = {}) {
            return beginPresentationTransition(state, options.durationMs || 0);
        },
        getPresentationState() {
            return presentationState;
        },
    };
}

