// The fight in the scene, kept by Scenario Builder (no extra call). A small
// model left to itself keeps a fight going forever: blows "find their mark"
// and nothing ever changes. So the director names each fighter but the
// player character - foes and allies - and their condition on FIGHT lines,
// from a fixed ladder, and this keeps the fight honest: a condition never
// gets better unless the story heals it, a foe worsens at least every other
// reply, and the fight ends within a few replies. The narrator is told every
// fighter's condition in plain words each reply. The player character is
// never a fighter here: how they fare is the player's to say.
// Pure: the runner is src/director/run.js.

export const FIGHT_LADDER = Object.freeze(['unhurt', 'hurt', 'wounded', 'badly wounded', 'failing', 'down']);
// Out of the fight: down, fled - or, for a foe, the winner.
export const FIGHT_OUT = Object.freeze(['down', 'fled', 'won']);
export const FIGHT_SIDES = Object.freeze(['foe', 'ally']);
export const FIGHT_REPLIES = 5;
const MAX_FIGHTERS = 8;

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
const rank = (condition) => FIGHT_LADDER.indexOf(condition);

// A condition in the model's words -> the ladder's ('' when unreadable).
export function readCondition(text) {
    const t = clean(text).toLowerCase().replace(/[.!*"']/g, '');
    if (!t) return '';
    if (FIGHT_LADDER.includes(t) || FIGHT_OUT.includes(t)) return t;
    if (/\b(dead|destroyed|slain|killed|defeated|fallen|collapsed|beaten|downed|dies|crumbles|unconscious)\b/.test(t)) return 'down';
    if (/\b(fled|flees|fleeing|retreats|retreated|withdraws|withdrew|escaped|escapes)\b/.test(t)) return 'fled';
    if (/\b(wins|won|victorious|triumphs|overpowers)\b/.test(t)) return 'won';
    if (/\b(failing|dying|staggering|near death|crippled)\b/.test(t)) return 'failing';
    if (/\b(badly|heavily|gravely|severely|seriously)\b/.test(t)) return 'badly wounded';
    if (/\b(wounded|bleeding|injured|damaged|cracked)\b/.test(t)) return 'wounded';
    if (/\b(hurt|scratched|grazed|bruised|dented|stung|winded)\b/.test(t)) return 'hurt';
    if (/\b(unhurt|unharmed|fresh|untouched|intact|unscathed|healthy)\b/.test(t)) return 'unhurt';
    return '';
}

// A side in the model's words: 'foe' or 'ally' ('' when not said).
export function readSide(text) {
    const t = clean(text).toLowerCase();
    if (/\b(foe|enemy|enemies|opponent|hostile|against)\b/.test(t)) return 'foe';
    if (/\b(ally|allies|friend|friendly|companion|with)\b/.test(t)) return 'ally';
    return '';
}

function normalizeFighter(f) {
    if (!isObject(f) || !clean(f.name)) return null;
    return {
        name: clean(f.name).slice(0, 80),
        side: FIGHT_SIDES.includes(f.side) ? f.side : 'foe',
        condition: [...FIGHT_LADDER, ...FIGHT_OUT].includes(f.condition) ? f.condition : 'unhurt',
        // Replies in a row a foe's condition did not worsen.
        steady: Number.isInteger(f.steady) && f.steady >= 0 ? f.steady : 0,
    };
}

export function normalizeFight(value) {
    if (!isObject(value)) return null;
    const fighters = (Array.isArray(value.fighters) ? value.fighters : []).map(normalizeFighter).filter(Boolean).slice(0, MAX_FIGHTERS);
    if (!fighters.length) return null;
    return {
        fighters,
        round: Number.isInteger(value.round) && value.round > 0 ? value.round : 1,
        ended: value.ended === true,
    };
}

const standing = (f) => !FIGHT_OUT.includes(f.condition);

// The fight after the director's briefing for a new reply.
// prev: the stored fight or null; lines: the FIGHT lines read ([{ name,
// condition, side }]); present(name): whether that fighter is still in the
// scene; limit: the most replies a fight lasts; playerNames: never fighters.
// -> the fight for this reply, or null when there is none.
export function nextFight(prev, lines = [], { present = () => true, limit = FIGHT_REPLIES, playerNames = [] } = {}) {
    const last = prev && !prev.ended ? normalizeFight(prev) : null;
    const said = (lines ?? [])
        .map((l) => ({ name: clean(l?.name), condition: readCondition(l?.condition), side: readSide(l?.side) }))
        .filter((l) => l.name && !playerNames.some((p) => sameName(p, l.name)));
    if (!last && !said.length) return null;
    // Everyone already fighting, then anyone new the briefing brings in.
    const fighters = (last?.fighters ?? []).map((f) => ({ ...f }));
    for (const l of said) {
        if (!fighters.some((f) => sameName(f.name, l.name)) && fighters.length < MAX_FIGHTERS) {
            fighters.push({ name: l.name, side: l.side || 'foe', condition: 'unhurt', steady: 0, fresh: true });
        }
    }
    // A fight the briefing no longer speaks of, with no fighter left in the
    // scene, is over.
    if (last && !said.length && !last.fighters.some((f) => standing(f) && present(f.name))) return null;
    const round = last ? last.round + 1 : 1;
    const out = fighters.map((f) => {
        const l = said.find((x) => sameName(x.name, f.name));
        const next = { name: f.name, side: l?.side || f.side, condition: f.condition, steady: f.steady };
        if (!standing(f)) return next;
        // Someone gone from the scene is out of it.
        if (!l && !present(f.name)) return { ...next, condition: 'fled', steady: 0 };
        if (l && FIGHT_OUT.includes(l.condition)) return { ...next, condition: l.side === 'ally' && l.condition === 'won' ? f.condition : l.condition, steady: 0 };
        // Never better than it was (unless the story heals it - then the
        // user or a new fight starts it afresh).
        const before = Math.max(0, rank(f.condition));
        let now = Math.max(before, l && rank(l.condition) >= 0 ? rank(l.condition) : before);
        let steady = !f.fresh && now === before ? f.steady + 1 : 0;
        // A foe two replies without harm: the blows tell.
        if (next.side === 'foe' && steady >= 2) { now += 1; steady = 0; }
        now = Math.min(now, rank('down'));
        return { ...next, condition: FIGHT_LADDER[now], steady: FIGHT_LADDER[now] === 'down' ? 0 : steady };
    });
    const foes = out.filter((f) => f.side === 'foe');
    // Its last reply: every foe still standing goes down if the fight has
    // gone against it, otherwise it breaks off.
    if (round >= limit) {
        for (const f of foes) if (standing(f)) Object.assign(f, { condition: rank(f.condition) >= rank('wounded') ? 'down' : 'fled', steady: 0 });
    }
    const allies = out.filter((f) => f.side === 'ally');
    const ended = !foes.length || foes.every((f) => !standing(f)) || foes.some((f) => f.condition === 'won')
        || (allies.length > 0 && allies.every((f) => !standing(f)));
    return { fighters: out, round, ended };
}

const CUES = {
    unhurt: 'still unhurt - but this reply the blows against it start getting through',
    hurt: 'hurt - a blow has got through: a dent, a cut, a stagger to recover from',
    wounded: 'wounded - armour split or flesh cut, bleeding or leaking ichor, slower than before',
    'badly wounded': 'badly wounded - a limb failing, armour hanging off, every move costing it',
    failing: 'failing - staggering, barely keeping its guard up; the next solid blow ends it',
    down: 'goes down in this reply - slain, destroyed or collapsed for good; show it',
    fled: 'is out of the fight in this reply - it flees, withdraws or is driven off',
    won: 'gets the upper hand in this reply - the others are driven back or overpowered',
};
const ALLY_CUES = {
    unhurt: 'unhurt',
    hurt: 'hurt - a cut or bruise slows them a little',
    wounded: 'wounded - bleeding, favouring a side, slower',
    'badly wounded': 'badly wounded - hard pressed to stay on their feet',
    failing: 'failing - barely standing; they need help or to get clear',
    down: 'goes down in this reply - knocked out or cut down (alive unless the story has said otherwise)',
    fled: 'is out of the fight - pulled back or driven off',
};

const listNames = (fighters) => fighters.map((f) => f.name).join(', ');

// The director's view of the fight (its dossier) - '' when there is none.
export function fightFacts(fight, limit = FIGHT_REPLIES) {
    const f = normalizeFight(fight);
    if (!f || f.ended) return '';
    const left = Math.max(1, limit - f.round);
    const who = f.fighters.map((x) => `${x.name} (${x.side}): ${x.condition}`).join('; ');
    return `After ${f.round} ${f.round === 1 ? 'reply' : 'replies'}: ${who}. A fight ends within ${limit} replies - ${left === 1 ? 'this is its last: it ends in this reply' : `at most ${left} more`}. A condition only gets worse unless the story heals it.`;
}

// The narrator's lines for the fight this reply - '' when there is none.
export function fightGuidance(fight) {
    const f = normalizeFight(fight);
    if (!f) return '';
    const line = (x) => `${x.name} ${x.side === 'ally' ? (x.condition === 'down' || x.condition === 'fled' ? ALLY_CUES[x.condition] : `is ${ALLY_CUES[x.condition] ?? ALLY_CUES.unhurt}`) : (['down', 'fled', 'won'].includes(x.condition) ? CUES[x.condition] : `is ${CUES[x.condition] ?? CUES.unhurt}`)}.`;
    const up = f.fighters.filter((x) => x.side === 'foe' && standing(x));
    const lines = f.fighters.map(line).join(' ');
    return f.ended
        ? `The fight ends in this reply. ${lines}`
        : `The fight goes on (reply ${f.round}). ${lines} Show the harm each blow does${up.length ? `, above all to ${listNames(up)}` : ''}.`;
}
