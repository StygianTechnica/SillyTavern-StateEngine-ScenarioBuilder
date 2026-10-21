// Missions and jobs (docs/ROADMAP.md, Structured events): ready-to-go work a
// giver hands out, again and again - a guild hall's board, an assassins'
// order's marks, a fence's jobs. A mission is a quest of type "mission"
// (src/quests/) with five parts of its own: the client who wants it done,
// the giver who hands it out, a difficulty matched to the one taking it,
// the target or task, and the reward.
//
// Any character, faction or location can be a giver (its sheet's Missions
// tab): what work it gives, for whom, for what pay. A mission is written by
// one model call, only when one is made - the user asks, or a giver's last
// mission has ended and it offers the next. Never a call per reply. The
// giver then offers it in the story: the GM plan's queue carries it to the
// director.
//
// The prompt and readers are pure (and tested); the runners never throw.

import { LOG_PREFIX } from '../constants.js';

export const MISSION_DIFFICULTIES = Object.freeze(['trivial', 'easy', 'moderate', 'hard', 'deadly']);
// How a giver picks the next mission's difficulty: grows with its record,
// fixed, random, or from the tension the story wants now.
export const DIFFICULTY_MODES = Object.freeze(['grow', 'fixed', 'random', 'story']);
// When a giver offers a mission: when they next meet, only when asked for
// work, or only once a condition holds (a story trigger watches for it).
export const OFFER_MODES = Object.freeze(['meet', 'asked', 'when']);
const DIFFICULTY_TEXT = {
    trivial: 'trivial - a routine errand; little can go wrong',
    easy: 'easy - a simple job with a small risk',
    moderate: 'moderate - real risk; it takes care, skill or a plan',
    hard: 'hard - dangerous; capable opposition, a good chance of failing',
    deadly: 'deadly - the kind of job people do not come back from',
};

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
    const t = clean(text);
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---- the giver (an entry's metadata: meta.giver)

export function emptyGiver() {
    return { on: false, trade: '', clients: '', reward: '', team: false, auto: true, difficultyMode: 'grow', difficulty: '', offer: 'meet', offerWhen: '', lastFollowed: '' };
}

export function normalizeGiver(value) {
    const g = isObject(value) ? value : {};
    return {
        on: g.on === true,
        // What work it gives ("marks to kill for pay", "quests for adventurers").
        trade: clean(g.trade).slice(0, 300),
        // Who its clients are ("nobles settling scores", "the town's merchants").
        clients: clean(g.clients).slice(0, 300),
        // The usual pay ("coin, by the job").
        reward: clean(g.reward).slice(0, 200),
        // Work for the group present, not the player character alone.
        team: g.team === true,
        // Offer the next mission once one has ended.
        auto: g.auto !== false,
        // How the next difficulty is picked; an older giver with a set
        // difficulty and no mode keeps it fixed.
        difficultyMode: DIFFICULTY_MODES.includes(g.difficultyMode) ? g.difficultyMode : (MISSION_DIFFICULTIES.includes(g.difficulty) ? 'fixed' : 'grow'),
        // The fixed difficulty ('' when not fixed).
        difficulty: MISSION_DIFFICULTIES.includes(g.difficulty) ? g.difficulty : '',
        // When it offers a mission, and the condition for 'when'.
        offer: OFFER_MODES.includes(g.offer) ? g.offer : 'meet',
        offerWhen: clean(g.offerWhen).slice(0, 300),
        // The ended mission it last followed with a new one.
        lastFollowed: clean(g.lastFollowed),
    };
}

// ---- the mission (a quest's metadata: meta.quest.mission)

export function normalizeMission(value) {
    if (!isObject(value) || !clean(value.giverId)) return null;
    return {
        giverId: clean(value.giverId),
        giverName: clean(value.giverName),
        client: clean(value.client).slice(0, 120),
        clientId: clean(value.clientId),
        target: clean(value.target).slice(0, 200),
        targetId: clean(value.targetId),
        task: clean(value.task).slice(0, 400),
        reward: clean(value.reward).slice(0, 200),
        difficulty: MISSION_DIFFICULTIES.includes(value.difficulty) ? value.difficulty : 'moderate',
        offeredAt: clean(value.offeredAt),
    };
}

// The difficulty of a giver's next mission, by its mode:
//   fixed  - the one set;
//   random - any, mostly the middle ones;
//   story  - the tension the story's shape wants now (1-5, src/planner/
//            shapes.js targetAt), so a job lands where the story is going;
//   grow   - starts easy and grows with the record: one step for every two
//            done, one back for each failure.
// past: [{ status }] - the giver's earlier missions; tension: the target
// (null without a story shape - then it grows); random: () => 0..1.
export function nextDifficulty(giver, past = [], { tension = null, random = Math.random } = {}) {
    const mode = giver?.difficultyMode ?? (MISSION_DIFFICULTIES.includes(giver?.difficulty) ? 'fixed' : 'grow');
    if (mode === 'fixed' && MISSION_DIFFICULTIES.includes(giver?.difficulty)) return giver.difficulty;
    if (mode === 'random') {
        const weights = [1, 3, 4, 3, 1];
        let roll = random() * weights.reduce((a, b) => a + b, 0);
        for (const [i, w] of weights.entries()) { roll -= w; if (roll < 0) return MISSION_DIFFICULTIES[i]; }
        return 'moderate';
    }
    if (mode === 'story' && Number.isFinite(tension)) return MISSION_DIFFICULTIES[Math.max(0, Math.min(4, Math.round(tension) - 1))];
    const done = past.filter((m) => m.status === 'Completed').length;
    const failed = past.filter((m) => m.status === 'Failed' || m.status === 'Abandoned').length;
    const step = Math.max(0, Math.min(MISSION_DIFFICULTIES.length - 1, 1 + Math.floor(done / 2) - failed));
    return MISSION_DIFFICULTIES[step];
}

const SYSTEM = 'You are a game master\'s assistant for a roleplay. You write one job, ready to hand out, in exactly the lines asked for - no preamble, no commentary.';

// "Write the next job this giver hands out." -> { system, user, plain }
// input: { giver: { name, type, description, trade, clients, reward },
//   taker: { name, description }, group: [name], difficulty, overview,
//   candidates: [{ name, type, description }], past: [{ name, status }],
//   request, canonOnly }
export function buildMissionPrompt(input) {
    const g = input?.giver ?? {};
    const taker = input?.taker ?? {};
    const group = (input?.group ?? []).map(clean).filter(Boolean);
    const candidates = (input?.candidates ?? []).filter((c) => clean(c?.name)).slice(0, 30);
    const past = (input?.past ?? []).filter((p) => clean(p?.name)).slice(-8);
    const difficulty = MISSION_DIFFICULTIES.includes(input?.difficulty) ? input.difficulty : 'moderate';
    const user = [
        clean(input?.overview) ? `# The setting\n${cut(input.overview, 500)}` : '',
        `# The giver\n${clean(g.name)}${clean(g.type) ? ` (${clean(g.type)})` : ''}${clean(g.description) ? `: ${cut(g.description, 500)}` : ''}`
            + `${clean(g.trade) ? `\nThe work they give: ${clean(g.trade)}` : ''}${clean(g.clients) ? `\nTheir clients: ${clean(g.clients)}` : ''}${clean(g.reward) ? `\nUsual pay: ${clean(g.reward)}` : ''}`,
        `# Who takes the job\n${clean(taker.name) || 'The player character'}${clean(taker.description) ? `: ${cut(taker.description, 300)}` : ''}${group.length ? `\nWith their group: ${group.join(', ')} - a job for all of them.` : ''}`,
        `# Difficulty\n${DIFFICULTY_TEXT[difficulty]}. Size the job to it - the opposition, the stakes and the pay.`,
        candidates.length ? `# People, places and things the setting has (use them as client or target where they fit)\n${candidates.map((c) => `- ${clean(c.name)}${clean(c.type) ? ` (${clean(c.type)})` : ''}${clean(c.description) ? `: ${cut(c.description, 90)}` : ''}`).join('\n')}` : '',
        past.length ? `# Jobs this giver has handed out before (do not repeat them)\n${past.map((p) => `- ${clean(p.name)}${clean(p.status) ? ` (${clean(p.status).toLowerCase()})` : ''}`).join('\n')}` : '',
        clean(input?.request) ? `# What the user wants this time\n${cut(input.request, 400)}` : '',
        '# Your task',
        `Write the next job ${clean(g.name) || 'the giver'} hands out - the kind of work they give, for one of their clients, at this difficulty.`,
        input?.canonOnly
            ? '- The client and the target must be people, places or things listed above; never invent new ones.'
            : '- Take the client and the target from the list above where one fits; otherwise invent one that fits the setting, and give it a name.',
        '- The task is concrete: who or what, where, and what counts as done. A few objectives in order.',
        '- Never decide what the one taking the job thinks, feels or chooses: they may still turn it down.',
        '# Reply\nExactly these lines:',
        'NAME: <a short title for the job>',
        'CLIENT: <who wants it done>',
        'TARGET: <the person, place or thing the job is about>',
        'TASK: <one or two sentences: what must be done>',
        'REWARD: <what it pays>',
        'OBJECTIVES: <three to five steps, separated by ";">',
        'DONE WHEN: <the event in the story that completes it>',
        'FAILS WHEN: <the event that makes it fail>',
    ].filter(Boolean).join('\n\n');
    return { system: SYSTEM, user, plain: true };
}

// The answer -> { name, client, target, task, reward, objectives: [text],
// completion, abandon }, or null when it has no name or task.
export function readMission(text) {
    const lines = String(text ?? '').split('\n').map((l) => l.replace(/[*`#]/g, '').trim());
    const pick = (re) => clean(lines.map((l) => l.match(re)?.[1]).find(Boolean) ?? '').replace(/^["']|["']$/g, '');
    const name = pick(/^(?:name|title|job)\s*[:\-–]\s*(.+)$/i);
    const task = pick(/^(?:task|job description|the job)\s*[:\-–]\s*(.+)$/i);
    if (!name || !task) return null;
    // Objectives: on the line, or as "- " lines after it.
    let objectives = pick(/^objectives?\s*[:\-–]\s*(.+)$/i).split(/\s*;\s*/).map(clean).filter(Boolean);
    if (objectives.length < 2) {
        const at = lines.findIndex((l) => /^objectives?\s*[:\-–]?\s*$/i.test(l));
        if (at >= 0) objectives = lines.slice(at + 1).map((l) => l.match(/^(?:[-•]|\d+[.)])\s*(.+)$/)?.[1]).filter(Boolean).map(clean);
    }
    return {
        name: name.slice(0, 100),
        client: pick(/^client\s*[:\-–]\s*(.+)$/i),
        target: pick(/^target\s*[:\-–]\s*(.+)$/i),
        task,
        reward: pick(/^(?:reward|pay|payment)\s*[:\-–]\s*(.+)$/i),
        objectives: objectives.map((o) => o.replace(/[.;]+$/, '')).filter(Boolean).slice(0, 6),
        completion: pick(/^(?:done when|completes? when|done)\s*[:\-–]\s*(.+)$/i),
        abandon: pick(/^(?:fails? when|failed when|fails?)\s*[:\-–]\s*(.+)$/i),
    };
}

// What the director is asked to work in: the giver offering the job - at
// their next meeting, or `now` (a trigger has fired: the moment is here).
export function offerText(mission, { giverName = '', takerName = '', now = false } = {}) {
    const who = clean(giverName) || 'The giver';
    if (now) return `${who} offers${clean(takerName) ? ` ${clean(takerName)}` : ''} a job: "${clean(mission.name)}" - ${unstop(clean(mission.task))}${clean(mission.reward) ? `, paying ${unstop(clean(mission.reward))}` : ''}. It can be turned down.`;
    return `${who} has a job to offer${clean(takerName) ? ` ${clean(takerName)}` : ''}: "${clean(mission.name)}" - ${unstop(clean(mission.task))}${clean(mission.reward) ? `, paying ${unstop(clean(mission.reward))}` : ''}. ${who} offers it the next time they meet (or at once, if they are together now); it can be turned down.`;
}
const unstop = (text) => clean(text).replace(/[.!?]+$/, '');

// Whether a giver's missions call for the next one: it offers more, its
// latest mission has ended, nothing of its is still open, and that ending
// has not been followed yet. missions: [{ id, status }] oldest first.
// -> the ended mission to follow, or null.
export function missionToFollow(giver, missions = []) {
    if (!giver?.on || !giver.auto || !missions.length) return null;
    if (missions.some((m) => m.status === 'Active' || m.status === 'Not started')) return null;
    const last = missions[missions.length - 1];
    return last && last.id !== giver.lastFollowed ? last : null;
}

// ---- runners

const TYPES_FOR_PARTS = ['character', 'faction', 'location', 'item', 'creature'];

// What a giver waits for before offering, as a story trigger's condition -
// or '' when it offers at the next meeting.
export function offerCondition(giver, { giverName = '', takerName = '' } = {}) {
    const who = clean(takerName) || 'the player character';
    if (giver?.offer === 'asked') return `${who} asks ${clean(giverName) || 'the giver'} for work or a new job`;
    if (giver?.offer === 'when' && clean(giver.offerWhen)) return clean(giver.offerWhen);
    return '';
}

// The tension the story's shape wants now (1-5), or null without one.
async function storyTension(chatKey) {
    try {
        const { getChatDoc } = await import('../store/chat-store.js');
        const { storyState } = await import('../planner/run.js');
        const { targetAt } = await import('../planner/shapes.js');
        const s = storyState(getChatDoc(chatKey).gm);
        return s.shape ? targetAt(s.shape, s.position).center : null;
    } catch {
        return null;
    }
}

// A giver's missions on the chat's board, oldest first.
async function giverMissions(chatId, chatKey, settingId, giverId) {
    const { questBoard } = await import('./sync.js');
    return (await questBoard(chatId, chatKey, settingId)).filter((q) => q.mission?.giverId === giverId)
        .sort((a, b) => String(a.mission.offeredAt).localeCompare(String(b.mission.offeredAt)));
}

// The library entry a name stands for, among the types a client or target
// can be. -> id or ''.
async function findPart(chatId, settingId, name) {
    if (!clean(name)) return '';
    const { findSimilar } = await import('../library/library.js');
    for (const type of TYPES_FOR_PARTS) {
        const hit = (await findSimilar(chatId, settingId, type, name).catch(() => []))[0];
        if (hit) return hit.id;
    }
    return '';
}

let offering = false;

// Writes a mission from a giver and puts it on the board, Not started, with
// the offer queued for the director. options: { difficulty, request }.
// -> the quest made, or null. Never throws.
export async function offerMission(chatId, chatKey, settingId, giverId, { difficulty = '', request = '' } = {}) {
    if (offering) return null;
    offering = true;
    try {
        const lib = await import('../library/library.js');
        const { setQuestMeta } = await import('./sync.js');
        const { getChatDoc, updateChatDoc } = await import('../store/chat-store.js');
        const { addRequest } = await import('../planner/model.js');
        const { newLocalId } = await import('../store/schema.js');
        const giverEntry = await lib.getEntry(chatId, settingId, giverId);
        if (!giverEntry) return null;
        const giver = normalizeGiver(giverEntry.meta?.giver);
        const past = await giverMissions(chatId, chatKey, settingId, giverId);
        const level = MISSION_DIFFICULTIES.includes(difficulty) ? difficulty : nextDifficulty(giver, past, { tension: await storyTension(chatKey) });
        const characters = await lib.listEntries(chatId, settingId, 'character');
        const playerId = lib.playerIdOf(settingId, characters);
        const player = characters.find((c) => c.id === playerId);
        const doc = getChatDoc(chatKey);
        const group = giver.team ? characters.filter((c) => c.id !== playerId && doc.canonical.castIds.includes(c.id)).map((c) => c.name) : [];
        const candidates = [];
        for (const type of ['character', 'faction', 'location', 'item']) {
            const list = type === 'character' ? characters : await lib.listEntries(chatId, settingId, type).catch(() => []);
            candidates.push(...list.filter((e) => e.id !== giverId && e.id !== playerId).slice(0, type === 'character' ? 14 : 8).map((e) => ({ name: e.name, type, description: e.description })));
        }
        const overview = lib.getOverview(settingId);
        const prompt = buildMissionPrompt({
            giver: { name: giverEntry.name, type: giverEntry.type, description: giverEntry.description, trade: giver.trade, clients: giver.clients, reward: giver.reward },
            taker: { name: player?.name ?? SillyTavern.getContext().name1, description: player?.description ?? '' },
            group,
            difficulty: level,
            overview: [overview.premise, overview.tone && `Tone: ${overview.tone}.`].filter(Boolean).join(' '),
            candidates,
            past: past.map((m) => ({ name: m.name, status: m.status })),
            request,
            canonOnly: lib.isCanonOnly(settingId),
        });
        const { askReliably } = await import('../generate/run.js');
        const result = await askReliably(prompt, (_p, text) => {
            const values = readMission(text);
            return values ? { values, dropped: [], error: null } : { values: {}, dropped: [], error: 'no NAME and TASK lines' };
        }, 600);
        if (result.error) {
            console.warn(LOG_PREFIX, `could not write a mission for ${giverEntry.name}: ${result.error}`);
            return null;
        }
        const m = result.values;
        const clientId = await findPart(chatId, settingId, m.client);
        const targetId = await findPart(chatId, settingId, m.target);
        const description = [m.task, m.client && `For ${m.client}.`, m.reward && `Pays ${m.reward}.`].filter(Boolean).join(' ');
        const quest = await lib.createEntry(chatId, settingId, 'quest', {
            name: m.name,
            description,
            objectives: m.objectives,
            related_entity_ids: [...new Set([giverId, clientId, targetId].filter(Boolean))],
        });
        if (!quest) return null;
        setQuestMeta(settingId, quest.id, {
            type: 'mission',
            objectives: m.objectives.map((text) => ({ text, status: 'pending' })),
            completion: m.completion,
            abandon: m.abandon,
            endsTried: true,
            mission: { giverId, giverName: giverEntry.name, client: m.client, clientId, target: m.target, targetId, task: m.task, reward: m.reward, difficulty: level, offeredAt: new Date().toISOString() },
        });
        // The giver offers it in the story: on a condition (a story trigger
        // watches for it), or when they next meet (the GM plan's queue).
        const takerName = player?.name ?? '';
        const condition = offerCondition(giver, { giverName: giverEntry.name, takerName });
        let watched = null;
        if (condition) {
            const { armTrigger } = await import('../triggers/run.js');
            watched = await armTrigger(chatId, chatKey, { kind: 'story', when: condition, then: offerText(m, { giverName: giverEntry.name, takerName, now: true }), source: 'giver' });
            if (!watched) console.info(LOG_PREFIX, `could not watch for "${condition}" (too many triggers armed?) - ${giverEntry.name} offers the job when they next meet instead`);
        }
        if (!watched) {
            const together = doc.canonical.castIds.includes(giverId) || doc.canonical.locationId === giverId;
            updateChatDoc(chatKey, (d) => { addRequest(d.gm, { id: newLocalId('r'), text: offerText(m, { giverName: giverEntry.name, takerName }), urgency: together ? 'soon' : 'whenever', at: new Date().toISOString() }); });
        }
        console.info(LOG_PREFIX, `${giverEntry.name} has a new ${level} mission: ${m.name}`);
        return quest;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not make a mission', err);
        return null;
    } finally {
        offering = false;
    }
}

// After a reply: a giver whose last mission has ended offers the next one
// (one giver per pass, so the queue stays light). -> the quest made or
// null. Never throws.
export async function followMissions(chatId, chatKey, settingId) {
    try {
        if (!settingId) return null;
        const lib = await import('../library/library.js');
        const { getSettingDoc } = await import('../store/setting-store.js');
        const entries = getSettingDoc(settingId).entries ?? {};
        for (const [id, meta] of Object.entries(entries)) {
            const giver = normalizeGiver(meta?.giver);
            if (!giver.on || !giver.auto) continue;
            const ended = missionToFollow(giver, await giverMissions(chatId, chatKey, settingId, id));
            if (!ended) continue;
            lib.setEntryMeta(settingId, id, { giver: { ...giver, lastFollowed: ended.id } });
            return await offerMission(chatId, chatKey, settingId, id);
        }
        return null;
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not follow the missions', err);
        return null;
    }
}
