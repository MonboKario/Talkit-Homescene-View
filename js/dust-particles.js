const DEFAULT_OPTIONS = Object.freeze({
    count: 60,
    minSize: 0.8,
    maxSize: 2.5,
    minSpeed: 0.08,
    maxSpeed: 0.35,
    minOpacity: 0.15,
    maxOpacity: 0.5,
    color: '255,255,255',
});

function addListener(cleanups, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => {
        target.removeEventListener(type, handler, options);
    });
}

export function createDustParticles(options) {
    const cleanups = [];
    const opts = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    let canvas = null;
    let context = null;
    let particles = [];
    let animationFrameId = 0;
    let width = 0;
    let height = 0;

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function createParticle() {
        return {
            x: randomBetween(0, width),
            y: randomBetween(0, height),
            radius: randomBetween(opts.minSize, opts.maxSize),
            velocityX: randomBetween(-opts.maxSpeed, opts.maxSpeed),
            velocityY: randomBetween(-opts.maxSpeed, opts.maxSpeed),
            opacity: randomBetween(opts.minOpacity, opts.maxOpacity),
            opacityDirection: randomBetween(0.0003, 0.0012) * (Math.random() > 0.5 ? 1 : -1),
        };
    }

    function initializeParticles() {
        particles = Array.from({ length: opts.count }, () => createParticle());
    }

    function resizeCanvas() {
        if (!canvas || !context) return;

        const rect = opts.container.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;

        width = rect.width || window.innerWidth;
        height = rect.height || window.innerHeight;

        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function updateParticles() {
        particles.forEach((particle) => {
            particle.x += particle.velocityX;
            particle.y += particle.velocityY;
            particle.opacity += particle.opacityDirection;

            if (particle.opacity > opts.maxOpacity || particle.opacity < opts.minOpacity) {
                particle.opacityDirection = -particle.opacityDirection;
            }

            if (particle.x < -5) particle.x = width + 5;
            if (particle.x > width + 5) particle.x = -5;
            if (particle.y < -5) particle.y = height + 5;
            if (particle.y > height + 5) particle.y = -5;
        });
    }

    function drawParticles() {
        context.clearRect(0, 0, width, height);

        particles.forEach((particle) => {
            context.globalAlpha = particle.opacity;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fillStyle = `rgb(${opts.color})`;
            context.fill();
        });

        context.globalAlpha = 1;
    }

    function loop() {
        updateParticles();
        drawParticles();
        animationFrameId = requestAnimationFrame(loop);
    }

    function start() {
        if (!opts.container) {
            console.error('DustParticles: container not found.');
            return;
        }

        canvas = document.createElement('canvas');
        canvas.className = 'dust-layer';
        canvas.style.opacity = '1';
        opts.container.appendChild(canvas);

        context = canvas.getContext('2d');
        resizeCanvas();
        initializeParticles();
        loop();

        addListener(cleanups, window, 'resize', resizeCanvas);
    }

    function transitionToVisibility(targetOpacity, durationMs = 0) {
        if (!canvas) return false;

        const duration = Math.max(0, Number(durationMs) || 0);
        if (duration > 0) {
            canvas.style.transition = `opacity ${duration}ms ease`;
        } else {
            canvas.style.transition = 'none';
        }

        canvas.style.opacity = String(targetOpacity);
        return true;
    }

    function destroy() {
        cleanups.splice(0).forEach((cleanup) => cleanup());

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }

        particles = [];

        if (canvas?.parentElement) {
            canvas.parentElement.removeChild(canvas);
        }

        canvas = null;
        context = null;
    }

    return {
        start,
        destroy,
        transitionToVisibility,
    };
}
