/**
 * Card Slider – 卡片拖拽滑动模块
 * 用法：CardSlider.init('#stage')
 */
const CardSlider = (() => {
    let stage, cards, TOTAL;
    let cardW = 0, stageW = 0, GAP = 0;
    let currentIdx = 0;

    function measure() {
        stageW = stage.offsetWidth;
        cardW  = cards[0].offsetWidth;
        GAP    = stageW * 0.04;
    }

    function getTransform(rel) {
        if (rel === 0) {
            return { x: 0, scale: 1, zIndex: 100, opacity: 1, blur: 0, rotate: 0, z: 200 };
        }

        if (rel > 0) {
            const step   = cardW * 1.15 + GAP;
            const x      = cardW / 2 + GAP * 1.5 + cardW * 1.15 / 2 + (rel - 1) * step;
            const zIndex = 200 - rel;
            return { x, scale: 1.15, zIndex, opacity: 0.40, blur: rel * 2, rotate: rel * 4, z: 300 - rel * 30 };
        }

        const depth  = -rel;
        const scales = [1];
        for (let d = 1; d <= depth; d++) {
            scales[d] = scales[d - 1] * Math.max(0.10, 0.80 - d * 0.05);
        }

        const peekRatios = [0, 0.45, 0.35, 0.25, 0.18];
        const getPeek = (d) => d < peekRatios.length ? peekRatios[d] : 0.10;

        let leftEdge = -cardW / 2, x = 0;
        for (let d = 1; d <= depth; d++) {
            const w = cardW * scales[d];
            leftEdge -= w * getPeek(d);
            x = leftEdge + w / 2;
        }

        return {
            x, scale: scales[depth], zIndex: 50 - depth,
            opacity: depth > 4 ? 0 : 1, blur: depth * 2, rotate: -depth * 4,
            z: -depth * 100
        };
    }

    function applyLayout(animate) {
        measure();
        cards.forEach((card, i) => {
            const rel = i - currentIdx;
            const { x, scale, zIndex, opacity, blur, rotate, z } = getTransform(rel);

            card.style.transition = animate
                ? 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.35s ease, filter 0.35s ease'
                : 'none';
            card.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale}) rotate(${rotate}deg)`;
            card.style.zIndex    = zIndex;
            card.style.opacity   = opacity;
            card.style.filter    = blur > 0 ? `blur(${blur}px)` : '';

            const fog = card.querySelector('.fog-overlay');
            if (fog) {
                const fogOpacity = rel < 0 ? Math.min(0.7, -rel * 0.15) : 0;
                fog.style.background = `rgba(255, 255, 255, ${fogOpacity})`;
            }
        });
    }

    function initDrag() {
        let dragStartX = 0, dragDelta = 0, isDragging = false;
        const THRESHOLD = 40;

        const onStart = (x) => { if (isAnimating) return; dragStartX = x; dragDelta = 0; isDragging = true; };
        const onMove  = (x) => { if (isDragging) dragDelta = x - dragStartX; };
        const onEnd   = (e) => {
            if (!isDragging) return;
            isDragging = false;

            if (Math.abs(dragDelta) < 5) {
                // 几乎没移动 → 视为点击
                const card = e && e.target && e.target.closest ? e.target.closest('.card') : null;
                if (card) {
                    const idx = cards.indexOf(card);
                    if (idx === currentIdx) triggerCardClick(card);
                }
                return;
            }

            if (dragDelta < -THRESHOLD && currentIdx < TOTAL - 1) currentIdx++;
            else if (dragDelta > THRESHOLD && currentIdx > 0) currentIdx--;
            applyLayout(true);
        };

        stage.addEventListener('mousedown', (e) => { onStart(e.clientX); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', (e) => onEnd(e));

        stage.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
        document.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
        document.addEventListener('touchend', onEnd);
    }

    function init(stageSelector) {
        stage = document.querySelector(stageSelector);
        if (!stage) return console.error('CardSlider: stage not found');
        cards = Array.from(stage.querySelectorAll('.card'));
        TOTAL = cards.length;

        applyLayout(false);
        initDrag();
        initTilt();
        initCardClick();
        window.addEventListener('resize', () => applyLayout(false));
    }

    // ── 点击当前卡片：晃动 + 缩小 + 推远 ──────────────
    let isAnimating = false;

    function triggerCardClick(card) {
        if (isAnimating) return;
        isAnimating = true;
        card.style.transition = 'none';

            const DURATION = 700;
            const FREQ = 2.2;          // 振荡频率（圈数）
            const DECAY = 3.5;         // 衰减速度
            const SCALE_DIP = 0.12;    // 最大缩小量
            const RX_AMP = 7;
            const RY_AMP = 9;
            const RZ_AMP = 3;

            const start = performance.now();

            function tick(now) {
                const elapsed = now - start;
                const t = Math.min(1, elapsed / DURATION);

                // 阻尼振荡：e^(-decay*t) * sin(freq*π*t)
                const envelope = Math.exp(-DECAY * t);
                const wave = Math.sin(FREQ * Math.PI * t) * envelope;

                const s  = 1 - SCALE_DIP * Math.abs(wave);
                const rx = RX_AMP * wave;
                const ry = RY_AMP * -wave;
                const rz = RZ_AMP * wave;

                card.style.transform = `translateX(0px) translateZ(200px) scale(${s}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;

                if (t < 1) {
                    requestAnimationFrame(tick);
                } else {
                    card.style.transform = 'translateX(0px) translateZ(200px) scale(1) rotate(0deg)';
                    isAnimating = false;
                }
            }

            requestAnimationFrame(tick);
    }

    function initCardClick() {
        // 点击由 drag 的 onEnd 判断触发，无需额外监听
    }

    // ── 鼠标跟随：卡片 3D 朝向鼠标 ──────────────
    let tiltX = 0, tiltY = 0;
    let targetTiltX = 0, targetTiltY = 0;
    const MAX_TILT = 16;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function initTilt() {
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        if (isMobile) {
            // ── 手机：陀螺仪 ──
            let gyroReady = false;

            function startGyro() {
                window.addEventListener('deviceorientation', (e) => {
                    if (e.beta == null || e.gamma == null) return;
                    // beta: 前后倾 (-180~180), gamma: 左右倾 (-90~90)
                    // 除以一个系数让小幅度倾斜就有明显效果
                    targetTiltX = clamp(e.beta / 4, -MAX_TILT, MAX_TILT);
                    targetTiltY = clamp(e.gamma / 3, -MAX_TILT, MAX_TILT);
                });
                gyroReady = true;
            }

            // iOS 13+ 需要用户授权
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // 需要用户交互触发，在首次触摸时请求
                const requestOnce = () => {
                    DeviceOrientationEvent.requestPermission()
                        .then(state => { if (state === 'granted') startGyro(); })
                        .catch(() => {});
                    document.removeEventListener('touchstart', requestOnce);
                };
                document.addEventListener('touchstart', requestOnce, { once: true });
            } else {
                // Android 或旧 iOS，直接监听
                startGyro();
            }
        } else {
            // ── 桌面：鼠标跟随 ──
            document.addEventListener('mousemove', (e) => {
                const rect = stage.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = (e.clientX - cx) / (rect.width / 2);
                const dy = (e.clientY - cy) / (rect.height / 2);
                targetTiltY = clamp(dx, -1, 1) * MAX_TILT;
                targetTiltX = clamp(-dy, -1, 1) * MAX_TILT;
            });

            document.addEventListener('mouseleave', () => {
                targetTiltX = 0;
                targetTiltY = 0;
            });
        }

        animateTilt();
    }

    function animateTilt() {
        tiltX += (targetTiltX - tiltX) * 0.1;
        tiltY += (targetTiltY - tiltY) * 0.1;

        if (Math.abs(tiltX) < 0.01 && targetTiltX === 0) tiltX = 0;
        if (Math.abs(tiltY) < 0.01 && targetTiltY === 0) tiltY = 0;

        if (stage) {
            stage.style.transform = `translateY(-7vh) scale(0.86) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        }

        requestAnimationFrame(animateTilt);
    }

    return { init };
})();
