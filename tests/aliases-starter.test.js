import { normalizeAliasInfo, aliasInfoFor, aliasLabel, knownAsText } from '../src/library/alias-kinds.js';
import { buildAliasPrompt, readAlias } from '../src/generate/prompt.js';
import { buildStarterPrompt, readStarter } from '../src/planner/prompts.js';
import { buildCast } from '../src/guidance/build.js';
import { planName } from '../src/naming/engine.js';
import { normalizeSettingDoc } from '../src/store/schema.js';

describe('kinds of alias', () => {
    it('keeps a kind and who uses it, and drops what is unknown or empty', () => {
        expect(normalizeAliasInfo({ Stitches: { kind: 'nickname', knownBy: ['c1', 'c1', 3] }, Bob: { kind: 'bogus' }, ' ': { kind: 'title' } }))
            .toEqual({ Stitches: { kind: 'nickname', knownBy: ['c1'] } });
        const doc = normalizeSettingDoc({ entries: { c1: { aliasInfo: { Nightjar: { kind: 'codename', knownBy: ['f1'] } } } } });
        expect(doc.entries.c1.aliasInfo.Nightjar.kind).toBe('codename');
    });

    it('forgets the kind of an alias the entry no longer has', () => {
        expect(aliasInfoFor(['Red'], { Red: { kind: 'nickname' }, Gone: { kind: 'title' } })).toEqual({ Red: { kind: 'nickname', knownBy: [] } });
    });

    it('says how someone is known, and by whom', () => {
        const info = { Stitches: { kind: 'nickname', knownBy: [] }, Nightjar: { kind: 'codename', knownBy: ['f1', 'c2'] } };
        const names = { f1: 'the Ninth Lanterns', c2: 'Mara' };
        const text = knownAsText('Hessa Tarn', ['Stitches', 'Nightjar', 'Doc'], info, (id) => names[id]);
        expect(text).toBe('Hessa Tarn is also known as "Stitches" (a nickname); "Nightjar" (a codename) - used only by the Ninth Lanterns and Mara; no one else knows Hessa Tarn by it; "Doc".');
        expect(knownAsText('Hessa', [], info)).toBe('');
        expect(aliasLabel('Nightjar', info)).toBe('Nightjar (codename)');
        expect(aliasLabel('Doc', info)).toBe('Doc');
    });

    it('puts it into the narrator\'s guidance with the person', () => {
        const cast = buildCast({ cast: [{ name: 'Hessa Tarn', knownAs: 'Hessa Tarn is also known as "Stitches" (a nickname).' }, { name: 'Kaya', player: true, knownAs: 'Kaya is also known as "Nightjar" (a codename).' }] });
        expect(cast).toContain('Hessa Tarn: Hessa Tarn is also known as "Stitches" (a nickname).');
        expect(cast).toContain('played by the user. Kaya is also known as "Nightjar" (a codename).');
    });

    it('rolls codenames from the callsign kit', () => {
        const names = [];
        let counter = 0;
        for (let i = 0; i < 12; i++) {
            const r = planName({ typeId: 'character', kindInfo: { kind: 'codename' } }, { naming: { seed: 'cs', counter }, names });
            counter = r.counter;
            expect(r.mode).toBe('rolled');
            names.push(r.name);
        }
        expect(new Set(names).size).toBe(12);
    });

    it('asks the model for a nickname in plain words, and reads a short answer', () => {
        const { user, plain } = buildAliasPrompt({ kind: 'nickname', name: 'Hessa Tarn', values: { description: 'A field medic with a scar.' }, existing: ['Doc'], taken: ['Mara'] });
        expect(plain).toBe(true);
        expect(user).toContain('Give Hessa Tarn a nickname');
        expect(user).toContain('already known as: Doc');
        expect(buildAliasPrompt({ kind: 'title', name: 'Vell' }).user).toContain('title or epithet');
        expect(readAlias('Nickname: "Stitches".')).toBe('Stitches');
        expect(readAlias('**the Butcher of Vell**\nBecause she...')).toBe('the Butcher of Vell');
        expect(readAlias('She is called that because of all the wounds she has sewn shut over the years')).toBe('');
    });
});

describe('the starter post', () => {
    it('asks for an opening that sets the scene and leaves the player character free', () => {
        const { system, prompt } = buildStarterPrompt({ dossier: 'WHERE: The Docks', userName: 'Kaya', story: { shape: 'Hero\'s journey', act: 'The call', beat: 'A stranger brings a warning', next: '' }, premise: 'A smuggling war.', pov: 'Point of view: second person.', wish: 'open on the rain', messages: [] });
        expect(system).toContain('never write what Kaya says, does');
        expect(prompt).toContain('WHERE: The Docks');
        expect(prompt).toContain('The beat now: A stranger brings a warning');
        expect(prompt).toContain('A smuggling war.');
        expect(prompt).toContain('calls for Kaya to act');
        expect(prompt).toContain('Point of view: second person.');
        expect(prompt).toContain('The user wants: open on the rain');
        expect(prompt).not.toContain('THE LATEST CHAT');
        expect(buildStarterPrompt({ userName: 'Kaya', messages: [{ name: 'Kaya', text: 'We leave at dawn.', isUser: true }] }).prompt).toContain('THE LATEST CHAT');
    });

    it('reads the post without what the model wraps it in', () => {
        expect(readStarter('Here is the opening post:\n\nRain hammers the docks.')).toBe('Rain hammers the docks.');
        expect(readStarter('```\nRain hammers the docks.\n```')).toBe('Rain hammers the docks.');
        expect(readStarter('"Rain hammers the docks."')).toBe('Rain hammers the docks.');
        expect(readStarter('Rain hammers the docks. "Move," says Mara.')).toBe('Rain hammers the docks. "Move," says Mara.');
        expect(readStarter('   ')).toBe('');
    });
});
