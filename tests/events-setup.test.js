import { emptyForm, eventFromForm, formProblem, readEntrants, foeMatcher, addTemplate, normalizeTemplates } from '../src/events/setup.js';
import { buildEventPrompt, readEventSetup, matchRooms } from '../src/events/generate.js';
import { readIdeas } from '../src/planner/prompts.js';

const foes = [{ id: 'chr_g', name: 'Graxx', aliases: ['the Pit-Wolf'] }];

describe('the event form', () => {
    it('makes each kind of event', () => {
        expect(eventFromForm({ ...emptyForm('arena'), name: 'Pit', opponents: 'the Pit-Wolf\nUlf' }, { matchFoe: foeMatcher(foes) }).stages[1].opponents[0]).toEqual({ name: 'Graxx', objectId: 'chr_g' });
        const t = eventFromForm({ ...emptyForm('tournament'), name: 'Lists', entrants: 'Graxx | strong\nSela (deadly)\nOrrin' }, { playerName: 'Remus' });
        expect(t.bracket.entrants.map((x) => `${x.name}:${x.strength}`)).toEqual(['Remus:standard', 'Graxx:strong', 'Sela:deadly', 'Orrin:standard']);
        const c = eventFromForm({ ...emptyForm('crawl'), name: 'Crypt', rooms: [{ placeId: 'loc_a', name: 'Gate', threats: 'none' }, { placeId: 'loc_b', name: 'Hall', threats: '3 ghouls, the Warden', final: true }, { name: 'not made yet' }] });
        expect(c.stages.map((s) => s.opponents.length)).toEqual([0, 2]);
        expect(eventFromForm({ ...emptyForm('programme'), steps: 'moment: Procession\nbout: Graxx' }).stages.map((s) => s.kind)).toEqual(['moment', 'bout']);
    });

    it('says what is missing', () => {
        expect(formProblem(emptyForm('tournament'))).toContain('rival');
        expect(formProblem({ ...emptyForm('arena'), opponents: 'Ulf' })).toBe('');
    });

    it('reads entrants with their strength', () => {
        expect(readEntrants('- Graxx - deadly\n2. Ulf')).toEqual([{ name: 'Graxx', objectId: '', strength: 'deadly' }, { name: 'Ulf', objectId: '', strength: 'standard' }]);
    });
});

describe('templates', () => {
    it('keep a form per name, without a start day', () => {
        let list = addTemplate([], { ...emptyForm('arena'), name: 'Pit', opponents: 'Ulf', startIn: '3' }, { id: 't1' });
        list = addTemplate(list, { ...emptyForm('arena'), name: 'pit', opponents: 'Graxx' }, { id: 't2' });
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ id: 't2', form: { opponents: 'Graxx', startIn: '' } });
        expect(normalizeTemplates([{ id: 'x' }, null])).toEqual([]);
    });
});

describe('a generated event', () => {
    it('asks for the kind\'s lines, from the setting', () => {
        const p = buildEventPrompt({ kind: 'crawl', request: 'a drowned crypt', rooms: ['The Gate'], candidates: [{ name: 'Graxx', type: 'character' }], canonOnly: true });
        expect(p.user).toContain('ROOM: <name> | foes:');
        expect(p.user).toContain('- The Gate');
        expect(p.user).toContain('invent none');
    });

    it('reads a tournament', () => {
        const form = readEventSetup('NAME: The Midsummer Lists\nOPENING: Banners.\nPRIZE: none\nENTRANT: Graxx | strong\nENTRANT: Sela | deadly\nBETWEEN: the next morning', 'tournament');
        expect(form).toMatchObject({ kind: 'tournament', name: 'The Midsummer Lists', prize: '', entrants: 'Graxx | strong\nSela | deadly', between: 'the next morning' });
        expect(readEventSetup('NAME: Nothing', 'tournament')).toBeNull();
    });

    it('reads a crawl\'s rooms and matches them to the dungeon\'s places', () => {
        const form = readEventSetup('NAME: The Sunken Crypt\nROOM: The Gate | foes: none | here: a rusted portcullis | treasure: none | puzzle: none | leads to: Hall of Bones\nROOM: Hall of Bones | foes: 3 ghouls | here: bones | treasure: a reliquary | puzzle: none | leads to: The Gate', 'crawl');
        expect(form.rooms.map((r) => [r.name, r.threats, r.loot, r.final])).toEqual([['The Gate', '', '', false], ['Hall of Bones', '3 ghouls', 'a reliquary', true]]);
        expect(matchRooms(form, [{ id: 'loc_gate', name: 'Gate' }]).rooms[0].placeId).toBe('loc_gate');
    });

    it('reads a programme', () => {
        expect(readEventSetup('NAME: Harvest\nSTEP: moment: The procession - relics\nSTEP: wait: until noon', 'programme').steps).toBe('moment: The procession - relics\nwait: until noon');
    });
});

describe('event ideas', () => {
    it('come from the ideas pass, one at most', () => {
        const ideas = readIdeas({ events: [{ kind: 'tournament', name: 'The Midsummer Lists', text: 'the duke\'s tournament', in_days: 6, why: 'Graxx spoke of it' }, { kind: 'arena', name: 'B', text: 'b' }] });
        expect(ideas).toEqual([{ kind: 'event', eventKind: 'tournament', name: 'The Midsummer Lists', text: 'the duke\'s tournament', why: 'Graxx spoke of it', ties: [], inDays: 6 }]);
        expect(readIdeas({ events: [{ kind: 'dungeon crawl', name: 'Mine', text: 'the old mine' }] })[0].eventKind).toBe('crawl');
    });
});
