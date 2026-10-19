import {
    emptyGm, normalizeGm, setOutline, setDayPlan, applyBeats, applyCheck, finishBeat, beatsOf, duePasses, volumeComplete, volumeReadings,
    mergeArchivistTension, addOwnReading, tensionNow, closeVolume, startVolume, editVolume, previousVolumesText, storyMarkdown, addChronicle,
} from '../src/planner/model.js';
import { buildRecapPrompt, readRecap, buildOutlinePrompt } from '../src/planner/prompts.js';
import { shapeOf } from '../src/planner/shapes.js';

const outlineAnswer = {
    premise: 'Remus must choose between his god and his people.',
    themes: ['loyalty'],
    acts: [
        { title: 'The call', beats: [{ text: 'Graxx offers an alliance', status: 'active' }] },
        { title: 'Homecoming', beats: [{ text: 'A reckoning with Elyon' }, { text: 'Redhaven rebuilds' }] },
    ],
};

function inVolume() {
    const gm = emptyGm();
    gm.shape = 'adventure-serial';
    setOutline(gm, outlineAnswer, { turn: 3 });
    return gm;
}

describe('the volume under way', () => {
    it('starts as volume 1 and survives a round trip', () => {
        const gm = emptyGm();
        expect(gm.volume).toMatchObject({ number: 1, startedTurn: 0, chronicle: [] });
        expect(gm.volumes).toEqual([]);
        expect(normalizeGm(JSON.parse(JSON.stringify(gm))).volume).toEqual(gm.volume);
        expect(normalizeGm({ volume: { number: -2, chronicle: [{ text: ' x ' }, {}] } }).volume).toMatchObject({ number: 1, chronicle: [{ text: 'x' }] });
    });

    it('chronicles what plays out: moments done, beats finished, beats a review marks done', () => {
        const gm = inVolume();
        setDayPlan(gm, { moments: [{ text: 'An envoy arrives' }, { text: 'A storm' }, { text: 'A duel' }] }, { day: 2, turn: 4 });
        applyBeats(gm, [{ id: 'm1', status: 'done', note: 'the envoy bowed' }, { id: 'm2', status: 'skipped' }]);
        applyCheck(gm, { done: [{ id: 'm3', how: 'Remus won' }] });
        finishBeat(gm, 'b1');
        setOutline(gm, { acts: [{ title: 'The call', beats: [{ id: 'b1', text: 'x', status: 'done' }] }, { title: 'Homecoming', beats: [{ id: 'b2', text: 'A reckoning with Elyon', status: 'done' }, { id: 'b3', text: 'Redhaven rebuilds' }] }] });
        expect(gm.volume.chronicle.map((c) => c.text)).toEqual([
            'An envoy arrives (the envoy bowed)',
            'A duel (Remus won)',
            'Beat: Graxx offers an alliance',
            'Beat: A reckoning with Elyon',
        ]);
        expect(gm.volume.chronicle[0].day).toBe(2);
        addChronicle(gm, 'Beat: A reckoning with Elyon');
        expect(gm.volume.chronicle).toHaveLength(4);
    });

    it('is complete when every beat of its last chapter has played out, and stops reviewing then', () => {
        const gm = inVolume();
        expect(volumeComplete(gm.outline)).toBe(false);
        finishBeat(gm, 'b1');
        finishBeat(gm, 'b2');
        beatsOf(gm.outline).find((b) => b.id === 'b3').status = 'skipped';
        expect(volumeComplete(gm.outline)).toBe(true);
        gm.day = { day: 1, madeTurn: 0, moments: [], agendas: [], offscreen: [] };
        gm.counters.sinceOutline = 99;
        gm.counters.lastCheck = 'z';
        expect(duePasses(gm, { day: 1, turn: 10 })).toEqual([]);
        expect(volumeComplete(null)).toBe(false);
    });

    it('reads only the volume\'s own tension: Archivist\'s by message, the planner\'s by reply', () => {
        const gm = inVolume();
        mergeArchivistTension(gm, [{ message_index: 10, overall: 1 }, { message_index: 50, overall: 4 }]);
        gm.volume.startedIndex = 40;
        expect(volumeReadings(gm).map((r) => r.index)).toEqual([50]);
        expect(tensionNow(gm).recent).toEqual([]);
        const own = emptyGm();
        addOwnReading(own, { overall: 2 }, { index: 3 });
        addOwnReading(own, { overall: 3 }, { index: 12 });
        own.volume.startedTurn = 10;
        expect(volumeReadings(own).map((r) => r.index)).toEqual([12]);
    });
});

describe('finishing a volume and starting the next', () => {
    const recap = { title: 'The Debt of Light', recap: 'Remus came to Redhaven owing Elyon everything.\n\nBy the end he owed his people more.', threads: ['The Pale Choir is watching'] };

    it('files the volume with its recap, outline and span, and marks unreached beats', () => {
        const gm = inVolume();
        gm.volume.startedDay = 1;
        finishBeat(gm, 'b1');
        const record = closeVolume(gm, recap, { shape: 'Adventure serial', turn: 40, day: 6, index: 120 });
        expect(record).toMatchObject({ number: 1, title: 'The Debt of Light', shape: 'Adventure serial', premise: outlineAnswer.premise, startedDay: 1, endedDay: 6, endedTurn: 40, endedIndex: 120, closedEarly: true });
        expect(record.beats).toEqual([{ text: 'Graxx offers an alliance', status: 'done' }, { text: 'A reckoning with Elyon', status: 'not reached' }, { text: 'Redhaven rebuilds', status: 'not reached' }]);
        expect(gm.volumes).toEqual([record]);
    });

    it('begins the next volume fresh, keeping the day plan, the queue and the past', () => {
        const gm = inVolume();
        gm.join = { act: 2, note: 'old' };
        setDayPlan(gm, { moments: [{ text: 'Dawn bells' }] }, { day: 6, turn: 40 });
        closeVolume(gm, recap, { turn: 40, day: 6, index: 120 });
        startVolume(gm, { shape: 'mystery', direction: 'something quieter', turn: 40, day: 6, index: 120 });
        expect(gm.volume).toMatchObject({ number: 2, startedTurn: 40, startedDay: 6, startedIndex: 120, direction: 'something quieter', chronicle: [] });
        expect(gm.shape).toBe('mystery');
        expect(gm.outline).toBeNull();
        expect(gm.join).toEqual({ act: -1, note: '' });
        expect(gm.day.moments).toHaveLength(1);
        expect(gm.volumes).toHaveLength(1);
        expect(duePasses(gm, { day: 6, turn: 41 })).toEqual(['outline']);
    });

    it('lets the user edit a finished volume', () => {
        const gm = inVolume();
        closeVolume(gm, recap, {});
        editVolume(gm, 1, { title: ' A Better Title ', recap: 'Mine.', threads: ['one', ' ', 'two'] });
        expect(gm.volumes[0]).toMatchObject({ title: 'A Better Title', recap: 'Mine.', threads: ['one', 'two'], editedByUser: true });
        editVolume(gm, 1, { title: '   ' });
        expect(gm.volumes[0].title).toBe('A Better Title');
    });

    it('gives the passes the earlier volumes: latest in full, earlier by first paragraph, threads', () => {
        const gm = inVolume();
        closeVolume(gm, { title: 'One', recap: 'First para one.\n\nMore of one.', threads: [] }, {});
        startVolume(gm, {});
        closeVolume(gm, { title: 'Two', recap: 'First para two.\n\nMore of two.', threads: ['The cache is still hidden'] }, {});
        const text = previousVolumesText(gm);
        expect(text).toContain('Volume 1, "One": First para one.');
        expect(text).not.toContain('More of one');
        expect(text).toContain('More of two');
        expect(text).toContain('- The cache is still hidden');
        expect(previousVolumesText(gm, { full: false })).not.toContain('More of two');
        expect(previousVolumesText(emptyGm())).toBe('');
    });

    it('writes the story so far as Markdown', () => {
        const gm = inVolume();
        closeVolume(gm, recap, { shape: 'Adventure serial', day: 6 });
        const md = storyMarkdown(gm);
        expect(md).toMatch(/^# The story so far/);
        expect(md).toContain('## Volume 1: The Debt of Light');
        expect(md).toContain('Remus came to Redhaven');
        expect(md).toContain('- The Pale Choir is watching');
    });
});

describe('the recap pass', () => {
    it('builds from the outline, chronicle, Archivist and quests, with a length target', () => {
        const gm = inVolume();
        finishBeat(gm, 'b1');
        const { system, prompt } = buildRecapPrompt({
            userName: 'Remus', number: 1, shape: 'Adventure serial', outline: gm.outline, chronicle: [{ day: 2, text: 'An envoy arrives' }],
            summary: 'A war of gods.', events: ['Graxx swore an oath'], quests: [{ name: 'The cache', status: 'Active' }], previous: '', closedEarly: true, words: 700,
        });
        expect(system).toContain('tell what Remus did as history');
        expect(system).toContain('never invent events');
        expect(prompt).toContain('VOLUME 1 (Adventure serial) - closed before its outline was finished');
        expect(prompt).toContain('- Graxx offers an alliance - happened');
        expect(prompt).toContain('- Redhaven rebuilds - not reached');
        expect(prompt).toContain('[day 2] An envoy arrives');
        expect(prompt).toContain('A war of gods.');
        expect(prompt).toContain('- Graxx swore an oath');
        expect(prompt).toContain('- The cache: Active');
        expect(prompt).toContain('About 700 words');
    });

    it('reads a recap, dropping one too short to be real', () => {
        expect(readRecap({ title: 'T', recap: 'Para one is long enough to count as a recap.\n\n\n\nPara two.', threads: ['a', '', 'b'] }))
            .toEqual({ title: 'T', recap: 'Para one is long enough to count as a recap.\n\nPara two.', threads: ['a', 'b'] });
        expect(readRecap({ recap: 'too short' })).toBeNull();
        expect(readRecap(null)).toBeNull();
    });

    it('a new volume\'s first outline starts at its first act instead of joining in progress', () => {
        const base = { dossier: '', shape: shapeOf('mystery'), outline: null, underWay: true, storySoFar: 'Earlier volumes: ...' };
        const fresh = buildOutlinePrompt({ ...base, newVolume: { number: 2 } }).prompt;
        expect(fresh).toContain('A NEW VOLUME - VOLUME 2');
        expect(fresh).not.toContain('TAKING OVER A STORY IN PROGRESS');
        expect(buildOutlinePrompt(base).prompt).toContain('TAKING OVER A STORY IN PROGRESS');
    });
});
