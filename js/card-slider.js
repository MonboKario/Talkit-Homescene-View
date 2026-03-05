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
            return { x: 0, scale: 1, zIndex: 100, opacity: 1, blur: 0, rotate: 0 };
        }

        if (rel > 0) {
            const step   = cardW * 1.15 + GAP;
            const x      = cardW / 2 + GAP * 1.5 + cardW * 1.15 / 2 + (rel - 1) * step;
            const zIndex = 200 - rel; // right-1=199, right-2=198… 始终最高
            return { x, scale: 1.15, zIndex, opacity: 0.40, blur: rel * 2, rotate: rel * 4 };
        }

        const depth  = -rel;
        const scales = [1];
        for (let d = 1; d <= depth; d++) {
            scales[d] = scales[d - 1] * Math.max(0.10, 0.80 - d * 0.05);
        }

        const peekRatios = [0, 0.25, 0.20, 0.15, 0.10];
        const getPeek = (d) => d < peekRatios.length ? peekRatios[d] : 0.05;

        let leftEdge = -cardW / 2, x = 0;
        for (let d = 1; d <= depth; d++) {
            const w = cardW * scales[d];
            leftEdge -= w * getPeek(d);
            x = leftEdge + w / 2;
        }

        return {
            x, scale: scales[depth], zIndex: 50 - depth, // left-1=49, left-2=48… 始终最低
            opacity: depth > 4 ? 0 : 1, blur: depth * 2, rotate: -depth * 4
        };
    }

    function applyLayout(animate) {
        measure();
        cards.forEach((card, i) => {
            const rel = i - currentIdx;
            const { x, scale, zIndex, opacity, blur, rotate } = getTransform(rel);

            card.style.transition = animate
                ? 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.35s ease, filter 0.35s ease'
                : 'none';
            card.style.transform = `translateX(${x}px) scale(${scale}) rotate(${rotate}deg)`;
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

        const onStart = (x) => { dragStartX = x; dragDelta = 0; isDragging = true; };
        const onMove  = (x) => { if (isDragging) dragDelta = x - dragStartX; };
        const onEnd   = () => {
            if (!isDragging) return;
            isDragging = false;
            if (dragDelta < -THRESHOLD && currentIdx < TOTAL - 1) currentIdx++;
            else if (dragDelta > THRESHOLD && currentIdx > 0) currentIdx--;
            applyLayout(true);
        };

        stage.addEventListener('mousedown', (e) => { onStart(e.clientX); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', onEnd);

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
        window.addEventListener('resize', () => applyLayout(false));
    }

    // ── 鼠标跟随：卡片 3D 朝向鼠标 ──────────────
    let tiltX = 0, tiltY = 0;
    let targetTiltX = 0, targetTiltY = 0;
    const MAX_TILT = 16;

    function initTilt() {
        document.addEventListener('mousemove', (e) => {
            const rect = stage.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            targetTiltY = Math.max(-1, Math.min(1, dx)) * MAX_TILT;
            targetTiltX = Math.max(-1, Math.min(1, -dy)) * MAX_TILT;
        });

        document.addEventListener('mouseleave', () => {
            targetTiltX = 0;
            targetTiltY = 0;
        });

        animateTilt();
    }

    function animateTilt() {
        tiltX += (targetTiltX - tiltX) * 0.1;
        tiltY += (targetTiltY - tiltY) * 0.1;

        if (Math.abs(tiltX) < 0.01 && targetTiltX === 0) tiltX = 0;
        if (Math.abs(tiltY) < 0.01 && targetTiltY === 0) tiltY = 0;

        // 3D 倾斜应用到 stage 容器，不干扰卡片各自的 transform
        if (stage) {
            stage.style.transform = `translateY(-7vh) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        }

        requestAnimationFrame(animateTilt);
    }

    return { init };
})();
