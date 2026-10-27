// Starting points for a world's bloodlines (docs/DESIGN - BLOODLINES.md,
// section 6). A preset fills a bloodline block and a short description,
// and bends to the age: each text that depends on it has two versions,
// [earlier, later] - the later one for a world of a later age (modern,
// science fiction, technology at TL6 and up; world-options.js isLaterAge),
// so cyberpunk elves are not dressed for a forest. Where a naming preset
// fits, it is the bloodline's culture. Pure.

import { isLaterAge } from './world-options.js';
import { emptyBloodline, normalizeBloodline } from './bloodlines.js';

export const PRESET_GROUPS = Object.freeze([
    ['fantasy', 'Fantasy'],
    ['scifi', 'Science fiction'],
    ['modern', 'Modern and urban fantasy'],
]);

// [earlier, later], or one text for both.
const P = (o) => Object.freeze(o);

export const BLOODLINE_PRESETS = Object.freeze([
    // ---- fantasy
    P({ id: 'humans', group: 'fantasy', name: 'Humans', singular: 'human', plural: 'humans', kind: 'human', lifespan: 'human', canMix: true,
        description: ['The most numerous people, short-lived and restless, found everywhere.', 'The most numerous people, and the one the world is built around.'],
        look: '', here: '', visual: { known: 'well' } }),
    P({ id: 'high_elves', group: 'fantasy', name: 'High Elves', singular: 'high elf', plural: 'high elves', adjective: 'elven', kind: 'ancestry', lifespan: 'long', culture: 'preset:elves', canMix: true, traits: ['keen senses', 'long memory'],
        description: ['An old and proud people of slender build and long lives, keepers of ancient cities and older grudges.', 'An old, long-lived people who have learned to live in a fast world - and to own a good part of it.'],
        look: ['tall and slender, pointed ears, eyes that catch the light, ageless faces', 'tall and slender, pointed ears, ageless faces; many hide the ears or have them altered to pass'],
        here: ['rule from old cities of white stone; few in number, long in memory', 'old money and long leases: boardrooms, embassies and galleries; they remember what the city was'],
        visual: { known: 'well', features: 'pointed ears, luminous eyes, ageless face', dress: ['flowing robes, fine silver jewellery', 'tailored modern clothes, understated luxury'], tags: 'elf, pointed ears' } }),
    P({ id: 'wood_elves', group: 'fantasy', name: 'Wood Elves', singular: 'wood elf', plural: 'wood elves', adjective: 'elven', kind: 'ancestry', lifespan: 'long', culture: 'preset:elves', canMix: true, traits: ['woodcraft', 'keen senses'],
        description: ['Elves of the deep forests: wary of outsiders, at home among the trees.', 'Elves who never took to the cities: parks, green belts and the edges of the map.'],
        look: ['lithe, pointed ears, weathered skin, hair worn long and braided with leaves', 'lithe, pointed ears, weathered skin; practical clothes with something green about them'],
        here: ['keep the old forests and guard their borders', 'rangers, activists and the people the city forgets are there'],
        visual: { known: 'well', features: 'pointed ears, braided hair', dress: ['leathers and green cloaks', 'practical outdoor wear, earthy colours'], tags: 'wood elf, pointed ears' } }),
    P({ id: 'dark_elves', group: 'fantasy', name: 'Dark Elves', singular: 'dark elf', plural: 'dark elves', adjective: 'dark elven', kind: 'ancestry', lifespan: 'long', canMix: true, traits: ['see in the dark'],
        description: ['Elves of the deep places under the world, schemers in cities without sun.', 'Elves of the underside: night shifts, undercities and the parts of the city that never see the sun.'],
        look: ['grey or dusky skin, white hair, pointed ears, eyes that shine in the dark', 'grey or dusky skin, white hair, pointed ears; often in tinted glasses by day'],
        here: ['rule cities in the deep dark; distrusted above', 'run the night: clubs, couriers, the undercity markets'],
        visual: { known: 'partly', skin: 'dusky grey skin', features: 'white hair, pointed ears, pale glowing eyes', dress: ['dark spider-silk, fine blades', 'black streetwear, tinted glasses'], tags: 'dark elf, grey skin, white hair, pointed ears' } }),
    P({ id: 'dwarves', group: 'fantasy', name: 'Dwarves', singular: 'dwarf', plural: 'dwarves', adjective: 'dwarven', kind: 'ancestry', lifespan: 'long', culture: 'preset:dwarves', canMix: false, traits: ['hardy', 'see in dim light'],
        description: ['A short, broad and stubborn people of the mountains, miners and smiths who keep their oaths and their grudges.', 'A short, broad and stubborn people: engineers, miners and unions that never forget a contract.'],
        look: ['short and broad, heavy-boned, thick beards worn with pride', 'short and broad, heavy-boned; beards kept, often braided round tech'],
        here: ['delve halls under the mountains and trade metal for grain', 'run heavy industry, mining concerns and the strongest trade unions'],
        visual: { known: 'well', features: 'stocky build, braided beard', dress: ['mail, leather apron, rune-marked tools', 'work gear, hi-vis, heavy boots'], tags: 'dwarf, stocky, braided beard' } }),
    P({ id: 'halflings', group: 'fantasy', name: 'Halflings', singular: 'halfling', plural: 'halflings', kind: 'ancestry', lifespan: 'human', culture: 'preset:shirefolk', canMix: false, traits: ['lucky', 'quiet on their feet'],
        description: ['Small, comfortable folk who love good food and quiet lives, and are braver than they look.', 'Small, sociable folk: the cooks, shopkeepers and neighbours who know everyone.'],
        look: ['child-sized but adult-faced, curly hair, bare and hairy feet', 'child-sized but adult-faced, curly hair; shoes made for them are a business of their own'],
        here: ['farm the green hills and keep away from great affairs', 'run the corner shops, kitchens and the neighbourhood gossip'],
        visual: { known: 'partly', body: 'half the height of a human, adult proportions', features: 'curly hair, round cheerful face', dress: ['waistcoat and breeches, bare feet', 'casual clothes in small sizes'], tags: 'halfling, small' } }),
    P({ id: 'gnomes', group: 'fantasy', name: 'Gnomes', singular: 'gnome', plural: 'gnomes', adjective: 'gnomish', kind: 'ancestry', lifespan: 'long', canMix: false, traits: ['tinkerers'],
        description: ['Small, clever tinkerers and illusionists with long noses and longer curiosity.', 'Small, clever tinkerers - the engineers and coders of the bloodlines.'],
        look: ['very small, big noses, bright eyes, wild hair', 'very small, big noses, bright eyes; tools and gadgets everywhere about them'],
        here: ['live in burrows and workshops, trade in clever things', 'start-ups, repair shops and labs'],
        visual: { known: 'partly', body: 'very small, a third of a human\'s height', features: 'large nose, bright eyes, wild hair', dress: ['tool belts, goggles', 'workshop overalls, smart glasses'], tags: 'gnome, small' } }),
    P({ id: 'orcs', group: 'fantasy', name: 'Orcs', singular: 'orc', plural: 'orcs', adjective: 'orcish', kind: 'ancestry', lifespan: 'short', culture: 'preset:orcs', canMix: true, traits: ['strong', 'tough'],
        description: ['A strong, hardy people of tribes and warbands, feared and often misjudged.', 'A strong, hardy people pushed to the hard jobs and the rough districts, and done with being misjudged.'],
        look: ['broad and powerful, green or grey skin, jutting lower tusks', 'broad and powerful, green or grey skin, tusks - often capped, filed or decorated'],
        here: ['clans and warbands on the edges of the kingdoms', 'labour, security work, prize fighting - and the city\'s loudest politics'],
        visual: { known: 'well', skin: 'green-grey skin', features: 'lower tusks, heavy brow, muscular', dress: ['furs, crude iron', 'work clothes, leather jackets'], tags: 'orc, green skin, tusks' } }),
    P({ id: 'half_orcs', group: 'fantasy', name: 'Half-Orcs', singular: 'half-orc', plural: 'half-orcs', kind: 'ancestry', lifespan: 'human', canMix: true, traits: ['strong'],
        description: ['Born between two peoples and at home in neither, strong and hard to ignore.', 'Born between two peoples, and the proof the city mixes whether it likes it or not.'],
        look: ['tall and heavy, greyish skin, small tusks', 'tall and heavy, greyish skin, small tusks'],
        here: ['mercenaries, labourers and outcasts', 'everywhere the rough work is'],
        visual: { known: 'partly', skin: 'greyish green skin', features: 'small tusks, strong jaw', tags: 'half-orc, small tusks' } }),
    P({ id: 'goblins', group: 'fantasy', name: 'Goblins', singular: 'goblin', plural: 'goblins', kind: 'ancestry', lifespan: 'short', canMix: false, traits: ['quick', 'see in the dark'],
        description: ['Small, quick, numerous and cunning, living in the cracks of other peoples\' lands.', 'Small, quick and numerous: the scrappers, couriers and fixers of the city\'s cracks.'],
        look: ['small and wiry, green skin, big ears and sharp teeth', 'small and wiry, green skin, big pierced ears'],
        here: ['warrens under hills and ruins', 'salvage yards, delivery runs, the grey market'],
        visual: { known: 'well', body: 'small, wiry', skin: 'green skin', features: 'large pointed ears, sharp teeth, yellow eyes', dress: ['rags and scavenged bits', 'oversized hoodies, scavenged tech'], tags: 'goblin, green skin, big ears' } }),
    P({ id: 'giants', group: 'fantasy', name: 'Giants', singular: 'giant', plural: 'giants', kind: 'ancestry', lifespan: 'long', canMix: false, traits: ['huge', 'strong'],
        description: ['Huge folk, ogres and giants, rare and dangerous, living apart in the high places.', 'Huge folk the city was never built for: everything they own is made to order.'],
        look: ['three times a man\'s height, heavy-boned, slow-voiced', 'twice a door\'s height, heavy-boned; stoop through every building'],
        here: ['live apart in mountains and wild country', 'heavy lifting, bodyguard work and a quiet fight for doors that fit'],
        visual: { known: 'partly', body: 'enormous, several times the height of a human', features: 'heavy brow, massive hands', tags: 'giant, huge' } }),
    P({ id: 'merfolk', group: 'fantasy', name: 'Merfolk', singular: 'merfolk', plural: 'merfolk', kind: 'ancestry', lifespan: 'long', canMix: false, traits: ['breathe water'],
        description: ['A people of the sea, human above and fish below, who come ashore rarely.', 'A people of the sea who keep to the harbours, the canals and the water-filled districts.'],
        look: ['human above the waist, a fish\'s tail below, scales at the cheek and wrist', 'human above the waist, a fish\'s tail below; on land in wheeled water-chairs or rarely at all'],
        here: ['kingdoms under the waves; trade with fishing towns', 'harbour pilots, divers and a neighbourhood under the docks'],
        visual: { known: 'well', body: 'human upper body, fish tail instead of legs', skin: 'scaled skin at the cheeks and arms', features: 'fins at the ears, webbed hands', tags: 'merfolk, mermaid, fish tail', negative: 'legs' } }),
    P({ id: 'fey', group: 'fantasy', name: 'Fey', singular: 'fey', plural: 'fey', adjective: 'fey', kind: 'ancestry', lifespan: 'ageless', culture: 'preset:fey', canMix: true, traits: ['glamour', 'bound by their word'],
        description: ['Beings of the otherworld, beautiful and dangerous, bound by their bargains.', 'Beings of the otherworld hiding in plain sight, still bound by their bargains.'],
        look: ['too beautiful to be human, eyes of an odd colour, something animal about them', 'too beautiful to be human, eyes of an odd colour - unless their glamour is up'],
        here: ['courts in the hollow hills, met at twilight and crossroads', 'behind glamours in clubs and old money; a bargain is still a bargain'],
        visual: { known: 'partly', features: 'otherworldly beauty, unusual eye colour, faintly pointed ears', dress: ['leaves, petals and silk', 'impossibly stylish clothes'], tags: 'fae, ethereal' } }),
    P({ id: 'dragonkin', group: 'fantasy', name: 'Dragon-kin', singular: 'dragon-kin', plural: 'dragon-kin', kind: 'ancestry', lifespan: 'long', canMix: false, traits: ['breathe fire', 'scaled hide'],
        description: ['A proud people descended from dragons, scaled and horned, who walk on two legs.', 'A proud scaled people descended from dragons, and very much at home among the powerful.'],
        look: ['tall and scaled, a dragon\'s head on a man\'s body, a tail', 'tall and scaled, a dragon\'s head; clothes cut for a tail'],
        here: ['proud clans, mercenaries and the guards of kings', 'security firms, old families, the occasional fire inspector\'s nightmare'],
        visual: { known: 'partly', body: 'humanoid with a tail', skin: 'scales', features: 'draconic head, horns, slit-pupil eyes', tags: 'dragonborn, scales, draconic head', negative: 'human face' } }),
    P({ id: 'beastfolk', group: 'fantasy', name: 'Beast-folk', singular: 'beast-folk', plural: 'beast-folk', kind: 'ancestry', lifespan: 'human', canMix: false, traits: ['keen senses'],
        description: ['Peoples with the features of animals - cats, wolves, hares - who walk and talk as people do.', 'Peoples with the features of animals - cats, wolves, hares - living alongside everyone else.'],
        look: ['animal heads, fur and tails on a person\'s body; kinds differ by clan', 'animal heads, fur and tails on a person\'s body; kinds differ by family'],
        here: ['clans and tribes in the wild lands', 'every walk of life; fur-care is a big business'],
        visual: { known: 'partly', body: 'humanoid with a tail', skin: 'fur', features: 'animal head, ears and muzzle', tags: 'anthro, furry', variety: 'the animal differs from one to the next', negative: 'human face' } }),
    P({ id: 'undead', group: 'fantasy', name: 'Undead', singular: 'undead', plural: 'undead', kind: 'changed', lifespan: 'ageless', canMix: false, traits: ['do not breathe', 'do not sleep'],
        description: ['The dead who walk and think still, feared by the living and bound by what raised them.', 'The dead who walk and think still: tolerated, regulated, and never quite trusted.'],
        look: ['grey dead flesh, sunken eyes, cold to the touch', 'grey dead flesh, sunken eyes; heavy makeup and scarves in polite company'],
        here: ['raised by necromancers or by their own will; hunted', 'night work, old archives and a long fight for rights'],
        visual: { known: 'partly', skin: 'grey dead skin', features: 'sunken eyes, gaunt face', tags: 'undead, pale grey skin' } }),
    P({ id: 'vampires', group: 'fantasy', name: 'Vampires', singular: 'vampire', plural: 'vampires', adjective: 'vampiric', kind: 'changed', lifespan: 'ageless', canMix: false, traits: ['feed on blood', 'harmed by sunlight'],
        description: ['The undying who feed on the living, old and courtly and hungry.', 'The undying who feed on the living, hiding in high society and the night economy.'],
        look: ['pale and beautiful, sharp canines, eyes with a red glint', 'pale and beautiful, sharp canines; dark glasses and long coats by day'],
        here: ['rule from castles and old houses; feared by villages', 'old money and night clubs; a quiet blood trade'],
        visual: { known: 'well', skin: 'pale skin', features: 'fangs, red-tinged eyes', dress: ['old-fashioned finery, high collars', 'sharp dark clothes, sunglasses'], tags: 'vampire, pale, fangs' } }),

    // ---- science fiction
    P({ id: 'cyborgs', group: 'scifi', name: 'Cyborgs', singular: 'cyborg', plural: 'cyborgs', adjective: 'augmented', kind: 'changed', lifespan: 'human', canMix: true, traits: ['augmented'],
        description: ['People rebuilt with machines: limbs, eyes and nerves replaced by hardware.', 'People rebuilt with machines: limbs, eyes and nerves replaced by hardware.'],
        look: 'human, with visible chrome limbs, ports and replaced eyes',
        here: 'soldiers, workers and the rich who can afford better than flesh',
        visual: { known: 'well', features: 'cybernetic limbs, glowing optical implants, ports at the temple', tags: 'cyborg, cybernetic implants' } }),
    P({ id: 'androids', group: 'scifi', name: 'Androids', singular: 'android', plural: 'androids', adjective: 'synthetic', kind: 'made', lifespan: 'ageless', canMix: false, traits: ['do not eat or sleep', 'can be repaired'],
        description: ['Made people: machines in human shape, built to work and now asking what they are.', 'Made people: machines in human shape, built to work and now asking what they are.'],
        look: 'near-human, too smooth and too still; seams at the joints, an indicator light at the temple',
        here: 'service work and labour; some free, most owned',
        visual: { known: 'well', skin: 'flawless synthetic skin', features: 'subtle panel seams, glowing indicator at the temple', tags: 'android, synthetic' } }),
    P({ id: 'clones', group: 'scifi', name: 'Clones', singular: 'clone', plural: 'clones', kind: 'made', lifespan: 'short', canMix: true,
        description: ['Grown people, copies of a few templates, made for a purpose and short of years.', 'Grown people, copies of a few templates, made for a purpose and short of years.'],
        look: 'human; many share a face, marked with a serial number or barcode tattoo',
        here: 'soldiers and workers made to order',
        visual: { known: 'partly', features: 'identical faces, barcode tattoo on the neck', tags: 'clone' } }),
    P({ id: 'uplifted', group: 'scifi', name: 'Uplifted Animals', singular: 'uplift', plural: 'uplifts', adjective: 'uplifted', kind: 'species', lifespan: 'human', canMix: false, traits: ['an animal\'s senses'],
        description: ['Animals raised to minds like ours - apes, dolphins, octopuses, dogs - and still finding their place.', 'Animals raised to minds like ours - apes, dolphins, octopuses, dogs - and still finding their place.'],
        look: 'animals of their kind, with gear made for them: speech boxes, harnesses, water-suits',
        here: 'pilots, specialists and second-class citizens',
        visual: { known: 'not', body: 'an animal\'s body', features: 'intelligent eyes, a voice box collar, tech harness', variety: 'which animal differs from one to the next', negative: 'human face' } }),
    P({ id: 'greys', group: 'scifi', name: 'Greys', singular: 'Grey', plural: 'Greys', kind: 'species', lifespan: 'long', canMix: false, traits: ['telepathic'],
        description: ['Small grey aliens with big heads and black eyes, cold and curious.', 'Small grey aliens with big heads and black eyes, cold and curious.'],
        look: 'small and thin, grey skin, a huge head and large black almond eyes',
        here: 'watchers and traders, rarely trusted',
        visual: { known: 'well', body: 'small and thin', skin: 'smooth grey skin', features: 'large head, huge black almond eyes, no ears', tags: 'grey alien', negative: 'hair' } }),
    P({ id: 'insectoids', group: 'scifi', name: 'Insectoid Hive', singular: 'insectoid', plural: 'insectoids', kind: 'species', lifespan: 'short', canMix: false, traits: ['hive mind', 'hard shell'],
        description: ['A hive people of chitin and clicking mandibles who think as many and act as one.', 'A hive people of chitin and clicking mandibles who think as many and act as one.'],
        look: 'tall and many-limbed, a hard shell, compound eyes and mandibles',
        here: 'hive ships and colonies; traders through translators',
        visual: { known: 'not', body: 'four-armed, insect-like, upright', skin: 'glossy chitin shell', features: 'compound eyes, mandibles, antennae', negative: 'human face, hair' } }),
    P({ id: 'reptilians', group: 'scifi', name: 'Reptilians', singular: 'reptilian', plural: 'reptilians', kind: 'species', lifespan: 'long', canMix: false, traits: ['cold-blooded'],
        description: ['A scaled, cold-blooded people from a hot world, patient and formal.', 'A scaled, cold-blooded people from a hot world, patient and formal.'],
        look: 'tall, scaled, lizard-headed, a heavy tail',
        here: 'diplomats, soldiers and merchants of an old empire',
        visual: { known: 'partly', body: 'humanoid with a tail', skin: 'green-brown scales', features: 'lizard head, slit pupils', tags: 'reptilian alien, lizard person', negative: 'human face, hair' } }),
    P({ id: 'energy', group: 'scifi', name: 'Energy Beings', singular: 'energy being', plural: 'energy beings', kind: 'species', lifespan: 'ageless', canMix: false, traits: ['no body'],
        description: ['Beings of light and field with no body of their own, who take a shape to talk with others.', 'Beings of light and field with no body of their own, who take a shape to talk with others.'],
        look: 'a moving shape of light, roughly human when it wants to be understood',
        here: 'rare and strange; some ride in machines or hosts',
        visual: { known: 'not', body: 'no fixed shape, a figure of light', skin: 'translucent glowing energy', features: 'crackling light, no face', negative: 'skin, clothes' } }),
    P({ id: 'spacers', group: 'scifi', name: 'Gene-adapted Spacers', singular: 'spacer', plural: 'spacers', kind: 'changed', lifespan: 'human', canMix: true, traits: ['at home in low gravity'],
        description: ['Humans bred for space: long-limbed and frail in low gravity, or squat and strong for heavy worlds.', 'Humans bred for space: long-limbed and frail in low gravity, or squat and strong for heavy worlds.'],
        look: 'very tall and thin, long fingers, pale; uneasy in full gravity',
        here: 'ship crews and station-born; looked down on by planet-born',
        visual: { known: 'not', body: 'very tall and thin, elongated limbs', skin: 'pale skin', features: 'long fingers, large eyes', dress: 'flight suit' } }),

    // ---- modern and urban fantasy
    P({ id: 'werewolves', group: 'modern', name: 'Werewolves', singular: 'werewolf', plural: 'werewolves', kind: 'changed', lifespan: 'human', canMix: false, traits: ['change at the full moon', 'heal fast'],
        description: ['People who become wolves, in packs that keep the secret.', 'People who become wolves, in packs that keep the secret.'],
        look: ['rough, restless people; in the change, a great wolf or a wolf-headed man', 'rough, restless people; in the change, a great wolf or a wolf-headed man'],
        here: ['packs in the forests and the edges of towns', 'packs that run bars, garages and the edges of the city'],
        visual: { known: 'well', features: 'wild hair, yellow eyes', tags: 'werewolf' } }),
    P({ id: 'witches', group: 'modern', name: 'Witches', singular: 'witch', plural: 'witches', kind: 'ancestry', lifespan: 'human', canMix: true, traits: ['born to magic'],
        description: ['Families born to magic, keeping it in the bloodline and away from everyone else.', 'Families born to magic, keeping it in the bloodline and away from everyone else.'],
        look: 'human; a charm, a tattoo or a herb-smell gives them away to those who know',
        here: ['covens in villages and old houses', 'covens in old houses, occult shops and the odd boardroom'],
        visual: { known: 'well', features: 'charms and pendants', tags: 'witch' } }),
    P({ id: 'fae_hidden', group: 'modern', name: 'Fae in Hiding', singular: 'fae', plural: 'fae', adjective: 'fae', kind: 'ancestry', lifespan: 'ageless', culture: 'preset:fey', canMix: true, traits: ['glamour', 'harmed by iron'],
        description: ['The fair folk, living among humans behind glamours and keeping their old rules.', 'The fair folk, living among humans behind glamours and keeping their old rules.'],
        look: 'beautiful and slightly wrong; the glamour slips in mirrors and photographs',
        here: 'among humans unseen; iron and broken promises are their danger',
        visual: { known: 'partly', features: 'otherworldly beauty, eyes of an odd colour, faintly pointed ears', tags: 'fae, ethereal' } }),
    P({ id: 'ghosts', group: 'modern', name: 'Ghosts', singular: 'ghost', plural: 'ghosts', kind: 'changed', lifespan: 'ageless', canMix: false, traits: ['no body', 'bound to a place'],
        description: ['The dead who stayed, bound to a place or a person, seen by few.', 'The dead who stayed, bound to a place or a person, seen by few.'],
        look: 'as they were in life, pale and see-through, in the clothes they died in',
        here: 'haunting the places they cannot leave',
        visual: { known: 'well', skin: 'pale translucent', features: 'see-through, faint glow', tags: 'ghost, translucent' } }),
]);

export const presetById = (id) => BLOODLINE_PRESETS.find((p) => p.id === id) ?? null;

// The text for this age: [earlier, later] or one text.
const forAge = (v, later) => (Array.isArray(v) ? v[later ? 1 : 0] ?? v[0] : v ?? '');

// A preset as a new bloodline for this world: { name, description,
// bloodline }. overview: the setting's (its age picks the texts).
export function fromPreset(id, overview = {}) {
    const p = presetById(id);
    if (!p) return null;
    const later = isLaterAge(overview);
    const v = p.visual ?? {};
    return {
        name: p.name,
        description: forAge(p.description, later),
        bloodline: normalizeBloodline({
            ...emptyBloodline(),
            on: true, kind: p.kind, singular: p.singular, plural: p.plural, adjective: p.adjective ?? '',
            look: forAge(p.look, later), here: forAge(p.here, later),
            lifespan: p.lifespan ?? '', traits: [...(p.traits ?? [])], culture: p.culture ?? '', naming: p.culture ? 'own' : '',
            playable: true, canMix: p.canMix === true, preset: p.id,
            visual: { known: v.known ?? '', body: v.body ?? '', skin: v.skin ?? '', features: v.features ?? '', dress: forAge(v.dress, later), tags: v.tags ?? '', negative: v.negative ?? '', variety: v.variety ?? '' },
        }),
    };
}

// The presets in the order to offer them: the world's own group first.
export function presetGroups(worldType) {
    const first = { science_fiction: 'scifi', modern: 'modern', urban_fantasy: 'modern', cosmic_horror: 'modern', post_apocalyptic: 'scifi' }[worldType] ?? 'fantasy';
    return [...PRESET_GROUPS].sort(([a], [b]) => (b === first) - (a === first)).map(([key, label]) => ({ key, label, presets: BLOODLINE_PRESETS.filter((p) => p.group === key) }));
}
