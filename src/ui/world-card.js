// The World card on the GM Plan tab (docs/DESIGN - THE WORLD MEANWHILE.md
// §9, phases 1-2): the side log of what went on off scene, the schemes under
// way (pause, let go on, end, leave those behind it alone), what is reaching
// the story, a rumour of the user's own, quieting the world for a while,
// and the level and surfacing settings. Hidden schemes and their log lines
// are veiled like the day plan unless spoilers are shown; what has
// surfaced is not.

import { getSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { isVeiled } from '../planner/model.js';
import { WORLD_LEVELS, SURFACINGS, LEVEL_LIMITS, openSchemes, waitingRipples, isQuiet } from '../world/model.js';
import { addUserRipple, endScheme, pauseScheme, leaveBe, quietFor, setWorldLevel, setWorldSurfacing, hasOwnPass } from '../world/run.js';
import { peek, runWorld, getPlannerStatus } from '../planner/run.js';
import { ws, rerender, markDirty } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

const VISIBILITY_TEXT = { hidden: 'hidden', traces: 'leaving traces', rumoured: 'rumoured', public: 'public' };
const ABOUT_TEXT = { seeks: 'seeks the player character', watches: 'watches the player character', opposes: 'works against the player character', helps: 'would help the player character' };
const WAY_TEXT = { rumour: 'Rumour', news: 'News', trace: 'Trace', approach: 'Coming', arrival: 'Nearby' };
const LEVEL_HINT = {
    off: 'Off: no one off scene does anything.',
    quiet: `Quiet: up to ${LEVEL_LIMITS.quiet.schemes} schemes at once, ${LEVEL_LIMITS.quiet.surface} thing surfacing a day, moved by the planner's day plan - no extra model call.`,
    lively: `Lively: up to ${LEVEL_LIMITS.lively.schemes} schemes, ${LEVEL_LIMITS.lively.surface} things surfacing a day. One model call when a day begins, and one more after something big happens.`,
    turbulent: `Turbulent: up to ${LEVEL_LIMITS.turbulent.schemes} schemes, ${LEVEL_LIMITS.turbulent.surface} things a day. A call when a day begins, after big happenings, and every ${LEVEL_LIMITS.turbulent.every} replies while something waits.`,
};

const clean = () => { ws.dirty = false; rerender(); };

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
            s.heard ? h('span', { class: 'sb-chip', title: 'The player character has learned of it' }, icon('fa-ear-listen')) : null,
            ABOUT_TEXT[s.aboutPlayer] ? h('span', { class: 'sb-chip', title: ABOUT_TEXT[s.aboutPlayer] }, icon('fa-user')) : null,
            h('div', { class: 'sb-iconbtn', title: s.held ? 'Let it go on' : 'Pause it', onclick: () => { pauseScheme(chatKey, s.id, !s.held); rerender(); } }, icon(s.held ? 'fa-play' : 'fa-pause')),
            h('div', { class: 'sb-iconbtn', title: `Leave ${who} alone - the world will not move them again until you say so`, onclick: () => { leaveBe(chatKey, s.who, true); rerender(); } }, icon('fa-user-slash')),
            h('div', { class: 'sb-iconbtn', title: 'End it - it will not be started again', onclick: () => { endScheme(chatKey, s.id); rerender(); } }, icon('fa-xmark'))));
}

// Quieting the world: nothing surfaces for some in-game days.
function quietRow(world, day) {
    const { chatKey } = ws.ctx;
    if (isQuiet(world, day)) {
        return h('div', { class: 'sb-actions' },
            h('small', { class: 'sb-hint' }, icon('fa-moon'), ` Keeping quiet until the end of day ${world.quietUntil}: schemes go on, nothing reaches the story.`),
            button('Let it stir again', () => { quietFor(chatKey, 0); rerender(); }, { iconName: 'fa-play' }));
    }
    let days = 3;
    return h('div', { class: 'sb-actions' },
        h('input', { type: 'number', class: 'text_pole', min: 1, max: 60, value: days, style: 'width:5em', title: 'In-game days', onchange: (e) => { days = Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)); } }),
        button('Quiet the world', () => { quietFor(chatKey, days); toast('info', `Nothing from the world reaches the story for ${days} day${days === 1 ? '' : 's'}.`); rerender(); }, { iconName: 'fa-moon', title: 'For when the story needs to breathe: schemes go on, nothing surfaces' }));
}

export function worldCard(gm, show, people = []) {
    const { chatId, chatKey } = ws.ctx;
    const w = getSettings().world;
    const on = w.level !== 'off';
    const plannerOn = getSettings().planner.enabled === true;
    const world = gm.world;
    const day = getChatDoc(chatKey).canonical.day;
    const schemes = openSchemes(world);
    const hiddenIds = new Set(world.schemes.filter((s) => s.visibility === 'hidden').map((s) => s.id));
    const log = world.log.slice(-12).reverse();
    const surfaced = world.surfaced.slice().reverse();
    const waiting = waitingRipples(world).length;
    const own = hasOwnPass();
    const st = getPlannerStatus();
    const busy = st.running && st.chatKey === chatKey;
    const nameOf = (id) => people.find((p) => p.id === id)?.name ?? id;
    let text = '';
    const add = () => {
        if (!text.trim()) return;
        if (addUserRipple(chatKey, text.trim())) toast('success', own ? 'The world will react to it after the next reply.' : 'The world will react to it when the next day begins.');
        clean();
    };
    const moveNow = async () => {
        toast('info', 'Moving the world… (in the background)');
        const out = await runWorld(chatId, chatKey);
        if (out) toast('success', `The world: ${out}`);
        else if (getPlannerStatus().error) toast('warning', `The world could not move: ${getPlannerStatus().error}`);
        rerender();
    };
    return h('div', { class: 'sb-card' },
        h('div', { class: 'sb-card-title' }, icon('fa-earth-europe'), 'The world meanwhile',
            busy && st.running === 'world' ? h('span', { class: 'sb-chip' }, icon('fa-spinner fa-spin'), 'moving…') : null),
        h('small', { class: 'sb-hint' }, 'People and factions who are not in the scene pursue things of their own when something happens that touches them. Some of it reaches the story: a rumour, news, a trace, someone coming to find the player character or arriving nearby, a happening on the calendar, or a quest idea. How much follows the story\'s tension.'),
        field('How much', select(WORLD_LEVELS.map(([value, label]) => ({ value, label })), w.level, { onchange: (e) => { setWorldLevel(e.target.value); rerender(); } }), LEVEL_HINT[w.level] ?? ''),
        on ? field('What reaches the story', select(SURFACINGS.map(([value, label]) => ({ value, label })), w.surfacing, { onchange: (e) => { setWorldSurfacing(e.target.value); rerender(); } }),
            'Rumours and news only: the world goes on, and the player hears about it. Side log only: read it here.') : null,
        on && !plannerOn ? h('p', { class: 'sb-hint' }, icon('fa-circle-info'), ' The planner is off, so the world stands still. Turn on "Plan ahead in the background".') : null,
        on && plannerOn ? quietRow(world, day) : null,
        on ? h('div', { class: 'sb-gm-sub' }, 'Schemes') : null,
        ...(on ? schemes.map((s) => schemeRow(gm, s, show)) : []),
        on && !schemes.length ? h('p', { class: 'sb-muted' }, own ? 'Nothing under way yet. Schemes begin when something happens that others would react to.' : 'Nothing under way yet. Schemes begin when an in-game day starts after something happens that others would react to.') : null,
        on && surfaced.length ? h('div', { class: 'sb-gm-sub' }, 'Reaching the story') : null,
        ...(on ? surfaced.map((x) => h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, WAY_TEXT[x.way] ?? x.way), h('span', {}, x.text),
            h('small', { class: 'sb-hint' }, `${x.where ? `${x.where} · ` : ''}from day ${x.fromDay}${x.shownFor.length ? ` · shown ${x.shownFor.length}×` : ''}`))) : []),
        on && log.length ? h('div', { class: 'sb-gm-sub' }, 'Off scene') : null,
        ...(on ? log.map((l) => (l.veiled && hiddenIds.has(l.schemeId) && isVeiled(gm, `world:${l.schemeId}`, show)
            ? veiledRow(chatKey, `world:${l.schemeId}`, `Day ${l.day ?? '?'}: something went on elsewhere`)
            : h('div', { class: 'sb-gm-row sb-gm-log' }, h('span', { class: 'sb-chip' }, `day ${l.day ?? '?'}`), h('span', {}, l.text)))) : []),
        on && world.leftAlone.length ? h('div', { class: 'sb-gm-sub' }, 'Left alone') : null,
        ...(on ? world.leftAlone.map((id) => h('div', { class: 'sb-gm-row' }, h('span', {}, nameOf(id)),
            h('div', { class: 'sb-iconbtn', title: 'Let the world move them again', onclick: () => { leaveBe(chatKey, [id], false); rerender(); } }, icon('fa-rotate-left')))) : []),
        on ? h('div', { class: 'sb-gm-sub' }, 'Add something for the world to react to') : null,
        on ? h('textarea', { class: 'text_pole', rows: 2, placeholder: 'A rumour or a happening off scene - "Someone swears they saw Cyril Moriarty on the quay". Or in the chat: /sb-world rumour ...', oninput: (e) => { text = e.target.value; markDirty(); } }) : null,
        on ? h('div', { class: 'sb-actions' },
            button('Add', add, { iconName: 'fa-plus', cls: 'sb-primary' }),
            own && plannerOn ? button('Move the world now', () => void moveNow(), { iconName: 'fa-forward', disabled: busy, title: 'One model call: the people off scene act on what waits, today' }) : null,
            waiting ? h('small', { class: 'sb-hint' }, `${waiting} waiting for ${own ? 'the world to move' : 'the next day'}`) : null) : null);
}
