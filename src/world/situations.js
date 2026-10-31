// The world meanwhile, phase 3 - the pure half of what lasts (docs/DESIGN -
// THE WORLD MEANWHILE.md §3.4, §3.6, §4.1). Situations: bigger than one
// scheme - a feud, a schism, peace talks, a plague - with a stage, sides, a
// public face and effects on the places they touch. Changes (overlays):
// the marks off-scene acts leave, for this chat only - a place burned, a
// person moved or in hiding, two factions at war, a death. A faction's
// condition (standing, leadership, mood), and when the player character
// last had contact with each person, faction and place, so coming back
// shows what has become of them ("since you were last here").
// No SillyTavern imports; src/world/model.js applies a pass's answer
// through these, src/world/run.js does the rest.
//
// gm.world (phase 3 parts):
//   situations: [{ id, kind, name, sides: [{ name, ids, wants }], stage, where: [placeId],
//                  whereNames, headline, truth, effects: [text], ties: [id], startedDay,
//                  endedDay, at }]
//   overlays:   { places: { [placeId]: { name, text, since, until } },
//                 people: { [personId]: { name, locationId, where, state, since } },
//                 stances: [{ a, b, aName, bName, stance, situationId, since }] }
//   conditions: { [factionId]: { name, standing, leadership, mood, since } }
//   contact:    { [id]: { day, turn, prevDay, visitTurn } }    the player character's
//               last contact; prevDay: the contact before this visit
//   pending:    [{ id, kind: 'death' | 'place', targetId, name, text, days, day, schemeId, until }]
//               changes waiting for the user's say-so
//   canonized:  [{ id, kind: 'place', targetId, name, before, text, at }]  changes the
//               user made part of the setting - kept for Undo

export const SITUATION_KINDS = Object.freeze(['conflict', 'schism', 'accord', 'crisis', 'contest']);
export const STAGES = Object.freeze(['brewing', 'open', 'turning', 'ending', 'over']);
export const STANDINGS = Object.freeze(['steady', 'thriving', 'strained', 'at war', 'divided', 'split', 'broken', 'gone to ground']);
export const STANCES = Object.freeze(['allied', 'friendly', 'wary', 'hostile', 'at war']);
export const CHANGE_KINDS = Object.freeze(['place', 'whereabouts', 'state', 'death', 'stance', 'split']);
export const PLACE_MODES = Object.freeze([['on', 'Yes'], ['ask', 'Ask me first'], ['off', 'No']]);
export const DEATH_MODES = Object.freeze([['ask', 'Ask me first'], ['allow', 'Allow'], ['never', 'Never']]);
// Situations that bring trouble: none begins, and none opens, while the
// story eases or the world is quieted.
const TROUBLE = new Set(['conflict', 'schism', 'crisis']);

const SITUATION_LIMIT = 8;
const STANCE_LIMIT = 30;
const PENDING_LIMIT = 12;
const CANONIZED_LIMIT = 20;
const CONTACT_LIMIT = 200;
// A pending change not answered in this many in-game days is let go.
const PENDING_DAYS = 7;
// "Since you were last here" is told for the first few replies of a visit.
export const VISIT_REPLIES = 4;
// A gap of more than this many replies makes the next contact a new visit.
const VISIT_GAP = 2;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clean = (v) => str(v).replace(/\s+/g, ' ').trim();
const cut = (v, n) => clean(v).slice(0, n);
const strList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const intOr = (v, fallback = null) => (Number.isInteger(v) ? v : fallback);
const unstop = (text) => clean(text).replace(/[.!?…]+$/, '');
const objMap = (v, fn) => (isObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fn(x)]).filter(([k, x]) => k && x)) : {});

export function emptyLasting() {
    return { situations: [], overlays: { places: {}, people: {}, stances: [] }, conditions: {}, contact: {}, pending: [], canonized: [] };
}

function normalizeSituation(s) {
    if (!isObject(s) || !clean(s.id) || !clean(s.name)) return null;
    return {
        id: clean(s.id),
        kind: SITUATION_KINDS.includes(s.kind) ? s.kind : 'conflict',
        name: cut(s.name, 120),
        sides: (Array.isArray(s.sides) ? s.sides : []).filter(isObject).map((x) => ({ name: cut(x.name, 120), ids: strList(x.ids).slice(0, 6), wants: cut(x.wants, 200) })).filter((x) => x.name).slice(0, 4),
        stage: STAGES.includes(s.stage) ? s.stage : 'brewing',
        where: strList(s.where).slice(0, 6),
        whereNames: strList(s.whereNames).slice(0, 6),
        headline: cut(s.headline, 200),
        truth: cut(s.truth, 300),
        effects: strList(s.effects).slice(0, 4).map((t) => t.slice(0, 200)),
        ties: strList(s.ties).slice(0, 12),
        startedDay: intOr(s.startedDay),
        endedDay: intOr(s.endedDay),
        at: str(s.at),
    };
}

const normalizePlace = (x) => (isObject(x) && clean(x.text) ? { name: cut(x.name, 120), text: cut(x.text, 300), since: intOr(x.since), until: intOr(x.until) } : null);
const normalizePerson = (x) => (isObject(x) && (clean(x.locationId) || clean(x.state))
    ? { name: cut(x.name, 120), locationId: clean(x.locationId), where: cut(x.where, 120), state: cut(x.state, 200), since: intOr(x.since) } : null);
const normalizeCondition = (x) => (isObject(x) && (STANDINGS.includes(x.standing) || clean(x.leadership) || clean(x.mood))
    ? { name: cut(x.name, 120), standing: STANDINGS.includes(x.standing) ? x.standing : 'steady', leadership: cut(x.leadership, 200), mood: cut(x.mood, 160), since: intOr(x.since) } : null);
const normalizeContact = (x) => (isObject(x) && Number.isInteger(x.turn)
    ? { day: intOr(x.day), turn: x.turn, prevDay: intOr(x.prevDay), visitTurn: intOr(x.visitTurn, x.turn) } : null);

export function normalizeLasting(w) {
    const v = isObject(w) ? w : {};
    const o = isObject(v.overlays) ? v.overlays : {};
    return {
        situations: (Array.isArray(v.situations) ? v.situations : []).map(normalizeSituation).filter(Boolean).slice(-SITUATION_LIMIT),
        overlays: {
            places: objMap(o.places, normalizePlace),
            people: objMap(o.people, normalizePerson),
            stances: (Array.isArray(o.stances) ? o.stances : []).filter((x) => isObject(x) && clean(x.a) && clean(x.b) && STANCES.includes(x.stance))
                .map((x) => ({ a: clean(x.a), b: clean(x.b), aName: cut(x.aName, 120), bName: cut(x.bName, 120), stance: x.stance, situationId: clean(x.situationId), since: intOr(x.since) })).slice(-STANCE_LIMIT),
        },
        conditions: objMap(v.conditions, normalizeCondition),
        contact: Object.fromEntries(Object.entries(objMap(v.contact, normalizeContact)).slice(-CONTACT_LIMIT)),
        pending: (Array.isArray(v.pending) ? v.pending : []).filter((x) => isObject(x) && clean(x.id) && ['death', 'place'].includes(x.kind) && clean(x.targetId))
            .map((x) => ({ id: clean(x.id), kind: x.kind, targetId: clean(x.targetId), name: cut(x.name, 120), text: cut(x.text, 300), days: intOr(x.days), day: intOr(x.day), schemeId: clean(x.schemeId), until: intOr(x.until) })).slice(-PENDING_LIMIT),
        canonized: (Array.isArray(v.canonized) ? v.canonized : []).filter((x) => isObject(x) && clean(x.id) && clean(x.targetId))
            .map((x) => ({ id: clean(x.id), kind: 'place', targetId: clean(x.targetId), name: cut(x.name, 120), before: str(x.before).slice(0, 4000), text: cut(x.text, 300), at: str(x.at) })).slice(-CANONIZED_LIMIT),
    };
}

// ---------------------------------------------------------------- situations (§3.4)

export const openSituations = (world) => world.situations.filter((s) => s.stage !== 'over');

const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

// A pass's situations, applied. answer: [{ id, kind, name, sides: [{ name,
// who: [name], wants }], stage, where: [name], headline, truth, effects }].
// resolve(name) -> an id; placeOf(name) -> a place id; max: how many may be
// open at once (0: none begins - those under way carry on); calm: the story
// eases or the world is quieted - nothing troubling begins or opens.
// -> { started, moved, ended, log: [{ text, ties, situationId }] }
export function applySituations(world, answer, { day, resolve = () => null, placeOf = () => '', max = 0, calm = false, newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`, at = new Date().toISOString() } = {}) {
    const out = { started: 0, moved: 0, ended: 0, log: [] };
    for (const a of answer ?? []) {
        if (!isObject(a)) continue;
        let s = a.id ? world.situations.find((x) => x.id === a.id) : openSituations(world).find((x) => sameName(x.name, a.name));
        if (s && s.stage === 'over') continue;
        const sides = (Array.isArray(a.sides) ? a.sides : []).filter(isObject).map((x) => ({ name: cut(x.name, 120), ids: [...new Set(strList(x.who).map(resolve).filter(Boolean))], wants: cut(x.wants, 200) })).filter((x) => x.name);
        if (!s) {
            const kind = SITUATION_KINDS.includes(a.kind) ? a.kind : '';
            if (!kind || !clean(a.name) || sides.length < (kind === 'crisis' ? 0 : 1) || openSituations(world).length >= max || (calm && TROUBLE.has(kind))) continue;
            const where = strList(a.where).map((n) => ({ n, id: placeOf(n) })).filter((x) => x.id);
            s = normalizeSituation({
                id: newId('sit'), kind, name: a.name, sides, stage: 'brewing', where: where.map((x) => x.id), whereNames: where.map((x) => x.n),
                headline: a.headline, truth: a.truth, effects: strList(a.effects), ties: [...new Set(sides.flatMap((x) => x.ids))], startedDay: day, at,
            });
            if (!s) continue;
            world.situations = [...world.situations, s].slice(-SITUATION_LIMIT);
            out.started += 1;
            out.log.push({ text: `${s.name} began${s.headline ? ` - ${unstop(s.headline)}` : ''}.`, ties: s.ties, situationId: s.id });
        } else out.moved += 1;
        // The stage only goes forward; while calm, trouble does not open.
        const to = STAGES.indexOf(clean(a.stage).toLowerCase());
        const from = STAGES.indexOf(s.stage);
        if (to > from && !(calm && TROUBLE.has(s.kind) && from < 1 && to <= 1)) {
            s.stage = STAGES[to];
            out.log.push({ text: `${s.name}: ${s.stage === 'over' ? 'it is over' : `now ${s.stage}`}${clean(a.headline) ? ` - ${unstop(a.headline)}` : ''}.`, ties: s.ties, situationId: s.id });
            if (s.stage === 'over') {
                s.endedDay = day;
                out.ended += 1;
                // Stances it held go with it.
                world.overlays.stances = world.overlays.stances.filter((x) => x.situationId !== s.id);
            }
        }
        if (clean(a.headline)) s.headline = cut(a.headline, 200);
        if (clean(a.truth)) s.truth = cut(a.truth, 300);
        if (strList(a.effects).length) s.effects = strList(a.effects).slice(0, 4).map((t) => t.slice(0, 200));
        for (const side of sides) {
            const had = s.sides.find((x) => sameName(x.name, side.name));
            if (had) { had.ids = [...new Set([...had.ids, ...side.ids])].slice(0, 6); if (side.wants) had.wants = side.wants; } else if (s.sides.length < 4) s.sides.push(side);
        }
        s.ties = [...new Set([...s.ties, ...s.sides.flatMap((x) => x.ids)])].slice(0, 12);
    }
    return out;
}

// The user ends a situation.
export function endSituation(world, id, day = null) {
    const s = world.situations.find((x) => x.id === id);
    if (!s || s.stage === 'over') return false;
    s.stage = 'over';
    s.endedDay = day;
    world.overlays.stances = world.overlays.stances.filter((x) => x.situationId !== id);
    return true;
}

// ---------------------------------------------------------------- changes (§3.6)

// A scheme's changes, checked and applied. changes: [{ kind, target, text,
// where, with, stance, days }]. ctx: { day, scheme (its id and names),
// resolve(name) -> id, placeOf(name) -> place id, nameOf(id), present: ids in
// the scene, placeIds: the scene's own place (never changed under it),
// playerId, isPerson(id), isFaction(id), mayKill(id) - not a plot device or
// unkillable, not already dead; places: 'on' | 'ask' | 'off'; deaths: 'ask' |
// 'allow' | 'never'; canonOnly (no breakaway factions); situationId }.
// -> { applied: [text for the log], extras: [{ way: 'death', id, name, how } |
//      { way: 'split', name, text, why, ties }] }
export function applyChanges(world, changes, ctx) {
    const { day, scheme = null, resolve = () => null, placeOf = () => '', nameOf = () => '', present = [], placeIds = [], playerId = '', isPerson = () => true, isFaction = () => false, mayKill = () => true, places = 'on', deaths = 'ask', canonOnly = false, newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}` } = ctx ?? {};
    const out = { applied: [], extras: [] };
    const here = new Set(present);
    const sceneAt = new Set(placeIds);
    for (const c of changes ?? []) {
        if (!isObject(c) || !CHANGE_KINDS.includes(c.kind)) continue;
        const text = cut(c.text, 300);
        if (c.kind === 'place') {
            const id = placeOf(c.target);
            if (!id || !text || places === 'off' || sceneAt.has(id)) continue;
            const days = Number.isInteger(c.days) && c.days > 0 ? Math.min(c.days, 120) : null;
            if (places === 'ask') { addPending(world, { id: newId('wp'), kind: 'place', targetId: id, name: nameOf(id) || c.target, text, days, day, schemeId: scheme?.id ?? '' }); continue; }
            setPlace(world, id, { name: nameOf(id) || c.target, text, since: day, until: days ? day + days : null });
            out.applied.push(`${nameOf(id) || c.target}: ${unstop(text)}.`);
        } else if (c.kind === 'whereabouts' || c.kind === 'state') {
            const id = resolve(c.target);
            if (!id || id === playerId || here.has(id) || !isPerson(id)) continue;
            const prev = world.overlays.people[id] ?? { name: nameOf(id), locationId: '', where: '', state: '', since: day };
            if (c.kind === 'whereabouts') {
                const loc = placeOf(c.where || c.text);
                if (!loc) continue;
                world.overlays.people[id] = { ...prev, name: nameOf(id), locationId: loc, where: nameOf(loc) || clean(c.where), since: day };
                out.applied.push(`${nameOf(id)} is now at ${nameOf(loc) || clean(c.where)}.`);
            } else {
                if (!text) continue;
                world.overlays.people[id] = { ...prev, name: nameOf(id), state: text, since: day };
                out.applied.push(`${nameOf(id)}: ${unstop(text)}.`);
            }
        } else if (c.kind === 'death') {
            const id = resolve(c.target);
            if (!id || id === playerId || here.has(id) || !isPerson(id) || deaths === 'never' || !mayKill(id)) continue;
            if (deaths === 'ask') { addPending(world, { id: newId('wp'), kind: 'death', targetId: id, name: nameOf(id), text: text || 'died off scene', day, schemeId: scheme?.id ?? '' }); continue; }
            out.extras.push({ way: 'death', id, name: nameOf(id), how: text || 'died off scene' });
        } else if (c.kind === 'stance') {
            const a = resolve(c.target);
            const b = resolve(c.with);
            const stance = clean(c.stance).toLowerCase();
            if (!a || !b || a === b || !isFaction(a) || !isFaction(b) || !STANCES.includes(stance)) continue;
            setStance(world, { a, b, aName: nameOf(a), bName: nameOf(b), stance, situationId: clean(ctx?.situationId), since: day });
            out.applied.push(`${nameOf(a)} and ${nameOf(b)}: ${stance}.`);
        } else if (c.kind === 'split') {
            const id = resolve(c.target);
            if (!id || !isFaction(id)) continue;
            const prev = world.conditions[id];
            world.conditions[id] = { name: nameOf(id), standing: 'split', leadership: prev?.leadership ?? '', mood: prev?.mood ?? '', since: day };
            out.applied.push(`${nameOf(id)} split${text ? `: ${unstop(text)}` : ''}.`);
            // The breakaway is a new faction: always a proposal (a large
            // change to the setting); a canon-only setting keeps the split
            // as a condition only.
            if (!canonOnly && clean(c.name)) out.extras.push({ way: 'split', name: cut(c.name, 80), text: text || `A faction broken away from ${nameOf(id)}.`, why: `${nameOf(id)} split`, ties: [nameOf(id), ...(scheme?.names ?? [])].filter(Boolean) });
        }
    }
    return out;
}

function setPlace(world, id, value) {
    world.overlays.places = { ...world.overlays.places, [id]: value };
}

function setStance(world, s) {
    const pair = (x) => [x.a, x.b].sort().join('|');
    world.overlays.stances = [...world.overlays.stances.filter((x) => pair(x) !== pair(s)), s].slice(-STANCE_LIMIT);
}

function addPending(world, p) {
    if (world.pending.some((x) => x.kind === p.kind && x.targetId === p.targetId)) return;
    world.pending = [...world.pending, { ...p, until: Number.isInteger(p.day) ? p.day + PENDING_DAYS : null }].slice(-PENDING_LIMIT);
}

// A pending change the user answered. -> the change (for the runner to
// carry out a death), or null. A place change taken is applied here.
export function answerPending(world, id, yes) {
    const p = world.pending.find((x) => x.id === id);
    if (!p) return null;
    world.pending = world.pending.filter((x) => x.id !== id);
    if (!yes) return null;
    if (p.kind === 'place') setPlace(world, p.targetId, { name: p.name, text: p.text, since: p.day, until: p.days && Number.isInteger(p.day) ? p.day + p.days : null });
    return p;
}

// Changes that have faded, and pending ones nobody answered, are let go.
export function settleChanges(world, day) {
    if (!Number.isInteger(day)) return;
    world.overlays.places = Object.fromEntries(Object.entries(world.overlays.places).filter(([, x]) => x.until === null || x.until > day));
    world.pending = world.pending.filter((x) => x.until === null || x.until >= day);
}

// The user takes a change back.
export function undoChange(world, kind, key) {
    if (kind === 'place') { const { [key]: _gone, ...rest } = world.overlays.places; world.overlays.places = rest; return true; }
    if (kind === 'person') { const { [key]: _gone, ...rest } = world.overlays.people; world.overlays.people = rest; return true; }
    if (kind === 'stance') { const before = world.overlays.stances.length; world.overlays.stances = world.overlays.stances.filter((x) => `${x.a}|${x.b}` !== key); return world.overlays.stances.length < before; }
    if (kind === 'condition') { const { [key]: _gone, ...rest } = world.conditions; world.conditions = rest; return true; }
    return false;
}

// "Make it part of the setting" for a place: the description it gets (the
// old one, then the change), and the record kept for Undo. The overlay
// goes: the setting now says it.
// -> { description, record } or null.
export function canonizePlace(world, placeId, before, { newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`, at = new Date().toISOString() } = {}) {
    const o = world.overlays.places[placeId];
    if (!o) return null;
    const description = [str(before).trim(), `${unstop(o.text)}.`].filter(Boolean).join('\n\n');
    const record = { id: newId('wc'), kind: 'place', targetId: placeId, name: o.name, before: str(before), text: o.text, at };
    world.canonized = [...world.canonized, record].slice(-CANONIZED_LIMIT);
    undoChange(world, 'place', placeId);
    return { description, record };
}

// Undo of "make it part of the setting": -> the record (its `before` is
// the description to put back), or null. The change is a change again.
export function uncanonize(world, recordId, day = null) {
    const r = world.canonized.find((x) => x.id === recordId);
    if (!r) return null;
    world.canonized = world.canonized.filter((x) => x.id !== recordId);
    setPlace(world, r.targetId, { name: r.name, text: r.text, since: day, until: null });
    return r;
}

// ---------------------------------------------------------------- faction conditions and contact (§4.1)

// A pass's faction conditions, applied: [{ name, standing, leadership,
// mood }]. Only a real change moves `since`. -> [text for the log].
export function applyConditions(world, answer, { day, resolve = () => null, nameOf = () => '', isFaction = () => true } = {}) {
    const log = [];
    for (const a of answer ?? []) {
        const id = resolve(a?.name);
        if (!id || !isFaction(id)) continue;
        const prev = world.conditions[id];
        const next = normalizeCondition({ name: nameOf(id) || a.name, standing: clean(a.standing).toLowerCase(), leadership: a.leadership || prev?.leadership, mood: a.mood || prev?.mood, since: day });
        if (!next) continue;
        if (prev && prev.standing === next.standing && prev.leadership === next.leadership && prev.mood === next.mood) continue;
        world.conditions[id] = next;
        if (!prev || prev.standing !== next.standing) log.push({ text: `${next.name} is ${next.standing} now${next.leadership ? ` - ${unstop(next.leadership)}` : ''}.`, ties: [id] });
    }
    return log;
}

// The player character was in contact with these people, factions and
// places this reply (`turn`: the chat's reply count). A gap makes it a new
// visit: the contact before it is kept as prevDay.
export function noteContact(world, ids, { day = null, turn = 0 } = {}) {
    if (!Number.isInteger(turn)) return;
    for (const id of new Set(ids ?? [])) {
        if (!id) continue;
        const rec = world.contact[id];
        if (rec && turn - rec.turn <= VISIT_GAP) world.contact[id] = { ...rec, day: day ?? rec.day, turn: Math.max(turn, rec.turn) };
        else world.contact[id] = { day, turn, prevDay: rec?.day ?? null, visitTurn: turn };
    }
    const keys = Object.keys(world.contact);
    if (keys.length > CONTACT_LIMIT) {
        const keep = keys.sort((a, b) => world.contact[b].turn - world.contact[a].turn).slice(0, CONTACT_LIMIT);
        world.contact = Object.fromEntries(keep.map((k) => [k, world.contact[k]]));
    }
}

// When the player character last had contact with `id` before this visit,
// as of reply `turn`: { prevDay, fresh } - fresh: the visit has only just
// begun (its first few replies). prevDay null: no contact before.
export function visitOf(world, id, turn) {
    const rec = world.contact[id];
    if (!rec) return { prevDay: null, fresh: false };
    const continuing = turn - rec.turn <= VISIT_GAP;
    if (!continuing) return { prevDay: rec.day, fresh: true };
    return { prevDay: rec.prevDay, fresh: turn - rec.visitTurn < VISIT_REPLIES };
}

// ---------------------------------------------------------------- what the director reads (§3.4, §4.1)

const STAGE_TEXT = { brewing: 'brewing', open: 'out in the open', turning: 'at a turn', ending: 'drawing to an end', over: 'over' };
const ago = (n) => (n <= 0 ? 'earlier today' : n === 1 ? 'a day ago' : `${n} days ago`);

// The world as it stands where the scene is - facts, not suggestions, so
// shown even while the scene is tense: this place's own change, the
// situations touching it or the people here, the state of anyone here the
// world has moved, and, for a faction or person the player character has
// come back to, what has become of them since (§4.1).
// opts: { day, turn, placeIds (the scene's place and those it is in),
// present: ids here, touched: [{ id, name }] factions and people the scene
// touches (members here, its places, named by the player), nameOf, max }.
// -> text ('' when nothing).
export function worldHereSection(world, { day, turn = 0, placeIds = [], present = [], touched = [], nameOf = () => '', max = 6 } = {}) {
    if (!Number.isInteger(day)) return '';
    const lines = [];
    const at = new Set(placeIds);
    const here = new Set(present);
    // The place itself, nearest first.
    for (const id of placeIds) {
        const o = world.overlays.places[id];
        if (o) lines.push(`- ${o.name || nameOf(id) || 'This place'} has changed (${ago(day - (o.since ?? day))}): ${unstop(o.text)}. Show it in what can be seen and in how people here behave.`);
    }
    // Situations: the world's weather here.
    for (const s of openSituations(world)) {
        if (!s.where.some((id) => at.has(id)) && !s.ties.some((id) => here.has(id))) continue;
        const sides = s.sides.length ? ` Sides: ${s.sides.map((x) => `${x.name}${x.wants ? ` (wants ${unstop(x.wants)})` : ''}`).join('; ')}.` : '';
        lines.push(`- In the air: ${s.name}, ${STAGE_TEXT[s.stage]}${s.headline ? ` - what people say: "${unstop(s.headline)}"` : ''}${s.truth ? `; the truth: ${unstop(s.truth)}` : ''}.${sides}${s.effects.length ? ` Here it shows: ${s.effects.map(unstop).join('; ')}.` : ''}`);
    }
    // Someone here the world has changed.
    for (const id of present) {
        const p = world.overlays.people[id];
        if (p?.state) lines.push(`- ${p.name || nameOf(id)}: ${unstop(p.state)} (since ${ago(day - (p.since ?? day))}).`);
    }
    // Coming back: what has become of them since the last contact.
    for (const t of touched) {
        const { prevDay, fresh } = visitOf(world, t.id, turn);
        if (!fresh || prevDay === null) continue;
        const c = world.conditions[t.id];
        const p = world.overlays.people[t.id];
        const since = world.log.filter((l) => Number.isInteger(l.day) && l.day > prevDay && (l.ties ?? []).includes(t.id)).slice(-3);
        const changed = (c && (c.since ?? -1) > prevDay) || (p && (p.since ?? -1) > prevDay && !here.has(t.id)) || since.length;
        if (!changed) continue;
        const bits = [
            c ? `now ${c.standing}${c.leadership ? `; ${unstop(c.leadership)}` : ''}${c.mood ? `; mood: ${unstop(c.mood)}` : ''}` : '',
            p?.state && !here.has(t.id) ? `now ${unstop(p.state)}` : '',
            since.length ? `since then: ${since.map((l) => unstop(l.text)).join('; ')}` : '',
        ].filter(Boolean);
        lines.push(`- Since the player character was last with ${t.name} (${ago(day - prevDay)}): ${bits.join('. ')}. Show what has become of them in what can be seen, and let people tell it as each would - a loyalist their side's version, a frightened clerk half of it, an enemy a lie - only if asked or if it is theirs to tell.`);
    }
    if (!lines.length) return '';
    return ['THE WORLD HERE NOW (private - what has changed off scene; facts the story keeps to, never written for the player character)', ...lines.slice(0, max)].join('\n');
}

// The lasting part for the WORLD and DAY prompts: situations under way,
// faction conditions and stances. -> [text]
export function lastingLines(world, { nameOf = () => '' } = {}) {
    const lines = [];
    for (const s of openSituations(world)) {
        lines.push(`- [${s.id}] ${s.name} (${s.kind}, ${s.stage})${s.sides.length ? ` - sides: ${s.sides.map((x) => `${x.name}${x.wants ? ` wants ${unstop(x.wants)}` : ''}`).join('; ')}` : ''}${s.headline ? `; said: "${unstop(s.headline)}"` : ''}${s.truth ? `; truth: ${unstop(s.truth)}` : ''}${s.whereNames.length ? `; where: ${s.whereNames.join(', ')}` : ''}.`);
    }
    for (const [id, c] of Object.entries(world.conditions)) lines.push(`- ${c.name || nameOf(id)}: ${c.standing}${c.leadership ? `; ${unstop(c.leadership)}` : ''}${c.mood ? `; mood: ${unstop(c.mood)}` : ''}.`);
    for (const s of world.overlays.stances) lines.push(`- ${s.aName} and ${s.bName}: ${s.stance}.`);
    for (const [id, p] of Object.entries(world.overlays.people)) lines.push(`- ${p.name || nameOf(id)}: ${[p.where && `at ${p.where}`, p.state].filter(Boolean).map(unstop).join(', ')}.`);
    for (const [id, o] of Object.entries(world.overlays.places)) lines.push(`- ${o.name || nameOf(id)}: ${unstop(o.text)}.`);
    return lines;
}

// Public faces for /sb-world: headlines of situations out in the open.
export function situationHeadlines(world) {
    return openSituations(world).filter((s) => s.stage !== 'brewing' && s.headline).map((s) => `${s.name}: ${unstop(s.headline)}.`);
}

