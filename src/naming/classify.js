// What kind of name a new thing needs, read from its type and the user's
// brief - and whether the setting already names it (docs/DESIGN - NAMING.md,
// section 4.1): a name in the brief, or an existing entry it is tied to.

import { fold } from './text.js';

const any = (text, words) => words.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)) ?? null;

const LOCATION_KINDS = [
    ['room', ['room', 'rooms', 'cellar', 'chamber', 'kitchen', 'attic', 'corridor', 'hallway', 'bedroom', 'study', 'pantry', 'larder', 'stable', 'stables', 'courtyard', 'balcony', 'cell', 'dormitory', 'parlour', 'parlor', 'foyer', 'lobby', 'basement', 'loft']],
    // A base, a hideout: a cover name when it is secret, its owner's otherwise.
    ['base', ['headquarters', 'hq', 'base', 'hideout', 'hide-out', 'safehouse', 'safe house', 'bunker', 'compound', 'facility', 'laboratory', 'lab', 'depot', 'armory', 'armoury', 'command center', 'command centre', 'black site', 'den', 'warehouse', 'garrison', 'barracks', 'station', 'hangar', 'nest']],
    ['inn', ['inn', 'tavern', 'taverns', 'alehouse', 'pub', 'taproom', 'bar', 'saloon', 'roadhouse', 'brewery', 'hostel', 'coaching inn', 'gin palace', 'cantina', 'speakeasy']],
    // A place of business in a later age: a club, a clinic, a hotel.
    ['venue', ['nightclub', 'club', 'restaurant', 'cafe', 'café', 'diner', 'hotel', 'motel', 'casino', 'brothel', 'theatre', 'theater', 'cinema', 'gym', 'clinic', 'hospital', 'school', 'office', 'offices', 'studio', 'garage', 'mall', 'arcade', 'gallery', 'museum', 'library', 'salon', 'teahouse', 'bathhouse', 'embassy', 'arena', 'stadium', 'parlour', 'lounge', 'boutique', 'pharmacy', 'dojo']],
    ['shop', ['shop', 'store', 'smithy', 'forge', 'bakery', 'apothecary', 'stall', 'emporium', 'workshop', 'tailor', 'cobbler', 'chandlery', 'pawnshop', 'bookshop', 'herbalist', 'tannery', 'mercantile']],
    ['site', ['tomb', 'crypt', 'barrow', 'ruin', 'ruins', 'catacomb', 'catacombs', 'vault', 'dungeon', 'lair', 'henge', 'cairn', 'sepulchre', 'mausoleum', 'necropolis']],
    ['temple', ['temple', 'shrine', 'church', 'chapel', 'cathedral', 'monastery', 'abbey', 'sanctum', 'sanctuary', 'priory', 'convent', 'mosque', 'synagogue', 'pagoda']],
    ['fort', ['castle', 'fortress', 'keep', 'citadel', 'fort', 'stronghold', 'bastion', 'tower', 'watchtower', 'manor', 'palace', 'hall']],
    ['district', ['district', 'neighborhood', 'neighbourhood', 'quarter', 'ward', 'sector', 'slum', 'slums', 'ghetto', 'enclave', 'arcology', 'megablock', 'undercity', 'sprawl', 'downtown', 'uptown', 'dockside', 'barrio', 'favela', 'hutong', 'red-light district']],
    ['street', ['street', 'avenue', 'alley', 'alleyway', 'boulevard', 'lane', 'plaza', 'square', 'piazza']],
    ['settlement', ['city', 'town', 'village', 'hamlet', 'port', 'harbor', 'harbour', 'capital', 'settlement', 'outpost', 'colony', 'township', 'borough', 'farmstead', 'homestead', 'thorp', 'stead', 'market town', 'trading post']],
    ['region', ['kingdom', 'realm', 'empire', 'province', 'region', 'land', 'lands', 'country', 'duchy', 'barony', 'county', 'march', 'principality', 'territory', 'dominion', 'republic', 'nation', 'shire', 'canton']],
];

// What makes a base secret: it gets a cover name, not its owner's.
const SECRET = ['secret', 'hidden', 'covert', 'clandestine', 'undercover', 'underground', 'black site', 'off the books', 'concealed', 'unmarked', 'classified'];

const FEATURES = [
    ['forest', ['forest', 'wood', 'woods', 'woodland', 'jungle', 'grove', 'thicket', 'weald', 'copse', 'greenwood']],
    ['mountain', ['mountain', 'mountains', 'peak', 'peaks', 'range', 'crag', 'crags', 'summit', 'volcano', 'spire']],
    ['hills', ['hill', 'hills', 'downs', 'tor', 'knoll', 'ridge', 'bluff']],
    ['river', ['river', 'stream', 'creek', 'brook', 'beck', 'rapids', 'waterfall', 'falls', 'canal']],
    ['lake', ['lake', 'pond', 'loch', 'lough', 'mere', 'tarn', 'lagoon', 'pool']],
    ['marsh', ['marsh', 'swamp', 'bog', 'fen', 'mire', 'wetland', 'wetlands', 'bayou', 'quagmire']],
    ['coast', ['coast', 'beach', 'shore', 'bay', 'cove', 'cliff', 'cliffs', 'headland', 'strand', 'reef']],
    ['cave', ['cave', 'caves', 'cavern', 'caverns', 'grotto', 'underdark', 'chasm', 'pit', 'mine']],
    ['desert', ['desert', 'dunes', 'dune sea', 'sands', 'badlands', 'salt flats']],
    ['plain', ['plain', 'plains', 'steppe', 'valley', 'vale', 'wasteland', 'wastes', 'moor', 'moors', 'heath', 'prairie', 'savanna', 'tundra', 'meadow', 'fields']],
    ['island', ['island', 'isle', 'islet', 'archipelago', 'atoll', 'skerry']],
];

const FACTION_KINDS = [
    ['house', ['house', 'clan', 'family', 'dynasty', 'bloodline', 'lineage', 'noble family', 'royal family']],
    ['gang', ['gang', 'street gang', 'thieves', "thieves' guild", 'smugglers', 'mob', 'cartel', 'syndicate', 'crew']],
    ['company', ['mercenary', 'mercenaries', 'sellswords', 'sellsword', 'free company', 'warband', 'war band', 'band', 'legion', 'regiment', 'army', 'militia', 'raiders', 'soldiers', 'private military']],
    // A business: a corporation in a later age, a merchant house in an
    // earlier one. A plain "company" is a business; a mercenary company is
    // caught above.
    ['business', ['corporation', 'corporations', 'corp', 'megacorp', 'megacorporation', 'conglomerate', 'firm', 'multinational', 'holdings', 'zaibatsu', 'keiretsu', 'chaebol', 'bank', 'consortium', 'startup', 'business', 'enterprise', 'trading company', 'trading house', 'merchant house', 'merchant company', 'partnership', 'trading partnership', 'shipping company', 'company', 'manufacturer', 'brand', 'franchise', 'chain']],
    ['order', ['guild', 'order', 'cult', 'brotherhood', 'sisterhood', 'circle', 'society', 'church', 'sect', 'covenant', 'league', 'council', 'cabal', 'coven', 'faith', 'priesthood', 'conclave', 'academy', 'college', 'lodge']],
];

const SHIP = ['ship', 'boat', 'vessel', 'galleon', 'sloop', 'frigate', 'brig', 'brigantine', 'schooner', 'caravel', 'carrack', 'cog', 'barge', 'galley', 'longship', 'junk', 'dhow', 'clipper', 'warship', 'man-of-war', 'privateer'];
const PIRATE = ['pirate', 'pirates', 'corsair', 'corsairs', 'buccaneer', 'buccaneers', 'raider', 'raiders', 'privateer', 'reaver', 'freebooter'];
const NAVAL = ['navy', 'naval', 'warship', 'man-of-war', 'frigate', 'ship of the line', 'admiral', 'fleet', 'flagship'];

const FEMALE = ['woman', 'women', 'girl', 'she', 'her', 'hers', 'lady', 'queen', 'princess', 'priestess', 'mother', 'daughter', 'sister', 'wife', 'widow', 'witch', 'matron', 'duchess', 'countess', 'empress', 'baroness', 'maiden', 'heroine', 'actress', 'waitress', 'goddess', 'matriarch', 'nun', 'abbess', 'aunt', 'grandmother', 'niece', 'female', 'sorceress', 'huntress', 'mistress', 'madam', 'crone', 'hag'];
const MALE = ['man', 'men', 'boy', 'he', 'him', 'his', 'lord', 'king', 'prince', 'priest', 'father', 'son', 'brother', 'husband', 'widower', 'wizard', 'duke', 'count', 'emperor', 'baron', 'hero', 'actor', 'waiter', 'god', 'patriarch', 'monk', 'abbot', 'uncle', 'grandfather', 'nephew', 'male', 'sorcerer', 'huntsman', 'master', 'sir', 'squire', 'knight'];

const kindIn = (text, table) => table.find(([, words]) => any(text, words))?.[0] ?? null;

// The gender a brief gives a person: 'f', 'm' or '' (either).
export function genderFrom(text) {
    const t = String(text ?? '').toLowerCase();
    const f = FEMALE.filter((w) => new RegExp(`\\b${w}\\b`).test(t)).length;
    const m = MALE.filter((w) => new RegExp(`\\b${w}\\b`).test(t)).length;
    return f > m ? 'f' : m > f ? 'm' : '';
}

// -> { kind, feature?, subtype?, noun? } or null when no rolled name
// fits (a room, a sword, a quest - the model names those in plain words).
// kind: 'person' | 'settlement' | 'region' | 'feature' | 'building' |
// 'site' | 'house' | 'faction' | 'ship'.
export function nameKindFor(typeId, text = '', { hasParent = false } = {}) {
    const t = String(text ?? '').toLowerCase();
    if (typeId === 'character') return { kind: 'person', gender: genderFrom(t) };
    if (typeId === 'location') {
        const feature = kindIn(t, FEATURES);
        const place = kindIn(t, LOCATION_KINDS);
        // "A tavern by the river" is a tavern: a building wins over the
        // landscape around it; between a town and a landscape, whichever
        // the brief says first ("a forest near the town" is a forest).
        const at = (table, kind) => t.search(new RegExp(`\\b${any(t, table.find(([k]) => k === kind)[1])}\\b`));
        const settled = place === 'settlement' || place === 'region';
        if (feature && (!place || (settled && at(FEATURES, feature) < at(LOCATION_KINDS, place)))) return { kind: 'feature', feature };
        if (place === 'room') return null;
        if (place === 'inn') return { kind: 'building', subtype: 'inn' };
        if (place === 'shop') return { kind: 'building', subtype: 'shop', noun: any(t, LOCATION_KINDS.find(([k]) => k === 'shop')[1]) };
        if (place === 'venue') return { kind: 'building', subtype: 'venue', noun: any(t, LOCATION_KINDS.find(([k]) => k === 'venue')[1]) };
        // Secret: a cover name, never its owner's.
        if (place === 'base') return { kind: 'base', secret: Boolean(any(t, SECRET)), noun: any(t, LOCATION_KINDS.find(([k]) => k === 'base')[1]) };
        if (place === 'site') return { kind: 'feature', feature: 'site' };
        if (place === 'temple' || place === 'fort') return { kind: 'settlement', subtype: place, noun: any(t, LOCATION_KINDS.find(([k]) => k === place)[1]) };
        if (place) return { kind: place };
        // Nothing said: a new region of the world is a settlement; a place
        // inside another could be anything - left to the model.
        return hasParent ? null : { kind: 'settlement' };
    }
    if (typeId === 'faction') {
        const sub = kindIn(t, FACTION_KINDS);
        if (sub === 'house') return { kind: 'house' };
        // Nothing says what kind of group: an order, unless what it is tied
        // to says otherwise (a rival of a corporation is a business).
        return sub ? { kind: 'faction', subtype: sub } : { kind: 'faction', subtype: 'order', guessed: true };
    }
    if (typeId === 'item' && any(t, SHIP)) {
        return { kind: 'ship', subtype: any(t, PIRATE) ? 'pirate' : any(t, NAVAL) ? 'naval' : any(t, ['longship', 'drakkar']) ? 'native' : 'merchant' };
    }
    return null;
}

// A name the brief already gives: `called X`, `named X`, `"X"`. -> '' if none.
export function nameInBrief(text) {
    const t = String(text ?? '');
    const quoted = t.match(/["“]([^"”]{2,60})["”]/);
    if (quoted) return quoted[1].trim();
    const called = t.match(/\b(?:called|named|known as|by the name of)\s+((?:the\s+)?[A-Z][\w'’-]*(?:\s+(?:of|the|de|van|von|al|[A-Z][\w'’-]*))*)/);
    return called ? called[1].trim() : '';
}

// How a brief relates a new thing to an entry it names: 'from' - it comes
// from it and is named from it (the followers of Morvath, the temple to
// Morvath, a branch of the bank, an inn in Brassport); 'apart' - it stands
// beside or against it and its name is its own (a rival to Omicron
// Innovations, an enemy of the guild, something like it). Unclear is
// 'apart': a name of its own is never wrong.
const APART = ['rival', 'rivals', 'rivalling', 'rivaling', 'enemy', 'enemies', 'competitor', 'competitors', 'competing', 'compete', 'against', 'opposed', 'opposing', 'opposes', 'opposition', 'hunts', 'hunting', 'hunt', 'unlike', 'nemesis', 'foe', 'foes', 'at war', 'war with', 'feud', 'feuding', 'versus', 'vs', 'instead of', 'replacing', 'like', 'similar', 'counterpart', 'alternative', 'challenger', 'challenging', 'undermine', 'undermining', 'sabotage', 'sabotaging', 'betray', 'betrayed', 'hostile', 'targets', 'targeting', 'spying on', 'spies on'];
const FROM = ['of', 'for', 'to', 'from', 'under', 'within', 'inside', 'in', 'at', 'serving', 'serves', 'serve', 'worshippers', 'worshipers', 'worshipping', 'followers', 'following', 'servants', 'devotees', 'disciples', 'branch', 'subsidiary', 'division', 'offshoot', 'splinter', 'arm', 'wing', 'son', 'daughter', 'child', 'heir', 'cult', 'church', 'temple', 'shrine', 'chapel', 'order', 'priests', 'priesthood', 'owned by', 'run by', 'founded by', 'loyal to', 'sworn to'];
// Words after a name that make the new thing its own: its followers, its
// headquarters, its club.
const OWNED = ['worshippers', 'worshipers', 'followers', 'cult', 'church', 'temple', 'shrine', 'faithful', 'loyalists', 'branch', 'subsidiary',
    'headquarters', 'hq', 'base', 'hideout', 'safehouse', 'bunker', 'compound', 'facility', 'lab', 'laboratory', 'offices', 'office', 'tower',
    'hall', 'lodge', 'clubhouse', 'den', 'lair', 'stronghold', 'keep', 'embassy', 'outpost', 'garrison', 'barracks', 'warehouse', 'depot', 'territory', 'turf'];
export function tieRelation(text, matched) {
    const t = String(text ?? '').toLowerCase();
    const at = t.indexOf(String(matched ?? '').toLowerCase());
    if (at < 0) return 'apart';
    const has = (s, words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(s));
    const before = t.slice(Math.max(0, at - 80), at).split(/\s+/).slice(-8).join(' ');
    const after = t.slice(at + matched.length, at + matched.length + 40);
    // A rival or an enemy near the name sets it apart ("a rival corporation
    // to X", "X's main competitor").
    if (has(before, APART) || has(after.split(/\s+/).slice(0, 5).join(' '), APART)) return 'apart';
    // "X's...", "X worshippers", "X headquarters": its people, its place.
    if (has(before, FROM) || /^['’]s\b/.test(after) || has(after.split(/\s+/).slice(0, 5).join(' '), OWNED)) return 'from';
    return 'apart';
}

// Existing entries the brief names (by name or alias, whole words), longest
// first: what a new thing is tied to. all: [{ id, name, aliases, type }].
export function tiesInBrief(text, all = []) {
    const t = ` ${String(text ?? '').toLowerCase()} `;
    if (!fold(t)) return [];
    const out = [];
    for (const e of all) {
        const names = [e.name, ...(e.aliases ?? [])].filter((n) => n && n.length >= 3);
        const hit = names.find((n) => new RegExp(`(^|[^\\p{L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(t));
        if (hit) out.push({ ...e, matched: hit });
    }
    return out.sort((a, b) => b.matched.length - a.matched.length).slice(0, 3);
}
