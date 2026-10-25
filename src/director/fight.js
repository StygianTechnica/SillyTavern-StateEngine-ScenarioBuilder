// The fight in the scene, kept by Scenario Builder (no extra call). A small
// model left to itself keeps a fight going forever: blows "find their mark"
// and nothing ever changes. So the director names each fighter but the
// player character - foes and allies - and their condition on FIGHT lines,
// from a fixed ladder, and this keeps the fight honest: a condition never
// gets better unless the story heals it, a foe worsens at least every other
// reply, and the fight ends within a few replies. The narrator is told every
// fighter's condition in plain words each reply. The player character is
// never a fighter here: how they fare is the player's to say.
// Each fighter carries the power rating and protection of the entry they
// are (src/director/combat.js): a strong foe wears down slower, a plot
// device flees instead of going down, an unkillable one goes down alive.
// Pure: the runner is src/director/run.js.

import { POWER_RATINGS, foeSteady, foeStep, extraReplies, allySteady } from './combat.js';

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
        // From the entry (src/director/combat.js): '' - standard / may die.
        power: POWER_RATINGS.includes(f.power) && f.power !== 'standard' ? f.power : '',
        protect: ['flee', 'spare'].includes(f.protect) ? f.protect : '',
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
        // The most replies this fight runs (longer while a strong foe stands).
        ...(Number.isInteger(value.limit) && value.limit > 0 ? { limit: value.limit } : {}),
    };
}

const standing = (f) => !FIGHT_OUT.includes(f.condition);

// The fight after the director's briefing for a new reply.
// prev: the stored fight or null; lines: the FIGHT lines read ([{ name,
// condition, side }]); present(name): whether that fighter is still in the
// scene; limit: the most replies a fight lasts; playerNames: never fighters;
// remembered: { [lower-case name]: condition } - wounds from a fight that
// was broken off, so someone who fights again starts as they left off.
// traitsOf(name, side): { power, protect } of the entry the fighter is
// (src/director/combat.js); foesFall, alliesPressed: the user's settings.
// -> the fight for this reply, or null when there is none.
export function nextFight(prev, lines = [], { present = () => true, limit = FIGHT_REPLIES, playerNames = [], remembered = {}, traitsOf = () => ({}), foesFall = 'standard', alliesPressed = 'spared' } = {}) {
    const last = prev && !prev.ended ? normalizeFight(prev) : null;
    const said = (lines ?? [])
        .map((l) => ({ name: clean(l?.name), condition: readCondition(l?.condition), side: readSide(l?.side) }))
        .filter((l) => l.name && !playerNames.some((p) => sameName(p, l.name)));
    if (!last && !said.length) return null;
    // Everyone already fighting, then anyone new the briefing brings in.
    const fighters = (last?.fighters ?? []).map((f) => ({ ...f }));
    for (const l of said) {
        if (!fighters.some((f) => sameName(f.name, l.name)) && fighters.length < MAX_FIGHTERS) {
            // Back in a fight with the wounds it left with (never as good
            // as down - that was the end of it).
            const was = remembered?.[clean(l.name).toLowerCase()];
            const start = FIGHT_LADDER.includes(was) && was !== 'down' ? was : 'unhurt';
            const side = l.side || 'foe';
            const t = traitsOf(l.name, side) ?? {};
            fighters.push(normalizeFighter({ name: l.name, side, condition: start, steady: 0, power: t.power, protect: t.protect }));
            fighters[fighters.length - 1].fresh = true;
        }
    }
    // A reply the briefing reports no fighting in: the fight is paused while
    // its fighters are still around (nothing counts, no one wears down - the
    // player may have stepped out), and over once none of them is.
    if (last && !said.length) return last.fighters.some((f) => standing(f) && present(f.name)) ? last : null;
    const round = last ? last.round + 1 : 1;
    // The hardest foe still standing hits allies harder, and draws the
    // fight out a little.
    const order = ['', 'minor', 'standard', 'strong', 'deadly'];
    const hardest = fighters.filter((f) => f.side === 'foe' && standing(f)).reduce((a, f) => (order.indexOf(f.power) > order.indexOf(a) ? f.power : a), '');
    const allyEvery = allySteady(alliesPressed, hardest);
    const out = fighters.map((f) => {
        const l = said.find((x) => sameName(x.name, f.name));
        const next = { name: f.name, side: l?.side || f.side, condition: f.condition, steady: f.steady, power: f.power ?? '', protect: f.protect ?? '' };
        if (!standing(f)) return next;
        // Someone gone from the scene is out of it.
        if (!l && !present(f.name)) return { ...next, condition: 'fled', steady: 0 };
        const before = Math.max(0, rank(f.condition));
        if (l && FIGHT_OUT.includes(l.condition)) {
            // A strong foe is not felled from fresh in one blow: it is worn
            // down only so far this reply.
            if (next.side === 'foe' && l.condition === 'down' && before + foeStep(next.power) < rank('down')) {
                return { ...next, condition: FIGHT_LADDER[before + foeStep(next.power)], steady: 0 };
            }
            return { ...next, condition: l.side === 'ally' && l.condition === 'won' ? f.condition : l.condition, steady: 0 };
        }
        // Never better than it was (unless the story heals it - then the
        // user or a new fight starts it afresh).
        let now = Math.max(before, l && rank(l.condition) >= 0 ? rank(l.condition) : before);
        if (next.side === 'foe') now = Math.min(now, before + foeStep(next.power));
        let steady = !f.fresh && now === before ? f.steady + 1 : 0;
        // A foe some replies without harm: the blows tell (sooner for a weak
        // one, later for a strong one).
        if (next.side === 'foe' && steady >= foeSteady(next.power, foesFall)) { now += 1; steady = 0; }
        // Allies pressed hard are worn down too - never past failing: how
        // they go down is the story's.
        if (next.side === 'ally' && allyEvery && steady >= allyEvery && now < rank('failing')) { now += 1; steady = 0; }
        // A weak foe that takes harm breaks quickly.
        if (next.side === 'foe' && next.power === 'minor' && now > before) now += 1;
        now = Math.min(now, rank('down'));
        return { ...next, condition: FIGHT_LADDER[now], steady: FIGHT_LADDER[now] === 'down' ? 0 : steady };
    });
    const foes = out.filter((f) => f.side === 'foe');
    // A strong foe still standing draws the fight out (the longest it ever
    // was stands, so a fight never ends sooner than it said).
    const standingFoes = foes.filter(standing);
    const longest = Math.max(limit, last?.limit ?? 0, limit + Math.max(0, ...standingFoes.map((f) => extraReplies(f.power))));
    // Its last reply: every foe still standing goes down if the fight has
    // gone against it, otherwise it breaks off.
    if (round >= longest) {
        for (const f of foes) if (standing(f)) Object.assign(f, { condition: rank(f.condition) >= rank('wounded') ? 'down' : 'fled', steady: 0 });
    }
    // A plot device does not go down: it flees, or is driven off.
    for (const f of out) if (f.protect === 'flee' && f.condition === 'down') Object.assign(f, { condition: 'fled', steady: 0 });
    const allies = out.filter((f) => f.side === 'ally');
    const ended = !foes.length || foes.every((f) => !standing(f)) || foes.some((f) => f.condition === 'won')
        || (allies.length > 0 && allies.every((f) => !standing(f)));
    return { fighters: out, round, ended, limit: longest };
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
// One who cannot be killed (src/director/combat.js) goes down alive.
const SPARED_DOWN = 'is beaten in this reply - knocked down, overpowered or taken captive, but alive: never killed';
const POWER_CUES = {
    minor: 'a weak foe: it breaks quickly once hurt',
    strong: 'a strong foe: it shrugs off lesser blows and hits hard',
    deadly: 'a deadly foe: every blow it lands is dangerous, and it takes a great deal to wear down',
};
const tags = (x) => [x.side, x.power, x.protect === 'flee' ? 'flees rather than dies' : x.protect === 'spare' ? 'never killed' : ''].filter(Boolean).join(', ');

// Wounds to remember when a fight is broken off or over: each fighter still
// standing and hurt, by lower-case name. -> { [name]: condition }
export function woundsOf(fight) {
    const f = normalizeFight(fight);
    if (!f) return {};
    return Object.fromEntries(f.fighters.filter((x) => standing(x) && x.condition !== 'unhurt').map((x) => [x.name.toLowerCase(), x.condition]));
}

const listNames = (fighters) => fighters.map((f) => f.name).join(', ');

// The director's view of the fight (its dossier) - '' when there is none.
export function fightFacts(fight, limit = FIGHT_REPLIES) {
    const f = normalizeFight(fight);
    if (!f || f.ended) return '';
    limit = f.limit ?? limit;
    const left = Math.max(1, limit - f.round);
    const who = f.fighters.map((x) => `${x.name} (${tags(x)}): ${x.condition}`).join('; ');
    return `After ${f.round} ${f.round === 1 ? 'reply' : 'replies'}: ${who}. A fight ends within ${limit} replies - ${left === 1 ? 'this is its last: it ends in this reply' : `at most ${left} more`}. A condition only gets worse unless the story heals it.`;
}

// The fight as Scenario Builder's variables, for a panel that shows it while
// it runs (Pretty Panels: a flag to show the panel, the round, a line per
// fighter, and the fighters who are characters, by side, for cards).
// `characterId(name)`: the character a fighter is, or '' (a creature, an
// unnamed guard). With no fight running, everything is empty.
export function fightValues(fight, limit = FIGHT_REPLIES, characterId = () => '') {
    const f = normalizeFight(fight);
    if (!f || f.ended) return { fight_active: false, fight_round: 0, fight_summary: '', fight_fighters: [], fight_allies: [], fight_foes: [] };
    limit = f.limit ?? limit;
    const ids = (side) => [...new Set(f.fighters.filter((x) => x.side === side).map((x) => characterId(x.name)).filter(Boolean))];
    return {
        fight_active: true,
        fight_round: f.round,
        fight_summary: `Round ${f.round} of at most ${limit}: ${f.fighters.map((x) => `${x.name} ${x.condition}`).join(', ')}`,
        fight_fighters: f.fighters.map((x) => `${x.name} (${x.side}) - ${x.condition}`),
        fight_allies: ids('ally'),
        fight_foes: ids('foe'),
    };
}

// The narrator's lines for the fight this reply - '' when there is none.
export function fightGuidance(fight) {
    const f = normalizeFight(fight);
    if (!f) return '';
    const cue = (x) => {
        if (x.condition === 'down' && x.protect === 'spare') return SPARED_DOWN;
        if (x.side === 'ally') return x.condition === 'down' || x.condition === 'fled' ? ALLY_CUES[x.condition] : `is ${ALLY_CUES[x.condition] ?? ALLY_CUES.unhurt}`;
        if (['down', 'fled', 'won'].includes(x.condition)) return CUES[x.condition];
        return `is ${CUES[x.condition] ?? CUES.unhurt}${POWER_CUES[x.power] ? ` (${POWER_CUES[x.power]})` : ''}`;
    };
    const line = (x) => `${x.name} ${cue(x)}.`;
    const up = f.fighters.filter((x) => x.side === 'foe' && standing(x));
    const lines = f.fighters.map(line).join(' ');
    return f.ended
        ? `The fight ends in this reply. ${lines}`
        : `The fight goes on (reply ${f.round}). ${lines} Show the harm each blow does${up.length ? `, above all to ${listNames(up)}` : ''}.`;
}
