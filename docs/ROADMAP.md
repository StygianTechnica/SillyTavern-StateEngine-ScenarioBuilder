# Roadmap - deferred work

What is deliberately not built yet, so we can circle back. Requirement IDs
refer to the [requirements specification](SCENARIO%20BUILDER%20REQUIREMENTS%20SPECIFICATION.md).
Newest decisions first in each section.

## Decisions that change the spec

These came after spec v0.5 and should be folded into its next revision.

- **The story leads.** Validation no longer holds the story back by default.
  Everything the roleplay establishes is accepted, and anything new it invents
  (a place, a character) is **adopted** into the library right away, so it
  becomes a real object that can be fleshed out. It is listed under
  Review → *New from the story* until the user has looked at it. This replaces
  the spec's conservative defaults (SB-222 "ask" for location/cast, SB-225
  auto-promotion off). "Canonical" and "ask" stay available per field.
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

- [ ] **Graph view** (wanted). Nodes are entries, edges are relationships
  (reference fields, related ids, the location tree, later Archivist
  relationships). Click a node to open its sheet; drag to arrange; optionally
  draw an edge to create a reference. Likely an SVG force layout with no
  dependency; filters by type and by "in play". Builds on
  `library/relations.js`.
- [ ] Relationship authoring on the sheet: add allies, rivals, family and
  employer as typed links (Scenario Builder metadata where State Engine has no
  field, SB-110), plus starting relationships (SB-112).
- [ ] Relationships from Archivist's compiled memory (`getRelationship`,
  dossiers): type, polarity, intensity, trend.
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

## Generation (spec 6.4 - phase 0.2)

- [ ] Create / fill in / expand / seed for every type (SB-130), context-aware
  (SB-131), schema-validated (SB-132), as proposals (SB-133).
- [ ] **Automatic enrichment** (SB-133b). This is how adopted objects get
  their detail: when the story introduces something, it is adopted, then
  queued to be fleshed out from the setting's context. It must honour
  canon-only settings and canon-locked entries (`mayAddGeneratedDetail`),
  fill empty fields only, and never touch user-edited fields (SB-128).
- [ ] Integrate adopted objects "into the story in some way": suggest hooks,
  links to existing factions and places, or a quest the newcomer could carry.
- [ ] World generation from the randomizable world definition (SB-139..139c).
- [ ] Duplicate guard on generation (SB-137 is done for manual creation).
- [ ] Suggesting a current description from Archivist memories ("the docks
  burned - update the description?").

## Lorebooks (spec 6.6, 6.7 - phase 0.4)

- [ ] World Info import into objects, through an Archivist-style pipeline
  (SB-150..157, OPEN-12).
- [ ] **Import option: no added detail.** When reading a lorebook, the user can
  turn off enrichment for what it creates: mark the setting canon-only and/or
  canon-lock every imported entry, so a published canon is not embellished
  with invented details. Imported entries get `origin: 'import'`.
- [ ] Narrative and structured lorebook export with round trip (SB-160..164).
- [ ] Lore-sourced memories for Archivist (SB-154, OPEN-14 - needs an
  Archivist design).

## Guidance and state (phases 0.2-0.5)

- [ ] Relevance scoring across the wider library (SB-400..402); guidance
  sections 5-7: knowledge boundaries, quests, factions/items/lore/events.
- [ ] Archivist memories in the guidance (SB-440..444).
- [ ] Perspective and knowledge boundaries, POV modes (9.4, OPEN-5).
- [ ] Quests: creation from Archivist seeds, objectives and conditions, the
  quest-only preset, type/priority (9.5).
- [ ] Events firing on deterministic conditions (SB-435).
- [ ] Time advancing by rules; generated weather (SB-211); a calendar model
  (OPEN-10).
- [ ] Status line in the chat (SB-702).
- [ ] Curator static blocks such as "Director rules" (SB-313).
- [ ] New-chat start from a character card or template (SB-504).
- [ ] Public API: `getPerspective` (SB-641).
- [ ] Ask State Engine for a `location.parent` field (SB-145, C1), then move
  the tree out of Scenario Builder's metadata.
