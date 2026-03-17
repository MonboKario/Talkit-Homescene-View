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

function getLoopMode(loopMode) {
    return loopMode === 'once' ? THREE.LoopOnce : THREE.LoopRepeat;
}

function getLoopRepetitions(loopMode) {
    return loopMode === 'once' ? 1 : Infinity;
}

function loadAnimationClip({ loader, animationUrl, targetModel }) {
    return new Promise((resolve, reject) => {
        loader.load(
            animationUrl,
            (animationGltf) => {
                const sourceClip = animationGltf.animations?.[0];
                if (!sourceClip) {
                    reject(new Error('Animation GLB loaded but contains no clips.'));
                    return;
                }

                const compatibleClip = createCompatibleClip(sourceClip, targetModel);
                if (!compatibleClip) {
                    reject(new Error('No compatible animation tracks found for TakiGLB model.'));
                    return;
                }

                resolve(compatibleClip);
            },
            undefined,
            (error) => {
                reject(error);
            }
        );
    });
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

export function createModelAnimationController({ loader, targetModel, animationStates }) {
    const mixer = new THREE.AnimationMixer(targetModel);
    const actionCache = new Map();
    const actionLoaders = new Map();

    let activeAction = null;
    let activeStateName = null;
    let pendingNextStateName = null;
    let playRequestId = 0;

    function getStateConfig(stateName) {
        return animationStates?.[stateName] || null;
    }

    async function getActionEntry(stateName) {
        if (actionCache.has(stateName)) {
            return actionCache.get(stateName);
        }

        if (actionLoaders.has(stateName)) {
            return actionLoaders.get(stateName);
        }

        const stateConfig = getStateConfig(stateName);
        if (!stateConfig?.url) {
            throw new Error(`Animation state "${stateName}" is not configured.`);
        }

        const actionPromise = loadAnimationClip({
            loader,
            animationUrl: stateConfig.url,
            targetModel,
        }).then((clip) => {
            const action = mixer.clipAction(clip);
            const entry = {
                action,
                clip,
                stateConfig,
            };
            actionCache.set(stateName, entry);
            actionLoaders.delete(stateName);
            return entry;
        }).catch((error) => {
            actionLoaders.delete(stateName);
            throw error;
        });

        actionLoaders.set(stateName, actionPromise);
        return actionPromise;
    }

    function handleActionFinished(event) {
        if (!activeAction || event.action !== activeAction) {
            return;
        }

        const nextStateName = pendingNextStateName;
        pendingNextStateName = null;

        if (!nextStateName) {
            return;
        }

        play(nextStateName);
    }

    async function play(stateName, options = {}) {
        const stateConfig = getStateConfig(stateName);
        if (!stateConfig?.url) {
            console.warn(`Animation state "${stateName}" is not configured.`);
            return false;
        }

        const requestId = ++playRequestId;
        const requestedNextStateName = options.nextState || null;

        let entry;
        try {
            entry = await getActionEntry(stateName);
        } catch (error) {
            console.warn(`Failed to load animation state "${stateName}":`, error);
            return false;
        }

        if (requestId !== playRequestId) {
            return false;
        }

        const { action } = entry;
        if (activeAction && activeAction !== action) {
            activeAction.stop();
        }

        pendingNextStateName = requestedNextStateName;
        action.reset();
        action.enabled = true;
        action.clampWhenFinished = stateConfig.loop === 'once';
        action.setEffectiveWeight(1);
        action.setEffectiveTimeScale(1);
        action.setLoop(getLoopMode(stateConfig.loop), getLoopRepetitions(stateConfig.loop));
        action.repetitions = getLoopRepetitions(stateConfig.loop);
        action.play();

        activeAction = action;
        activeStateName = stateName;
        return true;
    }

    function update(deltaSeconds) {
        mixer.update(deltaSeconds);
    }

    function preload(stateNames = Object.keys(animationStates || {})) {
        stateNames.forEach((stateName) => {
            if (!getStateConfig(stateName)?.url) {
                return;
            }

            getActionEntry(stateName).catch((error) => {
                console.warn(`Failed to preload animation state "${stateName}":`, error);
            });
        });
    }

    function destroy() {
        mixer.removeEventListener('finished', handleActionFinished);
        mixer.stopAllAction();
        mixer.uncacheRoot(targetModel);
        actionCache.clear();
        actionLoaders.clear();
        activeAction = null;
        activeStateName = null;
        pendingNextStateName = null;
    }

    mixer.addEventListener('finished', handleActionFinished);

    return {
        play,
        update,
        preload,
        destroy,
        getActiveStateName() {
            return activeStateName;
        },
    };
}

export function applyExternalAnimation({
    loader,
    animationUrl,
    targetModel,
    onMixerReady,
}) {
    const controller = createModelAnimationController({
        loader,
        targetModel,
        animationStates: {
            external: {
                url: animationUrl,
                loop: 'repeat',
            },
        },
    });

    controller.play('external').then((started) => {
        if (!started) return;
        onMixerReady?.({
            update: (deltaSeconds) => controller.update(deltaSeconds),
            stopAllAction() {
                controller.destroy();
            },
            uncacheRoot() {},
        });
    });
}
