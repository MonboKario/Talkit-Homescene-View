import * as THREE from '../three/three.module.js';

const PATCH_VERSION = 'taki-cel-v3';
const SHADER_MARKER = '// TAKI_CEL_SHADER';

const DEFAULT_OPTIONS = Object.freeze({
    enabled: true,
    threshold: 0.5,
    softness: 0.02,
    shadowColor: Object.freeze([0.72, 0.76, 0.84]),
    specularStrength: 0.08,
});

function clamp01(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }

    return THREE.MathUtils.clamp(number, 0, 1);
}

function resolveShadowColor(shadowColor) {
    if (shadowColor instanceof THREE.Color) {
        return shadowColor.clone();
    }

    if (Array.isArray(shadowColor) && shadowColor.length >= 3) {
        return new THREE.Color(
            clamp01(shadowColor[0], DEFAULT_OPTIONS.shadowColor[0]),
            clamp01(shadowColor[1], DEFAULT_OPTIONS.shadowColor[1]),
            clamp01(shadowColor[2], DEFAULT_OPTIONS.shadowColor[2])
        );
    }

    if (typeof shadowColor === 'number' || typeof shadowColor === 'string') {
        return new THREE.Color(shadowColor);
    }

    return new THREE.Color().fromArray(DEFAULT_OPTIONS.shadowColor);
}

function resolveOptions(options = {}) {
    return {
        enabled: options.enabled !== false,
        threshold: clamp01(options.threshold, DEFAULT_OPTIONS.threshold),
        softness: clamp01(options.softness, DEFAULT_OPTIONS.softness),
        shadowColor: resolveShadowColor(options.shadowColor),
        specularStrength: clamp01(options.specularStrength, DEFAULT_OPTIONS.specularStrength),
    };
}

function injectCelShader(fragmentShader) {
    if (fragmentShader.includes(SHADER_MARKER) || !fragmentShader.includes('#include <lights_fragment_end>')) {
        return fragmentShader;
    }

    const shaderHeader = `
${SHADER_MARKER}
uniform float takiCelThreshold;
uniform float takiCelSoftness;
uniform float takiCelSpecularStrength;
uniform vec3 takiCelShadowColor;

`;

    let nextFragmentShader = fragmentShader.replace(
        'void main() {',
        `${shaderHeader}
void main() {`
    );

    const celLightingBlock = `
    float takiCelSoftEdge = max(takiCelSoftness, 0.0001);
    float takiCelMainLightNoL = 1.0;
    #if NUM_DIR_LIGHTS > 0
        takiCelMainLightNoL = clamp(dot(geometryNormal, directionalLights[0].direction), 0.0, 1.0);
    #endif

    float takiCelBand = smoothstep(
        takiCelThreshold - takiCelSoftEdge,
        takiCelThreshold + takiCelSoftEdge,
        takiCelMainLightNoL
    );

    vec3 takiCelBaseColor = diffuseColor.rgb;
    vec3 takiCelMainLightFlat = vec3(1.0);
    vec3 takiCelAmbientFlat = ambientLightColor;
    #if NUM_DIR_LIGHTS > 0
        takiCelMainLightFlat = max(directionalLights[0].color, vec3(0.0));
    #endif
    #if NUM_HEMI_LIGHTS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
            takiCelAmbientFlat += 0.5 * ( hemisphereLights[ i ].skyColor + hemisphereLights[ i ].groundColor );
        }
        #pragma unroll_loop_end
    #endif

    float takiCelAmbientScalar = clamp(
        max(takiCelAmbientFlat.r, max(takiCelAmbientFlat.g, takiCelAmbientFlat.b)),
        0.0,
        1.0
    );
    vec3 takiCelFlatLit = takiCelBaseColor * takiCelMainLightFlat;
    vec3 takiCelFlatShadow = takiCelBaseColor * mix(vec3(0.0), takiCelShadowColor, takiCelAmbientScalar);

    reflectedLight.directDiffuse = vec3(0.0);
    reflectedLight.indirectDiffuse = mix(takiCelFlatShadow, takiCelFlatLit, takiCelBand);
    reflectedLight.directSpecular *= takiCelSpecularStrength * takiCelBand;
    reflectedLight.indirectSpecular *= takiCelSpecularStrength;`;

    if (nextFragmentShader.includes('#include <aomap_fragment>')) {
        nextFragmentShader = nextFragmentShader.replace(
            '#include <aomap_fragment>',
            `#include <aomap_fragment>
${celLightingBlock}`
        );
    } else {
        nextFragmentShader = nextFragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
${celLightingBlock}`
        );
    }

    return nextFragmentShader;
}

function supportsCelShadingMaterial(material) {
    return Boolean(
        material?.isMeshLambertMaterial ||
        material?.isMeshPhongMaterial ||
        material?.isMeshStandardMaterial ||
        material?.isMeshPhysicalMaterial ||
        material?.isMeshToonMaterial
    );
}

function syncUniforms(uniforms, options) {
    if (!uniforms) {
        return;
    }

    uniforms.takiCelThreshold.value = options.threshold;
    uniforms.takiCelSoftness.value = options.softness;
    uniforms.takiCelSpecularStrength.value = options.specularStrength;
    uniforms.takiCelShadowColor.value.copy(options.shadowColor);
}

export function applyCelShadingToMaterial(material, options = {}) {
    if (!material?.onBeforeCompile || !supportsCelShadingMaterial(material)) {
        return material;
    }

    const resolvedOptions = resolveOptions(options);
    if (!resolvedOptions.enabled) {
        return material;
    }

    const patchState = material.userData.takiCelShader || null;
    if (patchState) {
        patchState.options = resolvedOptions;
        syncUniforms(patchState.uniforms, resolvedOptions);
        return material;
    }

    const previousOnBeforeCompile = material.onBeforeCompile?.bind(material);
    const previousCustomProgramCacheKey = material.customProgramCacheKey?.bind(material);

    const nextPatchState = {
        options: resolvedOptions,
        uniforms: null,
    };

    material.userData.takiCelShader = nextPatchState;
    material.onBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile?.(shader, renderer);

        shader.uniforms.takiCelThreshold = { value: nextPatchState.options.threshold };
        shader.uniforms.takiCelSoftness = { value: nextPatchState.options.softness };
        shader.uniforms.takiCelSpecularStrength = { value: nextPatchState.options.specularStrength };
        shader.uniforms.takiCelShadowColor = { value: nextPatchState.options.shadowColor.clone() };
        shader.fragmentShader = injectCelShader(shader.fragmentShader);

        nextPatchState.uniforms = shader.uniforms;
        syncUniforms(nextPatchState.uniforms, nextPatchState.options);
    };

    material.customProgramCacheKey = function customProgramCacheKey() {
        const baseKey = previousCustomProgramCacheKey ? previousCustomProgramCacheKey() : '';
        return `${baseKey}|${PATCH_VERSION}`;
    };

    material.needsUpdate = true;
    return material;
}

export function applyCelShadingToModel(root, options = {}) {
    if (!options?.enabled) {
        return;
    }

    root.traverse((object) => {
        if (!object.isMesh || !object.material) {
            return;
        }

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
            applyCelShadingToMaterial(material, options);
        });
    });
}
