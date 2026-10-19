# Roadmap - deferred work

What is deliberately not built yet, so we can circle back. Requirement IDs
refer to the [requirements specification](SCENARIO%20BUILDER%20REQUIREMENTS%20SPECIFICATION.md).
Newest decisions first in each section.

## The user's priorities (2026-10-19)

From a review of what is left, in the user's words where it matters:

- **Under way:** people mentioned are not people present ("Graxx's men"
  brought Graxx back); events that fire on conditions, built on State
  Engine's prompted and calculated variables (Scenario Builder makes them on
  the fly, checks now and then whether any has borne fruit, and retires
  them - flags especially); a toggleable "think after each reply" mode for
  the game master.
- **Under way (2026-10-19):** perspective - people know only what they
  witnessed or were told ("Graxx keeps talking about Remus's divine power
  before he ever saw it"); "an impressive feat" if done well. A standing
  narrator and director rule, Archivist recording who was present for every
  memory (a dream, vision or thought only for the one who had it), and the
  director told, per person here, what they did not witness - no extra
  call. See the Perspective item below.
- **Wanted:** current descriptions updated from the story ("would be
  amazing"); revert an enrichment, a field or all of it ("I need to be able
  to"); a contextual place lookup - "the ruins" should find "Roadside
  Ruins" when that is where the story is, without taking the temple ruins
  they are heading for (aliases alone do not do it).
- **Nice to have, can wait:** an image gallery per entry (goes with updated
  descriptions: before and after pictures).
- **Not wanted:** a status line in the chat - Pretty Panels shows the state
  in full. Shift-drag for map routes is fine as it is.
- **Cost:** every extra model call per reply must earn its place and be
  switchable; the user streamlined State Engine for the same reason.

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
- [ ] Revert a single enriched field or a whole enrichment (SB-133b); protect
  user-edited fields from later automatic writes by tracking edits per field
  (SB-128 - today enrichment only ever writes empty fields).
- [ ] Full world generation in dependency order with per-object review
  (SB-139: overview -> locations -> factions -> characters -> ...); seeded,
  repeatable randomization (SB-139c); a world definition with main
  characters from personas/cards (SB-139a).
- [ ] Temperature per generation (needs the connection profile's own
  setting today).
- [ ] Suggesting a current description from Archivist memories ("the docks
  burned - update the description?").

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
- [ ] Narrative and structured lorebook export with round trip (SB-160..164).
- [ ] Lore-sourced memories for Archivist (SB-154, OPEN-14 - needs an
  Archivist design).

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
  - Still open: chats extracted before this have almost no witness data
    (God War: 6 of 867) - a re-extraction would fill it in; things a person
    was told are only detected from later memories' wording; POV modes.
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
- [ ] Events firing on deterministic conditions (SB-435).
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
