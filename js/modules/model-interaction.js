function addListener(cleanups, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => {
        target.removeEventListener(type, handler, options);
    });
}

export function createModelInteraction({
    eventTarget = window,
    getModel,
    hitTest,
    onModelClick,
    shouldIgnoreEvent,
}) {
    const cleanups = [];

    function ignoreEvent(event) {
        return typeof shouldIgnoreEvent === 'function' && shouldIgnoreEvent(event);
    }

    function handleClick(event) {
        if (!getModel()) return;
        if (ignoreEvent(event)) return;

        const hits = hitTest(event);
        if (hits.length > 0) {
            onModelClick?.(hits);
        }
    }

    addListener(cleanups, eventTarget, 'click', handleClick);

    return {
        destroy() {
            cleanups.splice(0).forEach((cleanup) => cleanup());
        },
    };
}
