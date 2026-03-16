import { createCardSlider } from '../card-slider.js';
import { createDustParticles } from '../dust-particles.js';

function renderCards(stage, items) {
    const fragment = document.createDocumentFragment();

    items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = String(index);
        card.dataset.cardId = item.id;

        const image = document.createElement('img');
        image.src = item.imageUrl;
        image.alt = item.alt || `Card ${index + 1}`;
        image.decoding = 'async';
        image.draggable = false;

        const fogOverlay = document.createElement('div');
        fogOverlay.className = 'fog-overlay';

        const highlightOverlay = document.createElement('div');
        highlightOverlay.className = 'highlight-overlay';

        card.appendChild(image);
        card.appendChild(fogOverlay);
        card.appendChild(highlightOverlay);
        fragment.appendChild(card);
    });

    stage.replaceChildren(fragment);
}

export function initCardLayer(config) {
    const stage = document.querySelector(config.stageSelector);
    const container = document.querySelector(config.containerSelector);
    const gyroscopeButton = document.querySelector(config.gyroscopeButtonSelector);

    if (!stage) {
        console.error(`Card layer: stage ${config.stageSelector} not found.`);
        return { destroy() {} };
    }

    if (!container) {
        console.error(`Card layer: container ${config.containerSelector} not found.`);
        return { destroy() {} };
    }

    renderCards(stage, config.items);

    const cardSlider = createCardSlider({
        stage,
        layout: config.layout,
        interaction: config.interaction,
        clickAnimation: config.clickAnimation,
        gyroscopeButton,
    });
    const dustParticles = createDustParticles({
        container,
        ...config.dust,
    });

    cardSlider.start();
    dustParticles.start();

    return {
        destroy() {
            cardSlider.destroy();
            dustParticles.destroy();
            stage.replaceChildren();
        },
        transitionToState(state, options = {}) {
            const durationMs = options.durationMs || 0;
            const targetOpacity = state === 'taking' ? 0 : 1;

            dustParticles.transitionToVisibility(targetOpacity, durationMs);
            return cardSlider.transitionToState(state, options);
        },
        getPresentationState() {
            return cardSlider.getPresentationState();
        },
    };
}
