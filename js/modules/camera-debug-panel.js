function createDebugField(field, cameraTuning, onTuningChange, inputs) {
    const wrapper = document.createElement('label');
    wrapper.className = 'camera-debug-panel__field';

    const label = document.createElement('span');
    label.textContent = field.label;

    const input = document.createElement('input');
    input.className = 'camera-debug-panel__input';
    input.type = 'number';
    input.step = field.step;

    if (field.key === 'fov') {
        input.min = '1';
        input.max = '179';
    }

    input.addEventListener('input', () => {
        const next = Number(input.value);
        if (!Number.isFinite(next)) return;

        if (field.key === 'fov') {
            cameraTuning.fov = next;
        } else {
            cameraTuning[field.group][field.axis] = next;
        }

        onTuningChange?.();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    inputs[field.key] = input;

    return wrapper;
}

export function createCameraDebugPanel({
    container,
    cameraTuning,
    enabled = true,
    toggleKey = 'Numpad0',
    onTuningChange,
}) {
    if (!enabled) {
        return {
            refresh() {},
            destroy() {},
        };
    }

    let panel = null;
    let visible = false;
    const inputs = {};

    function refresh() {
        const fields = [
            ['position.x', cameraTuning.position.x, 3],
            ['position.y', cameraTuning.position.y, 3],
            ['position.z', cameraTuning.position.z, 3],
            ['rotationDeg.x', cameraTuning.rotationDeg.x, 2],
            ['rotationDeg.y', cameraTuning.rotationDeg.y, 2],
            ['rotationDeg.z', cameraTuning.rotationDeg.z, 2],
            ['fov', cameraTuning.fov, 2],
        ];

        fields.forEach(([key, value, precision]) => {
            const input = inputs[key];
            if (!input) return;
            input.value = Number.isFinite(value) ? value.toFixed(precision) : '0';
        });
    }

    function setVisible(nextVisible) {
        visible = !!nextVisible;
        if (panel) {
            panel.style.display = visible ? 'flex' : 'none';
        }
    }

    function handleKeydown(event) {
        if (event.code !== toggleKey) return;

        const target = event.target;
        if (
            target instanceof HTMLElement &&
            (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            )
        ) {
            return;
        }

        event.preventDefault();
        setVisible(!visible);
    }

    panel = document.createElement('div');
    panel.className = 'camera-debug-panel';

    const title = document.createElement('div');
    title.className = 'camera-debug-panel__title';
    title.textContent = `Camera Debug (${toggleKey})`;
    panel.appendChild(title);

    const translationGrid = document.createElement('div');
    translationGrid.className = 'camera-debug-panel__grid camera-debug-panel__grid--triple';

    const rotationGrid = document.createElement('div');
    rotationGrid.className = 'camera-debug-panel__grid camera-debug-panel__grid--triple';

    const fovGrid = document.createElement('div');
    fovGrid.className = 'camera-debug-panel__grid camera-debug-panel__grid--single';

    [
        { key: 'position.x', label: 'position x', group: 'position', axis: 'x', step: '0.01' },
        { key: 'position.y', label: 'position y', group: 'position', axis: 'y', step: '0.01' },
        { key: 'position.z', label: 'position z', group: 'position', axis: 'z', step: '0.01' },
    ].forEach((field) => {
        translationGrid.appendChild(createDebugField(field, cameraTuning, onTuningChange, inputs));
    });

    [
        { key: 'rotationDeg.x', label: 'rotation x', group: 'rotationDeg', axis: 'x', step: '0.1' },
        { key: 'rotationDeg.y', label: 'rotation y', group: 'rotationDeg', axis: 'y', step: '0.1' },
        { key: 'rotationDeg.z', label: 'rotation z', group: 'rotationDeg', axis: 'z', step: '0.1' },
    ].forEach((field) => {
        rotationGrid.appendChild(createDebugField(field, cameraTuning, onTuningChange, inputs));
    });

    fovGrid.appendChild(
        createDebugField(
            { key: 'fov', label: 'fov', step: '0.1' },
            cameraTuning,
            onTuningChange,
            inputs
        )
    );

    panel.appendChild(translationGrid);
    panel.appendChild(rotationGrid);
    panel.appendChild(fovGrid);
    container.appendChild(panel);
    refresh();
    setVisible(false);

    window.addEventListener('keydown', handleKeydown);

    return {
        refresh,
        destroy() {
            window.removeEventListener('keydown', handleKeydown);

            if (panel?.parentElement) {
                panel.parentElement.removeChild(panel);
            }

            panel = null;
        },
    };
}
