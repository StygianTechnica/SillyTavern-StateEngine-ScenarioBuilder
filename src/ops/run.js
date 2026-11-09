// The other side's operation - the runner (the pure half: src/ops/model.js;
// the plan's call: src/ops/generate.js). It lives in the chat document
// (doc.op; finished ones in doc.opsDone). The director's briefing reads it
// (THE OTHER SIDE) and opAfterBriefing() moves it on from the briefing's
// OPERATION line, the fight and the deaths. An operation is made by the
// user (the GM Plan tab: plan, look over, start) or from the director's
// OPPOSED line (opFromDirector: planned and started at once, in the
// background, ready for the next reply). Never throws.

import { LOG_PREFIX } from '../constants.js';
import { getChatDoc, updateChatDoc } from '../store/chat-store.js';
import { newLocalId } from '../store/schema.js';
import { getSettings } from '../settings.js';
import { normalizeOp, startOp, afterBriefing, markOp, setCrewState, reviseOp, isLive, linkTaken, stillInStory, reopenOp, reopenable, crewIndex } from './model.js';
import { liveJobs, roomForJob, sidesOppose, settled, focused, MAX_ALSO } from './side-jobs.js';
import { inPersonOf } from '../guidance/spoken.js';
import { allWingsOf, wingOfPerson, markOtherWings } from '../library/wings.js';
import { buildOpPrompt, readOpPlan, matchPeople, swapOpNames, isPersonName, findSide, tiedFirst, shapePlan, aboutThem, sideInStory } from './generate.js';
import { encounterOpen, repeatJob, shownAtWork, namesOf } from './detect.js';

// How far back the chat must have named a group for a crew of theirs to start.
const RECENT_FOR_SIDE = 12;

export const OPS_EVENT = 'scenario_builder_ops_changed';

function emit(chatKey) {
    try {
        SillyTavern.getContext().eventSource.emit(OPS_EVENT, chatKey);
    } catch {
        // No event bus (tests).
    }
}

export const getOp = (chatKey) => getChatDoc(chatKey).op;

// Writes the chat's operation; one that is over goes to opsDone when
// another takes its place.
function save(chatKey, op) {
    updateChatDoc(chatKey, (d) => {
        // The job beside the main one keeps its place.
        const beside = (d.opsAlso ?? []).findIndex((x) => x.id === op?.id);
        if (beside >= 0) { d.opsAlso[beside] = op; return; }
        if (d.op && d.op.id !== op?.id) d.opsDone = [...(d.opsDone ?? []), d.op].slice(-6);
        d.op = op;
    });
    emit(chatKey);
    return op;
}

// The job with this id, or the main one.
const jobOf = (doc, id) => (id ? [doc.op, ...(doc.opsAlso ?? [])].find((o) => o?.id === id) ?? null : doc.op);

// A new job: the main one if that is free, else beside it.
function placeJob(chatKey, op) {
    const doc = getChatDoc(chatKey);
    if (!isLive(doc.op)) return save(chatKey, op);
    updateChatDoc(chatKey, (d) => { d.opsAlso = [...(d.opsAlso ?? []), op].slice(-MAX_ALSO); });
    emit(chatKey);
    return op;
}

// Those over move to the record, the other takes the main place, and the job
// with people in the scene comes first.
function arrangeJobs(chatKey) {
    updateChatDoc(chatKey, (d) => {
        const { op, also, done } = settled(d.op, d.opsAlso ?? [], d.turn);
        const [main, ...rest] = focused(op, also, { castIds: d.canonical.castIds });
        d.opsDone = [...(d.opsDone ?? []), ...done].slice(-6);
        d.op = main ?? null;
        d.opsAlso = rest.filter(Boolean);
    });
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).toLowerCase().replace(/^the\s+/, '');

// A job wrongly marked "got away", the one to offer putting back. -> or null.
export function gotAwayOp(chatKey) {
    const doc = getChatDoc(chatKey);
    return isLive(doc.op) ? null : reopenable([...(doc.opsDone ?? []), ...(doc.op ? [doc.op] : [])], doc.turn);
}

// Puts that job back: it runs again, on its last step. -> the operation or null.
export function putBackOp(chatKey) {
    const was = gotAwayOp(chatKey);
    if (!was) return null;
    const back = reopenOp(was, getChatDoc(chatKey).turn);
    if (!back) return null;
    updateChatDoc(chatKey, (d) => {
        const others = [...(d.opsDone ?? []), ...(d.op ? [d.op] : [])].filter((x) => x.id !== was.id);
        d.opsDone = others.slice(-6);
        d.op = back;
    });
    emit(chatKey);
    return back;
}

// After a briefing (src/director/run.js): the step moved on, held or
// done; the crew as the fight and deaths left them.
export function opAfterBriefing(chatKey, { report = null, fight = null, deaths = [], moves = [], lost = [], met = [], metBy = '' } = {}) {
    try {
        arrangeJobs(chatKey);
        const doc = getChatDoc(chatKey);
        const recent = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).slice(-2).map((m) => String(m.mes ?? '')).join('\n');
        const moveOn = (job, said) => {
            if (!(isLive(job) || job.at?.turn === doc.turn)) return;
            const inStory = stillInStory(job, { castIds: doc.canonical.castIds, recent });
            const next = afterBriefing(job, { ...said, fighters: fight?.fighters ?? [], deaths, moves, inStory }, doc.turn);
            if (next && JSON.stringify(next) !== JSON.stringify(normalizeOp(job))) {
                save(chatKey, next);
                const last = next.log[next.log.length - 1];
                if (last?.turn === doc.turn) console.info(LOG_PREFIX, `the other side (${next.side}): ${last.text}`);
            }
        };
        if (doc.op) moveOn(doc.op, { report, lost, met, metBy });
        // The job beside it carries on by itself: the OPERATION line is the
        // main one's, and only its own people count as lost.
        for (const job of doc.opsAlso ?? []) moveOn(job, { lost: lost.filter((l) => crewIndex(job, l?.who) >= 0) });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not move the other side on', err);
    }
}

// Whether the player's side hears them by one of their own links - a radio,
// a sending stone, a mind-link: from the player's latest post (src/ops/
// model.js linkTaken, which keeps the story's word for it), or set by hand
// (`on`).
export function setOpTapped(chatKey, { text = null, on = null } = {}) {
    const doc = getChatDoc(chatKey);
    if (!isLive(doc.op)) return null;
    const read = on !== null ? { said: on, with: '' } : linkTaken(text);
    const said = read.said;
    if (said === null) return null;
    // Already heard: only the story's word for it is new.
    if (said === doc.op.tapped) return said && read.with && read.with !== doc.op.tappedWith ? save(chatKey, { ...doc.op, tappedWith: read.with }) : null;
    console.info(LOG_PREFIX, `the other side (${doc.op.side}): ${said ? `heard through their ${read.with || 'link'}` : 'no longer heard'}`);
    return save(chatKey, { ...doc.op, tapped: said, tappedWith: said ? read.with : '', log: [...doc.op.log, { turn: doc.turn, text: said ? `Their ${read.with || 'link'} is in other hands: they are overheard.` : 'They are no longer overheard.' }] });
}

// The user steps in (the GM Plan card).
export function markOpAction(chatKey, action, id = '') {
    const doc = getChatDoc(chatKey);
    const job = jobOf(doc, id);
    if (!job) return null;
    const done = save(chatKey, markOp(job, action, doc.turn));
    arrangeJobs(chatKey);
    return done;
}
// The plan's lines changed while it runs. -> the operation, or null when
// the lines have no AIM or STEP.
export function reviseOpPlan(chatKey, text, characters = [], id = '') {
    const doc = getChatDoc(chatKey);
    const job = jobOf(doc, id);
    if (!job) return null;
    const read = readOpPlan(text, job.side);
    if (!read) return null;
    return save(chatKey, reviseOp(job, matchPeople(read, characters), doc.turn));
}
export function setOpCrew(chatKey, index, state, id = '') {
    const doc = getChatDoc(chatKey);
    const job = jobOf(doc, id);
    if (!job) return null;
    return save(chatKey, setCrewState(job, index, state));
}
export function clearOp(chatKey) {
    updateChatDoc(chatKey, (d) => {
        if (d.op && !isLive(d.op)) d.opsDone = [...(d.opsDone ?? []), d.op].slice(-6);
        d.op = null;
    });
    emit(chatKey);
}

// The recent chat, for a plan made in the middle of things.
function storySoFar() {
    const chat = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).slice(-6);
    return chat.map((m) => `${m.name}: ${clean(m.mes).slice(0, 700)}`).join('\n\n');
}

// Writes a plan (not started). options: { side (a name or id), request,
// placeId, aware }. -> the plan, or null. Never throws.
export async function planOp(chatId, chatKey, settingId, { side = '', request = '', placeId = '', aware = false } = {}) {
    try {
        const lib = await import('../library/library.js');
        const { libraryMemberships } = await import('../library/faction-sync.js');
        const { rosterOf, placeIn } = await import('../library/roster.js');
        const { getSettingDoc } = await import('../store/setting-store.js');
        const characters = await lib.listEntries(chatId, settingId, 'character').catch(() => []);
        const factions = await lib.listEntries(chatId, settingId, 'faction').catch(() => []);
        const places = await lib.listEntries(chatId, settingId, 'location').catch(() => []);
        const relations = getSettingDoc(settingId).relations ?? [];
        const memberships = libraryMemberships(factions, relations);
        const found = findSide(side, factions, characters, memberships);
        const sideName = found.faction?.name ?? (clean(side) || found.leader?.name || '');
        if (!sideName) return null;
        const playerId = lib.playerIdOf(settingId, characters);
        const player = characters.find((c) => c.id === playerId);
        // Its people, ranked first (the leader is on the roster's top).
        const roster = found.faction ? rosterOf(found.faction) : null;
        // ...and its wings' people - departments, chapters, families inside
        // it, any number and any depth (src/library/wings.js) - each with
        // the wing they stand in and their rank there; a wing's head is a
        // head too.
        const factionIds = new Set(factions.map((f) => f.id));
        const within = found.faction ? new Set([found.faction.id, ...allWingsOf(found.faction.id, relations, factionIds)]) : new Set();
        const people = found.faction ? characters.filter((c) => (memberships.get(c.id) ?? []).some((id) => within.has(id)) && c.id !== playerId)
            .map((c) => {
                const wing = wingOfPerson(c.id, found.faction.id, memberships, relations, factionIds);
                const wingFaction = wing ? factions.find((f) => f.id === wing) : null;
                return { c, place: placeIn(roster, c.id), wingFaction, wingPlace: wingFaction ? placeIn(rosterOf(wingFaction), c.id) : null };
            })
            .sort((a, b) => (a.place?.tier ?? 99) - (b.place?.tier ?? 99))
            .map(({ c, place, wingFaction, wingPlace }) => ({
                name: c.name, objectId: c.id, aliases: c.aliases ?? c.base?.aliases ?? [],
                rank: [place?.tierName, place?.title].filter(Boolean).join(', '),
                head: place?.tier === 0 || wingPlace?.tier === 0,
                // Heads their own wing only - may own its jobs (src/library/wings.js).
                wingHead: wingPlace?.tier === 0 && place?.tier !== 0,
                wing: wingFaction?.id ?? '', wingName: wingFaction?.name ?? '',
                wingRank: [wingPlace?.tierName, wingPlace?.title].filter(Boolean).join(', '),
                away: inPersonOf(c), description: c.description ?? c.base?.description ?? '',
            })) : [];
        // Kept off the job by their sheet ("In person": stays out of the
        // field, or waits for their beat - Bartin, the family scion). The
        // request naming one of them ties them to it ("Enrique's heist"):
        // they ordered it, still from afar - Edit the plan puts them on site.
        const asked = tiedFirst(people.map((p) => ({ ...p, away: '' })), request).filter((p) => p.tied);
        for (const p of people) if (p.away && asked.some((a) => a.name === p.name)) p.tied = true;
        if (found.leader && !people.some((p) => p.name === found.leader.name)) people.unshift({ name: found.leader.name, rank: 'leads this', tied: true, description: found.leader.description ?? '' });
        // Whoever the request or the story ties to the job comes first: it
        // is their job - not the faction's head's (Serlos Medina was put in
        // charge of Enrique's museum heist for being the Patriarch).
        const story = storySoFar();
        const against = player ? (memberships.get(player.id) ?? []).map((id) => factions.find((f) => f.id === id)?.name).filter(Boolean) : [];
        // Never the player character's own side.
        if (found.faction && player && (memberships.get(player.id) ?? []).includes(found.faction.id)) {
            console.info(LOG_PREFIX, `the other side: ${found.faction.name} is the player character's own side - no plan`);
            return null;
        }
        const them = [player?.name, ...against].filter(Boolean);
        const at = placeId || getChatDoc(chatKey).canonical.locationId || '';
        const parents = lib.getParents(settingId);
        const overview = lib.getOverview(settingId);
        const canonOnly = lib.isCanonOnly(settingId);
        let live = null;
        if (!canonOnly && getSettings().naming.live !== false) {
            try {
                const { livePoolFor, byType } = await import('../naming/run.js');
                live = { ...livePoolFor(settingId, byType([...characters.map((x) => ({ ...x, type: 'character' })), ...places.map((x) => ({ ...x, type: 'location' }))]), { placeId: at || null }), known: characters.flatMap((x) => [x.name, ...(x.aliases ?? [])]) };
            } catch (err) {
                console.warn(LOG_PREFIX, 'could not roll names for the other side', err);
            }
        }
        // Crewed from the wing of whoever's job it is (src/library/wings.js).
        const wings = markOtherWings(tiedFirst(people, [request, side, story].join('\n')), { relations, factionIds, sideName });
        const sidePeople = wings.people;
        const prompt = buildOpPrompt({
            side: { name: sideName, description: found.faction?.description ?? found.faction?.base?.description ?? '' },
            people: sidePeople,
            request,
            placeName: places.find((p) => p.id === at)?.name ?? '',
            places: places.filter((p) => parents[p.id] === at).map((p) => p.name),
            against,
            playerName: player?.name ?? SillyTavern.getContext().name1,
            aware,
            overview: [overview.premise, overview.tone && `Tone: ${overview.tone}.`].filter(Boolean).join(' '),
            story,
            canonOnly,
            pool: live?.pool ?? null,
        });
        const { askReliably } = await import('../generate/run.js');
        let tries = 0;
        const result = await askReliably(prompt, (_p, text) => {
            const values = readOpPlan(text, sideName);
            tries += 1;
            if (!values) return { values: {}, dropped: [], error: 'no AIM or STEP lines' };
            // No CREW lines (the crew only named in its steps): asked once more.
            // Likewise one or two STEP lines with the whole job crammed in.
            const missing = [!values.crew.length ? 'no CREW lines - one CREW line for each of the crew' : '', values.steps.filter((s) => s.status !== 'done').length < 3 ? 'too few STEP lines - three to six, one action each' : '',
                // Unaware of the player character, yet after him or his things.
                !aware && aboutThem([values.aim, ...values.steps.map((s) => s.text)].join('\n'), them) ? `the AIM or a STEP is about ${them.join(' or ')}, whom they do not know is there - they come for something at the place` : ''].filter(Boolean);
            if (missing.length && tries === 1) return { values: {}, dropped: [], error: missing.join('; ') };
            return { values, dropped: [], error: null };
        }, 900);
        if (result.error) {
            console.warn(LOG_PREFIX, `could not plan ${sideName}'s operation: ${result.error}`);
            return null;
        }
        let plan = matchPeople(result.values, characters);
        if (live) {
            const swapped = swapOpNames(plan, live.pool, { allowedText: [prompt.user, request].join('\n'), known: live.known });
            if (swapped.swaps.length) console.info(LOG_PREFIX, `made-up names on the other side swapped for the world's own: ${swapped.swaps.map((s) => `${s.from} -> ${s.to}`).join(', ')}`);
            plan = swapped.plan;
            const { takeFromPool } = await import('../naming/run.js');
            takeFromPool(settingId, live.key, swapped.used);
        }
        // Held to what a small model skips (src/ops/generate.js shapePlan).
        plan = shapePlan(plan, { people: sidePeople, against: them, aware, placeName: places.find((p) => p.id === at)?.name ?? '', fallbackAim: aboutThem(request, them) ? '' : request });
        return {
            ...plan,
            sideId: found.faction?.id ?? '',
            wingId: wings.ownerWing,
            placeId: at,
            placeName: places.find((p) => p.id === at)?.name ?? '',
            aware,
            against: [player?.name, ...against].filter(Boolean).join(' and '),
        };
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not plan the other side', err);
        return null;
    }
}

// Starts a plan from the next reply. Its named people the library does not
// have become characters of its side (src/director/run.js createNeeded),
// not placed in the scene - the story brings them in. -> the operation.
// turn: the reply it begins with (default: the next briefing's).
export async function startOpPlan(chatId, chatKey, settingId, plan, { turn = null } = {}) {
    let p = plan;
    try {
        const newcomers = [p.leader, ...(p.boss?.name ? [p.boss] : []), ...p.crew].filter((x) => x?.name && !x.objectId && isPersonName(x.name));
        if (newcomers.length && settingId && getSettings().director.allowCreate) {
            const { createNeeded } = await import('../director/run.js');
            // Whose job it is and whom they answer to, in the seed the
            // enrichment builds on - Nichiro Fukudo, made as Enrique's crew,
            // was written up as "the Moriarty branch, under Randrés Moriarty".
            const at = p.placeName || 'the scene';
            const whose = p.boss?.name ? `${p.boss.name}'s job` : 'the job';
            const items = newcomers.map((x) => ({
                kind: 'character',
                name: x.name,
                description: x === p.leader
                    ? `Of ${p.side}; runs ${whose} at ${at} on site: ${p.aim}${p.boss?.name ? `. A trusted lieutenant of ${p.boss.name}'s` : ''}`
                    : x === p.boss ? `Of ${p.side}; ordered the operation at ${at} and keeps well away from it.`
                    : `${x.skill ? `${x.skill.replace(/\.$/, '')}, ` : 'One '}of ${p.side}'s crew on ${whose} at ${at}${p.leader.name ? `, answering to ${p.leader.name}` : ''}${x.post ? `; posted ${x.post.replace(/^(?:posted|stationed)\s+/i, '')}` : ''}. ${p.boss?.name ? `One of ${p.boss.name}'s own people, not anyone else's in ${p.side}` : `Loyal to ${p.side}`}.`,
                tiedIds: [p.sideId, ...(x === p.leader ? [] : [p.leader.objectId]), ...(x === p.boss ? [] : [p.boss?.objectId])].filter(Boolean),
                here: false,
            }));
            const made = await createNeeded(chatId, chatKey, settingId, items, null);
            const idOf = (name) => made.find((m) => key(m.name) === key(name))?.id ?? '';
            p = { ...p, leader: { ...p.leader, objectId: p.leader.objectId || idOf(p.leader.name) }, ...(p.boss?.name ? { boss: { ...p.boss, objectId: p.boss.objectId || idOf(p.boss.name) } } : {}), crew: p.crew.map((c) => ({ ...c, objectId: c.objectId || idOf(c.name) })) };
            // One of its side, as the plan says.
            if (p.sideId) {
                const { addRelation } = await import('../library/relations-edit.js');
                for (const m of made) addRelation(settingId, { from: m.id, to: p.sideId, kind: 'member of' });
                // ...and of the wing whose job it is (src/library/wings.js).
                if (p.wingId && p.wingId !== p.sideId) for (const m of made) addRelation(settingId, { from: m.id, to: p.wingId, kind: 'member of' });
            }
        }
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not add the other side\'s people', err);
    }
    let op = startOp(p, Number.isInteger(turn) ? turn : getChatDoc(chatKey).turn, newLocalId('op'));
    if (!op) throw new Error('That plan has nothing to carry out.');
    // Up against a job already running: each is told of the other.
    const beside = liveJobs(getChatDoc(chatKey))[0];
    if (beside) {
        const { getSettingDoc } = await import('../store/setting-store.js');
        if (sidesOppose(op, beside, settingId ? getSettingDoc(settingId).relations ?? [] : [])) {
            op = { ...op, opposes: beside.side };
            save(chatKey, { ...beside, opposes: op.side });
        }
    }
    return placeJob(chatKey, op);
}

// The director saw a rival group at work in the scene with no plan
// (OPPOSED | <who> | <what>): one plan written and started, once per side
// and place, in the background. -> the operation, or null.
export async function opFromDirector(chatId, chatKey, settingId, opposed) {
    try {
        if (!opposed?.who || !settingId || getSettings().director.opposition === false) return null;
        const doc = getChatDoc(chatKey);
        if (!roomForJob(doc)) return null;
        const lastOp = doc.op ?? (doc.opsDone ?? []).at(-1) ?? null;
        const lib = await import('../library/library.js');
        const { libraryMemberships } = await import('../library/faction-sync.js');
        const { getSettingDoc } = await import('../store/setting-store.js');
        const characters = await lib.listEntries(chatId, settingId, 'character').catch(() => []);
        const factions = await lib.listEntries(chatId, settingId, 'faction').catch(() => []);
        const memberships = libraryMemberships(factions, getSettingDoc(settingId).relations ?? []);
        const recent = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).slice(-RECENT_FOR_SIDE).map((m) => String(m.mes ?? '')).join('\n');
        const who = sideInStory(opposed.who, { recent, factions, characters, memberships });
        if (!who) {
            console.info(LOG_PREFIX, `the other side: ${opposed.who} left alone - the recent chat does not have them in the story`);
            return null;
        }
        // The same side, or a branch of it, does not simply try again.
        const relations = getSettingDoc(settingId).relations ?? [];
        const factionIds = new Set(factions.map((f) => f.id));
        const found = findSide(who, factions, characters, memberships);
        const start = found.faction?.id ?? '';
        const sideIds = new Set(start ? [start, ...allWingsOf(start, relations, factionIds), ...factions.filter((f) => allWingsOf(f.id, relations, factionIds).includes(start)).map((f) => f.id)] : []);
        const memberIds = new Set([...characters.filter((c) => (memberships.get(c.id) ?? []).some((id) => sideIds.has(id))).map((c) => c.id), ...(found.leader ? [found.leader.id] : [])]);
        if (repeatJob([...(doc.opsDone ?? []), doc.op, ...(doc.opsAlso ?? [])], doc.turn, { side: who, sideIds, memberIds })) {
            console.info(LOG_PREFIX, `the other side: ${who} left alone - they are on a job, or their last has only just ended`);
            return null;
        }
        // In the middle of an encounter, only a group the latest chat shows
        // on a job of its own comes in: a faction war, not a surprise crew.
        if (encounterOpen({ fight: doc.fight, lastOp, castIds: doc.canonical.castIds })) {
            const names = found.faction ? namesOf(found.faction, characters.filter((c) => memberIds.has(c.id))) : [who];
            const latest = (SillyTavern.getContext().chat ?? []).filter((m) => m && !m.is_system).slice(-4).map((m) => String(m.mes ?? '')).join('\n');
            if (!shownAtWork(names, latest)) {
                console.info(LOG_PREFIX, `the other side: ${who} left alone - the encounter under way is not over`);
                return null;
            }
        }
        const tried = `${key(who)}@${doc.canonical.locationId || ''}`;
        if ((doc.opsTried ?? []).includes(tried)) return null;
        updateChatDoc(chatKey, (d) => { d.opsTried = [...(d.opsTried ?? []), tried].slice(-20); });
        console.info(LOG_PREFIX, `the other side: planning ${who}'s operation - ${opposed.what}`);
        const plan = await planOp(chatId, chatKey, settingId, { side: who, request: opposed.what, aware: false });
        if (!plan) return null;
        // The chat may have planned one meanwhile (the user).
        if (!roomForJob(getChatDoc(chatKey))) return null;
        // This reply's briefing is written: it runs from the next.
        return await startOpPlan(chatId, chatKey, settingId, plan, { turn: doc.turn + 1 });
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not plan the other side', err);
        return null;
    }
}
