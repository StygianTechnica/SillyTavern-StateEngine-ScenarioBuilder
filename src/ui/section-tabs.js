// Sections of a long page, one at a time under a row of tabs. They all stay
// on the page, the others hidden: changing tab needs no redraw, so nothing
// half typed in another section is lost and the page doesn't jump.

import { h, icon } from './dom.js';

// sections: [{ id, label, iconName, badge, body }] (one with no body is left
// out). active: the id to show, or the first. onPick(id): remember the choice.
export function sectionTabs(sections, active, onPick) {
    const shown = sections.filter((s) => s.body);
    let current = shown.some((s) => s.id === active) ? active : shown[0]?.id;
    const tabs = new Map();
    const panes = new Map();
    const pick = (id) => {
        current = id;
        for (const [key, tab] of tabs) {
            tab.classList.toggle('active', key === id);
            tab.setAttribute('aria-selected', String(key === id));
        }
        for (const [key, pane] of panes) pane.hidden = key !== id;
        onPick?.(id);
    };
    for (const s of shown) {
        tabs.set(s.id, h('div', {
            class: `sb-tab${s.id === current ? ' active' : ''}`,
            role: 'tab', tabindex: 0, 'aria-selected': String(s.id === current),
            onclick: () => pick(s.id),
            onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s.id); } },
        }, s.iconName ? icon(s.iconName) : null, h('span', {}, s.label), s.badge ? h('span', { class: 'sb-tab-badge' }, String(s.badge)) : null));
        panes.set(s.id, h('div', { class: 'sb-section-pane', role: 'tabpanel', hidden: s.id !== current }, s.body));
    }
    return h('div', { class: 'sb-section-tabs' },
        h('div', { class: 'sb-section-tabbar', role: 'tablist' }, [...tabs.values()]),
        [...panes.values()]);
}
