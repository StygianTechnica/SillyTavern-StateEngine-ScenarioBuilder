# Design - Naming

The model is bad at names. Asked for one, it gives the most likely name, so
every world fills up with the same Elaras, Kaels, Thornes, Lyras, Vexes,
Ashfords and Whispering Woods, whatever the premise. Scenario Builder rolls
names in code, from rules that belong to the world and to its cultures, and
hands them to the model. The model is told a thing's name; it is never asked
to make one up.

Status: phases 1-4 built (2026-10-26) - see "Phase 1 as built" to "Phase 4
as built" at the end. Phase 5 is a proposal.

## 1. Where the model names things today

| Where | What it names | File |
|-------|---------------|------|
| Generate (create, surprise) | the new entry | `generate/prompt.js` (`task === 'create'`, "Give it a memorable, setting-appropriate name") |
| The sparkle on a Name field | the entry | `generate/prompt.js` (`nameField`) |
| The director's NEW lines | people, places, creatures, factions, lore, events, quests the scene needs | `director/prompt.js` (`creating`) |
| The planner's ideas | quests, events | `planner/prompts.js` (ideas JSON) |
| Events | invented entrants and opponents, the event itself | `events/generate.js` |
| Missions | an invented client or target, the job | `quests/missions.js` |
| The narrator | anyone it introduces in a reply | (the main model) |

Lorebook imports and names the story has already used are canon and are
never renamed (the story leads).

## 2. Naming cultures

A world has one or more **naming cultures** (shown as "tongues" or
"cultures" - the user's word for it). Each one is a small invented naming
language:

```
culture = {
  id, name,                    "Vaskari"
  notes,                       "harsh mountain clans; names are boasts"
  preset,                      the default it started from ("dwarves"), or ''
  real: true | false,          a real-world culture (section 3.5): real names,
                               real conventions, no mutation
  era,                         which period of its stocks: 'ancient' |
                               'medieval' | 'early_modern' | 'modern'
  root,                        its main real-world language ("dutch"): the one
                               the culture is recognisably built on
  seeds: [{ language, weight }],   real-world name stocks it grows from - the
                               root first, then any accents
                               ([{ old_norse: 3 }, { german: 1 }])
  mutation,                    how far from the real names: 0 (real names,
                               for a historical setting) .. 3 (barely recognisable)
  parts: {                     each part of a name has its OWN pool (section 3.2c)
    given:   { seeds, mutation },          Joren, Pieter, Willem
    family:  { seeds, mutation, prefixes },  Dalen, Vermeer; "van", "de", "ter"
    byname:  { seeds, mutation },
  },                           a part with no seeds of its own uses the culture's
  shifts: [rule],              its sound changes, rolled once ("th -> d",
                               "-us -> -or", "c -> k"), so its names drift the same way
  sound: {                     OR: a phonology for a wholly alien tongue
    consonants, vowels,        weighted letter groups ("k:3 v:2 r:3 th sk")
    onsets, codas,             allowed clusters at the start / end of a syllable
    shapes,                    syllable shapes and weights ("CV:3 CVC:2 V")
    length,                    syllables per name, a range and a lean
    spelling,                  sound -> letters ("sh", "kh", an apostrophe, a diacritic)
    avoid,                     sequences never to produce ("aa", "q not before u")
  },
  learned: [names],            OR: example names it learns from (section 3.2)
  words: [{ meaning, root }],  the word stock: "iron" -> "vod", "hill" -> "mund"
  patterns: {                  how each kind of name is built (section 3.3)
    given, family, byname, settlement, region, feature, building,
    faction, item, ship, event, title
  },
  pools: {                     plain-language word pools for descriptive names
    adjectives, nouns          ("salt, tide, gull, tar, grey")
  },
  banned: [names or pieces],   never produce these
}
```

Every world also has a **world default** culture used when nothing more
specific applies, so the generator works before the user sets anything up.

### Who uses which culture

The culture of a new thing is the first of:

1. the culture the user picked in the create dialog or named in the brief;
2. the faction it belongs to (a faction may carry a culture);
3. the place it is in, walking up the location tree (a kingdom carries one
   and every town in it inherits it, as with place overrides of magic);
4. its species or creature kind, if that carries one;
5. the world default.

A place may carry a **population mix** ("Brassport: Tidefolk 60, Vaskari 30,
anything 10"), so a port city's crowd is not all one people.

## 3. The generator (pure, `src/naming/`)

No SillyTavern imports, unit-tested like the other pure modules.

### 3.1 Grown from real-world names (the default)

The main way a culture makes names: from **seed languages** - real-world
name stocks bundled with the extension - blended by weight, then mutated.

1. **The stocks.** `src/naming/stocks/`, one data file per language, each
   with given names (by gender where the language has them), family names or
   their forms (patronymics, clan prefixes), place-name endings with their
   meanings (Welsh *-bryn* hill, *aber-* river mouth; Norse *-vik* bay,
   *-fell* mountain; Persian *-abad* town), and a small glossary (river,
   hill, iron, wolf, old, black, holy, ford, keep...). A few hundred names
   per language, from public-domain name lists. A starting set of about
   thirty: Finnish, Welsh, Icelandic, Old Norse, Old English, German, Dutch,
   Scottish Gaelic, Irish, Breton, Latin, Byzantine Greek, Ancient Greek,
   Italian, Spanish, French, Basque, Hungarian, Polish, Russian, Persian,
   Arabic, Turkish, Hebrew, Ancient Egyptian, Akkadian, Sanskrit, Mongolian,
   Japanese, Korean, Mandarin (pinyin), Swahili, Yoruba, Nahuatl, Quechua,
   Hawaiian, Maori.
2. **The blend.** A letter-level Markov chain (order 2-3) is trained on the
   seed languages' names, each weighted, so a Finnish + Welsh + Icelandic
   elf sounds like none of them alone.
3. **The mutation.** The culture's own sound shifts (rolled once from the
   world seed and kept, editable) are applied to every output, and at higher
   mutation endings are swapped and syllables recombined. The shifts are
   what make a culture *consistent*: its names all drift the same way, like
   a real language's.
4. **The filter.** An output is kept only if it is not a real name from the
   stocks (unless mutation is 0), is the right length, and passes section
   3.4.

Place names come the same way from the endings and glossary: a mutated
root plus a mutated ending, with the meaning carried along (*Bryndal*,
"hill valley").

**Each world is different by construction**: the shifts and the draws come
from a seeded random generator, the seed made when the world is made. Two
worlds with the same elves still name them differently.

### 3.1b Built from sounds

For a tongue that should sound like no human language at all (insectoid,
draconic, machine), a culture can skip the seeds and use a phonology.
Syllables are drawn from the culture's shapes and letter groups, joined,
checked against `avoid`, then spelled. The word stock is generated the same
way: roots for 40-60 common meanings (river, hill, iron, wolf, old, black,
holy, ford, keep, son-of...), rolled once and stored, so names in a culture
share pieces and mean something: *Vodmund* is "iron hill", *Skarvod* "black
iron". The sheet can show a name's meaning - worldbuilding the user gets for
free (seeded cultures get meanings from the stocks' glossaries).

### 3.2 Learned from examples

The user's own names are a seed like any language: pasted names (or a
canon-only world's existing names) go into the same Markov blend with a
weight of their own, and the same mutation and filter apply - never one of
the examples, never too close to one (section 3.4). A made-up culture can be
seeded only from the user's names, from real languages, or both.

### 3.2b Defaults

Ready-made cultures to start from, each a seed blend, a mutation level and
patterns (the user changes any of it):

| Preset | Seeds |
|--------|-------|
| Elves | Finnish, Welsh, Icelandic |
| Dwarves | Old Norse, German, Scottish Gaelic |
| Empire | Latin, Byzantine Greek |
| Desert kingdom | Persian, Arabic, Turkish |
| Steppe nomads | Mongolian, Turkish |
| Northern seafarers | Old Norse, Old English |
| Old kingdom (feudal) | Old English, French, Breton |
| Halflings / shire-folk | Old English, Dutch |
| Orcs / raiders | Akkadian, Hungarian, Basque, high mutation |
| Jungle empire | Nahuatl, Quechua |
| Island folk | Hawaiian, Maori |
| Eastern court | Japanese, Korean, Mandarin |
| Holy order | Latin, Hebrew |
| Sun kingdom | Ancient Egyptian, Akkadian |
| Fey | Irish, Welsh, high mutation |

The first language in each row is the preset's **root**, the language the
culture is recognisably built on; the others are accents at a lower weight.
A culture can also be one root and nothing else (Empire = Dutch, Coastal
Kingdom = Portuguese, Northern Clans = Norwegian, Merchant States = Flemish).
That reads as a coherent people at once - the player hears "Dutch-ish" and
knows these folk belong together - at the cost of sounding like the real
language. Keep mutation at 1 or more for an invented world, or the empire
is simply Dutch. A blend sounds more original but less like any one people.
Both are the same mechanism: a root alone is a blend of one.

Not every world is a fantasy world: see section 3.5 for real places and
times.

### 3.2c A pool for each part of a name

The parts of a name do not wear the same: in many languages surnames are
younger, fixed later, or plainly modern (Dutch *Vermeer*, *de Vries*;
English *Smith*, *Baker*). A culture whose given names come out ancient and
whose surnames come out like a phone book feels wrong. So each part has its
own pool:

- **Given names**, **family names** and **bynames** each have their own
  seeds and mutation. Elves can take given names from Finnish and Welsh, and
  house names from Welsh place-words, mutated harder. Dwarves can take given
  names from Old Norse and clan names from German, with the German
  mutated more so it does not read as a modern surname.
- **Prefixes and particles** are a pool of their own, with how often they
  appear: Dutch *van*, *de*, *van der*, *ter*; Gaelic *Mac*, *Nic*, *Ó*;
  Arabic *al-*, *ibn*, *bint*; German *von*; French *de*, *du*. Prefixes are
  not mutated (they are the grammar that marks the culture) unless the user
  says so. *Joren van Dalen*, *Willem van Rijn*, *Maarten de Vries*.
- The stocks keep their parts apart already (given, family, prefixes), and
  for the languages where it matters they keep **older family-name forms**
  apart from modern ones (Dutch farm and place names before the 1811
  surname decree; Norwegian farm names; English bynames before fixed
  surnames), so a medieval culture can take the old forms.

### 3.3 Patterns

A pattern is a template over name pieces and word pools:

```
given:       {name}                         Vodri
family:      {root}{-heim|-sk|-ar}           Skarheim
person:      {given} {family}               Vodri Skarheim
byname:      {given} {word:epithet}          Vodri Ironhand
settlement:  {word:feature}{word:quality}    Vodmund  ("iron hill")
building:    The {adj} {noun}                The Tarred Gull
feature:     {name} {Ford|Water|Fell}        Skar Water
faction:     The {noun} of {settlement}      The Oath of Vodmund
```

Pieces: `{name}` (a fresh sound-built name), `{root}` / `{word:meaning}` (the
word stock), `{adj}` / `{noun}` (the culture's word pools, in plain
English for descriptive names), a literal list `{a|b|c}`, and another
pattern by kind. A culture can lean conlang (*Kar Vothmund*), descriptive
(*Blackwater Ford*), or mixed (*Vothmund's Rest*), per kind.

### 3.4 Never the same name twice: the name registry

Each world keeps a **name registry** (`naming.registry`): every name the
generator has handed out, with its kind, culture and what became of it -
used (an object has it), offered (shown or put in a pool, not taken), or
turned down (rerolled away or banned). It does three jobs:

1. **No repeats.** A name in the registry, or on any object in the setting,
   is never handed out again. A name that was only offered comes back into
   play after a while (once 200 more names have been handed out), so a
   long game does not run dry; a turned-down name never does.
2. **Spread, not just difference.** The registry also counts the *pieces*:
   first syllables, endings, and each given name and surname on its own. A
   roll is weighted away from pieces used recently, so a town does not fill
   with *Vod-* names, *-mund* towns or six Pieters, and a culture works its
   way through its whole pool instead of circling its most likely outputs.
3. **Across worlds.** The user's complaint is the same names in every world.
   Seeds already make each world's languages differ; on top of that, an
   optional **shared registry** (in the extension's own settings, not the
   world) remembers the names used in the user's other worlds and avoids
   them, off for real-world cultures (every Icelandic world may have a Jón).

Every name rolled is also checked against:

- every name and alias in the setting;
- **too close** to one of them - Levenshtein distance 2 or less, or the same
  first three letters and length (so not Kael, Kaelen and Kaelis in one town);
- the culture's banned list, and a built-in **cliché list** (Elara, Kael,
  Lyra, Thorne, Seraphina, Vex, Zephyr, Aria, Sable, Ashford, Eldoria,
  and so on), on by default, editable. Overused *words* in descriptive
  names (Whispering, Shadow, Crimson) are only weighted down (3.4b).

Names stay deterministic per call (seed + counter), so a reroll is a new
counter, never a clock.

### 3.4b Descriptive names: kits

Not every name should sound foreign. Many worlds want **fanciful English
names** - *the Whispering Woods*, *the Craggy Mounts*, *Snake River*,
*Gallows Hill* - and some kinds of thing have a naming tradition of their
own whatever the culture: inns and taverns (*the Drowned Rat*, *the Hart
and Hound*), pirate ships (*Widow's Revenge*, *Black Gull*), naval ships
(*Indomitable*, *HMS Resolute*), merchantmen (*Fair Margaret*), mercenary
companies (*the Grey Company*, *the Ninth Lanterns*), street gangs, temples,
shops.

These come from **kits**: a themed set of patterns and word pools, bundled
with the extension and editable.

```
kit = {
  id, label,                    "Pirate ships"
  kinds: ['ship'],              what it names
  cues: ['pirate', 'corsair', 'buccaneer', 'raider'],   words that call for it
  patterns: [weighted],         "{adj} {beast}", "{owner}'s {revenge}",
                                "The {woman}'s {ruin}", "{colour} {bird}"
  pools: { adj, beast, ... },   the word pools, each word weighted
}
```

Phase-one kits: wilderness features (woods, mountains and hills, rivers and
lakes, marsh, coast, caves - with *Whispering*, *Craggy*, *Snake*,
*Hanging*, *Weeping*, *Old Man's* and hundreds more), inns and taverns
(adjective + beast, beast + beast, an object, a joke, an owner),
ships (pirate, naval, merchant), and companies and crews. More follow
(temples, shops, starships, bands, noble mottoes), and the premise step
(section 5) can write a world's own kits: word pools in plain English are
safe to ask the model for, since it is not choosing the names.

**Choosing a kit.** The kind of thing (from its type and the brief: "a
tavern", "a ship"), the brief's cues ("a *pirate* ship"), its place (an
inn in a port leans maritime: *the Salt Cod*), and the world's type and tone
(grimdark inns are not called *the Merry Piglet*). A culture says, per kind,
whether it names in its **own tongue**, with a **kit**, or **both**: elves
call their forest *Aelvinmaa*, the humans next door call it *the Weeping
Wood*, and a place can carry both, one as an alias.

**Repetition in kits** is held off the same way as in names: the registry
counts each pool word, so the second inn is not *the Drowned* anything, and
the cliché list here *softens* overused words (*Whispering*, *Shadow*,
*Crimson*) to a low weight instead of banning them - the style is wanted,
the tenth whispering wood is not.

**The long tail.** No kit covers every thematic tangle (a tavern for
ghosts in a city of clockwork monks). When no kit fits the kind and cues,
nothing is rolled: per section 4.1 a plain-word name is the model's to
write, with the cliché list and the pool for any proper noun in it.

### 3.5 Real-world cultures

A world set in modern Reykjavik, 1920s Chicago, Edo Japan or Republican
Rome wants real names, used the way that people really use them. A culture
marked **real** is a stock as it stands, not a blend:

- **Real names only.** No Markov blend, no mutation: names are drawn from
  the stock, **weighted by how common they are** (a modern Icelandic stock
  gives Jón and Guðrún often and Hallveig rarely), so a town looks like a
  real town.
- **Its era.** Stocks are split by period where the names changed: medieval
  and modern Icelandic, Republican and Imperial Latin, Meiji and modern
  Japanese, 1920s and present-day American. The culture picks one.
- **Its conventions**, built into the stock's patterns, not left to a
  template the user has to write: Icelandic patronymics and matronymics
  from the parent's name in the genitive (Jón's son is *Jónsson*, his
  daughter *Jónsdóttir*); Russian name + patronymic + surname with the
  surname's feminine form; Spanish two surnames; family name first in
  Japanese, Korean and Chinese; Arabic *ism*, *nasab* and *nisba*; Roman
  *praenomen*, *nomen* and *cognomen*, with the women's forms. A person's
  name can draw on their family's: a character with a father in the library
  takes the father's name in the patronymic.
- **Places are real.** Real places (Reykjavik, Akureyri) are canon the user
  or the story brings in, never generated. The generator names only what the
  real world would not have a name for: a farm, a fishing boat, a bar, a
  street in an invented town, a company - in the local style (*-staðir*,
  *-vík*, *Kaffi ...*).
- **Looser sameness rules.** Real towns have two Jóns. Exact repeats of a
  full name are still refused, but "too close" (section 3.4) is off, and the
  cliché list is skipped (it is a fantasy list).
- **Mixing works as before.** A population mix on a real place ("Reykjavik:
  modern Icelandic 85, modern Polish 8, anything 7") gives a realistic crowd.

The stock list for real cultures adds the modern majors a present-day
setting needs: English (UK), American, Australian, Canadian French,
Mexican Spanish, Brazilian Portuguese, Nigerian (Yoruba, Igbo, Hausa), Hindi
and Tamil, Filipino, Vietnamese, Thai, Ukrainian, Swedish, Norwegian, Danish
and Dutch alongside the languages above. A real culture is chosen from a
list of these ("Iceland, modern"), not built.

The premise step (section 5) recognises a real setting - "Reykjavik, 2026",
"a murder mystery in 1890s London" - and makes real cultures for it instead
of fantasy ones.

## 4. Where the names go in

### 4.1 The setting comes first

A rolled name fills a gap; it never overrides a name the setting already
gives. In order:

1. **A name the user typed** is used as it is. Always.
2. **A name already given** - in the brief ("a temple called the Ninefold
   House"), the chat, the user's GM notes or steer, an imported lorebook - is
   canon and is used.
3. **A name that comes from something in the setting is derived from it,
   not rolled.** The followers of the god Morvath are named from Morvath;
   the temple of a goddess from the goddess; a lord's son from his house; an
   inn in Brassport may take the town's name; a Vaskari sect from Vaskari
   words. When the brief, or what a thing is tied to, names an existing
   entry, the generator builds **derived** names - *Children of Morvath*,
   *Morvath's Hand*, *the Morvathi* (the culture's adjective ending),
   *Temple of Morvath*, *Hessa Skarheim* (her father's house) - offered as
   suggestions, and the model may also build its own name out of that
   entry's name or plain words (*the Graveborn Compact* for a god of death).
   What it must not do is invent a new proper noun for it.
4. **Only then is a name rolled from scratch**: a person, a place, a house
   with no tie that names it.

The problem was never names built from the world - those are the good
ones. It is the model's invented proper nouns: the Elaras, the Kaels, the
Eldorias. So the rule for everything the model writes is: **any made-up
proper noun comes from the generator; descriptive names in plain words, and
names built from existing names, are the model's to write.** Titles of
quests, events, lore and most items are plain-word titles and stay with the
model, with the cliché list banned and the pool for any proper noun inside
them.

### 4.2 Where

No extra model calls per reply (the LLM budget): names are rolled in code
and written into prompts the extension already sends.

1. **Generate (create)** - with no name typed or given and no tie that
   names it, the name is rolled first and shown in the create dialog with a
   reroll and a culture picker. The prompt says "Its name is Vodri Skarheim"
   and asks only for the rest; the JSON template loses its `name` key. A
   thing whose brief names an existing entry gets derived suggestions
   instead (4.1, step 3). The dice beside a Name field rolls a name without
   asking the model. Every prompt also carries a short pool for any *other*
   person or place the text mentions ("her brother", "the village she fled"),
   which is where many invented names hide.
2. **The director** - when it may create things, the prompt carries a short
   pool for the cultures in play: "Names to use for anything new: people -
   Vodri, Hessa Tarn, Orrin Maul; places - Skar Water, The Tarred Gull",
   and the 4.1 rule. A NEW **character** or **place** whose name is a single
   made-up word that is neither from the pool, nor in the chat, nor built
   from an existing name is given the next pool name before it is created,
   and the briefing text is changed to match before the narrator sees it.
   Factions, lore, events and quests are never swapped: their names are
   checked only against the cliché list (a faction tied to a god keeps the
   name the director built from the god).
3. **The planner, events, missions** - the same pool and the same rule for
   what they invent. Things the user's notes or the outline name are canon
   (4.1, step 2) and are never renamed.
4. **The narrator** - an optional guidance line, off by default: "If someone
   new needs a name: ...". Whatever name the narrator actually writes is
   story canon and is kept.

Names in a pool are "offered" in the registry until used or until the pool
is rolled again.

## 5. Rules from the premise

As everywhere in Scenario Builder, the user can have the rules made for
them. One model call, pressed by the user (and offered when a world is
made): the premise, front page, factions, top-level places and the names
already in the world go in, along with the presets and the list of seed
languages; out come the cultures - name, notes, who uses them, a preset or
**seed languages with weights picked from the list**, a mutation level,
word pools for descriptive names, and the pattern each kind uses. A
phonology only for a culture the premise makes inhuman.

The model chooses the *recipe* of each culture, never the names: the names
come from the stocks and the seeded generator, so the model's favourite
names cannot leak in. A seed language it names that is not on the list is
dropped. Its answer is read forgivingly, one culture at a time for small models;
anything missing or unusable is filled with seeded random defaults. Example
names it offers are dropped (they are where the clichés come from).

A canon-only world starts from its own names instead: each culture learns
from the names already tied to its places and factions (section 3.2), and
the model step is optional - this adds no detail to any object.

## 6. The Naming tab

A new workspace tab, after Calendar:

- **Cultures** down the side, the world default first; add, duplicate,
  delete; "Make from the premise"; "Learn from this world's names".
- **A culture's card**: name, notes, who uses it (faction / place / species
  chips, with what inherits it shown greyed), population mixes on places.
- **Kind**: real-world (pick a place and era: "Iceland, modern") or
  invented.
- **Seeds** (invented cultures): start from a preset (Elves, Dwarves,
  Empire...) or from scratch; seed languages with a weight slider each; a box of the user's own
  example names (a seed too); the mutation slider; the sound shifts, with a
  reroll. For an alien tongue, a Sound section instead: letter groups and
  weights, syllable shapes, length.
- **Patterns**: one row per kind, with eight live samples, reroll, and per
  sample "keep" (reserve it) or "ban".
- **Word stock**: meanings and their roots, editable; the meaning of any
  sample on hover.
- **Test bench**: "Name a [tavern] of the [Vaskari] in [Brassport]".

A slash command (`/sb-name tavern Vaskari`) rolls names in chat.

## 7. Where it lives

`settings.library[settingId].naming`, normalized in `store/schema.js` with
a schema bump:

```
naming = {
  seed,                         made with the world
  defaultCulture,               culture id
  cultures: { id: culture },
  cliches: true,                use the built-in cliché list
  banned: [names],              world-wide
  registry: [{ name, kind, culture, state, at }],   every name handed out;
                                state: 'offered' | 'used' | 'declined'
  counter,                      how many names have been rolled (the RNG step)
  mixes: { placeId: [{ culture, weight }] },
}
```

A faction's or place's culture is kept in its library metadata
(`entries[id].culture`), so it moves with the entry. It all travels in world
files with the rest of the library.

## 8. Phases

1. **The engine and Generate.** `src/naming/` (the seed-language stocks,
   the Markov blend, sound shifts and mutation, a pool per name part with
   prefixes, patterns, the name registry and its piece counts, the shared
   registry, the cliché list, the presets, the phase-one kits for
   descriptive names), a world default with a blend rolled from the seed
   with no setup, and the create dialog / Name sparkle using it. Fixes the
   most common case on day one. The stocks are the biggest piece of work
   here: compiling and checking the name lists, with how common each name
   is and its era. Real-world cultures and their conventions (section 3.5)
   come with the stocks, since they are the stocks used as they are.
2. **The Naming tab.** Cultures, assignment and inheritance, sound editing,
   patterns with live samples, learning from examples.
3. **From the premise.** The model call that makes the cultures; learning
   from a canon-only world's names.
4. **Live play.** Pools and the swap rule for the director, the planner,
   events and missions; the optional narrator line.
5. **Extras.** Meanings on sheets, population mixes, the slash command.

## 9. Open questions

- **Told or chosen?** Proposed: Generate is *told* the name (the user can
  reroll); the director and planner get a small pool and the swap rule.
  Alternative: always offer the model three names to choose from - more
  fitting, but it can pick the blandest.
- **The narrator's own names** are kept (story leads). Worth renaming one
  the narrator invents in its first mention, before anything is created?
  Proposed: no.
- **How many cultures** the premise step makes by default: proposed up to
  four, plus the world default.
- **The stocks' size.** A few hundred names per language keeps the
  extension small (roughly 5-10 KB a language) and is plenty for a Markov
  blend. A user can add a language of their own as a stock file, or as a
  culture seeded only from pasted names.

## Phase 1 as built (2026-10-26)

`src/naming/`, all pure except `run.js`:

| File | What it does |
|------|--------------|
| `stocks/*.js`, `stocks/index.js` | 54 languages (about 10,700 names), most common first, with eras where names changed (medieval / modern Icelandic, Victorian English, 1920s American, pre-modern Japanese, Ottoman Turkish, imperial Chinese, classical Persian, modern Arabic and Hebrew), older family-name forms, particles, place words and endings with meanings, and street and business templates for some. 64 real-world cultures come from them. |
| `random.js`, `text.js` | Seeded rolls; folding, closeness (Kael / Kaelen) and casing. |
| `markov.js`, `mutate.js` | The weighted blend; the catalogue of sound shifts, signature endings and recombination by mutation level. |
| `conventions.js` | Icelandic genitives, Russian and Ukrainian patronymics, feminine surnames (Russian, Polish, Byzantine, Roman), and the order of parts in each tradition. |
| `kits.js` | Wilderness features, inns and taverns, shops, pirate / naval / merchant ships, companies, gangs, orders, businesses (corporations at TL6 and later worlds, merchant houses before), codenames - with grim, jolly, sea and overused tags on the words. |
| `cultures.js` | The 15 presets, real cultures, a blend for science fiction, and the world default read from the front page. |
| `classify.js` | The kind of name a brief needs, its gender, a name the brief gives, the entries it is tied to, and how: `from` (its followers, its temple, a subsidiary - named from it) or `apart` (a rival, an enemy - a name of its own sharing no word with it; unclear is `apart`). |
| `registry.js` | The registry, the cliché list, piece counts and the checks. |
| `engine.js` | `planName` (given / derived / rolled / none, best spread of ten candidates) and `namePool`. |
| `run.js` | Reads the world, records the counter and registry, the shared list across worlds, the culture picker. |

Wired in: the catalog's Generate panel has a Name box with dice, a Culture
picker and (characters) a Gender; the sheet's Name has dice in edit mode;
`generateEntry` tells the model a decided name, or asks for one built from
the entry it is tied to, and every generation prompt carries a pool for
other people and places plus the overused names to avoid. A saved new entry
marks its name used. Naming lives in the setting document (`naming`) and in
`settings.naming` (`avoidOtherWorlds`, `shared`).

Not yet: the Naming tab (cultures of a world's own, cultures on places and
factions, population mixes - so phase 1 uses the world default or the
culture picked in the Generate panel), rules from the premise, and the
director / planner / events / missions pools.

## Phase 2 as built (2026-10-26)

- **The Naming tab** (`src/ui/naming-tab.js`, after Calendar): the world
  default with why it was chosen ("\"tokyo\" on the front page") and what
  Automatic would pick when the user chose another; the world's own
  cultures, made from a preset, a real culture, from scratch or as an alien
  tongue; who uses which (places and factions); sample names per kind
  (click to copy, the cross bans), rolled from a sample stream so nothing is
  used up; and a test bench ("a rival corporation" in this culture).
- **The editor**: name and notes; seed languages and weights; how far from
  the real names (mutation 0-3) with its sound shifts shown in words and a
  reroll; family names from the same languages, others, or made like place
  names, with their own mutation and older forms; the user's own example
  names and their weight; for a real culture, which one; for an alien
  tongue, its consonants, vowels, syllable shapes and length; how it names
  each kind of thing (its own tongue, descriptive English, either); banned
  names; delete.
- **Cultures on places and factions**: entry meta `culture`, set on the
  Naming tab or a sheet's "Names (culture)" field. A new thing takes the
  culture picked in the Generate panel, else a faction it belongs to (its
  fields, or one the brief names it as coming from - not a rival), else the
  place it is in or the nearest above with one, else the world default
  (`inheritedCulture`, `cultureIdFor`).
- Stored as `naming.cultures[id]` (`normalizeCultureDef`): a culture's
  shifts are kept once rolled, so editing it does not change its names.

Not yet: population mixes and meanings on sheets (phase 5); editing a
culture's word stock (place words come from its stocks); "keep" on a
sample (copy it instead).

## Phase 3 as built (2026-10-26)

- **From the premise** (the Naming tab's card under World default,
  `src/naming/premise.js`, runner `proposeCultures` in `naming/run.js`):
  - **The call.** One model call, on a button, with an optional line to
    steer it.
  - **What goes in:** the front page, the top two levels of places, the
    factions, the people's names and the cultures already made.
  - **What it chooses from:** the presets, the real-world cultures by
    language and period, the seed languages, and an alien tongue for an
    inhuman people.
  - **What comes back:** a plain block per culture (`CULTURE / WHO / BASED
    ON / DISTANCE / FAMILY NAMES / PLACES / USED BY / DEFAULT / SOUNDS`),
    up to six.
  - **How the answer is read.** Forgivingly: markdown, bullets,
    lower-case keys and "Key - value" all work. A language not on the list
    is dropped. A missing recipe gets a rolled language. "Icelandic,
    modern" is the real culture, while "Old Norse 3, German 1" is a blend.
    Only one culture can be the default.
  - **What you see.** Each proposal shows its recipe in words, its places
    and factions, any names it gave that are not in the world, and sample
    men, women and towns, rolled without using anything up. Tick the ones
    you want and "Add the ticked cultures".
  - **What adding does.** Its places and factions use it, except one that
    already has a culture. The default becomes the world default unless
    you chose one.
  - **No model names.** The model never names anything: every name is
    rolled here.
- **Learn from this world's names** (`learnFromWorld`):
  - **What it does.** Each of the world's own grown cultures takes the
    names already under it as examples: its places and the places inside
    them, its factions, and the characters living there or belonging to
    them.
  - **The default culture** also takes the names that are under no other
    culture.
  - **What counts as a name.** People count by their names, places and
    factions by their distinctive words ("Skarn" from "the Iron Market of
    Skarn").
  - **What it never does.** The names are never handed out themselves,
    and nothing is added to any entry.
- **A canon-only world:**
  - The prompt says its names are canon and the cultures must sound like
    them.
  - Each proposal learns from its users' names before you add it.

Not yet: offering the call when a world is made (it is on the Naming tab
only); word pools for descriptive names per culture; peoples in the same
call (docs/DESIGN - PEOPLES.md, phase 3).

## Phase 4 as built (2026-10-26)

`src/naming/live.js` (pure), runners `livePoolFor` / `takeFromPool` in
`naming/run.js`, `rollPool` in `engine.js`. No extra model calls.

- **The pool.** Two men's, two women's and two places' names, rolled for
  the culture where the story is (the scene's place, or a giver faction's
  own), kept in the world's naming document (`naming.pools`, per culture)
  and topped up only as names are used. A pool name the world has taken
  since is marked used and replaced. Pool names are "offered" in the
  registry until used.
- **Who gets it.** The director (when it may add things), every GM planner
  pass that invents (outline, beat, day, ideas - in the dossier), the event
  generator and the mission writer, as one line: "Names for anyone or
  anywhere new that needs a name: people - ...; places - .... Use these
  rather than making up a name; a name built from one the world already
  has, or a plain descriptive one, is fine too." Never in a canon-only
  world.
- **The swap rule** (`inventedName`, `swapInvented`, `applySwaps`):
  - **What is swapped:** a new **person** whose name (titles aside) is one
    to three made-up words, and a new **place** of one or two made-up
    words. A made-up word is one that is not plain English: not in the kit
    word pools, the kinds classify.js knows, a short list of common words,
    or two of those run together ("Ashfall" stays, "Skarnhold" goes). An
    overused name (the cliché list) is swapped whatever it is made of.
  - **What stays:** a name in the chat, in the notes the model was shown
    or in any entry's description; a name built from a world name (Kaelen
    from Kael, Vaskaro from the Vaskari); a descriptive name ("The
    Eyepatched Man", "The Rusty Anchor"); a place with a plain word in it
    ("Varyn Keep"); a person's name with a group or place word in it (a
    faction taken for a client); someone unnamed; and every faction, lore,
    event, quest and item.
  - **How:** a woman's name for someone the description makes a woman, a
    man's for a man; a place the director adds is rolled in code for its
    own description (a nightclub gets a club's name, "Zyrex" becomes "The
    Kingfisher Club" whole), the pool's towns only when that fails; a title is kept ("Captain Zyrith" -> "Captain Vodri
    Skarheim"). The text is changed to match - the whole name, each part
    and its possessive ("Zyrith's" -> "Vodri's"); a patronymic or an
    epithet ("Imanini, son of Ashvattha", "Mahi the Tall") is called by its
    first word.
  - **Where:** the director's NEW character and location lines, before
    they are created, with the briefing, summary, direction, situation,
    MOVE place and ENTERS names changed before the narrator sees them; a
    tournament's entrants and an arena's opponents (and the event's name,
    opening, close and prize); a mission's client, and its target when the
    task speaks of the target as a person (and the job's name, task,
    reward, objectives and ends). The planner's ideas are steered by the
    pool but never rewritten: they are text the user reads, and whoever
    they bring in is made through the director.
- **The narrator** (off by default): a guidance section, "Names for anyone
  new", lists the pool for the narrator: "[If someone or somewhere new
  needs a name, use one of these: ...]". Whatever it writes is the story's.
- **Settings:** "Name new people and places from the world's cultures"
  (`settings.naming.live`, on) and "...and offer them to the narrator too"
  (`settings.naming.narrator`, off), under the game master's options.

- **People of a later age** (found while testing the pools): no one in a
  modern or later world gets an English epithet ("the Tall", "Ironhand") -
  only a real culture's own bynames, where it has them. The science-fiction
  blend gives a given and a family name, whatever its lead language does
  (Hawaiian's one name, Sanskrit's "son of").

Not yet: the narrator's own first mentions are never renamed (open
question, proposed no); a swapped place written mid-sentence keeps its
capital "The".
