import {
    emptyWorld, normalizeWorld, findRipples, addRipple, waitingRipples, stakeholders, applyWorld, openSchemes, dueSchemes,
    meanwhileSection, markShown, settleSurfaced, dismissScheme, holdScheme, arrivals, offscreenOf, LEVEL_LIMITS,
} from '../src/world/model.js';
import { worldPart, readWorld } from '../src/world/prompts.js';
import { emptyGm, normalizeGm } from '../src/planner/model.js';
import { buildDayPrompt, readDayPlan } from '../src/planner/prompts.js';
import { whoCouldTurnUp } from '../src/director/whereabouts.js';

let n = 0;
const newId = (p) => `${p}${++n}`;

// The Medina Syndicate: Cyril Moriarty, believed dead; his niece Ines;
// Enrique, who tried to kill him; the player character, Vex.
const entries = [
    { id: 'cyril', type: 'character', name: 'Cyril Moriarty', base: {} },
    { id: 'ines', type: 'character', name: 'Ines Moriarty', base: { role: 'smuggler', goals: 'keep the family whole' } },
    { id: 'enrique', type: 'character', name: 'Enrique', base: { role: 'Syndicate leader' } },
    { id: 'hale', type: 'character', name: 'Inspector Hale', base: {} },
    { id: 'medina', type: 'faction', name: 'Medina Syndicate', base: {} },
    { id: 'vex', type: 'character', name: 'Vex', base: {} },
];
const ties = { cyril: [{ otherId: 'ines', kind: 'niece' }], vex: [{ otherId: 'hale', kind: 'rival' }] };
const tiesOf = (id) => ties[id] ?? [];
const memberships = new Map([['cyril', ['medina']], ['enrique', ['medina']], ['ines', ['medina']]]);
const belief = {
    id: 'b1', kind: 'belief', status: 'held', text: 'Cyril Moriarty is dead', truth: 'Enrique tried to kill him and failed',
    about: [{ id: 'cyril', name: 'Cyril Moriarty' }], heldBy: [], knownBy: [{ id: 'enrique', name: 'Enrique' }], everyone: true,
};
const nameOf = (id) => entries.find((e) => e.id === id)?.name ?? '';
const resolve = (name) => entries.find((e) => e.name.toLowerCase() === String(name).toLowerCase())?.id ?? null;

describe('the world meanwhile - ripples', () => {
    it('only records what is there on the first look', () => {
        const { ripples, seen } = findRipples(undefined, { quests: [{ id: 'q1', name: 'The Ledger', status: 'Completed' }], dead: [{ id: 'hale', name: 'Inspector Hale' }] });
        expect(ripples).toEqual([]);
        expect(seen.primed).toBe(true);
    });

    it('finds quests ended, deaths, secrets out and beliefs shaken since the last look', () => {
        const first = findRipples(undefined, { quests: [{ id: 'q1', name: 'The Ledger', status: 'Active' }], dead: [], knowledge: [belief, { id: 'k2', kind: 'secret', status: 'kept', text: 'Ines runs guns', knownBy: [{ id: 'ines' }] }], beliefsSeen: {} });
        const { ripples } = findRipples(first.seen, {
            quests: [{ id: 'q1', name: 'The Ledger', status: 'Completed', involved: ['enrique'] }],
            dead: [{ id: 'hale', name: 'Inspector Hale', how: 'shot on the quay' }],
            knowledge: [belief, { id: 'k2', kind: 'secret', status: 'revealed', text: 'Ines runs guns', knownBy: [{ id: 'ines' }] }],
            beliefsSeen: { b1: { dockhand: 4 } },
        }, { nameOf: (id) => (id === 'dockhand' ? 'a dockhand' : nameOf(id)) });
        expect(ripples.map((r) => r.kind)).toEqual(['quest', 'death', 'secret', 'belief']);
        expect(ripples[1].text).toBe('Inspector Hale died - shot on the quay.');
        expect(ripples[3].text).toContain('a dockhand saw Cyril Moriarty');
        expect(ripples[3].ties).toEqual(expect.arrayContaining(['cyril', 'enrique']));
    });

    it('does not add the same waiting ripple twice', () => {
        const world = emptyWorld();
        addRipple(world, { id: 'r1', text: 'Someone saw Cyril on the quay' });
        expect(addRipple(world, { id: 'r2', text: 'someone saw cyril on the quay' })).toBeNull();
        expect(waitingRipples(world)).toHaveLength(1);
    });
});

describe('the world meanwhile - stakeholders', () => {
    const ripple = { id: 'r1', text: 'A dockhand saw Cyril', ties: ['cyril'] };

    it('finds family, faction and those who know the truth - never those present or the player', () => {
        const found = stakeholders([ripple], { entries, tiesOf, memberships, knowledge: [belief], present: ['cyril'], playerId: 'vex', limit: 5 });
        const ids = found.map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining(['ines', 'enrique', 'medina']));
        expect(ids).not.toContain('cyril');
        expect(ids).not.toContain('vex');
        expect(found.find((s) => s.id === 'enrique').why.join(' ')).toMatch(/knows/);
    });

    it('keeps to the limit, closest first, and skips the dead', () => {
        const found = stakeholders([ripple], { entries, tiesOf, memberships, knowledge: [belief], skip: ['ines'], limit: 2 });
        expect(found).toHaveLength(2);
        expect(found.map((s) => s.id)).not.toContain('ines');
    });

    it('stirs the player character\'s enemies when a ripple touches them', () => {
        const found = stakeholders([{ id: 'r2', text: 'Vex was seen with Cyril', ties: ['vex'] }], { entries, tiesOf, memberships, playerId: 'vex', limit: 5 });
        expect(found.map((s) => s.id)).toContain('hale');
    });
});

const answer = (over = {}) => ({ schemes: [{ id: '', who: ['Ines Moriarty'], aim: 'learn whether Cyril lives', motive: 'he is family', from: 'r1', steps: ['sail to Port Vael', 'question the dockhand', 'find him'], done: 1, inDays: 2, aboutPlayer: 'seeks', visibility: 'hidden', status: '', log: 'Ines took ship for Port Vael.', surface: { way: 'rumour', text: 'a dead man walks the quay', where: '', inDays: 0 }, ...over }] });

describe('the world meanwhile - schemes', () => {
    it('starts a scheme for a stakeholder, logs it and lets one line surface', () => {
        const world = emptyWorld();
        addRipple(world, { id: 'r1', text: 'A dockhand saw Cyril' });
        const counts = applyWorld(world, answer(), { day: 10, resolve, nameOf, ids: ['ines'], newId });
        expect(counts).toEqual({ moved: 0, started: 1, surfaced: 1, extras: [] });
        const s = openSchemes(world)[0];
        expect(s).toMatchObject({ who: ['ines'], names: ['Ines Moriarty'], done: 1, nextDay: 12, visibility: 'rumoured', startedDay: 10 });
        expect(world.log[0]).toMatchObject({ day: 10, text: 'Ines took ship for Port Vael.' });
        expect(world.surfaced[0]).toMatchObject({ way: 'rumour', fromDay: 10, untilDay: 13 });
        expect(waitingRipples(world)).toHaveLength(0);
        expect(offscreenOf(world, 10)).toEqual(['Ines took ship for Port Vael.']);
    });

    it('refuses schemes for people it was not shown, past the limits, or the user ended', () => {
        const world = emptyWorld();
        expect(applyWorld(world, answer(), { day: 1, resolve, ids: ['enrique'], newId }).started).toBe(0);
        applyWorld(world, answer(), { day: 1, resolve, ids: ['ines'], newId });
        // The limit of new schemes a pass may start.
        const two = { schemes: [answer({ who: ['Enrique'], aim: 'keep him dead' }).schemes[0], answer({ who: ['Inspector Hale'], aim: 'reopen the case' }).schemes[0]] };
        expect(applyWorld(world, two, { day: 2, resolve, ids: ['enrique', 'hale'], newId }).started).toBe(1);
        const id = openSchemes(world)[0].id;
        dismissScheme(world, id);
        expect(applyWorld(world, answer(), { day: 3, resolve, ids: ['ines'], newId }).started).toBe(0);
    });

    it('moves a scheme on - steps forward only, visibility only up - and closes it when its steps are done', () => {
        const world = emptyWorld();
        applyWorld(world, answer({ surface: null }), { day: 1, resolve, ids: ['ines'], newId });
        const s = openSchemes(world)[0];
        expect(dueSchemes(world, 2)).toHaveLength(0);
        expect(dueSchemes(world, 3)).toHaveLength(1);
        applyWorld(world, { schemes: [{ id: s.id, who: [], done: 0, visibility: 'hidden', log: 'nothing', inDays: 1 }] }, { day: 3, newId });
        expect(s.done).toBe(1);
        applyWorld(world, { schemes: [{ id: s.id, who: [], done: 3, visibility: 'public', log: 'Ines found him.' }] }, { day: 4, newId });
        expect(s.status).toBe('done');
        expect(s.visibility).toBe('public');
        expect(openSchemes(world)).toHaveLength(0);
    });

    it('leaves a paused scheme alone', () => {
        const world = emptyWorld();
        applyWorld(world, answer({ surface: null }), { day: 1, resolve, ids: ['ines'], newId });
        const s = openSchemes(world)[0];
        holdScheme(world, s.id, true);
        applyWorld(world, { schemes: [{ id: s.id, who: [], done: 3, log: 'moved' }] }, { day: 5, newId });
        expect(s.done).toBe(1);
        expect(dueSchemes(world, 9)).toHaveLength(0);
    });

    it('surfaces nothing hostile while the story eases, nothing at all for "log only", only talk for "talk"', () => {
        const ease = emptyWorld();
        applyWorld(ease, answer({ aboutPlayer: 'opposes' }), { day: 1, resolve, ids: ['ines'], aim: 'ease', newId });
        expect(ease.surfaced).toHaveLength(0);
        const log = emptyWorld();
        applyWorld(log, answer(), { day: 1, resolve, ids: ['ines'], surfacing: 'log', newId });
        expect(log.surfaced).toHaveLength(0);
        const talk = emptyWorld();
        applyWorld(talk, answer({ surface: { way: 'approach', text: 'Ines comes looking', inDays: 0 } }), { day: 1, resolve, ids: ['ines'], surfacing: 'talk', newId });
        expect(talk.surfaced).toHaveLength(0);
    });

    it('keeps to one surfacing a day at the Quiet level', () => {
        const world = emptyWorld();
        const two = { schemes: [answer().schemes[0], answer({ who: ['Enrique'], aim: 'keep him dead', surface: { way: 'news', text: 'a price on a rumour', inDays: 0 } }).schemes[0]] };
        applyWorld(world, two, { day: 1, resolve, ids: ['ines', 'enrique'], limits: { ...LEVEL_LIMITS.quiet, start: 2 }, newId });
        expect(openSchemes(world)).toHaveLength(2);
        expect(world.surfaced).toHaveLength(1);
    });
});

describe('the world meanwhile - what the director reads', () => {
    const world = () => {
        const w = emptyWorld();
        applyWorld(w, answer({ surface: { way: 'approach', text: 'Ines Moriarty is in the city asking after Cyril', where: '', inDays: 1 } }), { day: 1, resolve, ids: ['ines'], newId });
        return w;
    };

    it('shows a line from its day, at most three times, and a swipe is not counted twice', () => {
        const w = world();
        expect(meanwhileSection(w, { day: 1 }).text).toBe('');
        const first = meanwhileSection(w, { day: 2, userIndex: 5 });
        expect(first.text).toMatch(/^MEANWHILE/);
        expect(first.text).toContain('- Coming: Ines Moriarty is in the city asking after Cyril.');
        markShown(w, first.ids, 5);
        markShown(w, first.ids, 5);
        markShown(w, first.ids, 7);
        markShown(w, first.ids, 9);
        expect(meanwhileSection(w, { day: 2, userIndex: 9 }).ids).toHaveLength(1);
        expect(meanwhileSection(w, { day: 2, userIndex: 11 }).ids).toHaveLength(0);
    });

    it('says nothing while the scene is tense or lingering, or once the one coming is here', () => {
        const w = world();
        expect(meanwhileSection(w, { day: 2, quiet: true }).text).toBe('');
        expect(meanwhileSection(w, { day: 2, present: ['ines'] }).text).toBe('');
    });

    it('keeps a place\'s line to that place', () => {
        const w = emptyWorld();
        applyWorld(w, answer({ surface: { way: 'trace', text: 'the dockhand\'s room has been searched', where: 'The Quay', inDays: 0 } }), { day: 1, resolve, ids: ['ines'], placeOf: () => 'quay', newId });
        expect(meanwhileSection(w, { day: 1, placeIds: ['city'] }).text).toBe('');
        expect(meanwhileSection(w, { day: 1, placeIds: ['city', 'quay'] }).text).toContain('Here to be found');
    });

    it('lets those an approach brought near turn up, and lets them go when it is over', () => {
        const w = world();
        expect(arrivals(w, 2)).toEqual(['ines']);
        settleSurfaced(w, 9);
        expect(arrivals(w, 9)).toEqual([]);
        const characters = [{ id: 'ines', name: 'Ines Moriarty' }];
        expect(whoCouldTurnUp({ characters, locationId: 'tavern', inPlay: ['ines'] }).near).toEqual([]);
        expect(whoCouldTurnUp({ characters, locationId: 'tavern', inPlay: ['ines'], arrived: ['ines'] }).near[0]).toMatchObject({ id: 'ines', why: 'came looking, off scene' });
    });
});

describe('the world meanwhile - the DAY pass', () => {
    const scheme = () => {
        const w = emptyWorld();
        applyWorld(w, answer({ surface: null }), { day: 1, resolve, ids: ['ines'], newId });
        return openSchemes(w);
    };

    it('adds the world to the day plan\'s prompt in place of free off-screen lines', () => {
        const part = worldPart({ ripples: [{ id: 'r1', text: 'A dockhand saw Cyril' }], stakeholders: [{ name: 'Enrique', type: 'character', why: ['knows: he tried to kill him'], role: 'Syndicate leader' }], schemes: scheme(), day: 3, daysPassed: 2, limits: LEVEL_LIMITS.quiet, aim: { word: 'build', lean: 'uncertainty' }, userName: 'Vex' });
        expect(part.text).toContain('THE WORLD MEANWHILE');
        expect(part.text).toContain('2 days have passed');
        expect(part.text).toContain('- [r1] A dockhand saw Cyril');
        expect(part.text).toContain('- Enrique (person) - knows: he tried to kill him. role: Syndicate leader');
        expect(part.text).toMatch(/\[s\d+\] Ines Moriarty: learn whether Cyril lives/);
        expect(part.text).toContain('never decides what Vex does');
        const { prompt } = buildDayPrompt({ userName: 'Vex', messages: [], world: part });
        expect(prompt).toContain('THE WORLD MEANWHILE');
        expect(prompt).not.toContain('"offscreen"');
        expect(prompt).toContain('"world":{"schemes"');
        expect(buildDayPrompt({ userName: 'Vex', messages: [] }).prompt).toContain('"offscreen"');
    });

    it('says nothing when the world has nothing to move, and only talk when that is all that may surface', () => {
        expect(worldPart({ ripples: [], stakeholders: [], schemes: [] }).text).toBe('');
        const talk = worldPart({ ripples: [{ id: 'r1', text: 'x' }], surfacing: 'talk', limits: LEVEL_LIMITS.quiet });
        expect(talk.field).toContain('"way":"rumour|news|none"');
        expect(worldPart({ ripples: [{ id: 'r1', text: 'x' }], surfacing: 'log' }).text).toContain('leave every "surface" empty');
    });

    it('reads the world from the day plan\'s answer', () => {
        const plan = readDayPlan({
            moments: [{ text: 'Ines finds Vex in the tavern' }],
            world: { schemes: [{ id: '[s4]', who: ['Ines Moriarty'], done: '2', next_in_days: 3, visibility: 'Traces', status: 'under way', log: 'She questioned the dockhand.', surface: { way: 'approach', text: 'Ines comes to the tavern', in_days: 0 } }, { who: [], aim: '' }] },
        });
        expect(plan.world.schemes).toHaveLength(1);
        expect(plan.world.schemes[0]).toMatchObject({ id: 's4', done: 2, inDays: 3, visibility: 'traces', status: 'under way', surface: { way: 'approach', inDays: 0 } });
        expect(readWorld({ schemes: [] })).toBeNull();
        expect(readDayPlan({ moments: [{ text: 'x' }] }).world).toBeNull();
    });
});

describe('the world meanwhile - data', () => {
    it('is part of the planner\'s chat data, and survives normalising', () => {
        expect(emptyGm().world).toEqual(emptyWorld());
        const gm = normalizeGm({ world: { schemes: [{ id: 's1', aim: 'x', steps: ['a'], done: 5, status: 'bogus', visibility: 'nope' }], surfaced: [{ id: 'w1', way: 'shout', text: 'x' }], log: [{ text: 'y', day: 2 }] } });
        expect(gm.world.schemes[0]).toMatchObject({ done: 1, status: 'under way', visibility: 'hidden', held: false });
        expect(gm.world.surfaced).toEqual([]);
        expect(gm.world.log[0]).toMatchObject({ day: 2, text: 'y', veiled: true });
        expect(normalizeWorld(null)).toEqual(emptyWorld());
    });
});
