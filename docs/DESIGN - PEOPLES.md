# Design - Peoples

A world says who lives in it. Elves, dwarves and orcs in a fantasy realm;
androids, uplifted octopuses and Greys in a space opera; and, the hard
case, elves in a cyberpunk megacity, where the model's picture of an elf
(a bow, a forest, a silver circlet) is the wrong one. Today Scenario
Builder has no idea of a people. The model guesses from the premise, puts
elves everywhere or nowhere, and dresses them for the wrong age.

This design gives a world its **peoples**: who they are, how they look and
live *in this world*, how common they are where, and whose names they
carry. They come from presets, from the premise, from the user's own
invention, or from the story itself, like everything else.

Status: proposal (2026-10-26). Nothing built.

## 1. What a people is

A **people** is any kind of being that a character can *be*: an ancestry
(elf, dwarf, half-orc), a species (Vulcan, Grey, uplifted octopus), a made
kind (android, clone, golem), a changed kind (vampire, cyborg, ghoul), or
plain humans. "Race", "species", "ancestry", "kind" are the user's word for
it. The UI says "Peoples".

It is not a **creature**. A creature (`library/creature-form.js`) is
something met in a fight or the wild: a wolf, Ashmaw the dragon, "3
zombies". A people is someone's identity. Where the two meet (a troll
bouncer *and* trolls under the bridge), they are separate entries, and the
people can name the creature kind it is related to.

It is not a **faction** either. "The Sunborn" can be an elven *people*,
while "House Sunborn" is a *faction* of mostly Sunborn elves.

## 2. Peoples are Lore entries

A people is a **Lore entry** with a people block in its Scenario Builder
metadata. It is not a new State Engine type and not a list hidden in the
setting doc. Being Lore gives it, for free:
- a sheet, a description and an image, plus a place in the catalog with a
  "Peoples" filter;
- lorebook export, and import from a lorebook ("the Elves of Arcadia" in a
  published book comes in as a people when it reads like one, section 7);
- the lore selection that already picks "lore tied to the people present"
  (`guidance/build.js`), so an elf in the scene brings the elves' lore line
  without a new mechanism;
- Archivist's lore and the story-leads path (section 7).

The structured part lives in `meta.people` (pure, in `src/library/peoples.js`):

```
meta.people = {
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
  related,       a creature entry id (trolls the people / trolls the beast)
  playable,      the player can be one (it shows in the player's choices)
  canMix,        children with others are possible (half-elves)
}
```

Everything is optional. A people with only a name and a description
already works: it simply has less to steer with.

**Humans count.** A world gets an implicit "Humans" people when none is
defined, so "mostly humans, a few elves" can be said. The user can make
humans an entry of their own with a description and a "here" line.

## 3. Who lives where: the population

### 3.1 The world's mix

The overview gets a **population**: which peoples live in the world and how
common each is.

```
overview.population = {
  mix: [{ people, share }],   share: 'most' | 'common' | 'some' | 'few' |
                                     'rare' | 'unique' | 'none'
  notes,                      "elves keep to the arcologies"
  only,                       true: these peoples and no others (the model
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
above, but elves common". Adjust is the default because it is what people
mean most of the time.

### 3.3 A faction's members

A faction can say who it takes: "elves only" (the Sunborn Court), "mostly
dwarves", "anyone". It is the same list of people and share, on the
faction's sheet. It is used when a member is rolled (section 4) and in the
faction's guidance line.

## 4. Where peoples are used

### 4.1 A character's people

A character gets **People** on its sheet: one people, two for mixed
heritage (when both allow mixing), and an optional line of their own
("raised human; had her ears clipped at fourteen"). It is stored in
`meta.people = { ids: [], note }`.

The story can also say it. A character whose description says "an elven
fixer" is matched to the Elves entry by name, plural and adjective when
nobody set the field (a guess shown on the sheet the way creature form is
guessed, and taken when the user saves).

### 4.2 Generation

- **Generate / Surprise me** for a character, with no people in the brief:
  roll one from the mix that holds where they will live (their place, else
  their faction's members, else the world). It happens in code, before the
  model, like the name. The prompt is told "She is an elf (Elves: ...the
  'look' and 'here' lines...)", so the model writes an elf of *this* world.
- **A people in the brief** ("an elf hacker", "a Vaskari trader") wins. It
  is matched to an entry. An unknown one ("a troll bouncer" in a world
  without trolls) is used as given and offered as a new people (section 7).
- **Name and people go together.** The people is rolled first, then its
  naming culture feeds the name roll (section 5).
- **Locations and factions** get the population line in their generation
  prompt ("who lives here: mostly humans, some elves"), so a new district
  or gang fits the mix instead of the model's default.

### 4.3 Guidance and the director

- **The cast line** gets the people: "Kiri Ashvale (elf, fixer)". The
  player's line too.
- **The location section** gets one short line when the place's mix is not
  "humans only": "Who is about here: mostly humans; some elves; androids
  common in service work". It costs no extra calls and is a few tokens. It
  stays out when the mix is plain or unknown.
- **The peoples' lore** comes in through the lore section as it does today:
  the people of anyone present. The "look" and "here" lines are the short
  form, and the full description only when the budget allows.
- **The director**, inventing NPCs (NEW lines), is given the mix of the
  place and the `only` rule: "only these peoples exist: ...". A new
  character it adds gets a people like a generated one: its own word if it
  gave one, else rolled.
- **Out-of-world peoples:** when the world says `only`, guidance carries a
  short rule: "There are no dwarves, orcs or other peoples in this world
  beyond: ...". It sits beside the existing "absent" lists for magic and
  tech.

### 4.4 Images

An image model knows "elf" and "orc". It does not know a Vaskari, a
crystal-singer or an uplifted octopus, and given only the name it draws a
human, or nothing that fits. So a people carries its own **visual block**,
and how much of it goes into a prompt depends on how well the image model
can be expected to know the people already:

```
meta.people.visual = {
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

- **Prompts lead with the people when it is not well known.** The
  character's subject line opens with the body plan and features before
  the clothes and pose ("a slate-scaled four-armed Vaskari woman, three
  amber eyes, feathered crest, wearing ..."), because models weight the
  start. A well-known people gets its tag plus anything the world changes
  ("an elf, ears surgically clipped").
- **Negatives per provider.** `negative` goes into the SD negative prompt
  and Midjourney's `--no`. A non-human body plan also adds "human" to them,
  which otherwise pulls the figure back to a person in a costume.
- **Descriptions write it in.** When Generate writes a character of a
  people that is not well known, it is told the visual block and asked to
  put the features into the character's appearance. Then the character's
  own description carries them, for the narrator and for any image tool
  the user takes it to.
- **The people's own portrait.** Its Lore image is a reference picture of
  one of them (the existing image panel, with the visual block as the
  subject), so the user can check that the description draws what they
  mean before every character of that people inherits it.
- **Written for the user when blank.** For an invented people with a
  description but no visual block, one call (on the people's sheet, or as
  part of "invent your own") fills the block from the description. It is
  never automatic.
- **The age still applies.** The later-age rule in `lookLines` keeps
  clothes in the world's age, and `dress` says how this people does it
  ("chrome ear cuffs, no forest garb").

## 5. Peoples and naming

The naming design already has "Who uses which culture" with faction >
place > world. Peoples slot in **for people only**:

> the user's typed name > the character's own culture (sheet) > **their
> people's culture** (by its mode) > their faction's > their place's > the
> world default

- **own**: an elf rolls elven names wherever they live.
- **local**: they carry the place's names (elves raised in Arcadia City
  have city names), and the people's culture is not used.
- **either**: a coin weighted toward own: some keep the old names, some
  don't. This suits cyberpunk elves who rename themselves.

Mixed heritage takes either parent's culture (the given name from one, the
family name from the other when both are own).

Places and factions are unchanged: a people does not name a district.

## 6. Defaults: presets

The Peoples tab offers starting points, the way the Naming tab offers
cultures. A preset fills a people block and a short description. Where a
naming preset fits, it links to that culture (elves to the Elves culture,
dwarves to Dwarves).

| Group | Presets |
|-------|---------|
| Fantasy | humans, elves (high / wood / dark), dwarves, halflings, gnomes, orcs, half-orcs, goblins, giants / ogres, merfolk, fey, dragon-kin, beast-folk, undead (as a changed people), vampires |
| Science fiction | humans, augmented / cyborgs, androids, clones, uplifted animals, Greys, insectoid hive, reptilian, energy beings, gene-adapted (spacer, high-gravity) |
| Modern / urban fantasy | humans, vampires, werewolves, witches (as a people when the setting treats them so), fae in hiding, ghosts |

**A preset bends to the age.** Picked in a later-age world, a fantasy
preset's "look" and "here" are written for that age. Its template has two
versions (earlier / later, like the kits' o/m tags in naming), or, when the
user asks, one model call rewrites the preset's lines for this premise.
The call is optional, on a button, and counts as one generation like any
other.

**Invent your own.** "New people" asks for a name and a line ("silicon
crystal folk who sing to grow") and runs the ordinary Lore Generate with
the people form, so the model fills the block from the premise. A blank
one is for writing it by hand.

## 7. Where peoples come from

The same four doors as every entry (memory: story leads validation):
- **The user**: presets, invented, hand-written.
- **The premise**: one call reads the premise and lists the peoples and
  the world's mix. This should be the **same call** as naming phase 3
  ("rules from the premise"): one call proposes cultures, peoples, which
  people speaks which, and the mix. It shows as proposals the user accepts.
  This keeps the call budget flat (memory: LLM call budget).
- **A lorebook**: an imported lore entry that reads like a people ("The
  elves of X are...", an entry named for a plural kind) is marked a people
  with only the fields its text gives. The canon-only rule holds: nothing
  is added that the book does not say (memory: canon-only lorebooks).
- **The story**: a people the story uses that the world lacks ("the troll
  bouncer") is noticed when a character is taken in or generated with one.
  The State Engine review confirms it and Scenario Builder takes it in as a
  new people, enriched, not ignored. When the world is `only`, it is listed
  for the user to decide instead of added (the world said no trolls; the
  story disagreed).

## 8. The Peoples tab

A tab beside Naming, laid out like it:
- **This world's peoples**: cards with name, plural, kind, share in the
  world, naming culture, and a portrait when there is one. Add from preset
  / invent / blank. Each opens its Lore sheet, where the people block is a
  card.
- **Who lives where**: the world's mix as a list of rows (people, share),
  the notes, and the "only these" switch. Below it, the places and factions
  that set their own, each with its mix and a link to it.
- **Try it**: roll five characters' peoples here, in a place or faction, to
  see the mix work (no model call). It is the same idea as Sample names.

## 9. Where it lives

| What | Where |
|------|-------|
| people block, mix, shares, rolling, matching words in text | `src/library/peoples.js` (pure, tested) |
| presets | `src/library/people-presets.js` |
| world mix | `overview.population` in `store/schema.js` |
| place mix | `meta.realm.population`, inherited with the realm (`world-options.js`) |
| faction members | `meta.members` |
| character's people | `meta.people` |
| culture order for people | `naming/cultures.js` `inheritedCulture` gains the people step |
| tab | `src/ui/peoples-tab.js`; the sheet cards in `ui/sheet.js` |
| guidance lines | `guidance/build.js` (cast, location), `guidance/sync.js` |
| generation | `generate/prompt.js`, `generate/run.js` |
| director | `director/prompt.js` (mix and `only` for NEW lines) |
| images | `images/prompt.js` |

## 10. Phases

1. **Peoples and the mix.**
   - The people block on Lore entries, the Peoples tab, and presets with
     both ages.
   - The world, place and faction mix.
   - A character's People field and the guess from the description.
   - The cast and location guidance lines, and the visual block in image
     prompts.
2. **Generation uses them.**
   - Rolling a people for Generate / Surprise me.
   - Briefs matched to peoples.
   - Name culture by people (section 5).
   - The mix in location and faction prompts, and the director's NEW lines
     and the `only` rule.
3. **From the premise and the story.**
   - The shared premise call with naming phase 3.
   - Lorebook import marking peoples.
   - Story-led new peoples through review.
   - "Rewrite for this world" on a preset, and "Describe how they look"
     (fill the visual block from the description).
4. **Extras.**
   - Mixed heritage done fully.
   - How peoples see each other: standing and prejudice per place ("elves
     are distrusted in the Sprawl"), as guidance for NPC reactions.
   - Lifespan in ages: a 300-year-old elf is not "old".
   - The realms roadmap item, whose population mix is this.

## 11. Open questions

1. **Lore entries or a list of their own?** The proposal is Lore entries,
   for export, import, the lore selection and the story paths. The cost is
   that the catalog's Lore list gets a Peoples filter, and that a people
   deleted as lore is deleted as a people.
2. **Shares as words** (most / common / some / few / rare) rather than
   percentages. Words are easier to write and read, but less exact.
3. **A tab of its own, or one "Peoples & names" tab** with the Naming tab
   (they are closely linked through section 5)? The proposal is two tabs,
   with links between them.
4. **How strict `only` is.** It is off by default, so the story can still
   bring in a stray kind of being. Should a world made from a fantasy
   preset turn it on?
