import { scanMorphTargets } from './morph-target-scanner.js';
import { createLipsyncEngine } from './lipsync-engine.js';

export async function createLipsyncPlayback({ audioUrl, timelineUrl, getModel }) {
    const audio = new Audio();
    audio.src = audioUrl;
    audio.preload = 'auto';

    const response = await fetch(timelineUrl);
    if (!response.ok) {
        throw new Error(`Failed to load lipsync timeline: ${response.status}`);
    }
    const timeline = await response.json();

    let engine = null;
    let playing = false;

    function ensureEngine() {
        if (engine) return;

        const model = getModel();
        if (!model) {
            console.warn('[LipSync] Model not available yet for morph target scanning.');
            return;
        }

        const morphTargetMap = scanMorphTargets(model);
        engine = createLipsyncEngine({ timeline, morphTargetMap });
    }

    function handleEnded() {
        playing = false;
        engine?.reset();
    }

    audio.addEventListener('ended', handleEnded);

    function toggle() {
        ensureEngine();

        if (playing) {
            audio.pause();
            playing = false;
            engine?.reset();
        } else {
            audio.currentTime = 0;
            audio.play().catch((err) => {
                console.warn('[LipSync] Audio play failed:', err);
            });
            playing = true;
        }
    }

    function stop() {
        if (!playing) return;

        audio.pause();
        audio.currentTime = 0;
        playing = false;
        engine?.reset();
    }

    function update() {
        if (!playing || audio.paused) return;
        engine?.update(audio.currentTime);
    }

    function isPlaying() {
        return playing;
    }

    function destroy() {
        stop();
        audio.removeEventListener('ended', handleEnded);
        audio.src = '';
        engine = null;
    }

    return { toggle, stop, update, isPlaying, destroy };
}
