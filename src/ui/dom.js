// Small DOM helpers for Scenario Builder's UI. Everything user- or
// model-provided goes onto the page as TEXT, never as markup.

// h('div', { class: 'x', onclick: fn, title: 't' }, 'text', childNode, [more])
export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'value') el.value = value;
        else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'multiple' || key === 'hidden') el[key] = value === true;
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    append(el, children);
    return el;
}

function append(el, children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        if (Array.isArray(child)) append(el, child);
        else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}

export function icon(name) {
    return h('i', { class: `fa-solid ${name}` });
}

// A SillyTavern-styled button.
export function button(label, onclick, { iconName = null, title = null, cls = '', disabled = false } = {}) {
    return h('div', { class: `menu_button menu_button_icon sb-button ${cls}`.trim(), title, onclick: disabled ? null : onclick, 'aria-disabled': disabled ? 'true' : null },
        iconName ? icon(iconName) : null, label ? h('span', {}, label) : null);
}

// <select> from [{ value, label }], with `value` selected.
export function select(options, value, attrs = {}) {
    return h('select', { class: 'text_pole', ...attrs },
        options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label)));
}

export function field(label, control, hint = null) {
    return h('label', { class: 'sb-field' }, h('span', { class: 'sb-field-label' }, label), control, hint ? h('small', { class: 'sb-hint' }, hint) : null);
}

export const csv = (list) => (Array.isArray(list) ? list.join(', ') : '');
export const fromCsv = (text) => String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function toast(kind, message) {
    try {
        toastr[kind](message, 'Scenario Builder');
    } catch {
        console.log(`[ScenarioBuilder] ${message}`);
    }
}
