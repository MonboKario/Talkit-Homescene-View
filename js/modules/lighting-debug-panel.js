function createDebugField(field, tuningState, onTuningChange, inputs) {
    const wrapper = document.createElement('label');
    wrapper.className = 'camera-debug-panel__field';

    const label = document.createElement('span');
    label.textContent = field.label;

    const input = document.createElement('input');
    input.className = 'camera-debug-panel__input';
    input.type = 'number';
    input.step = field.step;

    if (field.min !== undefined) {
        input.min = String(field.min);
    }
    if (field.max !== undefined) {
        input.max = String(field.max);
    }

    input.addEventListener('input', () => {
        const next = Number(input.value);
        if (!Number.isFinite(next)) {
            return;
        }

        field.write(tuningState, next);
        onTuningChange?.();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    inputs[field.key] = input;

    return wrapper;
}

function createSectionTitle(text) {
    const title = document.createElement('div');
    title.textContent = text;
    title.style.fontWeight = '600';
    title.style.fontSize = '11px';
    title.style.opacity = '0.8';
    title.style.marginTop = '2px';
    return title;
}

export function createLightingDebugPanel({
    container,
    tuningState,
    enabled = true,
    toggleKey = 'Numpad1',
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

    const mainLightFields = [
        {
            key: 'mainLight.x',
            label: 'main x',
            step: '0.1',
            read: (state) => state.mainLight.x,
            write: (state, next) => { state.mainLight.x = next; },
        },
        {
            key: 'mainLight.y',
            label: 'main y',
            step: '0.1',
            read: (state) => state.mainLight.y,
            write: (state, next) => { state.mainLight.y = next; },
        },
        {
            key: 'mainLight.z',
            label: 'main z',
            step: '0.1',
            read: (state) => state.mainLight.z,
            write: (state, next) => { state.mainLight.z = next; },
        },
    ];

    const lightIntensityFields = [
        {
            key: 'mainLight.intensity',
            label: 'key intensity',
            step: '0.05',
            min: 0,
            max: 10,
            read: (state) => state.mainLight.intensity,
            write: (state, next) => { state.mainLight.intensity = next; },
        },
        {
            key: 'ambient.intensity',
            label: 'ambient',
            step: '0.05',
            min: 0,
            max: 10,
            read: (state) => state.ambientLight.intensity,
            write: (state, next) => { state.ambientLight.intensity = next; },
        },
    ];

    const shaderFields = [
        {
            key: 'cel.threshold',
            label: 'threshold',
            step: '0.01',
            min: 0,
            max: 1,
            read: (state) => state.celShader.threshold,
            write: (state, next) => { state.celShader.threshold = next; },
        },
        {
            key: 'cel.softness',
            label: 'softness',
            step: '0.005',
            min: 0,
            max: 1,
            read: (state) => state.celShader.softness,
            write: (state, next) => { state.celShader.softness = next; },
        },
        {
            key: 'cel.shadowColor',
            label: 'shadow color',
            step: '0.01',
            min: 0,
            max: 2,
            read: (state) => state.celShader.shadowColor,
            write: (state, next) => { state.celShader.shadowColor = next; },
        },
        {
            key: 'cel.specularStrength',
            label: 'specular',
            step: '0.01',
            min: 0,
            max: 1,
            read: (state) => state.celShader.specularStrength,
            write: (state, next) => { state.celShader.specularStrength = next; },
        },
    ];

    const allFields = [...mainLightFields, ...lightIntensityFields, ...shaderFields];

    function refresh() {
        allFields.forEach((field) => {
            const input = inputs[field.key];
            if (!input) {
                return;
            }

            const value = field.read(tuningState);
            input.value = Number.isFinite(value) ? value.toFixed(3) : '0';
        });
    }

    function setVisible(nextVisible) {
        visible = !!nextVisible;
        if (panel) {
            panel.style.display = visible ? 'flex' : 'none';
        }
    }

    function handleKeydown(event) {
        if (event.code !== toggleKey) {
            return;
        }

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
    panel.className = 'camera-debug-panel lighting-debug-panel';
    panel.style.top = '196px';

    const title = document.createElement('div');
    title.className = 'camera-debug-panel__title';
    title.textContent = `Light / Shader Debug (${toggleKey})`;
    panel.appendChild(title);

    panel.appendChild(createSectionTitle('Main Light'));

    const mainLightGrid = document.createElement('div');
    mainLightGrid.className = 'camera-debug-panel__grid camera-debug-panel__grid--triple';
    mainLightFields.forEach((field) => {
        mainLightGrid.appendChild(createDebugField(field, tuningState, onTuningChange, inputs));
    });
    panel.appendChild(mainLightGrid);

    const lightIntensityGrid = document.createElement('div');
    lightIntensityGrid.className = 'camera-debug-panel__grid';
    lightIntensityGrid.style.gridTemplateColumns = 'repeat(2, minmax(110px, 1fr))';
    lightIntensityFields.forEach((field) => {
        lightIntensityGrid.appendChild(createDebugField(field, tuningState, onTuningChange, inputs));
    });
    panel.appendChild(lightIntensityGrid);

    panel.appendChild(createSectionTitle('Cel Shader'));

    const shaderGrid = document.createElement('div');
    shaderGrid.className = 'camera-debug-panel__grid';
    shaderGrid.style.gridTemplateColumns = 'repeat(4, minmax(82px, 1fr))';
    shaderFields.forEach((field) => {
        shaderGrid.appendChild(createDebugField(field, tuningState, onTuningChange, inputs));
    });
    panel.appendChild(shaderGrid);

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
