import * as THREE from '../three/three.module.js';

function collectNodeNames(root) {
    const names = new Set();
    root.traverse((object) => {
        if (object.name) {
            names.add(object.name);
        }
    });
    return names;
}

function getTrackTargetName(trackName) {
    const boneIndex = trackName.indexOf('.bones[');
    if (boneIndex !== -1) return trackName.slice(0, boneIndex);

    const dotIndex = trackName.indexOf('.');
    if (dotIndex !== -1) return trackName.slice(0, dotIndex);

    return trackName;
}

function remapTrackName(trackName, nodeNames) {
    const boneIndex = trackName.indexOf('.bones[');
    const splitIndex = boneIndex !== -1 ? boneIndex : trackName.indexOf('.');
    if (splitIndex === -1) return trackName;

    const targetName = trackName.slice(0, splitIndex);
    if (nodeNames.has(targetName)) return trackName;

    const candidates = [targetName];
    ['|', '/', '\\', ':'].forEach((separator) => {
        if (!targetName.includes(separator)) return;
        const parts = targetName.split(separator);
        const lastSegment = parts[parts.length - 1];
        if (lastSegment) {
            candidates.push(lastSegment);
        }
    });

    for (const candidate of candidates) {
        if (nodeNames.has(candidate)) {
            return candidate + trackName.slice(splitIndex);
        }
    }

    return trackName;
}

function createCompatibleClip(clip, targetModel) {
    const nodeNames = collectNodeNames(targetModel);
    const tracks = [];
    let changed = false;

    clip.tracks.forEach((track) => {
        if (track.name.endsWith('.scale')) {
            changed = true;
            return;
        }

        const remappedTrackName = remapTrackName(track.name, nodeNames);
        const nextTrack = remappedTrackName === track.name ? track : (() => {
            const clonedTrack = track.clone();
            clonedTrack.name = remappedTrackName;
            changed = true;
            return clonedTrack;
        })();

        const targetName = getTrackTargetName(nextTrack.name);
        if (nodeNames.has(targetName)) {
            tracks.push(nextTrack);
        }
    });

    if (tracks.length === 0) return null;
    if (!changed && tracks.length === clip.tracks.length) return clip;

    if (tracks.length < clip.tracks.length) {
        console.warn(`Mapped ${tracks.length}/${clip.tracks.length} animation tracks to TakiGLB.`);
    }

    return new THREE.AnimationClip(
        clip.name || 'TakiGLB_ExternalAnimation',
        clip.duration,
        tracks
    );
}

function hasSkinnedMesh(root) {
    let found = false;
    root.traverse((object) => {
        if (object.isSkinnedMesh) {
            found = true;
        }
    });
    return found;
}

function isAncestor(ancestor, node) {
    let current = node;
    while (current) {
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
}

function attachPreserveWorld(parent, child) {
    if (!parent || !child || parent === child) return false;
    if (child.parent === parent) return false;
    if (isAncestor(child, parent)) return false;

    parent.attach(child);
    return true;
}

export function rebindDetachedMeshesToAnimationChain(targetModel) {
    if (hasSkinnedMesh(targetModel)) return;

    const rootBone = targetModel.getObjectByName('Root_M');
    const headBone = targetModel.getObjectByName('Bip001_Head') ||
        targetModel.getObjectByName('Neck_M');
    const bodyNode = targetModel.getObjectByName('Body');
    const hairNode = targetModel.getObjectByName('Hair');

    targetModel.updateMatrixWorld(true);

    let reboundCount = 0;
    if (attachPreserveWorld(rootBone, bodyNode)) {
        reboundCount += 1;
    }
    if (attachPreserveWorld(headBone, hairNode)) {
        reboundCount += 1;
    }

    if (reboundCount > 0) {
        console.info(
            `Rebound ${reboundCount} detached mesh node(s) to animation chain for external clip playback.`
        );
    }
}

export function applyExternalAnimation({
    loader,
    animationUrl,
    targetModel,
    onMixerReady,
}) {
    loader.load(
        animationUrl,
        (animationGltf) => {
            const sourceClip = animationGltf.animations?.[0];
            if (!sourceClip) {
                console.warn('Animation GLB loaded but contains no clips.');
                return;
            }

            const compatibleClip = createCompatibleClip(sourceClip, targetModel);
            if (!compatibleClip) {
                console.warn('No compatible animation tracks found for TakiGLB model.');
                return;
            }

            const mixer = new THREE.AnimationMixer(targetModel);
            const action = mixer.clipAction(compatibleClip);
            action.reset();
            action.enabled = true;
            action.clampWhenFinished = false;
            action.setEffectiveWeight(1);
            action.setEffectiveTimeScale(1);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.repetitions = Infinity;
            action.play();

            console.log('Looping external animation on TakiGLB:', compatibleClip.name || '(unnamed)');
            onMixerReady?.(mixer);
        },
        undefined,
        (error) => {
            console.warn('Failed to load animation GLB:', error);
        }
    );
}
