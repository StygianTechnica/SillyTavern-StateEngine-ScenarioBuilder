// Richer form controls for the workspace: a chip multi-select with custom
// values, a select with "your own" entry, a dice button, and the sparkle
// button that asks for generated content.

import { h, icon } from './dom.js';
import { splitList, joinList } from '../library/world-options.js';

// Toggleable chips for `options`, plus any custom values already chosen and
// an input to add more. value/onChange use ", "-joined text.
export function chipSelect({ options, value, onChange, placeholder = 'Add your own…', cls = '', titles = {} }) {
    const chosen = new Set(splitList(value));
    const custom = [...chosen].filter((v) => !options.includes(v));
    const emit = () => onChange(joinList([...chosen]));
    const wrap = h('div', { class: `sb-chipselect ${cls}`.trim() });
    const draw = () => {
        const chip = (opt) => h('span', {
            class: `sb-chipopt${chosen.has(opt) ? ' on' : ''}`,
            title: titles[opt] ?? null,
            onclick: () => { if (chosen.has(opt)) chosen.delete(opt); else chosen.add(opt); emit(); draw(); },
        }, opt);
        const input = h('input', {
            class: 'text_pole sb-chipinput', placeholder,
            onkeydown: (e) => {
                if (e.key !== 'Enter' && e.key !== ',') return;
                e.preventDefault();
                for (const v of splitList(e.target.value)) { chosen.add(v); if (!options.includes(v)) custom.push(v); }
                e.target.value = '';
                emit();
                draw();
                wrap.querySelector('.sb-chipinput')?.focus();
            },
        });
        wrap.replaceChildren(...[...options, ...custom.filter((c) => !options.includes(c))].map(chip), input);
    };
    draw();
    return wrap;
}

// A select from [value, label] pairs (or { group, items } blocks) with a
// "Your own…" choice that reveals a text box.
export function selectWithCustom({ options, value, onChange, groups = null }) {
    const known = new Set(groups ? groups.flatMap((g) => g.items) : options.map(([v]) => v));
    const isCustom = !!value && !known.has(value);
    const text = h('input', { class: 'text_pole', value: isCustom ? value : '', placeholder: 'Your own…', hidden: !isCustom, oninput: (e) => onChange(e.target.value) });
    const opt = (v, label) => h('option', { value: v, selected: !isCustom && v === (value ?? '') }, label);
    const sel = h('select', {
        class: 'text_pole',
        onchange: (e) => {
            const custom = e.target.value === '__custom__';
            text.hidden = !custom;
            if (custom) { text.focus(); onChange(text.value); } else onChange(e.target.value);
        },
    },
    opt('', '—'),
    groups ? groups.map((g) => h('optgroup', { label: g.label }, g.items.map((v) => opt(v, v))))
        : options.map(([v, label]) => opt(v, label)),
    h('option', { value: '__custom__', selected: isCustom }, 'Your own…'));
    return h('div', { class: 'sb-selectcustom' }, sel, text);
}

export function diceButton(onclick, title = 'Roll a random choice') {
    return h('span', { class: 'sb-iconbtn sb-dice', title, onclick }, icon('fa-dice'));
}

// The "generate" sparkle. `busy` shows a spinner; `disabledReason` greys it
// out with an explanation.
export function sparkButton(onclick, { title = 'Generate', busy = false, disabledReason = '' } = {}) {
    return h('span', {
        class: `sb-iconbtn sb-spark${busy ? ' sb-busy' : ''}${disabledReason ? ' sb-off' : ''}`,
        title: disabledReason || title,
        onclick: disabledReason || busy ? null : onclick,
    }, icon(busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'));
}

// A labelled field whose label row carries extra buttons on the right.
export function fieldWithTools(label, control, tools = [], hint = null, cls = '') {
    return h('div', { class: `sb-field ${cls}`.trim() },
        h('div', { class: 'sb-field-head' }, h('span', { class: 'sb-field-label' }, label), h('span', { class: 'sb-field-tools' }, tools)),
        control,
        hint ? h('small', { class: 'sb-hint' }, hint) : null);
}
