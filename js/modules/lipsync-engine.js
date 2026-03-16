function binarySearchKeyframe(keyframes, time) {
    let lo = 0;
    let hi = keyframes.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (keyframes[mid].time <= time) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    return Math.max(0, hi);
}

function resetAllInfluences(morphTargetMap) {
    for (const { mesh, index } of morphTargetMap.values()) {
        mesh.morphTargetInfluences[index] = 0;
    }
}

export function createLipsyncEngine({ timeline, morphTargetMap }) {
    const keyframes = timeline.keyframes;
    const hasTargets = morphTargetMap.size > 0;

    function update(timeSeconds) {
        if (!hasTargets || keyframes.length === 0) return;

        const idx = binarySearchKeyframe(keyframes, timeSeconds);
        const current = keyframes[idx];
        const next = keyframes[idx + 1];

        resetAllInfluences(morphTargetMap);

        if (!next || current.viseme === next.viseme) {
            const target = morphTargetMap.get(current.viseme);
            if (target) {
                target.mesh.morphTargetInfluences[target.index] = current.weight;
            }
            return;
        }

        const span = next.time - current.time;
        const t = span > 0 ? (timeSeconds - current.time) / span : 1;

        const currentTarget = morphTargetMap.get(current.viseme);
        const nextTarget = morphTargetMap.get(next.viseme);

        if (currentTarget) {
            const fadeOut = current.weight * (1 - t);
            currentTarget.mesh.morphTargetInfluences[currentTarget.index] = fadeOut;
        }

        if (nextTarget) {
            const fadeIn = next.weight * t;
            nextTarget.mesh.morphTargetInfluences[nextTarget.index] = fadeIn;
        }
    }

    function reset() {
        if (!hasTargets) return;
        resetAllInfluences(morphTargetMap);
    }

    return { update, reset };
}
