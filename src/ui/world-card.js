// The World card on the GM Plan tab (docs/DESIGN - THE WORLD MEANWHILE.md
// §9, phases 1-2): the side log of what went on off scene, the schemes under
// way (pause, let go on, end, leave those behind it alone), what is reaching
// the story, a rumour of the user's own, quieting the world for a while,
// and the level and surfacing settings. Hidden schemes and their log lines
// are veiled like the day plan unless spoilers are shown; what has
// surfaced is not. Phase 3: situations (end one), changes waiting for the
// user's say-so (a death, a changed place), the changes so far - places,
// people, stances, faction conditions - with Undo and "Make it part of
// the setting", and the settings for changes to places and deaths.

import { getSettings } from '../settings.js';
import { getChatDoc } from '../store/chat-store.js';
import { isVeiled } from '../planner/model.js';
import { WORLD_LEVELS, SURFACINGS, LEVEL_LIMITS, openSchemes, waitingRipples, isQuiet } from '../world/model.js';
import { PLACE_MODES, DEATH_MODES, openSituations } from '../world/situations.js';
import {
    addUserRipple, endScheme, pauseScheme, leaveBe, quietFor, setWorldLevel, setWorldSurfacing, hasOwnPass,
    setWorldPlaces, setWorldDeaths, endSituationNow, answerChange, undoWorldChange, makePlaceCanon, undoPlaceCanon,
} from '../world/run.js';
import { isCanonOnly } from '../library/library.js';
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

const STAGE_TEXT = { brewing: 'brewing', open: 'open', turning: 'turning', ending: 'ending', over: 'over' };

// Situations: a feud, talks, a plague - the world's weather for a while.
function situationRow(gm, s, show) {
    const { chatKey } = ws.ctx;
    const key = `world:${s.id}`;
    if (s.stage === 'brewing' && isVeiled(gm, key, show)) return veiledRow(chatKey, key, 'Something is brewing');
    return h('div', { class: 'sb-gm-row' },
        h('div', { class: 'sb-gm-text' },
            h('b', {}, s.name), s.headline ? ` - "${s.headline}"` : '',
            s.truth ? h('small', { class: 'sb-hint' }, ` Truth: ${s.truth}`) : null,
            s.sides.length ? h('div', { class: 'sb-hint' }, `Sides: ${s.sides.map((x) => `${x.name}${x.wants ? ` (${x.wants})` : ''}`).join('; ')}`) : null,
            s.effects.length || s.whereNames.length ? h('div', { class: 'sb-hint' }, [s.whereNames.length ? `Where: ${s.whereNames.join(', ')}` : '', s.effects.join('; ')].filter(Boolean).join(' · ')) : null),
        h('div', { class: 'sb-chips' },
            h('span', { class: 'sb-chip' }, s.kind),
            h('span', { class: 'sb-chip' }, STAGE_TEXT[s.stage]),
            h('div', { class: 'sb-iconbtn', title: 'End it', onclick: () => { endSituationNow(chatKey, s.id); rerender(); } }, icon('fa-xmark'))));
}

// Changes waiting for the user's say-so (§2): a death off scene, a place changed.
function pendingRow(p) {
    const { chatId, chatKey } = ws.ctx;
    const answer = async (yes) => {
        const done = await answerChange(chatId, chatKey, p.id, yes);
        if (done && yes) toast('success', p.kind === 'death' ? `${p.name} is dead in this chat.` : `${p.name} has changed in this chat.`);
        rerender();
    };
    return h('div', { class: 'sb-gm-row' },
        h('span', { class: 'sb-chip' }, icon(p.kind === 'death' ? 'fa-skull' : 'fa-house-crack'), p.kind === 'death' ? ' Death' : ' Place'),
        h('span', {}, h('b', {}, p.name), ` - ${p.text}`),
        h('div', { class: 'sb-chips' },
            h('div', { class: 'sb-iconbtn', title: p.kind === 'death' ? 'Let it happen - the dead stay dead' : 'Let it change', onclick: () => void answer(true) }, icon('fa-check')),
            h('div', { class: 'sb-iconbtn', title: 'No - it does not happen', onclick: () => void answer(false) }, icon('fa-xmark'))));
}

// The changes off-scene acts have left, for this chat: places (with "Make
// it part of the setting"), people, stances between factions and faction
// conditions; each can be undone.
function changeRows(world, settingId) {
    const { chatId, chatKey } = ws.ctx;
    const canon = settingId && !isCanonOnly(settingId);
    const undo = (kind, key) => { undoWorldChange(chatKey, kind, key); rerender(); };
    const undoBtn = (kind, key) => h('div', { class: 'sb-iconbtn', title: 'Undo - as if it never happened', onclick: () => undo(kind, key) }, icon('fa-rotate-left'));
    const make = async (id) => { const out = await makePlaceCanon(chatId, chatKey, settingId, id); toast(out.ok ? 'success' : 'warning', out.message); rerender({ force: true }); };
    const unmake = async (id) => { const out = await undoPlaceCanon(chatId, chatKey, settingId, id); toast(out.ok ? 'success' : 'warning', out.message); rerender({ force: true }); };
    const rows = [];
    for (const [id, o] of Object.entries(world.overlays.places)) {
        rows.push(h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, icon('fa-house-crack')), h('span', {}, h('b', {}, o.name), ` - ${o.text}`),
            h('small', { class: 'sb-hint' }, `since day ${o.since ?? '?'}${o.until !== null ? `, until day ${o.until}` : ''}`),
            h('div', { class: 'sb-chips' },
                canon ? h('div', { class: 'sb-iconbtn', title: 'Make it part of the setting - the place\'s description takes it in (for every chat)', onclick: () => void make(id) }, icon('fa-book-bookmark')) : null,
                undoBtn('place', id))));
    }
    for (const [id, p] of Object.entries(world.overlays.people)) {
        rows.push(h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, icon('fa-user-pen')), h('span', {}, h('b', {}, p.name), ` - ${[p.where && `at ${p.where}`, p.state].filter(Boolean).join('; ')}`), h('div', { class: 'sb-chips' }, undoBtn('person', id))));
    }
    for (const s of world.overlays.stances) {
        rows.push(h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, icon('fa-handshake-slash')), h('span', {}, `${s.aName} and ${s.bName}: ${s.stance}`), h('div', { class: 'sb-chips' }, undoBtn('stance', `${s.a}|${s.b}`))));
    }
    for (const [id, c] of Object.entries(world.conditions)) {
        rows.push(h('div', { class: 'sb-gm-row' }, h('span', { class: 'sb-chip' }, icon('fa-flag')), h('span', {}, h('b', {}, c.name), ` - ${c.standing}${c.leadership ? `; ${c.leadership}` : ''}${c.mood ? `; mood: ${c.mood}` : ''}`), h('div', { class: 'sb-chips' }, undoBtn('condition', id))));
    }
    for (const r of world.canonized.slice().reverse()) {
        rows.push(h('div', { class: 'sb-gm-row sb-gm-past' }, h('span', { class: 'sb-chip' }, icon('fa-book-bookmark')), h('span', {}, h('b', {}, r.name), ` - in the setting now: ${r.text}`),
            h('div', { class: 'sb-chips' }, h('div', { class: 'sb-iconbtn', title: 'Undo - the old description comes back, and the change is this chat\'s only', onclick: () => void unmake(r.id) }, icon('fa-rotate-left')))));
    }
    return rows;
}

export function worldCard(gm, show, people = []) {
    const { chatId, chatKey } = ws.ctx;
    const w = getSettings().world;
    const on = w.level !== 'off';
    const plannerOn = getSettings().planner.enabled === true;
    const world = gm.world;
    const day = getChatDoc(chatKey).canonical.day;
    const schemes = openSchemes(world);
    const situations = openSituations(world);
    const changes = on ? changeRows(world, ws.ctx.settingId) : [];
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
        on ? field('Changes to places', select(PLACE_MODES.map(([value, label]) => ({ value, label })), w.places ?? 'on', { onchange: (e) => { setWorldPlaces(e.target.value); rerender(); } }),
            'A place burned, robbed or under guard - in this chat only, until you make it part of the setting.') : null,
        on ? field('Deaths off scene', select(DEATH_MODES.map(([value, label]) => ({ value, label })), w.deaths ?? 'ask', { onchange: (e) => { setWorldDeaths(e.target.value); rerender(); } }),
            'Never anyone in the scene, the player character, a plot device or an unkillable character, or anyone this chat\'s "Who can die" spares.') : null,
        on && !plannerOn ? h('p', { class: 'sb-hint' }, icon('fa-circle-info'), ' The planner is off, so the world stands still. Turn on "Plan ahead in the background".') : null,
        on && plannerOn ? quietRow(world, day) : null,
        on && world.pending.length ? h('div', { class: 'sb-gm-sub' }, 'Waiting for your say') : null,
        ...(on ? world.pending.map(pendingRow) : []),
        on && situations.length ? h('div', { class: 'sb-gm-sub' }, 'Situations') : null,
        ...(on ? situations.map((s) => situationRow(gm, s, show)) : []),
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
        on && changes.length ? h('div', { class: 'sb-gm-sub' }, 'Changes in this chat') : null,
        ...(on ? changes : []),
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
