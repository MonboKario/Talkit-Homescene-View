/**
 * Dust Particles – 轻量 Canvas 粒子模块
 * 用法：DustParticles.init(containerSelector, options)
 */
const DustParticles = (() => {
    let canvas, ctx, particles = [], animId;
    let W, H;

    const defaults = {
        count: 60,
        minSize: 0.8,
        maxSize: 2.5,
        minSpeed: 0.08,
        maxSpeed: 0.35,
        minOpacity: 0.15,
        maxOpacity: 0.5,
        color: '255,255,255',
    };

    let opts = {};

    function rand(min, max) {
        return Math.random() * (max - min) + min;
    }

    function createParticle() {
        return {
            x: rand(0, W),
            y: rand(0, H),
            r: rand(opts.minSize, opts.maxSize),
            vx: rand(-opts.maxSpeed, opts.maxSpeed),
            vy: rand(-opts.maxSpeed, opts.maxSpeed),
            opacity: rand(opts.minOpacity, opts.maxOpacity),
            opacityDir: rand(0.0003, 0.0012) * (Math.random() > 0.5 ? 1 : -1),
        };
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < opts.count; i++) {
            particles.push(createParticle());
        }
    }

    function update() {
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.opacity += p.opacityDir;
            if (p.opacity > opts.maxOpacity || p.opacity < opts.minOpacity) {
                p.opacityDir = -p.opacityDir;
            }
            if (p.x < -5) p.x = W + 5;
            if (p.x > W + 5) p.x = -5;
            if (p.y < -5) p.y = H + 5;
            if (p.y > H + 5) p.y = -5;
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        for (const p of particles) {
            ctx.globalAlpha = p.opacity;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${opts.color})`;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function loop() {
        update();
        draw();
        animId = requestAnimationFrame(loop);
    }

    function resize() {
        const parent = canvas.parentElement;
        const rect = parent.getBoundingClientRect();
        W = canvas.width  = rect.width  || window.innerWidth;
        H = canvas.height = rect.height || window.innerHeight;
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';
    }

    function init(containerSelector, userOpts) {
        opts = Object.assign({}, defaults, userOpts);

        const container = document.querySelector(containerSelector);
        if (!container) return console.error('DustParticles: container not found');

        const pos = getComputedStyle(container).position;
        if (pos === 'static') container.style.position = 'relative';

        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:100;';
        container.appendChild(canvas);
        ctx = canvas.getContext('2d');

        resize();
        initParticles();
        loop();

        window.addEventListener('resize', resize);
    }

    function destroy() {
        cancelAnimationFrame(animId);
        if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
        particles = [];
    }

    return { init, destroy };
})();
