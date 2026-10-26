// Kits: descriptive names in plain English - the Whispering Woods, the
// Drowned Rat, the Widow's Revenge (docs/DESIGN - NAMING.md, section 3.4b).
//
// A pool word may carry tags after a slash, which change its weight:
//   g grim (more in a dark world, less in a cozy one), j jolly (the other
//   way), s the sea (more by the coast), c an overused word (much less).
// A pattern's pieces: {adj}, {beast}, {thing}, {head} (the kind of feature:
// Woods, Fen), {owner} ("Hangman's"), {num}, {colour}, {virtue}, {hero},
// {given}, {givenF}, {family}, {place} (names from the thing's culture).

const pool = (text) => text.trim().split(/\s*,\s*/).filter(Boolean);

const ADJ_WILD = pool(`Whispering/c, Weeping, Craggy, Hanging, Howling, Sighing, Murmuring, Sleeping, Drowned, Broken, Shattered,
Hollow, Tangled, Thorny, Bramble, Misty, Foggy, Mossy, Rotting/g, Silver, Golden, Copper, Iron, Rusty, Black, Grey, White, Red,
Green, Blue, Amber, Bitter, Sweet, Salt/s, Cold, Frozen, Burning, Ashen/c, Shadow/c, Crimson/c, Starfall, Moonlit, Sunken,
Lonely, Forgotten/c, Lost, Snake, Snakey, Adder, Wolf, Bear, Raven, Crow, Owl, Hart, Boar, Fox, Badger, Eel, Toad, Heron, Gull/s,
Goat, Elk, Troll, Goblin, Ogre, Crooked, Twisted, Wandering, Restless, Laughing/j, Singing/j, Grumbling, Screaming/g, Silent,
Quiet, Gentle/j, Merry/j, Grim/g, Gloomy/g, Dreary/g, Bleak/g, Wild, Tall, Long, Deep, High, Low, Far, Seven, Twin, Three, Nine,
Hundred, Last, First, Blind, Mad, Sour, Rattling, Creaking, Bleeding/g, Hungry, Thirsty, Barren, Dead/g, Gallows/g, Witchfire,
Bonewhite/g, Cinder, Slate, Flint, Chalk, Peat, Bog, Reed, Willow, Alder, Hazel, Rowan, Yew, Elder, Thistle, Nettle, Foxglove,
Hemlock/g, Bracken, Heather, Gorse, Juniper, Birch, Larch, Briar, Mire, Gloaming, Dusky, Pale, Wan, Fey, Elfin, Giant, Dragon/c,
Wyrm, Stormy, Windy, Rainy, Sunny/j, Bright, Shining, Glimmering, Dappled, Speckled, Stony, Rocky, Muddy, Sandy, Briny/s,
Kelp/s, Driftwood/s, Wreckers/s, Smugglers/s, Pilgrim, Hermit, Abbot, Friar, Beggar, Tinker`);

const OWNERS = pool(`Dead Man's/g, Old Man's, Widow's, Hangman's/g, Giant's, Devil's/g, Witch's, King's, Queen's, Bishop's,
Shepherd's, Miller's, Fiddler's/j, Piper's/j, Tinker's, Beggar's, Hermit's, Drowner's/g, Smuggler's/s, Wrecker's/s, Maiden's,
Lovers'/j, Thieves', Fool's/j, Saint's, Abbot's, Butcher's/g, Weaver's, Cobbler's, Brewer's/j, Mother's, Gravedigger's/g,
Hunter's, Huntsman's, Charcoal Burner's, Wolf's, Bear's, Raven's, Fox's, Goat's, Crow's, Snake's`);

const HEADS = {
    forest: pool('Woods, Wood, Forest, Weald, Thicket, Wilds, Holt, Grove, Copse, Tangle, Greenwood, Shaw'),
    mountain: pool('Mountains, Mounts, Peaks, Crags, Fells, Teeth, Spires, Pikes, Heights, Tors, Range'),
    hills: pool('Hills, Downs, Tors, Knolls, Barrows, Rise, Fells, Brae, Ridge'),
    river: pool('River, Water, Run, Creek, Brook, Stream, Beck, Burn, Rill, Flow'),
    lake: pool('Lake, Mere, Tarn, Pool, Water, Loch, Lough, Pond'),
    marsh: pool('Fen, Marsh, Mire, Bog, Moss, Sloughs, Wetlands, Levels, Carr, Quag'),
    coast: pool('Coast, Shore, Strand, Cliffs, Sands, Point, Bay, Cove, Head, Reach, Shallows, Rocks'),
    cave: pool('Caves, Caverns, Hollows, Deeps, Grotto, Delvings, Pits, Holes, Warrens'),
    plain: pool('Plains, Vale, Valley, Wastes, Barrens, Flats, Hollow, Moor, Heath, Steppe, Downs, Fields'),
    island: pool('Isle, Island, Rock, Holm, Skerry, Isles, Key'),
    desert: pool('Wastes, Sands, Dunes, Barrens, Flats, Expanse, Erg, Pan'),
    site: pool('Barrow, Tomb, Crypt, Vault, Ruins, Halls, Cairn, Henge, Stones, Mound, Pit, Catacombs, Sepulchre, Undercroft'),
};

const BEASTS = pool(`Stag, Hart, Boar, Bear, Lion, Unicorn, Griffin, Dragon/c, Wyvern, Swan, Goose, Cock, Hen, Owl, Raven, Crow,
Magpie, Pig, Piglet/j, Ox, Bull, Cow, Ram, Goat, Lamb, Horse, Mare, Pony, Hound, Dog, Fox, Badger, Hare, Rabbit, Cat, Rat, Weasel,
Otter, Eel/s, Pike, Trout, Salmon/s, Cod/s, Herring/s, Mermaid/s, Kraken/s, Gull/s, Pelican/s, Heron, Pheasant, Peacock, Falcon,
Eagle, Wolf, Toad, Frog, Mule, Donkey, Hedgehog, Squirrel, Beetle, Bee, Wasp, Spider/g, Lobster/s, Crab/s, Oyster/s, Seal/s,
Ferret, Mole, Stoat, Wren, Robin, Lark, Nightingale, Bat/g, Vulture/g, Maggot/g, Worm/g, Leech/g`);

const THINGS = pool(`Anchor/s, Lantern, Crown, Mitre, Barrel, Tankard, Flagon, Kettle, Cauldron, Plough, Wheel, Harp, Bell, Key,
Rose, Thistle, Oak, Acorn, Wheatsheaf, Anvil, Hammer, Sword, Shield, Helm, Gauntlet, Bow, Arrow, Axe, Ship/s, Oar/s, Compass/s,
Hook/s, Net/s, Candle, Lamp, Star, Moon, Sun, Comet, Feather, Quill, Book, Coin, Purse, Boot, Hat, Cloak, Bucket, Ladder, Gate,
Bridge, Mill, Well, Hearth, Fiddle/j, Drum, Dice, Tooth, Bone/g, Skull/g, Head, Hand, Heart, Eye, Gallows/g, Noose/g, Pipe, Pot,
Spoon, Ladle, Cheese/j, Loaf, Pie/j, Ham, Apple, Grape, Vine, Thorn, Bramble, Chequers, Shovel, Hourglass, Spindle, Thimble,
Saddle, Spur, Horseshoe, Cartwheel, Lodestone, Sextant/s, Bottle, Cork, Crab Pot/s, Gibbet/g, Stocks/g, Coffin/g, Cleaver/g`);

const ADJ_INN = pool(`Drowned, Drunken/j, Jolly/j, Merry/j, Laughing/j, Sleeping, Crooked, Golden, Silver, Red, Black, White,
Green, Blue, Gilded, Rusty, Broken, Lucky, Wandering, Dancing/j, Fighting, Thirsty, Hungry, Fat/j, Lame, Blind, Bald, Bearded,
One-Eyed, Three-Legged, Singing/j, Howling, Grinning, Tipsy/j, Wise, Honest, Saucy/j, Wicked, Royal, Old, Hanged/g, Speckled,
Spotted, Painted, Leaping, Rampant, Sleepy/j, Contented/j, Rising, Sunken, Weary, Bold, Stout, Brazen, Cheerful/j, Dismal/g,
Bloody/g, Headless/g, Gutted/g, Flayed/g, Mangy, Soggy/j, Salty/s, Tarred/s, Shipwrecked/s, Barnacled/s, Pickled/j, Rotten/g,
Toothless, Moulting, Wooden, Brass, Copper, Pewter, Tin, Velvet, Wet, Dry, Smoking, Burnt, Frozen, Woeful/g, Thrice-Hanged/g`);

const COLOURS = pool('Black, Grey, White, Red, Green, Blue, Gold, Silver, Iron, Bronze, Brass, Ash, Bone, Scarlet, Crimson/c, Azure, Amber, Copper, Jade, Rust, Pale');
const NUMBERS = pool('Two, Three, Four, Five, Seven, Nine, Twelve, Hundred, Thousand');
const ORDINALS = pool('First, Second, Third, Fourth, Fifth, Sixth, Seventh, Eighth, Ninth, Tenth, Eleventh, Twelfth, Thirteenth');

const PIRATE_ADJ = pool(`Black, Bloody/g, Grinning, Wicked, Savage, Cruel, Laughing, Drunken, Mad, Screaming/g, Howling, Hungry,
Jolly, Salty, Rotten, Restless, Cursed, Damned/g, Scarlet, Crimson/c, Red, Grey, Ragged, Wretched, Merciless/g, Gilded, Stolen,
Vicious, Rusty, Bilious, Toothsome, Jaunty, Wanton, Sly, Faithless, Hellbound/g`);
const PIRATE_NOUNS = pool(`Widow, Gull, Shark, Serpent, Kraken, Revenge, Vengeance, Fortune, Wench, Maiden, Bride, Harlot, Jest,
Dog, Hound, Wolf, Rat, Cutlass, Skull, Bones, Gallows, Raven, Crow, Viper, Barracuda, Corsair, Rover, Rogue, Devil, Spectre, Hag,
Siren, Tempest, Storm, Squall, Reaver, Gambit, Wager, Debt, Grin, Fang, Talon, Plunder, Doubloon, Mistress, Lass, Orphan`);
const NAVAL = pool(`Indomitable, Resolute, Valiant, Intrepid, Defiance, Vigilant, Dauntless, Invincible, Implacable, Formidable,
Victory, Triumph, Glory, Majesty, Sovereign, Thunderer, Vanguard, Steadfast, Relentless, Unyielding, Tenacious, Audacious,
Courageous, Warden, Sentinel, Bulwark, Rampart, Retribution, Justice, Fury, Wrath, Tempest, Endeavour, Discovery, Enterprise,
Venture, Constant, Loyal, Gallant, Swiftsure, Revenge, Repulse, Conqueror, Superb, Illustrious, Glorious, Monarch`);
const HEROES = pool('Achilles, Ajax, Hector, Orion, Hercules, Minotaur, Leviathan, Colossus, Titan, Perseus, Agamemnon, Bellerophon, Neptune, Mars, Vulcan, Jupiter, Hyperion, Atlas, Prometheus');
const SHIP_BEASTS = pool('Lion, Tiger, Bulldog, Eagle, Falcon, Hawk, Osprey, Kestrel, Greyhound, Wolfhound, Stag, Bear, Boar, Serpent, Dolphin, Swordfish, Orca');
const VIRTUES_MERCHANT = pool('Hope, Fortune, Venture, Intent, Providence, Promise, Tidings, Return, Harvest, Bounty, Profit, Faith, Grace, Endeavour, Prospect');
const CARGO = pool('Herring, Grain, Wool, Spice, Salt, Wine, Amber, Timber, Cod, Silk, Pepper, Tea, Coal, Copper, Linen');

const COMPANY_NOUNS = pool(`Company, Band, Host, Lances, Blades, Swords, Shields, Spears, Bows, Free Company, Brotherhood, Legion,
Riders, Hand, Fist, Banners, Pikes, Wolves, Hounds, Ravens, Crows, Lanterns, Ghosts, Sons, Daughters, Jackals, Vultures/g,
Butchers/g, Reapers/g, Mourners/g, Hammers, Anvils, Torches, Cloaks, Hoods, Masks, Knives, Ropes, Bells, Keys, Coins`);
const GANG_NOUNS = pool('Boys, Rats, Knives, Cats, Dogs, Crows, Sparrows, Gutters, Hooks, Razors, Bricks, Lanterns, Mudlarks, Rooks, Moths, Ferrets, Ghosts, Saints, Sinners, Hands');
const GANG_ADJ = pool('Black, Red, Grey, Dock/s, Gutter, Alley, Canal, Bridge, Market, Chimney, Sewer, Rag, Bone/g, Brass, Tin, Lead, Rusty, Stinking, Grinning, Laughing, Silent, Quick, Mad, Lucky, Sorry, Ragged');
const ORDER_HEADS = pool('Order, Brotherhood, Sisterhood, Circle, Covenant, Compact, League, Society, Fellowship, Oath, Hand, Eye, Lantern, Veil, Council, Conclave, Synod, Congregation, Guild, Lodge, Assembly, Chapter, Keepers, Wardens, Watchers, Children, Disciples, Sworn');
const ORDER_NOUNS = pool(`Ashes/c, Thorn, Iron, Salt, Lantern, Bell, Key, Coin, Quill, Ledger, Candle, Chain, Gate, Well, Stone, Oak,
Crow, Moth, Wolf, Hound, Serpent, Hand, Eye, Tongue, Bone, Rose, Lily, Star, Moon, Dawn, Dusk, Tide, Ember/c, Veil, Mirror,
Scale, Compass, Anvil, Lamp, Scroll, Seal, Thread, Needle, Spindle, Loom, Sickle, Plough, Cup, Chalice, Ring, Crown, Feather,
Owl, Raven, Stag, Bee, Hive, Ash Tree, Yew, Silence, Hour, Spiral, Knot, Wheel, Nail, Last Light, Open Door, Broken Wheel, Ninth Hour`);
const CALL_WORDS = pool(`Nightjar, Kestrel, Merlin, Shrike, Wren, Heron, Osprey, Harrier, Swift, Rook, Jackdaw, Magpie, Lark, Plover,
Curlew, Bittern, Goshawk, Kite, Petrel, Tern, Cobalt, Flint, Onyx, Garnet, Basalt, Quartz, Jasper, Mica, Pyrite, Cinnabar, Tungsten,
Bismuth, Argent, Slate, Squall, Sleet, Drift, Gale, Thistle, Bramble, Larch, Hemlock, Sorrel, Juniper, Lantern, Anvil, Compass, Needle,
Bellows, Chisel, Keystone, Lockpick, Tinderbox, Sextant, Ferret, Stoat, Badger, Lynx, Marten, Jackal, Mongoose, Viper, Adder, Pike,
Barracuda, Ghost/c, Wraith, Echo, Cipher, Sphinx, Magpie, Moth, Hornet, Mantis, Cricket, Gannet, Cormorant, Albatross, Pelican, Ibis,
Coyote, Wolverine, Jaguar, Ocelot, Caracal, Saluki, Lurcher, Mastiff, Gambit, Ledger, Tally, Bishop, Rook, Pawn, Jester, Tinker, Tailor,
Sexton, Verger, Ferryman, Lamplighter, Chimney, Gutter, Steeple, Vesper/c, Matins, Compline, Solstice, Equinox, Meridian, Zenith, Nadir`);
const CALL_NUMBERS = pool('One, Two, Three, Four, Five, Six, Seven, Eight, Nine, Actual, Lead, Prime, Zero');
const TRADES = pool('Smithy, Forge, Bakery, Apothecary, Emporium, Workshop, Tailors, Cobblers, Chandlery, Mercantile, Provisions, Curios, Pawnshop, Bindery, Cartographers, Tannery, Cooperage, Brewery, Herbalist, Bookshop');

// Businesses: a corporation's words in a later age, a merchant house's in
// an earlier one. Brand words are real words (Lodestar, Meridian), never
// coined ones - coined tech words are the model's clichés (the overused
// ones are kept, at a low weight, so a world can still have one).
const CORP_SUFFIXES = pool(`Industries, Holdings, Group, Corporation, Incorporated, Dynamics, Systems, Technologies, Heavy Industries,
Consolidated, Partners, Capital, Labs, Works, International, Enterprises, Combine, Conglomerate, Global, Solutions/c`);
const SECTORS = pool(`Biologics, Pharmaceuticals, Logistics, Orbital, Robotics, Cybernetics, Aerospace, Security, Media, Energy, Mining,
Freight, Neural Systems, Arms, Data, Analytics, Materials, Chemical, Medical, Finance, Insurance, Shipping, Construction, Telecom,
Water, Hydroponics, Genetics, Optics, Microsystems, Defence, Biotech, Fusion, Semiconductors, Agrisciences, Prosthetics, Armaments,
Infrastructure, Transit, Entertainment, Foods, Textiles, Petrochemicals, Bioengineering, Exploration`);
const BRANDS = pool(`Meridian, Halcyon, Lodestar, Bellwether, Keystone, Wayfarer, Kestrel, Juniper, Saltire, Corvid, Obelisk,
Vantage, Paragon, Sterling, Northgate, Greywater, Ironbridge, Blackwell, Cardinal, Covenant, Fathom, Gallant, Harrow, Lattice,
Monolith, Palisade, Quarry, Rampart, Sextant, Tessera, Umbra, Vanguard, Waypoint, Zenith, Ascendant, Bastion, Caldera, Driftwood,
Equinox, Foundry, Granite, Helix, Inkwell, Jetstream, Kingfisher, Longview, Mosaic, Orchard, Pinnacle, Redline, Silverline,
Tidewater, Union, Veridian, Wolfram, Atlas, Beacon, Carrion, Dominion, Ember/c, Firebrand, Gauntlet, Horizon, Lantern, Mantle,
Nexus/c, Quantum/c, Apex/c, Omni/c, Synth/c, Neo/c, Cyber/c, Aegis/c, Titan/c, Vertex/c`);
const GROUP_WORDS = pool('Group, Consortium, Combine, Trust, Syndicate, Collective, Holdings, Concern');
const GREEK = pool('Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Eta, Theta, Iota, Kappa, Lambda, Sigma, Tau, Upsilon, Phi, Chi, Psi, Omega');
const TRADE_HOUSES = pool('Trading Company, Merchant Company, Trading House, Mercantile, Exchange, Shipping Company, Bank, Counting House, Chartered Company, Company of Merchants, Carrying Company, Caravan Company');

// Bases, districts, venues, streets. Tags: m - a later age only (a
// sector, an arcology), o - an earlier one only (an undercroft, a belfry).
const LAIRS = pool(`Kennel, Cistern, Undercroft/o, Sump, Warren, Rookery, Nest, Burrow, Den, Cellar, Vault, Hollow, Pit, Boiler Room/m,
Old Mill/o, Pumphouse, Drain, Ossuary/o, Belfry/o, Loft, Signal Box/m, Coal Store/o, Ice House/o, Foundry, Bathhouse, Water Tower,
Sub-Basement/m, Annex/m, Substation/m, Server Farm/m, Cold Store/m, Morgue, Chapel, Kiln/o, Lighthouse, Observatory, Aviary, Cannery, Tannery/o`);
const DISTRICT_WORDS = pool(`Ward, Quarter, District, Heights, Flats, Docks/s, Row, End, Hill, Gate, Market, Commons, Yards, Sector/m, Block/m,
Stacks/m, Arcology/m, Strip/m, Terrace, Narrows, Bottoms, Reach, Side, Town, Shambles/o, Liberty/o`);
const DISTRICT_NOUNS = pool(`Shambles/o, Narrows, Rookery, Warrens, Stacks/m, Sprawl/m, Gutters, Pits, Tangle, Maze, Sinks, Bottoms, Hive/m,
Ditch, Steeps, Spires, Undercity/m, Mire, Rag Fair/o, Sumps, Kennels, Grid/m, Cages/m, Scrapyard/m, Tanneries/o, Tenements`);
const STREET_WORDS = pool('Street, Avenue, Road, Lane, Row, Alley, Way, Walk, Square, Close, Court, Terrace, Boulevard/m, Plaza/m, Hill, Gate, Steps, Passage');
const SECRET_SITES = pool('Site, Station, Facility, Outpost, Annex, Depot, Room, Camp, Point, Building');

export const KITS = Object.freeze({
    base_secret: {
        label: 'Secret bases and hideouts',
        patterns: [['Site {callWord}', 3], ['{callWord} {secretSite}', 2], ['The {callWord} Room', 1], ['Facility {initials}-{digit}', 1], ['Building {num2}', 1], ['The {lair}', 3], ['Station {greek}', 1]],
    },
    hideout: {
        label: 'Hideouts and lairs (an earlier age)',
        patterns: [['The {lair}', 4], ['The {adjInn} {lair}', 2], ["The {beast}'s {lair}", 2], ['The {owner} {lair}', 1]],
    },
    base_open: {
        label: 'Bases, offices and headquarters',
        patterns: [['{brand} Tower', 2], ['{place} Command', 1], ['Fort {family}', 2], ['Camp {family}', 1], ['The {callWord} Facility', 1], ['{brand} House', 1], ['The {adjInn} {lair}', 1]],
    },
    district: {
        label: 'Districts and neighbourhoods',
        patterns: [['{place} {districtWord}', 4], ['The {districtNoun}', 3], ['{brand} {districtWord}', 2], ['The {ordinal} Ward', 1], ['Little {place}', 1], ['{adj} {districtWord}', 2], ['{owner} {districtWord}', 1]],
    },
    venue: {
        label: 'Clubs, clinics, hotels and the like',
        patterns: [['{brand} {venue}', 3], ['The {brand} {venue}', 1], ["{family}'s {venue}", 2], ['The {adjInn} {beast}', 2], ['{place} {venue}', 1]],
    },
    institution: {
        label: 'Hospitals, clinics, schools and offices',
        patterns: [['{brand} {venue}', 3], ['{family} {venue}', 2], ['{place} {venue}', 2], ["Saint {given}'s {venue}", 1], ['The {brand} {venue}', 1]],
    },
    street: {
        label: 'Streets and squares',
        patterns: [['{family} {streetWord}', 3], ['{brand} {streetWord}', 1], ['{place} {streetWord}', 2], ['{thing} {streetWord}', 2], ['{owner} {streetWord}', 1], ['{adj} {streetWord}', 1]],
    },
    business_modern: {
        label: 'Corporations',
        patterns: [
            ['{family} {corpSuffix}', 4], ['{family} {sector}', 3], ['{family} & {family}', 1], ['{brand} {sector}', 4],
            ['{brand} {corpSuffix}', 2], ['{initials} {corpSuffix}', 1], ['{place} {sector} {groupWord}', 1], ['{greek} {sector}', 0.5],
        ],
    },
    business_trade: {
        label: 'Merchant houses and trading companies',
        patterns: [
            ['{family} & Sons', 3], ['{family} & {family}', 3], ['The {place} {tradeHouse}', 3], ['House {family}', 2],
            ['{family} Brothers', 1], ["{family}, {family} and Company", 1], ['The {adj} {thing} Company', 1], ['{family} {tradeHouse}', 2],
        ],
    },
    codename: {
        label: 'Codenames and callsigns',
        patterns: [['{callWord}', 6], ['{callWord} {callNumber}', 3], ['{colour} {callWord}', 2], ['{callWord}-{callNumber}', 1]],
    },
    wilderness: {
        label: 'Wilderness features',
        patterns: [
            ['The {adj} {head}', 6], ['{adj} {head}', 3], ['The {owner} {head}', 2], ['{owner} {head}', 1],
            ['{beast} {head}', 1], ['{place} {head}', 2],
        ],
    },
    inn: {
        label: 'Inns and taverns',
        patterns: [
            ['The {adj} {beast}', 6], ['The {beast} and {thing}', 3], ['The {beast} and {beast}', 2], ['The {adj} {thing}', 3],
            ['The {thing}', 0.4], ['The {num} {thingP}', 2], ['The {beast} in the {thing}', 1], ["The {beast}'s {part}", 2],
            ['The {place} Arms', 1], ["{given}'s Rest", 1], ['The {thing} and {thing}', 1],
        ],
    },
    shop: {
        label: 'Shops and workshops',
        patterns: [["{family}'s {trade}", 4], ['{family} & Sons', 1], ['The {adj} {thing}', 3], ["{given}'s {trade}", 2], ['{place} {trade}', 1]],
    },
    ship_pirate: {
        label: 'Pirate ships',
        patterns: [['{pirateAdj} {pirateNoun}', 6], ["{givenF}'s Revenge", 1], ["{owner} {pirateNoun}", 2], ['{colour} {pirateNoun}', 2], ['{pirateNoun}', 1]],
    },
    ship_naval: {
        label: 'Naval ships',
        patterns: [['{virtue}', 6], ['{hero}', 2], ['{shipBeast}', 2], ['{place}', 2], ['{family}', 1]],
    },
    ship_merchant: {
        label: 'Merchant ships',
        patterns: [['Fair {givenF}', 2], ['Sweet {givenF}', 1], ['Good {merchantVirtue}', 3], ['{givenF} of {place}', 2], ['{place} {merchantNoun}', 2], ['{adj} {cargo}', 2], ['{givenF}', 1]],
    },
    company: {
        label: 'Companies and crews',
        patterns: [['The {colour} {companyNoun}', 5], ['The {ordinal} {companyNoun}', 3], ['The {num} {companyNoun}', 1], ["{given}'s {companyNoun}", 2], ['The {companyNoun} of {place}', 2]],
    },
    gang: {
        label: 'Gangs',
        patterns: [['The {gangAdj} {gangNoun}', 6], ['The {place} {gangNoun}', 2], ["{given}'s {gangNoun}", 1]],
    },
    order: {
        label: 'Orders, guilds and cults',
        patterns: [['The {orderHead} of the {orderNoun}', 5], ['The {orderNoun} {orderHead}', 2], ['The {orderHead} of {place}', 2], ['The {colour} {orderHead}', 2]],
    },
});

export const POOLS = Object.freeze({
    adj: ADJ_WILD, adjInn: ADJ_INN, owner: OWNERS, beast: BEASTS, thing: THINGS, colour: COLOURS, num: NUMBERS, ordinal: ORDINALS,
    pirateAdj: PIRATE_ADJ, pirateNoun: PIRATE_NOUNS, virtue: NAVAL, hero: HEROES, shipBeast: SHIP_BEASTS,
    merchantVirtue: VIRTUES_MERCHANT, cargo: CARGO, merchantNoun: pool('Trader, Lass, Belle, Merchant, Packet, Pride, Venture, Star, Rose'),
    companyNoun: COMPANY_NOUNS, gangNoun: GANG_NOUNS, gangAdj: GANG_ADJ, orderHead: ORDER_HEADS, orderNoun: ORDER_NOUNS, trade: TRADES,
    callWord: CALL_WORDS, callNumber: CALL_NUMBERS,
    lair: LAIRS, districtWord: DISTRICT_WORDS, districtNoun: DISTRICT_NOUNS, streetWord: STREET_WORDS, secretSite: SECRET_SITES,
    corpSuffix: CORP_SUFFIXES, sector: SECTORS, brand: BRANDS, groupWord: GROUP_WORDS, greek: GREEK, tradeHouse: TRADE_HOUSES,
    part: pool('Whisker, Beard, Tail, Ear, Nose, Paw, Hoof, Horn, Tooth, Eye, Head, Knees/j, Bollocks/j, Breakfast/j, Supper, Wedding/j, Funeral/g, Revenge, Folly, Rest, Delight/j, Lament/g'),
});

export const HEAD_KINDS = Object.freeze(Object.keys(HEADS));
export const headsFor = (feature) => HEADS[feature] ?? HEADS.forest;

const parseWord = (raw) => {
    const [word, tags = ''] = raw.split('/');
    return { word, tags };
};

// A pool word's weight for the mood and the place: { grim, jolly, sea,
// later (a modern or later world) }.
export function wordWeight(raw, mood = {}) {
    const { tags } = parseWord(raw);
    let w = 1;
    if (tags.includes('c')) w *= 0.15;
    if (tags.includes('g')) w *= mood.grim ? 3 : mood.jolly ? 0.25 : 1;
    if (tags.includes('j')) w *= mood.jolly ? 3 : mood.grim ? 0.25 : 1;
    if (tags.includes('s')) w *= mood.sea ? 4 : 0.6;
    // A later age's words, an earlier age's: kept to their own worlds.
    if (tags.includes('m')) w *= mood.later ? 1.5 : 0.02;
    if (tags.includes('o')) w *= mood.later ? 0.2 : 1.5;
    return w;
}

export const wordOf = (raw) => parseWord(raw).word;

// Tones that darken or lighten a world (src/library/world-options.js TONES).
const GRIM = ['dark', 'gritty', 'bleak', 'brutal', 'noir', 'tense', 'melancholy', 'serious'];
const JOLLY = ['whimsical', 'comedic', 'cozy', 'hopeful', 'romantic', 'heroic'];
export function moodOf(tone = '', text = '') {
    const t = String(tone).toLowerCase();
    const grim = GRIM.filter((x) => t.includes(x)).length;
    const jolly = JOLLY.filter((x) => t.includes(x)).length;
    return { grim: grim > jolly, jolly: jolly > grim, sea: /\b(port|harbou?r|dock|docks|wharf|quay|coast|coastal|sea|seaside|shore|bay|island|pier|fishing|sailors?|pirates?|ships?)\b/i.test(text) };
}
