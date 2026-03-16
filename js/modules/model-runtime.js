import * as THREE from '../three/three.module.js';

export function createModelRuntime(container, config) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        1,
        config.camera.near,
        config.camera.far
    );

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: !!config.renderer.useAlpha,
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth || 1, window.innerHeight || 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = config.renderer.toneMappingExposure;
    renderer.setClearColor(config.renderer.clearColor, config.renderer.clearAlpha);

    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
        new THREE.Color(...config.lights.ambientColor),
        config.lights.ambientIntensity
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(config.lights.keyColor, config.lights.keyIntensity);
    const keyPitch = THREE.MathUtils.degToRad(config.lights.keyPitchDeg);
    const keyYaw = THREE.MathUtils.degToRad(config.lights.keyYawDeg);
    const keyDistance = config.lights.keyDistance;
    keyLight.position.set(
        keyDistance * Math.cos(keyPitch) * Math.sin(keyYaw),
        keyDistance * Math.sin(keyPitch),
        keyDistance * Math.cos(keyPitch) * Math.cos(keyYaw)
    );
    keyLight.target.position.set(0, 0, 0);
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.HemisphereLight(
        config.lights.fillSkyColor,
        config.lights.fillGroundColor,
        config.lights.fillIntensity
    );
    scene.add(fillLight);

    return {
        scene,
        camera,
        renderer,
        lights: {
            ambientLight,
            keyLight,
            fillLight,
        },
        resize() {
            const width = window.innerWidth || container.clientWidth || 1;
            const height = window.innerHeight || container.clientHeight || 1;

            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        },
        destroy() {
            renderer.dispose();

            if (renderer.domElement.parentElement === container) {
                container.removeChild(renderer.domElement);
            }
        },
    };
}
