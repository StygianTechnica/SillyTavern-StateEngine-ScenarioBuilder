# Roadmap - deferred work

What is deliberately not built yet, so we can circle back. Requirement IDs
refer to the [requirements specification](SCENARIO%20BUILDER%20REQUIREMENTS%20SPECIFICATION.md).
Newest decisions first in each section.

## The user's priorities (2026-10-19)

From a review of what is left, in the user's words where it matters:

- **Done (2026-10-19):** people mentioned are not people present ("Graxx's
  men" brought Graxx back); events that fire on conditions, built on State
  Engine's prompted and calculated variables (story triggers, SB-435 below);
  a toggleable "think after each reply" mode for the game master.
- **Done (2026-10-22):** perspective - people know only what they
  witnessed or were told ("Graxx keeps talking about Remus's divine power
  before he ever saw it"). A standing narrator and director rule, Archivist
  recording who was present for every memory, the director told per person
  what they did not witness, what the player tells the people with them
  taken as known from then on, a point-of-view setting, and a pointer to
  Archivist's rebuild for chats with little witness data - no extra call.
  See the Perspective item below.
- **Done (2026-10-22):** current descriptions updated from the story ("would
  be amazing") - src/state/changes.js; see Generation below.
- **Done (2026-10-20):** revert an enrichment, a field or all of it ("I need
  to be able to" - src/generate/revert.js); a contextual place lookup -
  "the ruins" finds "Roadside Ruins" when that is where the story is, not
  the temple ruins it is heading for, plus a suggested parent on a place
  with none (src/library/place-context.js); death is remembered
  (src/state/death.js); missions and jobs (src/quests/missions.js).
- **Done (2026-10-22) - the reason these extensions exist:** guardrails
  for the model to run a sequenced event or process in a roleplay: an arena,
  a tournament with rounds and a grand final, a dungeon crawl, a programme,
  missions and jobs. See Structured events below.
- **Nice to have, can wait:** an image gallery per entry (goes with updated
  descriptions: before and after pictures).
- **Not wanted:** a status line in the chat - Pretty Panels shows the state
  in full. Shift-drag for map routes is fine as it is.
- **Cost:** every extra model call per reply must earn its place and be
  switchable; the user streamlined State Engine for the same reason.

## Getting started (added 2026-10-25)

Setting up a new chat on a new setting, perhaps with a new panel layout, is
clunky today - the user's words: people would "get upset and unhappy with
how the different extensions work". The process needs refining so a new
user can get started easily.

- [ ] **A start-up wizard in Scenario Builder** that makes sure everything
  is lined up the way it ought to be: the setting, its presets active in
  State Engine (Scenario State and the rest), Curator placement, Archivist,
  the panel layout in Pretty Panels - checking each and offering to fix
  what is missing or wrong.
- [ ] **The panel layout check, at start-up:** whether the layout in use
  reads State Engine's own preset variables or Scenario Builder's sb__
  ones (Scenario State) in its state preset. If it uses State Engine's,
  suggest changing the preset to Scenario State - or offer to fix it for
  the user.
- [ ] **A new setting opens on the catalog's front page.** When a setting
  has never been opened in the workspace, start on its front page (the
  overview), not the last tab and chapter remembered - that is where you
  should start filling in the setting's details, and it took the user a
  while to find it.
- [ ] **A default Pretty Panels layout** that reliably shows Scenario
  Builder's state values (sb__canon_*, sb__cast, sb__quests, sb__fight_*,
  sb__event_*...) rather than State Engine's own. Start from the user's
  "Scenario Builder Test" layout (they are making a variation of it now).
- [ ] **State Engine change:** send an event when the active presets change,
  so attached extensions can refresh what is available (and what is not).
  Today Pretty Panels' variable dropdowns do not update when presets are
  switched on or off in State Engine - it shows up when setting up a new
  setting. Pretty Panels (and Scenario Builder, where it lists variables)
  then listens for it.

## Decisions that change the spec

These came after spec v0.5 and should be folded into its next revision.

- **The story leads.** Validation no longer holds the story back by default:
  everything the roleplay establishes is accepted into the scene. This
  replaces the spec's conservative defaults (SB-222 "ask" for location/cast).
  "Canonical" and "ask" stay available per field.
- **Confirmation belongs to State Engine.** New objects the story names are
  confirmed (or resolved as aliases, merged, deleted) in State Engine's own
  object review - its "New ... detected for review" notification and the
  object manager Pretty Panels registers. Scenario Builder does not repeat
  that step, and has no candidate queue of its own any more (replaces SB-225).
  Once an object is confirmed, **intake** takes it into the library: tracked,
  a new place put next to where the scene came from, listed in Review → *New
  in the setting*, and **auto-enriched** (empty fields only) when that is on.
  Scenario Builder's own State Engine notification covers only that list and
  any open questions; its button opens the Review tab.
- **Magic and technology are described separately** (replaces one "tech or
  magic level", SB-139a). Magic: which kinds exist, which kinds do NOT exist,
  how widespread, how powerful, **rules that restrict it** (after GURPS
  Magic's restrictions: low mana, ritual or ceremony required, power ceiling,
  social limits, outlawed, costly... plus the user's own), and free prose. Technology: level on a GURPS-style
  TL0-TL15 scale (TL8 added for the information age; suggested from the era
  until the user picks one; each level's defining examples go to the model), flavour, how it is spread and
  understood (e.g. adopted from outside and not understood), what does not
  exist, and prose. What does not exist is a **hard limit**: stated
  separately in every generation prompt and kept in the guidance even when
  the overview is shortened.
- **Canon only.** A setting can be marked canon-only (front page switch) for
  fixed, published canon. Then no generated detail is added to its entries,
  and the story's inventions wait in Review instead of being adopted. Single
  entries can be **canon-locked** (GM notes tab). The check every future
  generation write must pass is `library.mayAddGeneratedDetail()`.
- **Current description.** Each world object can have a per-chat narrative
  description that replaces its base description in the guidance and in
  image prompts, for when the story has changed it (the forest burned down).
  The base description in the setting is never changed.
- **Images come from outside.** Scenario Builder never generates images. It
  writes prompts (Midjourney first) and takes pictures by upload, paste or
  URL. It can also ask SillyTavern's Image Generation extension for one.
- **The workspace is its own window.** It doesn't close on an outside click or
  on Escape, and it keeps keystrokes away from SillyTavern's shortcuts. It can
  be minimised to a pill.

- **Scenario Builder is the GM brain; the guidance is narrative.** Before
  each reply a game master (src/director/) reads the recent chat and the
  scene and writes the narrator a prose briefing: where things stand, what
  the people present want and will likely do, what should probably happen
  next, what to show. It leads sb__guidance; the rest of the guidance is the
  scene written as prose, not lists. It adds the rooms, people and items the
  scene needs (rooms under the current location, things placed in it) and
  fleshes out a thin location or cast. The briefing is model output, so the
  guidance is no longer byte-deterministic (SB-015 now covers everything
  except the briefing). The reply waits for it up to a timeout, and the
  previous briefing stands when it is late. The guidance is meant to replace
  world-info entries, so the token budget default is now 2000.

- **Scenario Builder keeps the clock and the scene.** It is the authority for
  the canonical state: time on the setting's State Engine calendar (fantasy
  calendars included), part of day, simulated weather and temperature
  (climate zone per region, season, fronts that last), who is present and what
  is in the scene (items, creatures, active quests, relevant lore, events).
  Canonical values are deterministic and written only by Scenario Builder;
  the prompted `sb__scene_*` variables, `sb__scene_deltatime` included, are
  observations checked against the story. Time moves on before each reply
  by what the director says the reply covers (TIME line; per-turn default
  otherwise) and catches up afterwards when the story narrates a bigger skip.
  A weather the story sets (story leads) holds for two watches, then the
  simulation resumes. Scenario State (preset v3) is self-contained -
  calculated flags included - so Scene Context can be switched off, and it is
  meant to replace the reactive state shown in Pretty Panels.
- **The player character is never written for.** One character per setting
  is marked the player character (else the one named like the persona). The
  guidance and the director's briefing are about the other characters and
  the world; the player character's line says only who they are.
- **Characters present is its own output** (`sb__cast`), concise, so it can be
  placed above the guidance in Curator.
- **The director adds only what is relevant** - enforced in code: a new
  thing (any kind: place, person, creature, faction, lore, event, item) must
  be brought up by the last few messages, or be tied by name to a person,
  place, faction or open thread the setting already has (a plot point that
  grows out of what is there); items only for plot points. What it is tied
  to becomes its related entries; every type can be added (quests start
  active). Its dossier carries the factions at play, the lore that matters
  here, events, earlier scenes, and every other entry of any type the chat
  names or that is tied to the place or the people present ("Also
  relevant") - one short line each, which the briefing folds into its
  narrative in a few words rather than listing.
- **People known only by a description** ("a man with an eyepatch") who
  take part in the scene are added under a descriptive name ("The
  Eyepatched Man"), marked provisional; when the story names them the
  director's RENAME line renames the same entry, keeping the description as
  an alias, so what they did and said stays theirs. State Engine's detection
  also brings such people in by a short description.
- **The guidance runs from the general to the immediate:** setting, world
  rules, threads followed, the scene, then the game master's summary and,
  last, where the reply should go (the briefing's "Next:" paragraph). The
  director's own input is ordered the same way, and its instructions are
  prose, not a numbered list, so the briefing does not come out formulaic.
- **Items only when they matter.** A named item takes on weight with the
  model and pulls the scene toward it, so the director describes ordinary
  objects in prose and adds an item only for a plot point or an open thread
  (it must say which; enforced in code: the item ties to an active quest, or
  the player named it outright). The guidance lists items here as "should the
  scene turn to them", not as things to reach for.
- **The guidance also comes in six parts**, each its own variable
  (`sb__guidance_setting`, `_rules`, `_threads`, `_scene`, `_summary`,
  `_direction`), so each can be placed, read and tuned on its own in Curator;
  `sb__guidance` stays the whole.
- **Dates follow the setting's calendar.** The calendar is kept on the State
  Engine setting, and `sb__canon_datetime` uses State Engine's "@setting"
  calendar, so each setting's chats show their own (fantasy) dates with
  nothing rewritten when chats change.
- **No wait before the message is taken.** For a send, the work before a
  reply runs on USER_MESSAGE_RENDERED (after SillyTavern posts the message,
  before it builds the prompt) instead of GENERATION_STARTED.

## Catalog UI (iterating - "a fun place to do worldbuilding")

- [x] **Graph view** - done (`ui/graph.js`, `ui/graph-layout.js`): a Graph
  workspace tab and a Book/Graph toggle on the front page; type and "in play
  only" filters; drag to pin (saved per setting), pan, zoom, hover to light
  up neighbours, click to open a sheet.
- [x] Graph, next - done: drag between two nodes (Link tool, or Shift) to
  link them - a reference field that fits either way, a route between two
  places (travel time guessed), or a relationship; Archivist's relationships
  as "In the story" edges (a relationship the user wrote for the pair takes
  their place); edge labels on the canvas ("Labels"; a lit node's always
  show); pinch-zoom on touch screens; "Group by region" gathers everything
  under its top-level place in a labelled box.
- [x] Relationship editing on the sheet: links in reference fields removed
  (x) and added; authored relationships (ally, rival, family, mentor... or
  your own words, with a note, one-way or mutual) kept as Scenario Builder
  metadata (SB-110, SB-112); "Correct it" on a story relationship writes your
  own version, which takes precedence in guidance and generation (Archivist
  itself is never written, SB-005).
- [x] Show authored relationships as edges in the graph view.
- [x] Relationships from Archivist's compiled memory (dossiers): shown on the
  sheet, given to generation, and - between the characters present - in the
  guidance's cast lines.
- [ ] Image gallery per entry, perhaps using State Engine object *variants*
  (each variant can carry its own image), so a place can have "before" and
  "after the fire" pictures.
- [ ] Groups (SB-122: "Act I", "Harbor District"), multi-select bulk
  operations (SB-125), an "in play / recently used" view (SB-121).
- [ ] **Tags, filters and sorting in the catalog (added 2026-10-21).** Today a
  chapter has a search box, ONE tag filter, a status filter (in scene / in
  play / unused) and "within a place"; sorts by name, recent or status;
  tags are typed on the sheet as comma-separated text. Wanted:
  - Quick filters for what Scenario Builder already knows: powers only,
    the dead only (this chat), active characters (in the scene or in play)
    and inactive ones, the player character, canon-locked, made by the
    story or the director, generated and not yet reviewed.
  - Filter and group by faction membership (a character's Factions, a
    place's), and by any field - "Role is guard", "Danger is high".
  - Sort by faction, by a field, or by a key the user defines.
  - A proper tagging system: tags picked from the setting's own list
    (autocomplete, colours), added to many entries at once (with SB-125's
    multi-select), shown as chips on cards, several tags combined in a
    filter (all of / any of / none of).
  - User-defined keys: the user's own fields for sorting and filtering
    ("Act", "Allegiance", "Threat") - probably State Engine baseline
    fields added on request (SB-102), so they also reach the guidance.
  - Saved filters ("my villains", "Act II cast") per setting.
- [ ] Drag-and-drop re-parenting in card/list views (only the tree has it now).
- [x] Location connections with travel time (SB-111): routes on a location's
  Details tab, in the guidance, the director's dossier and the graph; a move
  along a route (or between the places the ends are in) moves the clock on
  by its travel time.
- [x] Suggested routes: on a location with places inside, the model connects
  them with routes and travel times that fit their scale and the world's
  technology; the user keeps the ones they want.
- [x] A place's climate can be rolled at random (dice) or written to fit it
  (wand, steerable), in edit mode on the Environment card.
- [x] Guessed routes: a move between places no route connects adds one,
  marked a guess, with a travel time from the places' scale (room, building,
  settlement, region, country) and the world's technology; the clock moves
  on by it. Edit the time in place on the sheet to make it yours; the add
  form starts from a guess too.
- [ ] Routes: locked or hidden ones, and travel time by means (on foot, by
  cart, by ship).
- [x] Merge two entries from the catalog (SB-113 merge path): "Merge…" on a
  sheet suggests likely duplicates by name (any type) or searches the library;
  same type merges through State Engine (aliases, empty fields, references),
  different types add the duplicate's names as aliases and remove it.
  Scenario Builder's own data follows (src/library/merge.js).
- [ ] Undo for deletes (SB-127; needs a tombstone, since State Engine ids
  cannot be recreated).
- [ ] Keyboard navigation (arrows through cards, Enter to open, E to edit).
- [x] Remember the window's last tab and chapter across reloads (not the open sheet yet).
- [x] Map-like outline for locations (SB-141): the Locations chapter's Map
  view, one level at a time (the top-level places first; click a place to
  go inside, the breadcrumb to come out); places dragged to where they lie;
  routes drawn with their travel times. The routes whose time the user set
  give the level a scale, and each guessed route shows what the map says it
  takes - "Apply map estimates" writes those in. Shift + drag between two
  places adds a route.

## Pretty Panels integration (added 2026-10-19)

Easier access to Scenario Builder from Pretty Panels' panels. Only when
Scenario Builder is installed: Pretty Panels looks for
`window.StateEngineScenarioBuilder` (src/public-api.js, the way it already
finds Archivist in its src/chat/archivist-link.js) and shows none of this
without it. Scenario Builder offers the actions as callbacks on its public
API (docs/api.md, SB-640..642); Pretty Panels owns where they appear.

- [x] **Object clicks open Scenario Builder.** Done 2026-10-21: Pretty
  Panels opens the object through its provider's openEntry (Scenario
  Builder's public API), setting "Open objects in Scenario Builder" (on).
  Was: With Scenario Builder
  installed, clicking an object card opens its Scenario Builder page (the
  catalog sheet, `openSheet(entryId)` in src/ui/ws.js), not the State Engine
  / Pretty Panels object modal. Pretty Panels needs a replaceable "open
  object" callback that Scenario Builder registers; without it, the old
  modal. Perhaps a setting to keep the old modal.
- [x] **Buttons on character cards.** Done 2026-10-21: Pretty Panels'
  Action Button element (palette: "Action", and a "Scenario Builder" row
  with each action ready to drop); on a card template it acts on the card's
  object. Scenario Builder offers open, leave (the scene), map, workspace
  (getActions / runAction). Was: Actions to put on a character's card:
  remove them from the scene (as a LEAVES would - out of the canonical
  cast) and go to their page. Positioned by the user like any other field:
  a "Scenario Builder" tab in Pretty Panels' drag-on palette lists what
  Scenario Builder makes available, but the buttons belong to the object
  (each one acts on that card's entry).
- [x] **Map in one click.** (the "Open the map" action) A button that opens the Locations map
  (`openLocationMap()` in src/ui/catalog.js).
- [ ] Nice to have: a **mini map** panel element - a small version of the
  map view with a pip per location, hover for details (name, what is
  there, who is there, travel time from here), click to open its page.
- [x] **Fight status in a panel (added 2026-10-20).** Done 2026-10-21:
  sb__fight_active, _round, _summary, _fighters ("Graxx (foe) - wounded"),
  _allies and _foes (character objects, for cards); preset version 13. Not
  yet: a condition per card (needs a runtime field on the object). Was: Expose the fight
  tracker (src/director/fight.js, the chat document's `fight`) to State
  Engine as Scenario Builder variables, written like the other canonical
  values (src/guidance/sync.js): e.g. `sb__fight_active` (a flag, for
  showing a panel only during a fight), `sb__fight_round` / the reply
  limit, and the fighters with their side and condition (a list, or an
  object per fighter so a card can show a condition bar or icon). Then a
  Pretty Panels layout can show the fight while it runs.

## World definition

- [x] Per-place world (for science fiction and multiverse settings, or a
  dead-magic land in a fantasy one): a location's "The world here" card sets
  its kind of world, magic, technology level and how it differs; the places
  inside inherit what they do not set. The guidance, the director,
  generation, image prompts and route times all work from the world as it
  holds where the scene (or the entry) is.
- [ ] Per-faction magic and technology (a technologically advanced empire
  next to a backward one, carried by its people wherever they go).
- [x] Image prompts that respect world limits (e.g. Midjourney `--no` with
  absent magic or technology).
- [ ] Final enumerations and custom values (OPEN-15).

## Images

- [ ] **AI-refined prompts.** Have the chosen connection profile rewrite the
  templated prompt into a richer one per provider (Midjourney syntax, multi-
  prompt weights `::`, `--cref` for character consistency). The current
  prompts are deterministic templates.
- [ ] User-defined style presets (save your own style words and Midjourney
  parameters as named presets), per setting as well as global.
- [ ] More providers: Flux-specific phrasing, NovelAI tags, Ideogram.
- [ ] Per-type aspect ratio overrides in the UI (defaults: portraits 2:3,
  places 16:9).
- [ ] Confirm the Image Generation hand-off against the current SillyTavern
  release. It calls `/imagine quiet=true <prompt>` through
  `executeSlashCommandsWithOptions` and uses the returned path. That needs
  testing in a live install.

## Generation (spec 6.4)

Done: per-field write/enrich, Fill empty, Enrich all, Generate a new entry
(from a brief or a surprise, optionally placed), front-page writing and
dice for world type / magic / era / tone / themes, automatic enrichment of
newly confirmed objects, a separate generation connection profile.

- [x] **State Engine change (done, uncommitted in that repo):** a public JSON
  API, `parseModelJson` / `parseModelJsonArray` (spec section 25), so
  Scenario Builder reads answers with State Engine's own repair.
- [ ] **State Engine change:** expose its background-LLM call (with the
  per-connection queue) through the API, so generation shares State Engine's
  queue instead of running beside it. Today `src/generate/llm.js` calls the
  Connection Manager / `generateRaw` directly - the only file to change.
- [ ] Seed a group of related objects in one go (SB-130d: "a district with
  its places, people and a faction"); "add rooms to this inn" (SB-144).
- [ ] Show and edit the context a generation used (SB-131 "the user can see
  and edit what context was used"); a token budget for context.
- [ ] Integrate taken-in objects "into the story in some way": suggest hooks,
  links to existing factions and places, or a quest the newcomer could carry.
- [x] Revert a single enriched field or a whole enrichment (SB-133b) - each
  enrichment (background, or saved from the sheet) is recorded with what
  each field held before; the Overview tab's "Generated detail" card puts a
  field or all of it back, asking first when it was edited since
  (src/generate/revert.js).
- [ ] Protect user-edited fields from later automatic writes by tracking
  edits per field (SB-128 - today enrichment only ever writes empty fields).
- [ ] Full world generation in dependency order with per-object review
  (SB-139: overview -> locations -> factions -> characters -> ...); seeded,
  repeatable randomization (SB-139c); a world definition with main
  characters from personas/cards (SB-139a).
- [ ] Temperature per generation (needs the connection profile's own
  setting today).
- [x] Suggesting a current description from Archivist memories ("the docks
  burned - update the description?") - src/state/changes.js: after each
  reply (and when Archivist's memories change) the memories are read for a
  change of the thing's own kind near its name - a place burned, rebuilt or
  overrun; a thing broken or reforged; a group scattered or taken over; a
  person scarred, maimed or crowned - never one only threatened or planned,
  never the player character; a chat's first look takes only its latest 40
  memories. No call to find them. Review lists them ("Changed in the
  story"); "Write how it is now" is one call that rewrites the description
  for what the story did, to edit and use as the current description (the
  setting's own stays). Settings: offer them (on), write them at once (off,
  one call each).

## Lorebooks (spec 6.6, 6.7 - phase 0.4)

Done: the Import tab - choose books, entries matched to existing objects
(title, keys, aliases, or an earlier import of the same entry) fill their
BLANK fields; unmatched entries are classified and created; extraction uses
only the entry's words; a plan to review before anything changes; options
to canon-lock what the import touches and mark the setting canon-only;
places put inside the place an entry names; `origin: 'import'` and the
source entry recorded (SB-155). It runs on Scenario Builder's own model
calls (one entry at a time, retry, and the entry text as a fallback).

- [ ] Run large books on State Engine independent presets (resumable across
  reloads, SB-157) instead of in-page.
- [x] Undo a whole import (the last 10 are kept on record): deletes what it
  created, puts back the blank fields it filled.
- [x] Links only to objects an entry actually names (a small model copying
  the candidate list made everyone a member); the entry's title is its name.
- [ ] Re-import that updates entries an earlier import created (today it
  only fills blanks again).
- [ ] Change an entry's kind in the plan (today: untick it, or fix the type
  after import).
- [x] Relationships from lorebook text: links to the names an entry gives
  become authored relationships (undone with the import).
- [x] Entries that list many things (a pantheon, a roster): split into one
  object per named thing.
- [ ] Memories from lorebook text (SB-153/154, OPEN-14).
- [x] Narrative lorebook export (SB-160, SB-164): Worlds tab, "A lorebook for
  plain SillyTavern" - one entry per object, the overview as a constant
  entry, GM notes and excluded entries left out by default; from the world
  as it is or from any starting point; always a new book (SB-162).
- [~] Structured export with round trip (SB-161): the world file (Worlds tab
  - download / load) carries State Engine's setting export and the library
  document, with a format and version (SB-163). It loads as a NEW world;
  it does not yet update an existing one or ask about id conflicts (SB-126).
- [ ] Lore-sourced memories for Archivist (SB-154, OPEN-14 - needs an
  Archivist design).

## Worlds and playthroughs (added 2026-10-21)

Done: the Worlds tab (src/worlds/, src/ui/worlds-tab.js).
- [x] Starting points: "Original" kept on its own the first time a world is
  played from a fresh chat (before the first reply); "Save the world as it
  is now" any time. Kept as files in user/files; download, rename, delete.
- [x] Start over: a new playthrough (a State Engine setting copied with
  importSetting - new ids, references kept) and a new chat on it. The old
  playthrough is untouched. A world played before it had a starting point
  can start over without the entries the story or director added (edits to
  the user's own entries cannot be told apart, so they stay).
- [x] Delete a playthrough: type its name; optionally save the story first,
  have Archivist forget its chats (forgetChat), delete the solo chat files.
  The playthrough open now cannot be deleted.
- [x] Copy an entry (and a place's sub-places) to another world, from the
  sheet: references follow to the other world's namesakes.
- [x] A deleted chat's document is forgotten (CHAT_DELETED).
- [x] The story so far: saved with the world and chat in the file name, the
  volume under way included, from the first chronicle line.
- [ ] Undo enrichment added during play in a clean copy (needs telling
  story-time enrichment from the user's).
- [ ] Group chats: delete their files through SillyTavern's group API.

## Guidance and state (phases 0.2-0.5)

- [ ] Relevance scoring across the wider library (SB-400..402); guidance
  sections 5-7: knowledge boundaries, quests, factions/items/lore/events.
- [x] Archivist memories feed the director's briefing (the location's and
  the cast's top memories).
- [x] GM planner, phase 1 (docs/DESIGN - GM PLANNER.md): a day plan made in
  the background and kept in step with the story, the user's guidance queue,
  inspiration texts distilled into motifs, pacing that moves an idle scene
  on, a private GM PLAN section with BEAT lines, and the GM Plan tab.
- [x] GM planner, phase 2: story shapes and the tension aim from Archivist's
  readings (or the planner's own), the OUTLINE pass, and the outline with
  its tension chart (edit, lock, add, finish or remove beats; rewrite).
- [x] GM planner, phase 3: volumes - when a story ends, a narrative recap of
  it and a new volume of chapters that grows out of it.
- [x] GM planner, volumes (2026-10-22): the people, places and groups a new
  volume's steer names that the world lacks (its antagonist, the temple it
  sets out for) are made first - one call, before the recap or the outline
  reads the steer - with the user's own words as their description, a place
  inside the place the steer names, the role in GM notes, listed in Review.
  Also when the steer is edited. A switch on the next-volume panel
  (settings.planner.steerObjects, on); never in a canon-only setting.
- [x] GM planner: /sb-request and /sb-requests - queue and list requests for
  the game master from the chat box.
- [x] GM planner, phase 4: proactive ideas (quest hooks, quest detail,
  happenings, seeds) as proposals or silent per setting, and the agenda on
  the Calendar.
- [ ] GM planner, phase 5: tuning (custom shapes, per-pass budgets, how often
  planned moments land).
- [x] Director: a "think after each reply" mode (settings.director.thinkAhead,
  src/director/ahead.js) - done; per-character perspective briefings:
  see Perspective below. Was: a "think after each reply" mode (zero wait, written before
  the player's next message), and per-character perspective briefings once
  State Engine offers perspectives.
- [x] Director: people it says arrive (ENTERS) or adds as here join the
  canonical cast; LEAVES takes them out.
- [x] Secrets and oaths (part of 9.4): Archivist's compiled secrets (who
  knows them) and promises - oaths, vows, pledges, pacts (who swore, to
  whom, pending / kept / broken / released) - plus the user's own, written
  on an entry's Relations tab. Each person present is told what they know
  and have sworn; the scene gets a rule for every kept secret naming who
  here does not know it (they never act on it, hint at it or guess it);
  the director is given the same and told people act only on what they
  know. Revealed secrets and released or kept oaths drop out.
- [~] Perspective and knowledge boundaries beyond secrets (9.4, OPEN-5) -
  progressed 2026-10-19, no new model calls:
  - Narrator (src/guidance/build.js, secrets section) and director system
    prompt: people know only what they saw, heard or were told; inner
    experiences are the owner's alone.
  - Archivist: "present" is always asked for (it was optional and given for
    under 1% of memories), and `private: true` marks one person's inner
    experience - a dream, vision, thought, unspoken feeling, something seen
    alone - whose witness is only that person (src/extraction/
    memory-variable.js, converter.js, src/memory/schema.js).
  - Director (src/director/perspective.js): for each person here other than
    the player, the important recent memories about people in the scene
    they did not witness and were not told later (WHAT EACH PERSON DOES NOT
    KNOW, each memory once with who lacks it), at most 3 per person and
    settings.director.perspectiveTokens (600) in all; the briefing is told
    to say it plainly ("Varyn did not see the vision - he only saw Remus
    sleep restlessly"). Older memories with no witnesses count only when
    they read as someone's vision or dream, and not once a later memory
    shows it was told. Toggle: "Perspective" in the settings (on).
  - Done 2026-10-22: what the player tells the people with them, in their
    own messages (a telling word or speech, and the memory's distinctive
    words or its kind of inner experience), is theirs from then on
    (doc.perspectiveTold) - only the player's words count, never the
    narrator's, which is what lets things slip. A point of view (settings:
    the narrator's own, third person close on the player character, second
    person, all-seeing) given to the narrator with the perspective rule and
    to the director. The settings drawer says when few of a chat's memories
    record who was present, and points to Archivist's "Rebuild memories from
    chat", which reads the chat again and fills it in.
  - Still open: things the others tell each other (not the player) are only
    detected from later memories' wording.
- [x] Quests (9.5): made automatically from Archivist's quest seeds, goals,
  plans and hooks (plus a "Scan Archivist for quests" catch-up), objectives
  kept in step with the plan's steps, type and base priority, effective
  priority from the scene, status from the user / the story's runtime /
  Archivist with disagreements shown, "Track progress" runtime fields,
  active quests held in sb__quests so State Engine tracks them, a quest
  board, and an Active quests section in the guidance.
- [ ] Quests: a separate optional quest-only preset (SB-207) instead of
  sb__quests in Scenario State; completion/abandon conditions checked
  automatically (today they are shown to the user and the model only).
- [x] Events firing on conditions (SB-435) - done as story triggers
  (src/triggers/, the GM plan's "Story triggers" card): a story flag State
  Engine answers, a place reached, someone present, or a day coming; each
  chat has its own small preset, fired ones go to the game master once and
  their variables are deleted, and the planner arms and retires its own.
- [x] Time advancing by rules; generated weather (SB-211); a calendar model
  (OPEN-10): the clock, weather simulation, sky (suns, moons), holidays and
  the Calendar tab.
- [x] Weather the director may call for (a WEATHER line, held two watches).
- [ ] Magical weather; per-season climate overrides per region.
- [ ] Hunger and tiredness tracked per character from hours awake and meals
  (today: by the hour only).
- [ ] Status line in the chat (SB-702).
- [ ] Curator static blocks such as "Director rules" (SB-313).
- [ ] New-chat start from a character card or template (SB-504).
- [ ] Public API: `getPerspective` (SB-641).
- [ ] Ask State Engine for a `location.parent` field (SB-145, C1), then move
  the tree out of Scenario Builder's metadata.

## Combat (added 2026-10-20)

The fight tracker (src/director/fight.js) keeps each fighter's condition on
a ladder and ends a fight within a few replies. The user does not use stats
in their games, but wants combat resolution more configurable:

- [x] Settings for how combat resolves, set by the user (2026-10-25,
  src/director/combat.js; the drawer): how long fights last (as before),
  how readily foes fall (quickly / standard / slowly), how hard allies are
  pressed (spared / pressed / hard - never past failing by wear alone).
- [x] A **power rating** for monsters and people (2026-10-25, the sheet's
  "In a fight" card): minor, standard, strong, deadly. A strong or deadly
  foe takes longer to wear down, cannot be felled from fresh in one reply,
  draws the fight out a reply or two, and wears allies down even when they
  are otherwise spared; a minor one breaks quickly. The narrator and the
  director are told. A tournament entrant with no strength given takes the
  entry's rating.
- [x] Fates on entries (2026-10-25, the same card):
  - **Plot device** - in a losing fight it flees (or is driven off) rather
    than being killed; the story still needs it.
  - **Unkillable** - a character who can be beaten, hurt or captured but
    never dies: goes down alive.
  - **Mortal** - can die whatever the chat's stance.
  - A chat-wide stance (the Scene tab; a default in the drawer): anyone can
    die, allies are spared (those fighting on the player's side), or no
    named character dies (only nameless foes and creatures of a kind).
  The director's dossier lists who here cannot be killed (NEVER KILLED IN
  THIS STORY) and a DIES line for one of them is not kept; the user's own
  "Mark dead" always stands. No extra model calls.
  Not yet: a protection line in the narrator's guidance outside a fight
  (an execution, a fall) - today only the director hears it there.
- [x] **Death is remembered** (src/state/death.js). The director reports a
  death with a DIES line, or the user marks it on the sheet; the dead are
  out of the scene, listed to the director and narrator as never to be
  shown alive, and setCanonical keeps anyone but the user from putting
  them back. The user's "Bring back" (or adding them by hand) raises them.
  Added 2026-10-21: a story death remembers the reply it happened in, and
  deleting, swiping or editing that reply undoes it (back in the scene if
  they were there; deaths the user marked stay); the director's RISES line
  brings someone back when the latest chat itself does (resurrected, raised
  as undead) - only for someone on the dead list the recent chat names.
  Not yet: swiping BACK to the reply with the death does not mark it
  again; the planner's own prompts.
- [x] **Creatures: one being or a kind** (src/library/creature-form.js). One
  being (a pet, a mount, a familiar, a unique monster) behaves like a person
  in the scene and can die; a kind (zombies, wolves) has a count in the scene
  (ENTERS | 3 zombies, DIES | 2 zombies), leaves at none, and fades out when
  the story stops naming it. Guessed from the name, set on the sheet.
- [x] **Fights broken off** are paused, not counted down, while nobody fights;
  wounds are remembered a while, so a fight taken up again goes on from them.
- [ ] (Future) Optional **stats** for characters, creatures and combat, for
  users who want them - rolled or compared by Scenario Builder rather than
  left to the model.

## Structured events (added 2026-10-20)

The user's original motivation for these extensions: guardrails so the model
can run a sequenced event or process inside a roleplay chat. The GM planner
(outline, beats, coming moments) and story triggers come close, but they are
loose guidance - nothing holds the story to an order of steps, keeps count,
or knows when a step is over. Four kinds it must be able to carry:

1. **A tournament** - rounds, a bracket of entrants, winners going on, a
   grand final.
2. **A dungeon crawl** - rooms or levels in order (or a map), each with what
   waits there, cleared as the party goes through.
3. **An arena** - opponents sent out one after another for combat, each
   fought until beaten (or the player is), then the next.
4. **Missions and jobs** - ready-to-go work handed out by a giver, again and
   again: a guild hall's board of quests fit for the character's level or
   power; a job that regularly assigns a task of its kind - an assassin's
   marks, an adventurer's quests, a thief's things to steal for pay. A team
   gets work of a different nature (taking over a property, intimidating a
   mark), shaped by who the group is, who they work for and who the
   clients are.

- [x] Missions: each has (1) a **client** - who wants it done; (2) a
  **giver** - boss, agent, guild master, guild clerk; (3) a **difficulty**,
  matched to the character's or group's level or power; (4) a **target or
  task**; (5) a **reward** for completion. Probably a kind of quest (the
  quest board, objectives and status already exist - src/quests/), with
  these as its fields. Done as quests of type "mission"
  (src/quests/missions.js); a giver's sheet has a Missions tab.
- [x] Generated to fit: the planner makes a mission from the giver (their
  trade - a thieves' guild, an assassins' order, an adventurers' hall),
  the group taking it, the clients the setting has, and the character's
  standing - the client and target drawn from the library where they fit.
  One model call when one is made; the difficulty grows with the giver's
  record (or is fixed); the offer goes to the director through the GM
  plan's queue.
- [x] Givers offer the next one: once a mission is done (or failed), its
  giver can offer a new one of its kind - on the next visit, when asked, or
  after a while (on the calendar) - so a job keeps running through a story.
  The next is written once the last has ended, and offered when they next
  meet, only when asked for work, only on a condition (a story trigger), or
  some days later (a day trigger, 2026-10-22). Difficulty grows, is fixed,
  random, or follows the story's tension. A board (2026-10-22): a giver
  keeps up to six jobs on offer at once, the character picks one; none new
  while one is under way, and the board fills up again when it ends.
- [x] **Design written (2026-10-21):** docs/DESIGN - STRUCTURED EVENTS.md.
  **Phase 1, the arena, built:** set up in the GM Plan (Event card) -
  opponents in order, an opening and a close, a prize; the director sees
  the stage under way only (THE EVENT) and the narrator the same, shorter;
  a bout ends with the fight tracker (foes down or fled: won; a foe won:
  lost - which ends the arena); moments last one reply; the user can mark
  won / lost / skip or end it; stages keyed to the reply count, so swipes
  never move it on twice; sb__event_* for panels. No extra model calls.
  **Phase 2, built 2026-10-22:** the tournament (a bracket drawn round by
  round, the other matches decided off screen by the entrants' strength with
  the event's own seeded roll and reported in a moment, an optional wait
  between rounds on the clock, the grand final), the dungeon crawl (rooms
  are places; the room the scene is in is the stage, followed through the
  director's MOVE; foes beaten, a puzzle or trap cleared by a story trigger,
  treasure taken once a room is left; ways on from the routes; the final
  room ends it), the programme (moments, bouts and waits from lines), wait
  stages, templates per world, generated events (one call), dated events on
  the calendar's agenda that begin by themselves, and the planner's ideas
  pass proposing an event the story points to. sb__event_kind and
  sb__event_bracket for panels (preset version 14).
- [x] Design first (was): what an event is (stages in order, or a graph of
  stages), what each stage holds (who or what is faced, its place, what
  ends it - a win, a loss, leaving, a day), the state it keeps (round,
  bracket, opponents left, rooms cleared) and what follows a win or a loss.
- [x] Planned-out parts (2026-10-22: wait stages hold a stage until a time on
  the clock; dated events): an event runs like a programme - an introduction
  (the herald, the crowd, the entrants presented), its stages with their
  timing on the clock and calendar (round one at noon, the final the next
  day, rests between bouts), the moments between them, and a close (the
  victor crowned, the prize, the aftermath). A tournament or arena is
  mostly a timeline of these.
- [x] Dungeon crawls (2026-10-22, the crawl in src/events/model.js): not a timeline but a series of
  events in an environment the party moves through - places linked to one
  another (the location tree and routes may carry it), each with what waits
  there, entered in any order the routes allow, with state kept per place
  (cleared, looted, a door opened, something still lurking).
- [x] Guardrails: the director and narrator see the current stage only and
  are told what it is and what ends it; the story cannot skip ahead,
  repeat a stage or invent the next opponent; the stage moves on only when
  its end condition is met. Likely built from what exists: story triggers
  (State Engine flags answering "has this stage ended?") and the director's
  briefing, with the event's state in Scenario Builder's chat document.
- [x] Templates for the four kinds, so an event can be set up in a few
  steps and reused across chats (2026-10-22: kept per world, src/events/setup.js).
- [x] Generated events (2026-10-22, src/events/generate.js; a crawl's new
  rooms are made as places inside the dungeon, joined by routes): the user
  gives loose guidance ("a tournament in
  the capital, five rounds") and the GM planner fills in the detailed event
  (entrants, bracket, rooms, opponents, prizes) from the setting - or the
  planner proposes one on its own when the story seems to call for it.
- [x] The planner reads the story for events (2026-10-22: an "event" idea in
  the ideas pass - no extra call; taking it up writes it with one call and
  puts it on the calendar; random events stay with happenings): when the player character
  mentions one ("the tournament at midsummer"), it is put on the calendar
  (a calendar event with its date) and becomes a structured event when the
  day comes. It may also insert random events - an ambush on the road, a
  festival, a challenge - where they fit the setting and the story, within
  the director's restraint (they arise from the world, never for the
  player character).
- [x] Shown in Pretty Panels (current round, bracket, opponents left) - as
  sb__event_* variables; a layout for them is Pretty Panels' own.
- [x] Mind the call budget: no extra model call per reply unless it earns
  its place and can be switched off. (Running an event costs none; a
  generated event or an accepted event idea costs one, when made.)
