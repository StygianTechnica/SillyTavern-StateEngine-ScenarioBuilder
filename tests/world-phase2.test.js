import {
    emptyWorld, addRipple, applyWorld, openSchemes, stirOf, worldDue, markPass, quietWorld, isQuiet, leaveAlone, hearScheme,
    meanwhileSection, arrivals, publicLines, LEVEL_LIMITS,
} from '../src/world/model.js';
import { worldPart, buildWorldPrompt, readWorld } from '../src/world/prompts.js';
import { buildDirectorPrompt, parseDirectorNote } from '../src/director/prompt.js';

let n = 0;
const newId = (p) => `${p}_${(++n).toString(36)}`;

const people = { 'ines moriarty': 'ines', enrique: 'enrique', 'inspector hale': 'hale' };
const names = { ines: 'Ines Moriarty', enrique: 'Enrique', hale: 'Inspector Hale' };
const resolve = (name) => people[String(name).toLowerCase()] ?? null;
const nameOf = (id) => names[id] ?? '';
const ids = ['ines', 'enrique', 'hale'];

const scheme = (over = {}) => ({ id: '', who: ['Ines Moriarty'], aim: 'learn whether Cyril lives', motive: 'he is family', from: 'r1', steps: ['sail to Port Vael', 'question the dockhand', 'find him'], done: 1, inDays: 2, aboutPlayer: 'seeks', visibility: 'hidden', status: '', log: 'Ines took ship for Port Vael.', surface: null, ...over });
const opts = (over = {}) => ({ day: 5, resolve, nameOf, ids, newId, ...over });

describe('the world meanwhile, phase 2 - how much stirs', () => {
    it('presses harder when the story builds, gently when it eases, not at all when quieted', () => {
        const q = LEVEL_LIMITS.lively;
        expect(stirOf(q, { aim: 'build' })).toMatchObject({ surface: 3, start: 3, hostile: true, press: 'harder' });
        expect(stirOf(q, { aim: 'ease' })).toMatchObject({ surface: 1, start: 1, hostile: false });
        expect(stirOf(q, { aim: 'hold' })).toMatchObject({ surface: 2, start: 2, hostile: true });
        expect(stirOf(q, { aim: 'build', day: 4, quietUntil: 5 })).toMatchObject({ surface: 0, press: 'quiet' });
        expect(stirOf(q, { day: 6, quietUntil: 5 }).surface).toBe(2);
    });

    it('lets a building story start and surface more', () => {
        const world = emptyWorld();
        const answer = { schemes: [
            scheme({ surface: { way: 'rumour', text: 'a dead man walks the quay' } }),
            scheme({ who: ['Enrique'], aim: 'keep him dead', surface: { way: 'news', text: 'a price on a rumour' } }),
        ] };
        expect(applyWorld(world, answer, opts({ aim: 'build' }))).toMatchObject({ started: 2, surfaced: 2 });
        expect(applyWorld(emptyWorld(), answer, opts())).toMatchObject({ started: 1, surfaced: 1 });
    });

    it('lets nothing surface while the world is quieted, and clears what had not reached the story', () => {
        const world = emptyWorld();
        applyWorld(world, { schemes: [scheme({ surface: { way: 'rumour', text: 'a dead man walks the quay' } })] }, opts());
        quietWorld(world, 5, 3);
        expect(isQuiet(world, 7)).toBe(true);
        expect(isQuiet(world, 8)).toBe(false);
        expect(world.surfaced).toEqual([]);
        const s = openSchemes(world)[0];
        const moved = applyWorld(world, { schemes: [{ ...scheme({ id: s.id, who: [], done: 2 }), surface: { way: 'approach', text: 'Ines comes looking' } }] }, opts({ day: 6 }));
        expect(moved).toMatchObject({ moved: 1, surfaced: 0 });
        expect(s.done).toBe(2);
        quietWorld(world, 6, 0);
        expect(world.quietUntil).toBeNull();
    });
});

describe('the world meanwhile, phase 2 - the WORLD pass cadence', () => {
    it('is never due at Quiet - the DAY pass moves that world', () => {
        expect(worldDue(emptyWorld(), { level: 'quiet', day: 3 })).toBe('');
        expect(worldDue(emptyWorld(), { level: 'off', day: 3 })).toBe('');
    });

    it('is due when a day begins, once more after a major ripple at Lively, and no more', () => {
        const world = emptyWorld();
        expect(worldDue(world, { level: 'lively', day: 3 })).toBe('day');
        markPass(world, { day: 3, turn: 10 });
        expect(worldDue(world, { level: 'lively', day: 3, turn: 11 })).toBe('');
        addRipple(world, { id: 'r1', kind: 'quest', text: 'The quest "The Ledger" was seen through.' });
        expect(worldDue(world, { level: 'lively', day: 3, turn: 11 })).toBe('');
        addRipple(world, { id: 'r2', kind: 'death', text: 'Inspector Hale died.' });
        expect(worldDue(world, { level: 'lively', day: 3, turn: 11 })).toBe('ripple');
        markPass(world, { day: 3, turn: 11 });
        addRipple(world, { id: 'r3', kind: 'user', text: 'Someone saw Cyril.' });
        expect(worldDue(world, { level: 'lively', day: 3, turn: 12 })).toBe('');
        expect(worldDue(world, { level: 'turbulent', day: 3, turn: 12 })).toBe('ripple');
        expect(worldDue(world, { level: 'lively', day: 4, turn: 12 })).toBe('day');
    });

    it('moves a Turbulent world every so many replies while ripples wait', () => {
        const world = emptyWorld();
        markPass(world, { day: 3, turn: 10 });
        world.pass.count = 9;
        addRipple(world, { id: 'r1', kind: 'quest', text: 'A quest ended.' });
        expect(worldDue(world, { level: 'turbulent', day: 3, turn: 21 })).toBe('');
        expect(worldDue(world, { level: 'turbulent', day: 3, turn: 22 })).toBe('every');
    });
});

describe('the world meanwhile, phase 2 - surfacing', () => {
    it('hands happenings and quest hooks on as extras, and keeps hooks out of canon-only settings', () => {
        const world = emptyWorld();
        const out = applyWorld(world, { schemes: [
            scheme({ surface: { way: 'happening', text: 'The Moriarty ship docks', inDays: 0 } }),
            scheme({ who: ['Enrique'], aim: 'keep him dead', surface: { way: 'hook', text: 'Find Cyril before Enrique does', name: 'A Dead Man\'s Trail' } }),
        ] }, opts({ aim: 'build' }));
        expect(out.extras).toEqual([
            expect.objectContaining({ way: 'happening', text: 'The Moriarty ship docks', day: 6, ties: ['Ines Moriarty'] }),
            expect.objectContaining({ way: 'hook', name: 'A Dead Man\'s Trail', why: 'Enrique: keep him dead', ties: ['Enrique'] }),
        ]);
        expect(world.surfaced).toEqual([]);
        const canon = applyWorld(emptyWorld(), { schemes: [scheme({ surface: { way: 'hook', text: 'x', name: 'Y' } })] }, opts({ canonOnly: true }));
        expect(canon.extras).toEqual([]);
    });

    it('puts an approach on the agenda too when the world has its own pass', () => {
        const approach = { schemes: [scheme({ surface: { way: 'approach', text: 'Ines comes to the tavern', inDays: 1 } })] };
        expect(applyWorld(emptyWorld(), approach, opts()).extras).toEqual([]);
        expect(applyWorld(emptyWorld(), approach, opts({ agenda: true })).extras).toEqual([expect.objectContaining({ way: 'happening', day: 6, text: 'Ines comes to the tavern' })]);
    });

    it('brings someone nearby with an arrival, without having them seek the player character', () => {
        const world = emptyWorld();
        applyWorld(world, { schemes: [scheme({ surface: { way: 'arrival', text: 'Ines Moriarty is in the city', inDays: 0 } })] }, opts());
        expect(arrivals(world, 5)).toEqual(['ines']);
        const { text } = meanwhileSection(world, { day: 5 });
        expect(text).toMatch(/- Nearby: Ines Moriarty is in the city\. They may turn up .* \[s_\w+\]$/);
        expect(openSchemes(world)[0].visibility).toBe('traces');
    });

    it('starts nothing for those the user left alone, and ends their schemes', () => {
        const world = emptyWorld();
        applyWorld(world, { schemes: [scheme()] }, opts());
        leaveAlone(world, ['ines']);
        expect(openSchemes(world)).toEqual([]);
        expect(applyWorld(world, { schemes: [scheme({ aim: 'something else' })] }, opts({ day: 6 })).started).toBe(0);
        leaveAlone(world, ['ines'], false);
        expect(applyWorld(world, { schemes: [scheme({ aim: 'something else' })] }, opts({ day: 7 })).started).toBe(1);
    });
});

describe('the world meanwhile, phase 2 - HEARD', () => {
    it('marks a scheme heard: it is no longer hidden, the log says how, and only once', () => {
        const world = emptyWorld();
        applyWorld(world, { schemes: [scheme()] }, opts());
        const s = openSchemes(world)[0];
        expect(hearScheme(world, s.id, 'overheard at the docks', { day: 6 })).toBe(true);
        expect(s).toMatchObject({ heard: true, visibility: 'rumoured' });
        expect(world.log.at(-1)).toMatchObject({ day: 6, veiled: false, text: 'The player character learned of it - overheard at the docks (Ines Moriarty: learn whether Cyril lives).' });
        expect(hearScheme(world, s.id, 'again')).toBe(false);
        expect(hearScheme(world, 's_nope')).toBe(false);
        expect(publicLines(world, 6)).toEqual(['Whispered: Ines Moriarty - learn whether Cyril lives.']);
    });

    it('is read from the director\'s note and asked for only when MEANWHILE has ids', () => {
        const parsed = parseDirectorNote('Mira mentions the quay.\nHEARD | [s_ab12] | Mira told her\nHEARD | s_ab12 | twice\nNext: the cellar.');
        expect(parsed.heard).toEqual([{ id: 's_ab12', how: 'Mira told her' }]);
        expect(parsed.note).not.toContain('HEARD');
        const base = { messages: [{ name: 'Ash', text: 'Hello.', isUser: true }], userName: 'Ash' };
        expect(buildDirectorPrompt({ ...base, gmPlan: 'MEANWHILE (private)\n- Word going round: x. [s_ab12]' }).prompt).toContain('HEARD | <its id>');
        expect(buildDirectorPrompt({ ...base, gmPlan: 'GM PLAN (private)\n- Aim: build.' }).prompt).not.toContain('HEARD |');
    });

    it('tells the next pass the player character knows', () => {
        const world = emptyWorld();
        applyWorld(world, { schemes: [scheme()] }, opts());
        hearScheme(world, openSchemes(world)[0].id, 'told');
        expect(worldPart({ schemes: openSchemes(world), day: 6, userName: 'Vex' }).text).toContain('Vex has learned of it - they may react to that');
    });
});

describe('the world meanwhile, phase 2 - the WORLD prompt', () => {
    const part = (over = {}) => worldPart({ ripples: [{ id: 'r1', text: 'A dockhand saw Cyril' }], day: 5, userName: 'Vex', limits: stirOf(LEVEL_LIMITS.lively, {}), ...over });

    it('offers every way to surface, hooks only outside canon, and no day-plan moments for its own pass', () => {
        const all = part();
        expect(all.shape).toContain('"way":"rumour|news|trace|approach|arrival|happening|hook|none"');
        expect(all.shape).toContain('"name"');
        expect(all.text).toContain('make that one of the day\'s moments too');
        const canon = part({ canonOnly: true, ownPass: true });
        expect(canon.shape).not.toContain('hook');
        expect(canon.text).not.toContain('day\'s moments');
        expect(part({ limits: stirOf(LEVEL_LIMITS.lively, { day: 5, quietUntil: 5 }) }).text).toContain('Nothing surfaces for Vex today');
        expect(part({ limits: { start: 0, surface: 1 } }).text).toContain('Start no new scheme today.');
    });

    it('stands on its own: the dossier, the latest chat, the story and the answer shape', () => {
        const world = part({ ownPass: true });
        const { system, prompt } = buildWorldPrompt({ dossier: 'THE SCENE: the Gilded Gull.', messages: [{ name: 'Vex', text: 'I ask about the quay.', isUser: true }], userName: 'Vex', dateText: 'the 14th of Frostfall', story: { shape: 'Thriller', beat: 'the dead return' }, world });
        expect(system).toContain('never decide what Vex says, does, thinks or feels');
        expect(prompt).toContain('THE SCENE: the Gilded Gull.');
        expect(prompt).toContain('Vex: I ask about the quay.');
        expect(prompt).toContain('- The beat now: the dead return');
        expect(prompt).toContain('TODAY - the 14th of Frostfall');
        expect(prompt.trim().endsWith(world.shape)).toBe(true);
    });

    it('reads a hook\'s name and the new ways', () => {
        const read = readWorld({ schemes: [{ id: 's_1', who: [], surface: { way: 'Hook', text: 'Find him first', name: 'A Dead Man\'s Trail' } }, { id: 's_2', surface: { way: 'arrival', text: 'Ines is in town' } }] });
        expect(read.schemes[0].surface).toMatchObject({ way: 'hook', name: 'A Dead Man\'s Trail' });
        expect(read.schemes[1].surface.way).toBe('arrival');
    });
});
