// A new place inside another one fits it: a place in a nightlife district
// is a place for a night out, one in a business district is an office,
// a bank or somewhere the people who work there eat - not a dump, and not
// another site of the one corporation that has its tower there. Pure.
//
// The parent's purpose is read from its name and description
// (src/naming/classify.js, as for naming districts). A surprise inside such
// a place is given a fitting kind in code - not left to the model, which
// in a grim world reaches for the same rundown backstreet every time - and
// a kind its neighbours already are is picked last.

import { nameKindFor, purposeOf } from '../naming/classify.js';
import { pick } from '../naming/random.js';

// What each purpose holds: [earlier age, later age] lists of the kinds of
// place found there, each a noun the name generator knows.
const HOLDS = {
    pleasure: [
        ['tavern', 'gambling den', 'theatre', 'music hall', 'bathhouse', 'pleasure garden', 'wine house', 'fighting pit', 'dance hall', 'opium den'],
        ['nightclub', 'cocktail bar', 'casino', 'karaoke bar', 'music venue', 'cabaret', 'arcade', 'noodle bar', 'rooftop bar', 'theatre', 'hotel', 'dance club', 'sake bar', 'jazz club'],
    ],
    business: [
        ['counting house', 'exchange', 'bank', 'coffee house', 'guildhall', 'merchant hall', 'scriveners\' office', 'chophouse'],
        ['office tower', 'bank', 'trading floor', 'hotel', 'restaurant', 'coffee bar', 'law office', 'private club', 'plaza', 'data centre', 'clinic', 'gym'],
    ],
    industrial: [
        ['foundry', 'mill', 'tannery', 'warehouse', 'workshop', 'brewery', 'ropewalk', 'workers\' tavern'],
        ['factory', 'warehouse', 'foundry', 'rail yard', 'power plant', 'workers\' canteen', 'recycling plant', 'garage', 'depot'],
    ],
    residential: [
        ['row of cottages', 'well square', 'bakery', 'chapel', 'school', 'tavern', 'boarding house'],
        ['apartment block', 'corner shop', 'laundromat', 'school', 'park', 'diner', 'clinic', 'community centre'],
    ],
    civic: [
        ['courthouse', 'town hall', 'archive', 'watch house', 'jail', 'hall of records', 'chancery'],
        ['courthouse', 'city hall', 'police station', 'archive', 'hospital', 'ministry', 'embassy', 'museum'],
    ],
    market: [
        ['market hall', 'spice stall', 'smithy', 'apothecary', 'cloth merchant', 'tavern', 'moneylender'],
        ['market hall', 'food court', 'pawn shop', 'electronics stall', 'tailor', 'street food stall', 'fixer\'s shop', 'pharmacy'],
    ],
    harbour: [
        ['dockside tavern', 'warehouse', 'customs house', 'shipwright', 'fish market', 'chandlery', 'sailors\' hostel'],
        ['container yard', 'warehouse', 'customs office', 'ferry terminal', 'fish market', 'dockside bar', 'boatyard'],
    ],
    temple: [
        ['shrine', 'temple', 'monastery', 'pilgrims\' hostel', 'reliquary', 'almshouse'],
        ['shrine', 'temple', 'church', 'meditation centre', 'charity kitchen', 'bookshop'],
    ],
    academic: [
        ['college', 'library', 'scriptorium', 'observatory', 'student tavern', 'bookbinder'],
        ['lecture hall', 'library', 'laboratory', 'student bar', 'bookshop', 'museum', 'research institute'],
    ],
    slum: [
        ['tenement', 'flophouse', 'soup kitchen', 'gin shop', 'rag market', 'hedge doctor\'s'],
        ['tenement block', 'clinic', 'soup kitchen', 'chop shop', 'dive bar', 'pawn shop', 'street market'],
    ],
};

// How a purpose reads in a prompt.
const PHRASE = {
    pleasure: 'a nightlife and entertainment district - people come here for a night out',
    business: 'a business district - offices, money and the people who work there',
    industrial: 'an industrial district - work, machines and the people who run them',
    residential: 'a residential area - where people live',
    civic: 'the seat of government and law',
    market: 'a market district - buying and selling',
    harbour: 'a harbour - ships, cargo and the people who work the docks',
    temple: 'a holy district - worship and the people who serve it',
    academic: 'a district of learning',
    slum: 'a slum - poor, crowded and hard',
};

// What a parent place is, for the places made inside it. parent: { name,
// description }. -> { purpose, public } - public: a district, a town or a
// region, where most places belong to no one in particular (as opposed to
// a fortress or a tower, whose rooms are its owner's).
export function parentFrame(parent) {
    const text = `${parent?.name ?? ''} ${parent?.description ?? ''}`;
    const kind = nameKindFor('location', `${parent?.name ?? ''}`, { hasParent: true }) ?? nameKindFor('location', text, { hasParent: true });
    const open = ['district', 'settlement', 'region', 'street', 'feature'].includes(kind?.kind) && kind?.subtype !== 'fort' && kind?.subtype !== 'temple';
    const purpose = kind?.kind === 'district' ? kind.purpose || purposeOf(text) : open ? purposeOf(text) : '';
    return { purpose, public: open || Boolean(purpose) };
}

// A kind of place for a surprise inside the parent: one its purpose holds,
// one no neighbour already is when there is a choice. siblings: [{ name,
// description }]. -> 'a nightclub', or '' when the purpose is unknown.
export function surpriseKind(frame, { later = false, siblings = [], rand = Math.random } = {}) {
    const lists = HOLDS[frame?.purpose];
    if (!lists) return '';
    const list = lists[later ? 1 : 0];
    const seen = siblings.map((s) => `${s.name ?? ''} ${s.description ?? ''}`.toLowerCase()).join(' | ');
    const fresh = list.filter((noun) => !seen.includes(noun.toLowerCase()));
    const noun = pick(rand, fresh.length ? fresh : list);
    return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

// The prompt's rule for a place inside `parentName`. A public place sets
// the mood, but the things in it are not its factions' unless asked; a
// fortress's rooms are its owner's.
export function placeRuleFor(parentName, frame, { factions = [], siblings = [] } = {}) {
    if (!parentName) return '';
    const lines = [];
    if (frame?.purpose) lines.push(`${parentName} is ${PHRASE[frame.purpose]}: make it the kind of place found there, that fits what the district is for and what draws people to it - even in a grim world, a place people actually go to, not a rundown backwater, unless the user asks for that.`);
    if (frame?.public) {
        lines.push(`Keep it true to ${parentName}'s character and mood. It is one of many places there, owned and run by its own people - not a branch, office, outpost or front of ${factions.length ? factions.join(' or ') : 'a faction based there'}, unless the user says so. Never make it serve a side ${parentName} stands against.`);
        if (siblings.length) lines.push(`Already in ${parentName}: ${siblings.slice(0, 12).join(', ')}. Make something different from them, not another of them.`);
    } else {
        lines.push(`It is part of ${parentName}: keep it true to that place and the people tied to it - their side, their enemies, their mood - unless the user says otherwise. Never make it serve a side the place it is in stands against.`);
    }
    return lines.join('\n');
}
