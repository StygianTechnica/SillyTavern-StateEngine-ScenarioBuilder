// How fights go, set by the user (docs/ROADMAP.md, Combat) - no stats. An
// entry can carry a power rating (minor, standard, strong, deadly) the fight
// tracker reads: a strong foe takes longer to wear down and hits harder, a
// weak one breaks quickly. And a fate: a plot device the story still needs
// flees a losing fight (or is driven off) rather than being killed; an
// unkillable one can be beaten, hurt or captured but never dies. A chat-wide
// stance covers everyone else: a free-for-all, the player's allies spared,
// or no one with an entry killed by the story.
//
// The user's own "Mark dead" always stands: these hold the director and the
// story back, not the user. Pure: the fight tracker is src/director/fight.js.

import { STRENGTHS } from '../events/model.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The same steps a tournament entrant's strength uses (src/events/model.js).
export const POWER_RATINGS = STRENGTHS;
// '' - the chat's stance decides; 'plot' - flees rather than dies;
// 'unkillable' - beaten, never killed; 'mortal' - can die whatever the stance.
export const FATES = Object.freeze(['plot', 'unkillable', 'mortal']);
// free: anyone may die; allies: those fighting on the player's side never
// die at the story's hand; named: no one with an entry does (people, and
// creatures that are one being) - only nameless foes and creatures of a kind.
export const STANCES = Object.freeze(['free', 'allies', 'named']);
// How readily foes fall, and how hard allies are pressed.
export const FOES_FALL = Object.freeze(['quickly', 'standard', 'slowly']);
export const ALLIES_PRESSED = Object.freeze(['spared', 'pressed', 'hard']);

export const POWER_LABELS = Object.freeze({ minor: 'Minor', standard: 'Standard', strong: 'Strong', deadly: 'Deadly' });
export const FATE_LABELS = Object.freeze({ '': 'As the chat decides', plot: 'Plot device - flees rather than dies', unkillable: 'Unkillable - beaten, never killed', mortal: 'Mortal - can die whatever the chat says' });
export const STANCE_LABELS = Object.freeze({ free: 'Anyone can die', allies: 'Allies are spared', named: 'No named character dies' });

// meta.combat: { power, fate } ('' = not set).
export function normalizeCombatMeta(value) {
    const c = isObject(value) ? value : {};
    return { power: POWER_RATINGS.includes(c.power) ? c.power : '', fate: FATES.includes(c.fate) ? c.fate : '' };
}

export const powerRatingOf = (entry) => normalizeCombatMeta(entry?.meta?.combat).power;
export const fateOf = (entry) => normalizeCombatMeta(entry?.meta?.combat).fate;

// The settings' combat block, read safely.
export function combatOptions(settings) {
    const c = isObject(settings?.combat) ? settings.combat : {};
    return {
        stance: STANCES.includes(c.stance) ? c.stance : 'free',
        foesFall: FOES_FALL.includes(c.foesFall) ? c.foesFall : 'standard',
        alliesPressed: ALLIES_PRESSED.includes(c.alliesPressed) ? c.alliesPressed : 'spared',
    };
}

// The stance for a chat: its own, else the default.
export const stanceFor = (doc, settings) => (STANCES.includes(doc?.combatStance) ? doc.combatStance : combatOptions(settings).stance);

// How a fighter is spared: '' (may die), 'flee' (a losing fight ends with
// them fleeing or driven off) or 'spare' (beaten, never killed).
// entry: the library entry the fighter is, or null (someone nameless);
// side: 'foe' | 'ally'.
export function protectionOf(entry, { stance = 'free', side = 'foe' } = {}) {
    const fate = fateOf(entry);
    if (fate === 'plot') return 'flee';
    if (fate === 'unkillable') return 'spare';
    if (fate === 'mortal') return '';
    if (stance === 'allies' && side === 'ally') return 'spare';
    if (stance === 'named' && entry) return 'spare';
    return '';
}

// Whether a DIES line may stand for this entry. wasAlly: they fought on the
// player's side in the fight just now.
export const mayDie = (entry, { stance = 'free', wasAlly = false } = {}) => !protectionOf(entry, { stance, side: wasAlly ? 'ally' : 'foe' });

// What the director is told about who cannot be killed here: the people
// present (entries) with a protection, and the stance. -> text or ''.
export function protectedText(entries = [], { stance = 'free' } = {}) {
    const lines = [];
    const flee = entries.filter((e) => e && fateOf(e) === 'plot').map((e) => clean(e.name)).filter(Boolean);
    const spare = entries.filter((e) => e && fateOf(e) !== 'plot' && protectionOf(e, { stance }) === 'spare').map((e) => clean(e.name)).filter(Boolean);
    if (spare.length) lines.push(`${spare.join(', ')} can be beaten, wounded, knocked out or captured, but never killed.`);
    if (flee.length) lines.push(`${flee.join(', ')} - the story still needs ${flee.length === 1 ? 'them' : 'each of them'}: in a fight going against them, they flee, slip away or are driven off; never killed.`);
    if (stance === 'allies') lines.push('Those who fight on the player character\'s side are never killed - beaten, wounded or captured at worst.');
    if (stance === 'named') lines.push('No named person dies in this story: foes are beaten, captured or put to flight; only nameless foes and creatures of a kind may be killed.');
    return lines.join(' ');
}

// The fight tracker's numbers for a fighter.
// foesFall: replies a foe may go unharmed before the blows tell.
const FALL_STEADY = { quickly: 1, standard: 2, slowly: 3 };
const POWER_STEADY = { minor: -1, standard: 0, strong: 1, deadly: 2 };
// The most rungs a report may take a foe down in one reply (a small model
// fells a dragon in a sentence): none for minor and standard.
const POWER_STEP = { strong: 2, deadly: 1 };
// Extra replies a fight may run while such a foe still stands.
const POWER_REPLIES = { strong: 1, deadly: 2 };
// Allies: replies unharmed before they are worn down (0: never forced).
const PRESSED_STEADY = { spared: 0, pressed: 3, hard: 2 };

export function foeSteady(power, foesFall = 'standard') {
    return Math.max(1, (FALL_STEADY[foesFall] ?? 2) + (POWER_STEADY[power] ?? 0));
}
export const foeStep = (power) => POWER_STEP[power] ?? Infinity;
export const extraReplies = (power) => POWER_REPLIES[power] ?? 0;
// Against a strong or deadly foe, allies are worn down even when spared
// otherwise - it hits harder - and a step sooner when pressed.
export function allySteady(alliesPressed = 'spared', hardestFoe = '') {
    const base = PRESSED_STEADY[alliesPressed] ?? 0;
    const hits = hardestFoe === 'deadly' ? 2 : hardestFoe === 'strong' ? 1 : 0;
    if (!base) return hits ? 4 - hits : 0;
    return Math.max(1, base - (hits ? 1 : 0));
}
