# Roadmap - deferred work

What is deliberately not built yet, so we can circle back. Requirement IDs
refer to the [requirements specification](SCENARIO%20BUILDER%20REQUIREMENTS%20SPECIFICATION.md).
Newest decisions first in each section.

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

## Catalog UI (iterating - "a fun place to do worldbuilding")

- [x] **Graph view** - done (`ui/graph.js`, `ui/graph-layout.js`): a Graph
  workspace tab and a Book/Graph toggle on the front page; type and "in play
  only" filters; drag to pin (saved per setting), pan, zoom, hover to light
  up neighbours, click to open a sheet.
- [ ] Graph, next: draw an edge between two nodes to create a reference;
  Archivist relationships (allies, rivals, family) as edges; edge labels on
  the canvas; pinch-zoom on touch screens; group/cluster by region.
- [x] Relationship editing on the sheet: links in reference fields removed
  (x) and added; authored relationships (ally, rival, family, mentor... or
  your own words, with a note, one-way or mutual) kept as Scenario Builder
  metadata (SB-110, SB-112); "Correct it" on a story relationship writes your
  own version, which takes precedence in guidance and generation (Archivist
  itself is never written, SB-005).
- [ ] Show authored relationships as edges in the graph view.
- [x] Relationships from Archivist's compiled memory (dossiers): shown on the
  sheet, given to generation, and - between the characters present - in the
  guidance's cast lines.
- [ ] Image gallery per entry, perhaps using State Engine object *variants*
  (each variant can carry its own image), so a place can have "before" and
  "after the fire" pictures.
- [ ] Groups (SB-122: "Act I", "Harbor District"), multi-select bulk
  operations (SB-125), an "in play / recently used" view (SB-121).
- [ ] Drag-and-drop re-parenting in card/list views (only the tree has it now).
- [ ] Location connections: adjacency, travel time, locked/hidden (SB-111).
- [ ] Merge two entries from the catalog (SB-113 merge path).
- [ ] Undo for deletes (SB-127; needs a tombstone, since State Engine ids
  cannot be recreated).
- [ ] Keyboard navigation (arrows through cards, Enter to open, E to edit).
- [ ] Remember the window's last tab/chapter/sheet across reloads.
- [ ] Map-like outline for locations (SB-141).

## World definition

- [ ] Per-region or per-faction magic and technology (a technologically
  advanced empire next to a backward one; magic only in one land) - the
  location tree's inherited environment is the natural place.
- [ ] Image prompts that respect world limits (e.g. Midjourney `--no` with
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
- [ ] Archivist memories in the guidance (SB-440..444).
- [ ] Perspective and knowledge boundaries, POV modes (9.4, OPEN-5).
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
- [ ] Time advancing by rules; generated weather (SB-211); a calendar model
  (OPEN-10).
- [ ] Status line in the chat (SB-702).
- [ ] Curator static blocks such as "Director rules" (SB-313).
- [ ] New-chat start from a character card or template (SB-504).
- [ ] Public API: `getPerspective` (SB-641).
- [ ] Ask State Engine for a `location.parent` field (SB-145, C1), then move
  the tree out of Scenario Builder's metadata.
