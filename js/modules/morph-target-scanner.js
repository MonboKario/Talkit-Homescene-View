const VISEME_NAMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'A', 'E', 'I', 'O', 'U'];

const ARKIT_TO_VISEME = {
    jawopen: 'A',
    mouthopen: 'A',
    mouthfunnel: 'O',
    mouthpucker: 'U',
    mouthsmile_l: 'E',
    mouthsmile_r: 'E',
    mouthsmileleft: 'E',
    mouthsmileright: 'E',
    mouthclose: 'sil',
    mouthpress_l: 'PP',
    mouthpress_r: 'PP',
    mouthpressleft: 'PP',
    mouthpressright: 'PP',
    mouthfrownleft: 'E',
    mouthfrownright: 'E',
    mouthrolllower: 'FF',
    mouthrollupper: 'FF',
    mouthshruglower: 'I',
    mouthshrugupper: 'I',
    mouthlowerdown_l: 'A',
    mouthlowerdown_r: 'A',
    mouthlowerdownleft: 'A',
    mouthlowerdownright: 'A',
};

function collectMeshMorphTargets(model) {
    const meshes = [];
    model.traverse((node) => {
        if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
            meshes.push(node);
        }
    });
    return meshes;
}

function tryExactMatch(meshes, visemeName) {
    for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary[visemeName];
        if (index !== undefined) {
            return { mesh, index };
        }
    }
    return null;
}

function tryPrefixMatch(meshes, visemeName) {
    const prefix = `viseme_${visemeName}`;
    for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary[prefix];
        if (index !== undefined) {
            return { mesh, index };
        }
    }
    return null;
}

function tryArkitFallback(meshes, visemeName) {
    for (const mesh of meshes) {
        for (const [arkitName, mappedViseme] of Object.entries(ARKIT_TO_VISEME)) {
            if (mappedViseme !== visemeName) continue;
            for (const [morphName, index] of Object.entries(mesh.morphTargetDictionary)) {
                if (morphName.toLowerCase() === arkitName) {
                    return { mesh, index };
                }
            }
        }
    }
    return null;
}

export function scanMorphTargets(model) {
    const result = new Map();

    if (!model) {
        console.warn('[LipSync] No model provided for morph target scanning.');
        return result;
    }

    const meshes = collectMeshMorphTargets(model);

    if (meshes.length === 0) {
        console.info('[LipSync] Model has no morph targets. Audio will play without lip animation.');
        return result;
    }

    const allMorphNames = new Set();
    for (const mesh of meshes) {
        for (const name of Object.keys(mesh.morphTargetDictionary)) {
            allMorphNames.add(name);
        }
    }
    console.info('[LipSync] Available morph targets:', [...allMorphNames].join(', '));

    for (const viseme of VISEME_NAMES) {
        const match = tryExactMatch(meshes, viseme)
            || tryPrefixMatch(meshes, viseme)
            || tryArkitFallback(meshes, viseme);

        if (match) {
            result.set(viseme, match);
        }
    }

    if (result.size > 0) {
        const mapped = [...result.keys()].join(', ');
        console.info(`[LipSync] Mapped visemes: ${mapped}`);
    } else {
        console.info('[LipSync] No matching viseme morph targets found. Audio will play without lip animation.');
    }

    return result;
}
