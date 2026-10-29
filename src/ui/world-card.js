// The World card on the GM Plan tab (docs/DESIGN - THE WORLD MEANWHILE.md
// §9, phase 1): the side log of what went on off scene, the schemes under
// way (pause, let go on, end), a rumour of the user's own, and the level
// and surfacing settings. Hidden schemes and their log lines are veiled
// like the day plan unless spoilers are shown; what has surfaced is not.

import { getSettings } from '../settings.js';
import { isVeiled } from '../planner/model.js';
import { WORLD_LEVELS, SURFACINGS, openSchemes, waitingRipples } from '../world/model.js';
import { addUserRipple, endScheme, pauseScheme, setWorldLevel, setWorldSurfacing } from '../world/run.js';
import { peek } from '../planner/run.js';
import { ws, rerender, markDirty } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const VISIBILITY_TEXT = { hidden: 'hidden', traces: 'leaving traces', rumoured: 'rumoured', public: 'public' };
const ABOUT_TEXT = { seeks: 'seeks the player character', watches: 'watches the player character', opposes: 'works against the player character', helps: 'would help the player character' };
const WAY_TEXT = { rumour: 'Rumour', news: 'News', trace: 'Trace', approach: 'Coming' };

const veiledRow = (chatKey, key, text) => h('div', { class: 'sb-gm-row sb-gm-veiled' }, icon('fa-mask'), h('span', { class: 'sb-muted' }, text),
    h('a', { href: '#', class: 'sb-gm-peek', onclick: (e) => { e.preventDefault(); peek(chatKey, key); } }, 'peek'));

function schemeRow(gm, s, show) {
    const { chatKey } = ws.ctx;
    const who = s.names.join(', ') || 'Someone';
    const key = `world:${s.id}`;
    if (s.visibility === 'hidden' && isVeiled(gm, key, show)) return veiledRow(chatKey, key, `${who} ${s.names.length > 1 ? 'are' : 'is'} up to something`);
    const next = s.steps[s.done];
    return h('div', { class: `sb-gm-row${s.held ? ' sb-gm-past' : ''}` },
        h('div', { class: 'sb-gm-text' },
            h('b', {}, who), ` - ${s.aim}`, s.motive ? h('small', { class: 'sb-hint' }, ` Why: ${s.motive}`) : null,
            h('div', { class: 'sb-hint' }, `Step ${Math.min(s.done + 1, s.steps.length)} of ${s.steps.length}${next ? `: ${next}` : ''}`)),
        h('div', { class: 'sb-chips' },
            h('span', { class: 'sb-chip' }, s.held ? 'paused' : s.status),
            h('span', { class: 'sb-chip' }, VISIBILITY_TEXT[s.visibility]),
            ABOUT_TEXT[s.aboutPlayer] ? h('span', { class: 'sb-chip', title: ABOUT_TEXT[s.aboutPlayer] }, icon('fa-user')) : null,
            h('div', { class: 'sb-iconbtn', title: s.held ? 'Let it go on' : 'Pause it', onclick: () => { pauseScheme(chatKey, s.id, !s.held); rerender(); } }, icon(s.held ? 'fa-play' : 'fa-pause')),
            h('div', { class: 'sb-iconbtn', title: 'End it - it will not be started again', onclick: () => { endScheme(chatKey, s.id); rerender(); } }, icon('fa-xmark'))));
}

export function worldCard(gm, show) {
    const { chatKey } = ws.ctx;
    const w = getSettings().world;
    const on = w.level !== 'off';
    const plannerOn = getSettings().planner.enabled === true;
    const world = gm.world;
    const schemes = openSchemes(world);
    const hiddenIds = new Set(world.schemes.filter((s) => s.visibility === 'hidden').map((s) => s.id));
    const log = world.log.slice(-12).reverse();
    const surfaced = world.surfaced.slice().reverse();
    let text = '';
    const add = () => {
        if (!text.trim()) return;
        if (addUserRipple(chatKey, text.trim())) toast('success', 'The world will react to it when the next day begins.');
        rerender();
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-earth-europe'), 'The world meanwhile'),
        h('small', { class: 'sb-hint' }, 'People and factions who are not in the scene pursue things of their own when something happens that touches them. Some of it reaches the story as a rumour, news, a trace or someone coming to find the player character.'),
        field('How much', select(WORLD_LEVELS.map(([value, label]) => ({ value, label })), w.level, { onchange: (e) => { setWorldLevel(e.target.value); rerender(); } }),
            'Quiet: up to three schemes at once, one thing surfacing a day, moved by the planner\'s day plan - no extra model call.'),
        on ? field('What reaches the story', select(SURFACINGS.map(([value, label]) => ({ value, label })), w.surfacing, { onchange: (e) => { setWorldSurfacing(e.target.value); rerender(); } }),
            'Side log only: the world goes on, and you can read it here.') : null,
        on && !plannerOn ? h('p', { class: 'sb-hint' }, icon('fa-circle-info'), ' The planner is off, so the world stands still. Turn on "Plan ahead in the background".') : null,
        on ? h('div', { class: 'sb-gm-sub' }, 'Schemes') : null,
        ...(on ? schemes.map((s) => schemeRow(gm, s, show)) : []),
        on && !schemes.length ? h('p', { class: 'sb-muted' }, 'Nothing under way yet. Schemes begin when an in-game day starts after something happens that others would react to.') : null,
        on && surfaced.length ? h('div', { class: 'sb-gm-sub' }, 'Reaching the story') : null,
        ...(on ? surfaced.map((x) => h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, WAY_TEXT[x.way]), h('span', {}, x.text),
            h('small', { class: 'sb-hint' }, `${x.where ? `${x.where} · ` : ''}from day ${x.fromDay}${x.shownFor.length ? ` · shown ${x.shownFor.length}×` : ''}`))) : []),
        on && log.length ? h('div', { class: 'sb-gm-sub' }, 'Off scene') : null,
        ...(on ? log.map((l) => (l.veiled && hiddenIds.has(l.schemeId) && isVeiled(gm, `world:${l.schemeId}`, show)
            ? veiledRow(chatKey, `world:${l.schemeId}`, `Day ${l.day ?? '?'}: something went on elsewhere`)
            : h('div', { class: 'sb-gm-row sb-gm-log' }, h('span', { class: 'sb-chip' }, `day ${l.day ?? '?'}`), h('span', {}, l.text)))) : []),
        on ? h('div', { class: 'sb-gm-sub' }, 'Add something for the world to react to') : null,
        on ? h('textarea', { class: 'text_pole', rows: 2, placeholder: 'A rumour or a happening off scene - "Someone swears they saw Cyril Moriarty on the quay"', oninput: (e) => { text = e.target.value; markDirty(); } }) : null,
        on ? h('div', { class: 'sb-actions' },
            button('Add', add, { iconName: 'fa-plus', cls: 'sb-primary' }),
            waitingRipples(world).length ? h('small', { class: 'sb-hint' }, `${waitingRipples(world).length} waiting for the next day`) : null) : null);
}
