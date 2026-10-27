# Design - Bloodlines

A world says who lives in it. Elves, dwarves and orcs in a fantasy realm;
androids, uplifted octopuses and Greys in a space opera; and, the hard
case, elves in a cyberpunk megacity, where the model's picture of an elf
(a bow, a forest, a silver circlet) is the wrong one. Today Scenario
Builder has no idea of a bloodline. The model guesses from the premise, puts
elves everywhere or nowhere, and dresses them for the wrong age.

This design gives a world its **bloodlines**: who they are, how they look and
live *in this world*, how common they are where, and whose names they
carry. They come from presets, from the premise, from the user's own
invention, or from the story itself, like everything else.

Status: phases 1 and 2 built (2026-10-27) - see "Phase 1 as built" and
"Phase 2 as built" at the end. Phases 3-4 not yet. Called "Peoples" in the first draft; renamed so it is
not confused with characters and suits the book's theming.

## 1. What a bloodline is

A **bloodline** is any kind of being that a character can *be*: an ancestry
(elf, dwarf, half-orc), a species (Vulcan, Grey, uplifted octopus), a made
kind (android, clone, golem), a changed kind (vampire, cyborg, ghoul), or
plain humans. "Race", "species", "ancestry", "kind" are the user's word for
it. The UI says "Bloodlines".

It is not a **creature**. A creature (`library/creature-form.js`) is
something met in a fight or the wild: a wolf, Ashmaw the dragon, "3
zombies". A bloodline is someone's identity. Where the two meet (a troll
bouncer *and* trolls under the bridge), they are separate entries, and the
bloodline can name the creature kind it is related to.

It is not a **faction** either. "The Sunborn" can be an elven *bloodline*,
while "House Sunborn" is a *faction* of mostly Sunborn elves.

## 2. Bloodlines are Lore entries

A bloodline is a **Lore entry** with a bloodline block in its Scenario Builder
metadata. It is not a new State Engine type and not a list hidden in the
setting doc. Being Lore gives it, for free:
- a sheet, a description and an image, plus a place in the catalog with a
  "Bloodlines" filter;
- lorebook export, and import from a lorebook ("the Elves of Arcadia" in a
  published book comes in as a bloodline when it reads like one, section 7);
- the lore selection that already picks "lore tied to the bloodline present"
  (`guidance/build.js`), so an elf in the scene brings the elves' lore line
  without a new mechanism;
- Archivist's lore and the story-leads path (section 7).

The structured part lives in `meta.bloodline` (pure, in `src/library/bloodlines.js`):

```
meta.bloodline = {
  kind,          'ancestry' | 'species' | 'made' | 'changed' | 'human'
                 (it only steers wording and presets)
  plural,        "elves", "Vaskari" - for "mostly humans, some elves"
  adjective,     "elven", "Vaskari"
  look,          what anyone would see, in a sentence, for prose:
                 "tall, pointed ears, eyes that catch the light; often
                 surgically 'corrected' to pass as human"
  visual,        the detailed look for image prompts (section 4.4)
  here,          how they live in THIS world (the cyberpunk answer):
                 "awakened in 2031; overrepresented in corporate boards,
                 underrepresented in street gangs; old money"
  lifespan,      'short' | 'human' | 'long' | 'ageless' + an optional note
                 (an elf of 300 can look 30)
  traits,        a short free list: "darkvision", "no need to sleep"
  naming: {      whose names they carry (section 5)
    culture,     a naming culture id, or ''
    mode,        'own' | 'local' | 'either' - their own tongue, the place's,
                 or a mix (elves raised in the city have city names)
  },
  related,       a creature entry id (trolls the bloodline / trolls the beast)
  playable,      the player can be one (it shows in the player's choices)
  canMix,        children with others are possible (half-elves)
}
```

Everything is optional. A bloodline with only a name and a description
already works: it simply has less to steer with.

**Humans count.** A world gets an implicit "Humans" bloodline when none is
defined, so "mostly humans, a few elves" can be said. The user can make
humans an entry of their own with a description and a "here" line.

## 3. Who lives where: the population

### 3.1 The world's mix

The overview gets a **population**: which bloodlines live in the world and how
common each is.

```
overview.population = {
  mix: [{ bloodline, share }],   share: 'most' | 'common' | 'some' | 'few' |
                                     'rare' | 'unique' | 'none'
  notes,                      "elves keep to the arcologies"
  only,                       true: these bloodlines and no others (the model
                              must not invent dwarves). false: others may
                              turn up rarely when the story wants them.
}
```

Shares are words, not percentages. The model reads words better, and a
user writing a world thinks "elves are rare here", not "4%". In code each
word has a weight for rolling (most 60, common 20, some 8, few 3, rare 1,
unique: one, already in the library, never rolled; none: never).

### 3.2 A place's mix

A location can set its own mix on its "The world here" card (the realm
card), and the places inside it inherit it unless they set their own. This
is exactly how kind of world, magic and tech already pass down
(`library/world-options.js` `inheritedRealm`). Examples:
- the Elven Quarter of Arcadia City: elves most, humans some;
- the orbital colony: androids common, humans most, no elves;
- Victorian London on a time-travel stop: humans only.

A place's mix can **replace** the world's, or **adjust** it, as in "as
above, but elves common". Adjust is the default because it is what users
mean most of the time.

### 3.3 A faction's members

A faction can say who it takes: "elves only" (the Sunborn Court), "mostly
dwarves", "anyone". It is the same list of bloodline and share, on the
faction's sheet. It is used when a member is rolled (section 4) and in the
faction's guidance line.

## 4. Where bloodlines are used

### 4.1 A character's bloodline

A character gets **Bloodline** on its sheet: one bloodline, two for mixed
heritage (when both allow mixing), and an optional line of their own
("raised human; had her ears clipped at fourteen"). It is stored in
`meta.lineage = { ids: [], note }`.

The story can also say it. A character whose description says "an elven
fixer" is matched to the Elves entry by name, plural and adjective when
nobody set the field (a guess shown on the sheet the way creature form is
guessed, and taken when the user saves).

### 4.2 Generation

- **Generate / Surprise me** for a character, with no bloodline in the brief:
  roll one from the mix that holds where they will live (their place, else
  their faction's members, else the world). It happens in code, before the
  model, like the name. The prompt is told "She is an elf (Elves: ...the
  'look' and 'here' lines...)", so the model writes an elf of *this* world.
- **A bloodline in the brief** ("an elf hacker", "a Vaskari trader") wins. It
  is matched to an entry. An unknown one ("a troll bouncer" in a world
  without trolls) is used as given and offered as a new bloodline (section 7).
- **Name and bloodline go together.** The bloodline is rolled first, then its
  naming culture feeds the name roll (section 5).
- **Locations and factions** get the population line in their generation
  prompt ("who lives here: mostly humans, some elves"), so a new district
  or gang fits the mix instead of the model's default.

### 4.3 Guidance and the director

- **The cast line** gets the bloodline: "Kiri Ashvale (elf, fixer)". The
  player's line too.
- **The location section** gets one short line when the place's mix is not
  "humans only": "Who is about here: mostly humans; some elves; androids
  common in service work". It costs no extra calls and is a few tokens. It
  stays out when the mix is plain or unknown.
- **The bloodlines' lore** comes in through the lore section as it does today:
  the bloodline of anyone present. The "look" and "here" lines are the short
  form, and the full description only when the budget allows.
- **The director**, inventing NPCs (NEW lines), is given the mix of the
  place and the `only` rule: "only these bloodlines exist: ...". A new
  character it adds gets a bloodline like a generated one: its own word if it
  gave one, else rolled.
- **Out-of-world bloodlines:** when the world says `only`, guidance carries a
  short rule: "There are no dwarves, orcs or other bloodlines in this world
  beyond: ...". It sits beside the existing "absent" lists for magic and
  tech.

### 4.4 Images

An image model knows "elf" and "orc". It does not know a Vaskari, a
crystal-singer or an uplifted octopus, and given only the name it draws a
human, or nothing that fits. So a bloodline carries its own **visual block**,
and how much of it goes into a prompt depends on how well the image model
can be expected to know the bloodline already:

```
meta.bloodline.visual = {
  known,      'well' (elf, dwarf, android: a tag is enough) |
              'partly' (tiefling, Grey: a tag plus the features that matter) |
              'not' (invented: the full description, no tag to lean on)
  body,       the body plan, against a human: "humanoid", "four-armed",
              "centaur-like", "no fixed shape", "the size of a child"
  skin,       skin / hide / surface and colouring: "slate-grey scales
              with a copper sheen", "translucent, veins of light"
  features,   the 2-4 things that make one recognisable, most important
              first: "no nose; three amber eyes in a row; feathered crest"
  dress,      what they wear or carry in THIS world (bends to the age)
  tags,       short tags for tag-based models (SD): "pointed ears, elf"
  negative,   what must not appear: "human ears", "human face", "hair"
  variety,    how much individuals differ: "colouring varies by clan"
}
```

- **Prompts lead with the bloodline when it is not well known.** The
  character's subject line opens with the body plan and features before
  the clothes and pose ("a slate-scaled four-armed Vaskari woman, three
  amber eyes, feathered crest, wearing ..."), because models weight the
  start. A well-known bloodline gets its tag plus anything the world changes
  ("an elf, ears surgically clipped").
- **Negatives per provider.** `negative` goes into the SD negative prompt
  and Midjourney's `--no`. A non-human body plan also adds "human" to them,
  which otherwise pulls the figure back to a person in a costume.
- **Descriptions write it in.** When Generate writes a character of a
  bloodline that is not well known, it is told the visual block and asked to
  put the features into the character's appearance. Then the character's
  own description carries them, for the narrator and for any image tool
  the user takes it to.
- **The bloodline's own portrait.** Its Lore image is a reference picture of
  one of them (the existing image panel, with the visual block as the
  subject), so the user can check that the description draws what they
  mean before every character of that bloodline inherits it.
- **Written for the user when blank.** For an invented bloodline with a
  description but no visual block, one call (on the bloodline's sheet, or as
  part of "invent your own") fills the block from the description. It is
  never automatic.
- **The age still applies.** The later-age rule in `lookLines` keeps
  clothes in the world's age, and `dress` says how this bloodline does it
  ("chrome ear cuffs, no forest garb").

## 5. Bloodlines and naming

The naming design already has "Who uses which culture" with faction >
place > world. Bloodlines slot in **for characters only**:

> the user's typed name > the character's own culture (sheet) > **their
> bloodline's culture** (by its mode) > their faction's > their place's > the
> world default

- **own**: an elf rolls elven names wherever they live.
- **local**: they carry the place's names (elves raised in Arcadia City
  have city names), and the bloodline's culture is not used.
- **either**: a coin weighted toward own: some keep the old names, some
  don't. This suits cyberpunk elves who rename themselves.

Mixed heritage takes either parent's culture (the given name from one, the
family name from the other when both are own).

Places and factions are unchanged: a bloodline does not name a district.

## 6. Defaults: presets

The Bloodlines tab offers starting points, the way the Naming tab offers
cultures. A preset fills a bloodline block and a short description. Where a
naming preset fits, it links to that culture (elves to the Elves culture,
dwarves to Dwarves).

| Group | Presets |
|-------|---------|
| Fantasy | humans, elves (high / wood / dark), dwarves, halflings, gnomes, orcs, half-orcs, goblins, giants / ogres, merfolk, fey, dragon-kin, beast-folk, undead (as a changed bloodline), vampires |
| Science fiction | humans, augmented / cyborgs, androids, clones, uplifted animals, Greys, insectoid hive, reptilian, energy beings, gene-adapted (spacer, high-gravity) |
| Modern / urban fantasy | humans, vampires, werewolves, witches (as a bloodline when the setting treats them so), fae in hiding, ghosts |

**A preset bends to the age.** Picked in a later-age world, a fantasy
preset's "look" and "here" are written for that age. Its template has two
versions (earlier / later, like the kits' o/m tags in naming), or, when the
user asks, one model call rewrites the preset's lines for this premise.
The call is optional, on a button, and counts as one generation like any
other.

**Invent your own.** "New bloodline" asks for a name and a line ("silicon
crystal folk who sing to grow") and runs the ordinary Lore Generate with
the bloodline form, so the model fills the block from the premise. A blank
one is for writing it by hand.

## 7. Where bloodlines come from

The same four doors as every entry (memory: story leads validation):
- **The user**: presets, invented, hand-written.
- **The premise**: one call reads the premise and lists the bloodlines and
  the world's mix. This should be the **same call** as naming phase 3
  ("rules from the premise"): one call proposes cultures, bloodlines, which
  bloodline speaks which, and the mix. It shows as proposals the user accepts.
  This keeps the call budget flat (memory: LLM call budget).
- **A lorebook**: an imported lore entry that reads like a bloodline ("The
  elves of X are...", an entry named for a plural kind) is marked a bloodline
  with only the fields its text gives. The canon-only rule holds: nothing
  is added that the book does not say (memory: canon-only lorebooks).
- **The story**: a bloodline the story uses that the world lacks ("the troll
  bouncer") is noticed when a character is taken in or generated with one.
  The State Engine review confirms it and Scenario Builder takes it in as a
  new bloodline, enriched, not ignored. When the world is `only`, it is listed
  for the user to decide instead of added (the world said no trolls; the
  story disagreed).

## 8. The Bloodlines tab

A tab beside Naming, laid out like it:
- **This world's bloodlines**: cards with name, plural, kind, share in the
  world, naming culture, and a portrait when there is one. Add from preset
  / invent / blank. Each opens its Lore sheet, where the bloodline block is a
  card.
- **Who lives where**: the world's mix as a list of rows (bloodline, share),
  the notes, and the "only these" switch. Below it, the places and factions
  that set their own, each with its mix and a link to it.
- **Try it**: roll five characters' bloodlines here, in a place or faction, to
  see the mix work (no model call). It is the same idea as Sample names.

## 9. Where it lives

| What | Where |
|------|-------|
| bloodline block, mix, shares, rolling, matching words in text | `src/library/bloodlines.js` (pure, tested) |
| presets | `src/library/bloodline-presets.js` |
| world mix | `overview.population` in `store/schema.js` |
| place mix | `meta.realm.population`, inherited with the realm (`world-options.js`) |
| faction members | `meta.members` |
| character's bloodline | `meta.lineage` |
| culture order for bloodline | `naming/cultures.js` `inheritedCulture` gains the bloodline step |
| tab | `src/ui/bloodlines-tab.js`; the sheet cards in `ui/sheet.js` |
| guidance lines | `guidance/build.js` (cast, location), `guidance/sync.js` |
| generation | `generate/prompt.js`, `generate/run.js` |
| director | `director/prompt.js` (mix and `only` for NEW lines) |
| images | `images/prompt.js` |

## 10. Phases

1. **Bloodlines and the mix.**
   - The bloodline block on Lore entries, the Bloodlines tab, and presets with
     both ages.
   - The world, place and faction mix.
   - A character's Bloodline field and the guess from the description.
   - The cast and location guidance lines, and the visual block in image
     prompts.
2. **Generation uses them.**
   - Rolling a bloodline for Generate / Surprise me.
   - Briefs matched to bloodlines.
   - Name culture by bloodline (section 5).
   - The mix in location and faction prompts, and the director's NEW lines
     and the `only` rule.
3. **From the premise and the story.**
   - The shared premise call with naming phase 3.
   - Lorebook import marking bloodlines.
   - Story-led new bloodlines through review.
   - "Rewrite for this world" on a preset, and "Describe how they look"
     (fill the visual block from the description).
4. **Extras.**
   - Mixed heritage done fully.
   - How bloodlines see each other: standing and prejudice per place ("elves
     are distrusted in the Sprawl"), as guidance for NPC reactions.
   - Lifespan in ages: a 300-year-old elf is not "old".
   - The realms roadmap item, whose population mix is this.

## 11. Open questions

1. **Lore entries or a list of their own?** The proposal is Lore entries,
   for export, import, the lore selection and the story paths. The cost is
   that the catalog's Lore list gets a Bloodlines filter, and that a bloodline
   deleted as lore is deleted as a bloodline.
2. **Shares as words** (most / common / some / few / rare) rather than
   percentages. Words are easier to write and read, but less exact.
3. **A tab of its own, or one "Bloodlines & names" tab** with the Naming tab
   (they are closely linked through section 5)? The proposal is two tabs,
   with links between them.
4. **How strict `only` is.** It is off by default, so the story can still
   bring in a stray kind of being. Should a world made from a fantasy
   preset turn it on?

## Phase 1 as built (2026-10-27)

Names in code follow the rename: `meta.bloodline` (the block on a Lore
entry), `meta.lineage` (a character's), `meta.population` (a place's mix),
`meta.members` (a faction's), `overview.population` (the world's).

| File | What it does |
|------|--------------|
| `src/library/bloodlines.js` | Pure. The block and its normalizing; shares and their weights; the implicit humans (`HUMANS`, replaced by a world's own human bloodline); the mix at a place (`mixAt`: world, then each place from the top, adjusting or replacing) and for a faction (`mixFor`); rolling from a mix; the mix in words; the "who is about" line and the "only" rule; the guess from a character's role and first sentence; the cast label ("elf", "half elf, half human"); the short form for prompts; what an image prompt needs (`visualFor`). |
| `src/library/bloodline-presets.js` | 31 presets in three groups (fantasy, science fiction, modern and urban fantasy), each text in an earlier and a later version; a preset links its naming culture where one fits. |
| `src/library/bloodline-store.js` | The world's bloodlines (lore marked as one), adding one from a preset or by name (it joins the world's mix as "some", with humans "most" when the mix was empty), the world's mix. |
| `src/ui/bloodlines-tab.js` | The tab, after Naming: the bloodlines as cards (open the Lore sheet), add from a preset (the world's own group first) or by name; who lives where (the world's mix, notes, "these and no others", then the places and factions with their own); "Try it" rolls five in a place or faction and shows the line the narrator gets there. |
| `src/ui/bloodline-cards.js` | On the sheets, saving at once: a Lore entry's "It is a bloodline" and its block (with "How to draw them"); a character's bloodline, a second for mixed heritage when it allows it, their own note, and the guess with "That is right"; a place's "Who lives here" (changes or replaces the mix above) and a faction's "Who it takes". |

- **Guidance.** The cast line has the bloodline ("Kiri (elf): ..."; the
  player's "(elf, courier)"), and "human" only in a world that has other
  bloodlines. After the cast, "Bloodlines present - Elves: look. How they
  live here: ...", for those present other than the player, at most four.
  The location section has "Who is about here: ..." when the mix is more
  than humans, and "No elves are found here." for a bloodline set to none.
  The "only" rule goes with the world's limits (never dropped).
- **A character with no bloodline set** is read from their role and the
  first sentence of their description, by each bloodline's singular and
  adjective (humans never guessed); the guess is used until one is set.
- **Images.** A character's portrait leads with their bloodline ("portrait
  of an elf fixer"); one that image models do not know well adds its body,
  skin and features before the description; its "never draw" words and,
  for a body that is not a person's, "human" go to `--no` and the negative
  prompt. A bloodline's own Lore picture is a full-body reference of one.
  Bloodline names are not stripped from descriptions as proper names.
- **Catalog.** The Lore chapter has a Bloodlines / Not bloodlines filter
  once the world has one.

Since built: phase 2, below.

## Phase 2 as built (2026-10-27)

No extra model calls: everything is decided in code and told to the model.

- **A new character's bloodline** (`decideLineage` in bloodlines.js,
  `bloodlineContext` in generate/run.js), decided before the name:
  - the one picked in the Generate panel (a new **Bloodline** box, shown
    once the world has two or more to choose from);
  - else the ones the idea names (`matchBrief`): "an elven hacker", "one
    of the Vaskari", "a half-orc" (half human too, unless another is named);
    a proper bloodline ("Grey") only with its capital, so "a grey coat" is
    not one;
  - else a kind of being the world has no bloodline for ("a troll
    bouncer"): written as asked, nothing rolled, and a toast says it can be
    added on the Bloodlines tab;
  - else rolled from the mix where they will be: their faction's members
    (a faction their fields tie them to), else the place they are generated
    in, else the world.
  The new sheet opens with it on the Bloodline card (changeable before
  saving), and it is saved with the character.
- **What the model is told** (`lineageBriefLine`, the prompt's "# Who
  they are"): "They are an elf.", the bloodline's look and how they live
  here, and for one image models do not know well, the body, skin and
  features to put into their appearance. A saved character's own bloodline
  is told the same way when its fields are filled or enriched.
- **Names by bloodline** (`cultureOfLineage`): a bloodline's culture names
  them - always (own), never (local: the place's, as before), or about two
  times in three (either). A culture picked in the Generate panel still
  wins. The sheet's Name dice use the character's bloodline too. Mixed
  heritage takes the first bloodline that has a culture (given and family
  names from each parent is phase 4).
- **Places and factions** (`populationBriefLine`, the prompt's "# Who
  lives there"): who lives where it is - a place's own mix, a faction's
  members, else the place's - and the world's "only" rule; nothing for a
  mix of humans alone.
- **The director**: when it may add things, its NEW-line instructions carry
  who is about here and the "only" rule, and ask that a new character's
  description say which bloodline they are. A character it adds gets the
  bloodline its own words give, else one rolled from the scene's mix; a
  kind the world lacks is left as the story wrote it (phase 3 takes those
  in). Its rolled names still come from the place's culture pool.

Not yet: phases 3-4 - the premise call, lorebook import, story-led new
bloodlines through review, "Rewrite for this world" and "Describe how they
look", mixed heritage done fully, prejudice per place, lifespans in ages.
