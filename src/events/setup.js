// Structured events - setting one up (pure). The GM Plan's Event card keeps
// a form per kind; a template is a form kept per setting, so an event set up
// once can run in any chat on the world; a generated event is a form the
// model filled from loose guidance (src/events/generate.js). eventFromForm
// turns a form into a planned event (src/events/model.js).

import { arenaFromSetup, tournamentFromSetup, crawlFromSetup, programmeFromSetup, readProgrammeLines, EVENT_KINDS, STRENGTHS } from './model.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const str = (v) => (typeof v === 'string' ? v : '');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const TEMPLATES_KEPT = 30;

export function emptyRoom() {
    return { placeId: '', name: '', threats: '', note: '', loot: '', clearWhen: '', final: false, leadsTo: '' };
}

// One form holds every kind's fields; the kind picks which are used.
//   opponents  an arena's, one per line, in order
//   entrants   a tournament's rivals, one per line: "Graxx | strong"
//   between    a tournament's wait between rounds ("the next morning")
//   steps      a programme's lines (readProgrammeLines)
//   rooms      a crawl's rooms
//   startIn    days from today it begins by itself ('' = when the user starts it)
export function emptyForm(kind = 'arena') {
    return { kind: EVENT_KINDS.includes(kind) ? kind : 'arena', name: '', placeId: '', intro: '', close: '', prize: '', opponents: '', entrants: '', between: '', steps: '', rooms: [], startIn: '' };
}

export function normalizeForm(value) {
    const f = isObject(value) ? value : {};
    const out = emptyForm(f.kind);
    for (const key of ['name', 'placeId', 'intro', 'close', 'prize', 'opponents', 'entrants', 'between', 'steps', 'startIn']) out[key] = str(f[key]).slice(0, 4000);
    out.rooms = (Array.isArray(f.rooms) ? f.rooms : []).filter(isObject).slice(0, 40).map((r) => ({
        ...emptyRoom(), ...Object.fromEntries(['placeId', 'name', 'threats', 'note', 'loot', 'clearWhen', 'leadsTo'].map((k) => [k, str(r[k]).slice(0, 600)])), final: r.final === true,
    }));
    return out;
}

const lines = (text) => String(text ?? '').split('\n').map((l) => clean(l.replace(/^[-*•]\s*|^\d+[.)]\s*/, ''))).filter(Boolean);
const lower = (s) => clean(s).toLowerCase();

// A name matched to a library character or creature by name or alias.
export function foeMatcher(foes = []) {
    return (name) => {
        const found = (foes ?? []).find((f) => [f.name, ...(f.aliases ?? [])].some((n) => lower(n) === lower(name)));
        const out = { name: found?.name ?? clean(name), objectId: found?.id ?? '' };
        // Its power rating (src/director/combat.js), for a tournament
        // entrant's strength - not stored on the opponent.
        Object.defineProperty(out, 'power', { value: found?.meta?.combat?.power ?? '', enumerable: false });
        return out;
    };
}

// "Graxx | strong" / "Graxx (deadly)" / "Graxx" -> { name, objectId, strength }
// (with no strength given: the entry's power rating, else standard).
export function readEntrants(text, matchFoe = foeMatcher()) {
    return lines(text).map((line) => {
        const m = line.match(/^(.+?)\s*(?:\||[-–—:]\s+|\()\s*(minor|standard|strong|deadly)\)?\s*$/i);
        const name = clean(m ? m[1] : line);
        const foe = matchFoe(name);
        return { ...foe, strength: m ? m[2].toLowerCase() : (STRENGTHS.includes(foe.power) ? foe.power : 'standard') };
    }).filter((x) => x.name);
}

const listNames = (text) => String(text ?? '').split(/\s*(?:,|;|&|\band\b)\s*/i).map(clean).filter((n) => n && !/^(none|nothing|empty|-)$/i.test(n));

// The form as a planned event, or null when it has nothing to run.
// matchFoe: names to library entries; playerName: the player character's.
export function eventFromForm(form, { matchFoe = foeMatcher(), playerName = '' } = {}) {
    const f = normalizeForm(form);
    const base = { name: f.name, placeId: f.placeId, intro: f.intro, close: f.close, prize: f.prize };
    if (f.kind === 'tournament') return tournamentFromSetup({ ...base, entrants: readEntrants(f.entrants, matchFoe), between: f.between, playerName });
    if (f.kind === 'crawl') {
        return crawlFromSetup({
            ...base,
            rooms: f.rooms.filter((r) => r.placeId).map((r) => ({ placeId: r.placeId, name: r.name, threats: listNames(r.threats).map(matchFoe), note: r.note, loot: r.loot, clearWhen: r.clearWhen, final: r.final })),
        });
    }
    if (f.kind === 'programme') return programmeFromSetup({ ...base, stages: readProgrammeLines(f.steps, matchFoe) });
    return arenaFromSetup({ ...base, opponents: lines(f.opponents).map(matchFoe) });
}

// Why a form cannot be set up yet - '' when it can.
export function formProblem(form) {
    const f = normalizeForm(form);
    if (f.kind === 'tournament' && !lines(f.entrants).length) return 'A tournament needs at least one rival entrant.';
    if (f.kind === 'crawl' && !f.rooms.some((r) => r.placeId || clean(r.name))) return 'A crawl needs at least one room.';
    if (f.kind === 'programme' && !lines(f.steps).length) return 'A programme needs at least one stage.';
    if (f.kind === 'arena' && !lines(f.opponents).length) return 'An arena needs at least one opponent.';
    return '';
}

// ---- templates (the setting document's eventTemplates)

export function normalizeTemplate(value) {
    if (!isObject(value) || !clean(value.id) || !clean(value.name)) return null;
    return { id: clean(value.id), name: clean(value.name).slice(0, 100), form: normalizeForm({ ...value.form, startIn: '' }), at: str(value.at) };
}

export const normalizeTemplates = (list) => (Array.isArray(list) ? list.map(normalizeTemplate).filter(Boolean) : []).slice(-TEMPLATES_KEPT);

// A template from a form (one of the same name is replaced).
export function addTemplate(list, form, { id, at = new Date().toISOString() }) {
    const f = normalizeForm(form);
    const name = clean(f.name) || `A ${f.kind}`;
    const kept = normalizeTemplates(list).filter((t) => lower(t.name) !== lower(name));
    return normalizeTemplates([...kept, { id, name, form: f, at }]);
}

export const STRENGTH_WORDS = STRENGTHS;
