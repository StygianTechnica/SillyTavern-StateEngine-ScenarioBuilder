# SCENARIO BUILDER REQUIREMENTS SPECIFICATION

Version 0.5 (Draft) - Requirements for the State Engine Scenario Builder extension

Status: **Draft for review.** Requirement IDs (`SB-xxx`) are stable; do not renumber. Items marked **[OPEN-n]** are unresolved (section 14). Items marked **[STATE ENGINE CHANGE]** are changes or confirmations needed in State Engine or Archivist (collected in 14.1).

Revision 0.5: quests expanded (objectives, completion and abandon conditions, tracking by prompted runtime variables plus Archivist evidence, a quest-only preset, Scenario Builder owns quest objects; 9.5); world generation from an optional, randomizable world definition, with personas, character cards and lorebooks as inputs (SB-139..139c); lorebook-memory ownership left as a design item (SB-154, OPEN-14).

Revision 0.4: output narrowed to **one guidance variable** plus an optional canonical state block (section 8); the `sb` preset is its own, trimmed, and required (7.1); added content generation for all object types (6.4), a location hierarchy (6.5), World Info import and lorebook export (6.6, 6.7), and quest type/priority (9.5). Setting discovery is expected from State Engine's existing API (11.1).

Revision 0.3: decisions on OPEN-1 (preset coexists with Scene Context, which is untouched), OPEN-2/type validation (State Engine's job), OPEN-4 (quests specified in 9.5), OPEN-6 (setting binding, 11.1). Archivist memories and object runtime variables are now an explicit guidance input (9.6).

Revision 0.2: Scenario Builder is now defined as (1) the owner and generator of a setting's world state, (2) a managed library of State Engine objects presented as a game-module catalog, and (3) the producer of one prompt variable offered to Curator. Replaces the 0.1 model in which Scenario Builder kept a separate world store.

---

## 1. Purpose

Scenario Builder is the **narrative control layer** of the State Engine + Archivist + Curator system. It gives the roleplay LLM deterministic world state, scene guidance and per-character perspective rules, instead of leaving the model to infer them. It acts as the story's "director".

It has three jobs:

1. **Own and generate the world state** of a roleplay setting - location, time, weather, who is present, active scene - by maintaining its own State Engine variable preset. That preset's variables are *prompted*, so what the roleplay LLM writes is read back and **validated against** the Scenario Builder library; content the LLM invents that did not originate in Scenario Builder is checked and adjusted (section 7).
2. **Maintain a library of setting objects** - NPC characters, locations, factions, items, creatures, lore, quests, scenes and events - and present it as an orderly **catalog**, like a tabletop RPG setting module, so the user can define and manage the setting's major features (section 6).
3. **Produce narrative guidance** - one output variable of guidance for the roleplay LLM (plus an optional canonical state block) - and offer it, as a State Engine capability, to **Curator** for injection into the prompt (section 8).

Net effect: from *reactive extraction* (read what the LLM wrote) to *proactive orchestration* (tell the LLM what is true, what is relevant, and what each character knows).

## 2. Scope

### 2.1 In scope

- A SillyTavern third-party extension, `SillyTavern-StateEngine-ScenarioBuilder`.
- A Scenario Builder variable preset registered through the State Engine API.
- The object library UI (catalog) and its authoring, generation, import and export tools, including World Info import and lorebook export.
- Relevance selection and guidance generation for each reply.
- Validation/adjustment of extracted state against the library.
- The output variables and their Curator capability declarations.

### 2.2 Out of scope

- Extracting values from replies (State Engine).
- Storing or compiling memories (Archivist).
- Assembling or injecting the prompt (Curator). Scenario Builder only *offers* text.
- Writing the story prose.
- Replacing character cards, World Info or lorebooks (World Info is read for import and written for export only, 6.6-6.7).
- State Engine's Scene Context preset (its construction and existence are out of scope; it is left as-is).

## 3. Definitions

| Term | Meaning |
|------|---------|
| **Setting** | State Engine's unit for a roleplay world; objects and object presets belong to a setting (see *DESIGN - OBJECT PRESETS.md*). |
| **Object** | A State Engine object record (`chr_`, `loc_`, `fac_`, `itm_`, `crt_`, `lor_`, `qst_`, `scn_`, `evt_`). |
| **Library** | The set of objects in a setting that Scenario Builder manages, plus Scenario Builder's own organisation metadata. |
| **Catalog** | The UI presentation of the library, organised like a game module. |
| **Scenario preset** | The State Engine variable preset Scenario Builder registers and maintains (namespace `sb`). |
| **Canonical** | What the library and Scenario Builder's own decisions say is true. |
| **Observed / extracted** | What State Engine pulled from the LLM's reply into the prompted variables. |
| **Drift** | A divergence between canonical and observed values. |
| **Candidate** | An object the LLM introduced that the library does not contain, awaiting review. |
| **Guidance** | The primary output variable (`sb__guidance`): narrative guidance text for the roleplay LLM, offered to Curator. |
| **Canonical state block** | Optional output variable (`sb__state_block`): the deterministic canonical state as text, like State Engine's `se__state_block` but built from canonical values, not the prompted ones. |

## 4. System context and dependencies

```
State Engine      variables, presets, objects, roles, extraction, capability graph   (required)
Archivist         memories, witnesses, compiled profiles/relationships/threads       (optional, recommended)
Scenario Builder  setting library, scenario preset, validation, guidance block       (this extension)
Curator           prompt assembly; injects the guidance                              (optional)
```

- **SB-001** State Engine is REQUIRED. Scenario Builder MUST detect it at startup using the ExtensionTemplate pattern (`src/api/dependency-check.js`) and, if absent, disable itself with a clear notice.
- **SB-002** Scenario Builder MUST register with State Engine (`registerExtension`) with namespace `sb`, its variable list, and capabilities (section 8.2; plus proposed `scenario.library`, `scenario.state`, `scenario.perspective` for other extensions).
- **SB-003** Archivist is OPTIONAL and accessed only through its public read-only API (`window.StateEngineArchivist`). Without it, Scenario Builder works from the library alone; Archivist-dependent features MUST degrade gracefully and say so in the UI.
- **SB-004** Curator is OPTIONAL and NEED NOT be installed or called. Scenario Builder only declares capabilities; it makes no Curator API call (per Curator's *injection-blocks.md*). Without Curator, the output variables are still viewable and available through State Engine's own macros for use in a World Info entry.
- **SB-005** Scenario Builder MUST NOT write Archivist memories and MUST NOT modify State Engine or Curator internals; it uses public APIs only.

## 5. Architectural invariants

Mirrors the State Engine Requirements Specification.

- **SB-010 Single source of truth per datum.**
  - Object records (and their baseline/runtime fields) -> **State Engine** (Object API).
  - Variable values (including `sb__*`) -> State Engine's isolated variable store.
  - Memories -> Archivist.
  - Library *organisation* (catalog structure, grouping, ordering, links, guidance notes, per-chat canonical overrides) -> Scenario Builder.
- **SB-011** Scenario Builder MUST NOT duplicate an object's data in its own store. It stores object **ids** plus its own metadata. Create, edit and delete go through State Engine's Object API.
- **SB-012** Variable writes go only through State Engine's public write path; macro store is a mirror and is never seeded or read for decisions. No chat metadata for Scenario Builder data (State Engine spec 1.3). Per-chat data lives in extension settings keyed by chat id (Archivist pattern).
- **SB-013** Structure belongs to the setting, values to the chat (State Engine object-presets design): Scenario Builder never overrides a setting's object-preset fields or field roles per chat.
- **SB-014** Every kind of write has exactly one entry-point function (validation, events, persistence cannot be bypassed). Stored documents carry a `schemaVersion`; migrations are forward-only.
- **SB-015** Determinism: identical library, state, and settings MUST produce byte-identical guidance output. Randomness is allowed only from seeded generators with the seed stored.

## 6. The object library and catalog

### 6.1 Object types

The library covers the nine State Engine object types. Scenario Builder MUST use State Engine's type registry (ids, prefixes, colours, icons) rather than defining its own.

| Catalog section | State Engine type | Examples |
|-----------------|-------------------|----------|
| NPCs | `character` | allies, rivals, shopkeepers |
| Locations | `location` | regions, towns, buildings, rooms |
| Factions | `faction` | guilds, houses, cults |
| Items | `item` | artifacts, weapons, keys |
| Creatures | `creature` | monsters, beasts, spirits |
| Lore | `lore` | history, rules of magic, religion |
| Quests | `quest` | main plot, side quests, hooks |
| Scenes | `scene` | prepared encounters, set pieces |
| Events | `event` | festivals, raids, scheduled happenings |

- **SB-100** Every library entry IS a State Engine object (SB-011). Fields shown and edited are the object's intrinsic fields plus its setting's object-preset fields for that type; Scenario Builder MUST NOT invent a parallel field system. Field roles (`character.mood`, `faction.members`, `quest.status`, ...) are read by role so user renames do not break it. (`location.parent` is the intended role for the hierarchy but does not exist yet; see SB-145.)
- **SB-101** Scenario Builder MAY author **baseline** fields (global per setting) and is the primary author of a setting, as designed. It MUST leave **runtime** fields (per chat: mood, conditions, standing, quest status) to State Engine extraction, Archivist and the user, except where it validates and corrects them (section 7).
- **SB-102** Scenario Builder MAY register additional Scenario Builder field roles (namespace `sb`, e.g. `sb__character.secrets_known`) through State Engine's role API and request them; it MUST NOT add fields to a user's object preset itself - unassigned roles are shown for the user to map.

### 6.2 Relationships between entries

- **SB-110** Cross-references are stored as object references using State Engine's ref/refs field types where the preset has them (location parent, character faction, item owner/location, quest giver). Where no field exists, Scenario Builder stores the link in its own metadata, keyed by object ids.
- **SB-111** Location hierarchy: see 6.5. Connections (adjacency, travel time, locked/hidden/faction-controlled) are Scenario Builder metadata. Movement not permitted by connections is flagged as drift (section 7).
- **SB-112** Relationship data (character-to-character, faction standing) is *displayed* from the library and Archivist; Scenario Builder authors only the baseline, "starting" relationships.
- **SB-113** Deleting or merging an object MUST show all referring entries first and offer to repair them.

### 6.3 Catalog presentation

The catalog is the module-like face of the library.

- **SB-120** Organised as a **setting book**: an overview page (premise, tone, themes, era, rules), then a chapter per type with an index and an entry page per object. Entries open as a "stat block"-style card: image, summary, key fields, relationships, secrets/GM notes, hooks.
- **SB-121** Navigation: tree/outline by type and hierarchy, full-text search, filters (type, tag, region, faction, status, chat usage), sorting, and a "recently used / in play" view.
- **SB-122** Users can define **groups** (e.g. "Act I", "Harbor District", "Thieves' Guild plot"), tag entries, pin entries, and order entries; an entry may be in several groups.
- **SB-123** Entries separate **player-facing** content from **GM-only** content (secrets, true motives). GM-only text is never included in guidance unless the selection rules say the relevant character knows it (section 9.4).
- **SB-124** Each entry shows *status in this chat*: unused, in play, offstage, resolved - and links to the memories (Archivist) and extracted values that concern it, when available.
- **SB-125** Bulk operations: multi-select, tag, move, enable/disable for this chat, export.
- **SB-126** Library import/export as JSON (whole module or selection), validated on import, never executing imported content, with id-conflict resolution (skip, replace, duplicate with new id).
- **SB-127** Mobile-friendly layout and SillyTavern theming. Destructive actions confirm and are undoable where feasible.
- **SB-128** **Everything is user-editable.** Every object in the catalog, whether authored, imported, auto-converted, enriched or generated, can be edited, renamed, re-parented, merged or deleted by the user at any time, so the user stays in control of their world. Generation and enrichment never lock an object or field against the user. The user's edit always wins: an edited field is marked user-authored and protected from later automatic changes (enrichment, re-import, regeneration), and the user can **lock** any field or object and can unlock or reset it to a generated value. Only deliberate user action or an explicit "regenerate" overwrites it.

### 6.4 Content generation for all object types

Scenario Builder MUST be able to automatically generate content to fill out objects of **every type** (characters, locations, factions, items, creatures, lore, quests, scenes, events), shaped by the context it already holds for the current setting.

- **SB-130** For each type, generation can: (a) **create** a new object from a short brief or from nothing ("suggest a tavern for this district"), (b) **fill in** the empty fields of an existing object, (c) **expand** or rewrite a field, and (d) **seed** a group of related objects (a district with its places, people and a faction).
- **SB-131** **Context-aware:** the generation prompt is assembled from the setting's existing data - the setting overview and tone, the target's neighbours (parent and sibling locations, linked factions, residents, related lore), objects it references, similar objects (to keep style and avoid duplicates), and, when available, Archivist memories and the compiled world for the chat. Context selection uses the relevance rules in 9.1 and a token budget; the user can see and edit what context was used.
- **SB-132** Generated content MUST respect the object's State Engine fields: output is schema-validated against the setting's object preset for that type (field names via roles, types, enum values) and mapped to field values; unknown fields are dropped and reported.
- **SB-133** Output is a **proposal** (diff-style, editable per field) and MUST be accepted before any object is created or changed (except automatic conversion of direct inputs, SB-133a, and automatic enrichment of empty fields on approved objects, SB-133b). No silent background generation changes the library. Accepted items are written through State Engine's Object API.
- **SB-133a** **Automatic conversion (to avoid review fatigue).** Per-item review does not scale to a whole world. Scenario Builder MUST be able to convert some inputs into objects **automatically**, without a per-item proposal step, using the Object API:
  - **Direct inputs** that already name an object: world definition entries (starting and nearby locations, main characters, NPC seeds, factions, rival factions; SB-139a), chosen character cards and personas, and items the user typed in.
  - **Structured imports** that carry their own ids and types: Scenario Builder's own structured lorebook (SB-161).
  - **Bulk lorebook imports** classified above a user-set confidence (SB-151), and Archivist quest seeds above a threshold (SB-430), when the user turns it on.
  Auto-conversion creates *minimal* objects (name, type, parent/links, source marker) and leaves detail to automatic enrichment (SB-133b) and further generation, which stays proposal-based. Rules: the duplicate guard (SB-137) still applies, and matches merge or are skipped, never duplicated; each converted object records its source (SB-136, SB-155); low-confidence items still go to review; conversions are batched, show a summary, and are undoable as one batch (SB-226). Policy is configurable per input kind and type (auto / review / off), and the defaults are **auto** for direct user inputs and **review** for classified or inferred ones (matching SB-225).
- **SB-133b** **Automatic enrichment on approval.** When an object is **approved** (accepted from a proposal, promoted from a candidate or seed, or auto-converted under SB-133a), Scenario Builder automatically **adds detail** to it by running fill-in generation (SB-130, option b) in the background, using the setting's context (SB-131). This is what keeps conversion cheap: objects are created minimal, then fleshed out without the user asking.
  - Enrichment fills **empty** fields only. It never overwrites a field the user authored or edited, or a field set by an import (SB-128). The user can edit any enriched value at once.
  - Enriched values are written directly (no second review) and marked as generated (SB-136). The user can review, edit, revert a single field or the whole enrichment, or re-run it.
  - Controlled by settings: on/off globally and per type, a detail level (brief / standard / rich), and a rule to hold or hide enrichment for objects the user is currently editing.
  - Runs in a queue on the chosen connection profile (SB-134): rate-limited, cancellable, resumable, with visible progress. Failures or malformed output change nothing and are reported. Enrichment of one object may add *links* to existing objects but MUST NOT create new objects on its own; suggestions for related objects (e.g. a new NPC for a tavern) are offered as proposals.
  - Enrichment is ordered by dependency (a parent location before its children) so later objects see earlier detail, and respects the knowledge rule (SB-135).
- **SB-134** Generation can run on a chosen SillyTavern connection profile (as Archivist catch-up does); failures and malformed output are rejected without side effects and shown to the user.
- **SB-135** Generation MUST NOT leak knowledge: a prompt for a character excludes secrets that character should not know; GM-only content is marked as such in the context.
- **SB-136** Generation records its source (e.g. "generated, from context X") on the object or in history so users can tell authored from generated content.
- **SB-137** Duplicate guard: before creating, check for existing objects with the same or similar name/aliases and offer to merge or fill the existing one instead.
- **SB-138** Scenario Builder MAY propose a starting library from a character card, an existing chat, Archivist's compiled world, or imported World Info (6.6).
- **SB-139** **World generation ("Generate world").** Scenario Builder builds a whole new setting from user input, and the user chooses how much to give before pressing **Generate**. Inputs are all optional:
  - setting premise, genre, tone, themes, era, scale, rules, and things to include or avoid;
  - **main characters**, supplied as a SillyTavern **persona** (parsed into a character object) or chosen from existing **character cards**;
  - **NPCs**, chosen from character cards or described by the user;
  - locations, factions, quests, items, creatures or lore the user already has in mind;
  - one or more **lorebooks / World Info books** to parse into object data (6.6) and then **enhance** with generated detail.
  With almost no input, Scenario Builder generates a **random world that is consistent within itself** (shared names, geography, factions, history and cast that agree with each other). Whatever the user supplies is treated as fixed canon; generation fills the gaps around it using the same context rules (SB-131), as proposals (SB-133), in dependency order (setting overview -> locations hierarchy -> factions -> characters -> items/creatures/lore -> quests and events), with progress, cancel and per-object review. Cards and personas are read, never modified.
- **SB-139a** **World definition (the seed form).** The inputs above are organised as a **world definition** with the fields below. Every field is optional and has a **Randomize** option; the user can randomize any one field, any subset, or everything ("Randomize all") and re-roll individual fields. Randomized values are constrained by the fields already set, so the result is coherent (e.g. a `cosmic` level is not rolled for a `none`-tech historical world unless the user chose it).

| Field | Type / allowed values | Notes |
|-------|----------------------|-------|
| `world_type` | fantasy, science_fiction, modern, historical, post_apocalyptic, urban_fantasy, cosmic_horror, multiverse | Overall nature of the setting. Multiverse lets several world types coexist and enables cross-reality travel. |
| `allowed_world_types_in_multiverse` | list of `world_type` values | Only used when `world_type` is multiverse; if omitted, all are allowed. |
| `tone` | serious, whimsical, gritty, romantic, dark, heroic, comedic | Emotional and narrative flavour. Multi-select is permitted **[OPEN-15]**. |
| `tech_or_magic_level` | none, low, medium, high, cosmic | General capability level, technological, magical or both. |
| `starting_location` | name + type (city, village, space_station, frontier_outpost, guild_hall, ...) | Where the roleplay begins; becomes the first location object. |
| `nearby_locations` | list | Seeds the initial location hierarchy (6.5). |
| `main_characters` | list: name + role, or a persona / character card | See SB-139. |
| `npc_seeds` | list: name + role, or character cards | Supporting characters. |
| `factions` | list: name + `faction_type` (guild, cult, corporation, noble_house, syndicate, ...) | Groups that influence the world. |
| `rival_factions` | list | Opposing or competing factions. |
| `history_seed` | string | One anchoring historical event, expanded into a basic world history (lore objects). |
| `cultural_detail` | string | A belief, myth, tradition or superstition that influences the world. |

- **SB-139b** The enumerations above are **suggested defaults**, not a closed schema: the user may add custom values, and the final lists are settled in design **[OPEN-15]**. The world definition is stored with the setting (11.1) so it can be re-used, edited, and regenerated, and it is part of the context for later generation (SB-131).
- **SB-139c** Randomization is **seedable and repeatable** (the same seed and definition give the same proposals where the model allows) and each randomized field is marked as random in the form so the user can lock or re-roll it.

### 6.5 Location hierarchy

Location is inherently hierarchical (world > region > settlement > building > room). Scenario Builder MUST manage that hierarchy.

- **SB-140** Every location has at most one **parent** location; the hierarchy is a forest (single parent, no cycles). Scenario Builder MUST prevent cycles and orphaning on move, delete and merge.
- **SB-141** The catalog presents locations as an expandable **tree** with drag-and-drop re-parenting, breadcrumbs ("Brass Market > Old Quarter > Veylan"), child counts, and a map-like outline. Any location can be addressed by its path.
- **SB-142** Environment and description **inherit** down the tree unless overridden (climate, lighting, rules, controlling faction). Guidance uses the full path and inherited context for the current location.
- **SB-143** Hierarchy-aware features: "in" and "near" relations for presence (a character in a room is also in its building and city), relevance (a parent's lore is relevant to a child), and validating movement (6.2).
- **SB-144** Generation (6.4) works on the tree: "add rooms to this inn", "fill the district".
- **SB-145** **[STATE ENGINE CHANGE - to confirm]** State Engine's location object currently has a single baseline field, `region` (text), and no parent. The object-presets design lists a `location.parent` field role (and `location.region`), but no such field exists in the default location type. For the hierarchy to be a State Engine fact (shared with Pretty Panels, Archivist and the scene variables) the location type likely needs a baseline `parent` field (`ref` to `location`) assigned to the `location.parent` role, and possibly a derived path/ancestors accessor. Until decided, Scenario Builder keeps the tree in its own setting-level metadata keyed by object id (SB-110) and treats `region` as a display label. See 14.1.

### 6.6 Importing World Info / lorebooks

Scenario Builder MUST be able to take one or more World Info books or lorebooks and parse their entries into **objects and memories**, so the content can be classified, linked and scored for relevance (instead of relying on keyword triggers).

- **SB-150** Sources: SillyTavern World Info books (global, character-attached, chat-attached, persona) and lorebook JSON files, selectable individually or several at once. Reading uses SillyTavern's own World Info data and State Engine's World Info surface where applicable; the original books are never modified.
- **SB-151** Per entry, parse: title/comment, content, keys, secondary keys, group, order/priority, constant/selective flags, and position. Entries are **classified** into object types (a character, location, faction, item, creature, quest, event or general lore) with a confidence and a proposed name, aliases, summary, field values, parent location and links to other entries.
- **SB-152** The parsing pipeline SHOULD **leverage Archivist's approach** to reading a chat: chunking input, an *independent preset* run through State Engine on a chosen connection profile, a converter that turns model output into records (entity names -> ids), resumable background passes with cancel and progress, and a *compile* step that deduplicates and links items (cf. Archivist `catch-up.js`, `converter.js`, `compiler.js`, and State Engine's independent-preset API: `createIndependentPreset`, `runIndependentPreset`). **[OPEN-12: share code or call Archivist, versus a Scenario Builder pipeline of its own that follows the same pattern.]**
- **SB-153** Output is **proposals** (6.4, SB-133): candidate objects, merges with existing objects, and **memories** (facts, relationships, secrets with their subject entities and, where the text says, who knows them). The user reviews, edits, accepts, merges or rejects, in bulk or per entry.
- **SB-154** Memories from lorebooks need a home. The leaning is that **Archivist should own them**, but today Archivist has no way for another extension to add memories or to trigger processing of a lorebook (no write API, SB-005; memories are tied to chat messages via `source_message_id`). **[ARCHIVIST CHANGE - design needed, OPEN-14]** The mechanism is undecided; it needs its own design pass covering: a way to submit lore-sourced memories (not tied to a message, e.g. `source: lorebook:<book>#<entry>`), or a way to ask Archivist to process a lorebook with its own pipeline; validation; dedupe/compile; and how they are removed when the source changes. Until decided, Scenario Builder only produces proposals (SB-153) and does not depend on a lore-memory path.
- **SB-155** Every created object/memory records its **source entry** (book, entry id/uid) so re-importing updates rather than duplicates, and the user can see where a fact came from.
- **SB-156** Relevance: the import step derives, per entry, how it should be scored later (locations and cast it concerns, trigger words become aliases) so guidance can select lore by relevance (9.1) instead of by World Info keyword match.
- **SB-157** Large books are processed in chunks, in the background, with progress, cancel, resume and no change to the library until proposals are accepted.

### 6.7 Exporting to a lorebook

Two export styles MUST be supported.

- **SB-160 Narrative lorebook (baseline SillyTavern).** Generate a standard World Info book from the library that works in unmodified SillyTavern: one entry per object (or per group), readable prose built from its fields, sensible keys (name, aliases, related terms), order/depth settings, constant entries for setting overview, and options per type (include/exclude types, GM-only content excluded by default, token size per entry). No Scenario Builder-specific data is required to *use* it.
- **SB-161 Structured lorebook (Scenario Builder round-trip).** Export the library to a World Info book (or JSON file) in a **hierarchical, machine-readable form** - e.g. entries whose content holds JSON for each object (id, type, fields, parent, links, GM notes, tags, groups, connections, sources) with a format version - that Scenario Builder can **import back losslessly**: ids, hierarchy, references and metadata survive a round trip. On import, id conflicts are resolved by the user (SB-126).
- **SB-162** Both styles can be produced from the same library in one action, into new or existing books. Existing books are never silently overwritten: write to a new book, or update only entries Scenario Builder previously created (tracked by source marker), with a preview of changes.
- **SB-163** The structured form carries a `format` and `version`; importing an unknown version fails clearly. Imports never execute content.
- **SB-164** The narrative export SHOULD be regenerable at any time from the library (it is output, not a second source of truth).

## 7. The Scenario preset and world-state validation

### 7.1 The preset

- **SB-200** Scenario Builder has **its own State Engine variable preset** (namespace `sb`, working name "Scenario State"), registered through State Engine's presets API. State Engine handles activating and deactivating presets; Scenario Builder does not manage preset toggling itself.
- **SB-201** The preset is **a trimmed subset of State Engine's Scene Context preset**, not a full duplicate, plus the canonical state variables. It carries only what Scenario Builder needs, renamed `sb__<name>`. Starting from Scene Context's variables (`scene_id`, `scene_title`, `scene_summary`, `scene_tags`, `scene_location`, `scene_characters`, `scene_weather`, `scene_temperature`, `scene_isindoor`, `scene_currentdate`, `scene_currenttime`, `scene_deltatime`, and the calculated weather flags):
  - **Excluded:** `scene_currentdate` and `scene_currenttime` (decided: not needed).
  - **Candidates to skip (to confirm in design, since each costs prompt space when prompted):** `scene_deltatime`, `scene_id`, `scene_tags`, the calculated weather flags (`is_dry`, `is_windy`, `is_burning`, `is_foggy`, `is_hailing`, `is_snowy`, `is_stormy`, `is_drizzle`, `is_raining`; only if a Scenario Builder reader needs them), and anything else the guidance never uses. **[OPEN-1]**
  - **Added:** the canonical state variables (what Scenario Builder holds as true: location, cast present, weather, time/day-part, active scene) as non-prompted variables, so canonical and observed values sit side by side.
- **SB-202** The prompted variables hold **observations to validate**, not authoritative state (7.3). The canonical variables are written only by Scenario Builder.
- **SB-203** Scenario Builder **requires its preset** to exist and be active in the chat. It does not toggle presets itself (State Engine does). If the preset is missing or inactive, Scenario Builder shows a clear message and stays inert (empty guidance); it MAY offer a button that calls State Engine's preset activation API (`activatePreset` / `deactivatePreset`).
- **SB-204** The **extension drawer provides a shortcut** to activate/deactivate the Scenario State preset for the open chat (through State Engine's preset API), and shows its status.
- **SB-205** Scene Context is not needed when Scenario State is active, and leaving both active costs variable-prompt space. The drawer MUST show a hint/indicator when both are active ("Scene Context is not needed - Scenario State covers it"), but MUST NOT change or disable Scene Context on its own, and MUST NOT modify its definition.
- **SB-206** The preset definition carries a version and is restored/migrated from Scenario Builder's blueprint (as State Engine restores its starter presets); users do not edit it in the manager.
- **SB-207** A second, **quest-only preset** (working name "Scenario Quests", namespace `sb`) MAY be registered for tracking active quest objects through their prompted runtime variables (SB-439a). It follows the same rules as SB-203 to SB-206 and is optional: Scenario State works without it.

### 7.2 Where world state comes from

World state originates in Scenario Builder, from the library and the user:

- **SB-210** The active location is a library `location` object; the cast present are library `character` objects; the scene is a library `scene` object (or an ad-hoc scene created by Scenario Builder).
- **SB-211** Weather, temperature and time are set by the user, by scene definitions, or **generated deterministically** (seed + season + climate of the location + time). Time advances by explicit rules: per-turn delta, travel time between locations, or user override.
- **SB-212** Environment is inherited down the location hierarchy unless a child overrides it.
- **SB-213** At the start of a reply (before generation) Scenario Builder writes canonical values into the preset variables so the prompt and trackers show the intended state.

### 7.3 Validate and adjust

After each AI reply, once State Engine has extracted the prompted `sb__*` values:

- **SB-220** Compare observed values with canonical for: location, characters present, time/date, weather/temperature/indoors, active scene, quest/event triggers.
- **SB-221** Classify each difference:

| Case | Meaning | Default action |
|------|---------|----------------|
| **Consistent** | observed matches canonical | nothing |
| **Natural progress** | allowed change (e.g. time passed within limits, an expected exit) | accept, update canonical |
| **Library match** | LLM names an existing library object not yet in play | accept, mark in play, link |
| **Candidate** | LLM names an unknown location/character/item/faction | create a *candidate*, keep the observed value temporarily, flag |
| **Contradiction** | breaks library facts (wrong region, dead NPC present, impossible move, wrong time of day) | **adjust**: write the canonical value back, add a correction line to the corrections section of the guidance, log |
| **Ambiguous** | cannot decide | flag for review |

- **SB-222** Resolution policy is configurable per field: **canonical wins**, **observed wins**, **ask**. Conservative defaults: location, cast, and time changes the user did not initiate default to *ask* (or canonical wins when clearly impossible); decorative fields (weather wording, summary) default to *observed wins*. **[OPEN-2: confirm defaults.]**
- **SB-222a** Value **type validation** (numbers, enums, datetimes, object references) is State Engine's job. Scenario Builder validates only *meaning* against the library and MUST treat values it receives as already type-valid.
- **SB-223** Every drift item records field, canonical, observed, source message id (`<chatId>#<index>@<send_date>`), classification, and resolution. Reconciliation is idempotent.
- **SB-224** Changes follow messages: swipes, regenerations, edits and deletions revert or recompute any canonical change derived from that message (consistent with Archivist and State Engine).
- **SB-225** Candidates are reviewed in a queue: promote (create the State Engine object, choose a parent location/type fields), merge into an existing object, or reject (suppress future flags). Auto-promotion MAY be enabled per type with an evidence threshold; default off.
- **SB-226** Adjustments are **non-destructive and visible**: a History view shows every automated change with its source and an undo.

## 8. The guidance output (variables and Curator offer)

The only thing Scenario Builder needs to hand to the prompt is **narrative guidance**. It is written into State Engine variables (as Archivist writes its blocks) which Curator offers for injection.

### 8.1 The variables

- **SB-300** **Primary output: `sb__guidance`.** One chat-scope string variable (stored, written by Scenario Builder, never asked of the model: `prompted: false`, `showInTracker: false`) holding the narrative guidance for the **next** reply. This is the one required output. The text is composed from the sections in 9.2 within a single token budget; there are no separate per-topic variables. **[OPEN-11: confirm one variable is enough, or whether a second guidance variable (e.g. long-lived setting guidance vs per-turn guidance) helps Curator placement.]**
- **SB-301** **Optional output: `sb__state_block`.** A string variable that renders Scenario Builder's **canonical state** as text, in the style of State Engine's own `se__state_block` (a line per value, empty lines omitted, `''` when there is nothing). It MUST be built from the **canonical** values (7.2), not the reactive prompted variables that reflect what the LLM wrote, so it is deterministic. It can be switched off in settings, and Curator offers it separately.
- **SB-302** Text MUST be setting-specific and current, written for the model, and MUST NOT name Scenario Builder.
- **SB-303** Each variable begins with the line `REFERENCE ONLY — DO NOT CONTINUE`, as State Engine and Archivist blocks do.
- **SB-304** A variable with nothing to say is `''` (no scenario, paused, disabled, preset inactive), so Curator sends nothing.
- **SB-305** Deterministic (SB-015); bounded by a configurable token budget with a documented drop/compress order (last to drop: current location/time, knowledge boundaries, and active corrections).
- **SB-306** Rewritten when inputs change (state change, validation, Archivist update, library edit, chat change) and before generation, in the order State Engine extraction -> validation -> writing (SB-502). Writes go through State Engine's variable write path, and only when the text actually changed.

### 8.2 Offering them to Curator

- **SB-310** Declare through `registerExtension`: `curator.inject:sb__guidance` and `curator.inject.role:user:sb__guidance` (suggested role; the user may override in Curator), and the same pair for `sb__state_block` when enabled.
- **SB-311** Each variable's `label` and `description` are what Curator shows; they MUST be clear and not name Scenario Builder (Curator shows the source).
- **SB-312** Curator reads values through State Engine's Variable Value API; Scenario Builder makes no Curator call and has no load-order dependency. The user ticks the variable in Curator's **State Engine Variables** bank; until then nothing is injected.
- **SB-313** Optionally, when Curator is present, Scenario Builder MAY register static editable blocks (e.g. "Director rules") via `window.Curator.registerInjectionProvider`.
- **SB-314** An in-extension **preview** shows the exact text of each output variable with token counts and, per included entry, why it was selected (9.1).
- **SB-315** The settings panel shows whether the user has enabled the outputs in Curator (where detectable) and warns when they are written but not enabled.

## 9. Gathering relevant information and building guidance

### 9.1 Relevance selection

The library may be large; the guidance must only contain what matters now.

- **SB-400** For each reply, Scenario Builder selects library entries by relevance scoring over: current location and its ancestors, present characters, active scene, active quests, events triggered by time/place/stage, factions linked to the above, items held or present, and recent mentions (user message, latest AI message, Archivist memories).
- **SB-401** Scoring rules are deterministic, transparent, and user-adjustable (pin / exclude / weight by type).
- **SB-402** Selected entries are rendered at a detail level appropriate to relevance and remaining budget (full / summary / name-only).

### 9.2 Sections of the guidance

`sb__guidance` is one text composed of ordered, individually toggleable **sections**, each built from specific sources: the library (baseline fields, GM notes), canonical/observed state, object runtime variables, and Archivist data (9.6).

1. Setting overview, tone and rules (short)
2. Location: path through the hierarchy, description, time, weather, lighting
3. Scene premise, stakes, tone
4. Cast present: role, motive, intention, constraints, relevant runtime state
5. Perspective and knowledge boundaries (9.4)
6. Active quests, by priority (9.5)
7. Relevant factions, items, creatures, lore, pending events
8. Corrections from validation (7.3), short-lived

Sections are dropped or compressed by priority when over budget (SB-305).

### 9.3 Scenes

- **SB-410** A `scene` object holds location, time, cast, premise, tone and stakes. Scene transitions (location, time skip, cast change) are explicit events that close one scene and open the next.
- **SB-411** Scene-level guidance covers the scene's purpose, constraints and relevant quests only; it does not include any sequenced step-by-step plan.

### 9.4 Perspective and knowledge boundaries

- **SB-420** For each relevant character, compute what they **know, suspect, wrongly believe, or do not know**.
- **SB-421** Sources in priority order: (1) user overrides, (2) library facts and GM notes marked as known to them, (3) Archivist memories where they are in `witness_ids` (and secrets they witnessed), (4) the character card baseline.
- **SB-422** **Central rule:** a character is never given knowledge of a secret or event they did not witness unless a recorded reveal exists. Guidance states the boundary *explicitly* ("Mira does not know X; she must not act on it").
- **SB-423** False beliefs are a first-class record, distinct from ignorance.
- **SB-424** POV mode: single-POV, multi-POV, or omniscient with guard rules. **[OPEN-5]**
- **SB-425** Use safe defaults for older Archivist records lacking `witness_ids`, `tags`, `tone`, `entity_types`.

### 9.5 Quests

Quests are one of State Engine's most important object jobs, and Scenario Builder's main contribution is to create and flesh them out. The requirements below fix the direction; the quest object stays open-ended for now.

- **SB-430** **Quest creation from Archivist data.** Archivist identifies quest seeds, goals, plans and unfinished business (compiled `threads` and `quests`, plot hooks, unresolved threads). Scenario Builder MUST read these and offer to turn them into State Engine **quest objects** (candidate -> review -> promote, as 7.3 candidates), linking the characters, locations, factions and items involved and carrying source memory ids so each quest traces back to the story.
- **SB-431** **Fleshing out.** For a quest (new or user-authored) Scenario Builder proposes missing information (giver, stakes, objectives, stages, prerequisites, obstacles, rewards, consequences, related NPCs/locations), as a proposal the user accepts or edits (6.4).
- **SB-432** **Quest runtime variables.** A quest object carries per-chat runtime fields (State Engine's quest roles `quest.status`, `quest.objectives`, plus any the setting's quest preset adds) that are **prompted**, so State Engine tracks the quest's progress while it is active and relevant to the story. Scenario Builder MUST NOT duplicate this tracking; it reads these runtime values for guidance and validation.
- **SB-433** **Relevance.** Only quests that are active and relevant to the current scene (by location, cast, factions, items, creatures, recent mentions) appear in the guidance and are included in prompted object updates; dormant quests stay in the library.
- **SB-434** Quest progress comes from two reactive sources that complement each other: (1) the **prompted runtime variables** on the quest object, which State Engine fills from the roleplay LLM's output and the user's input, and (2) **Archivist's** quest/plan/goal memories, which it infers from the story and which are not perfect. Scenario Builder reads both, adds little processing of its own, and treats the quest object's runtime variables as the authoritative progress record, with Archivist data as supporting evidence.
- **SB-435** Events (festival, raid, scheduled happening) fire on deterministic conditions (time, location, quest status, faction standing), are logged, and the guidance states what happens, not how to narrate it.
- **SB-436** **Quest fields.** The quest model Scenario Builder works with is:

| Field | Type | Provided by State Engine today? |
|-------|------|---------------------------------|
| `id` | string | Yes (`qst_...`) |
| `name` | string | Yes (common field) |
| `summary` | string | Yes (the common `description`; confirm the mapping) |
| `objectives` | list | Yes (baseline `objectives`; role `quest.objectives`) |
| `status` | enum (Not started / Active / Completed / Failed) | Yes (runtime, prompted; role `quest.status`) |
| `type` | `main` \| `side` \| `personal` \| `faction` \| `mystery` \| `task` | **No** |
| `priority` | `low` \| `medium` \| `high` | **No** |

- **SB-437** **Quest `type`** is a stable, authored (or generated) classification. **[STATE ENGINE CHANGE - to confirm]** Add it as a baseline enum field on the quest object preset (with a field role such as `quest.type`), or hold it in Scenario Builder's setting-level metadata until then.
- **SB-438** **Quest `priority`** is partly **dynamic**: it depends on the quest's relevance to the story's current circumstances - characters, items, locations, creatures and factions present, the active scene, and recent mentions (9.1) - on top of an authored base priority. Scenario Builder computes the effective priority deterministically for guidance ordering and for deciding which quests to include; it MAY store the base priority as a baseline field (**[STATE ENGINE CHANGE - to confirm]**) and keeps the computed value in its own chat-level state rather than writing it as a prompted variable.
- **SB-439** **Quest definition.** In addition to the fields above, a quest defines:
  - **Objectives**: each with an id, description, and its own status (pending / done / failed / optional).
  - **Completion conditions**: what must be true for the quest to complete (e.g. all required objectives done, a named event, an item delivered, a location reached).
  - **Abandon conditions**: what makes the quest abandoned, failed or expired (e.g. the giver dies, a deadline passes, the player refuses or leaves). The status set therefore gains *Abandoned* alongside Not started / Active / Completed / Failed **[STATE ENGINE CHANGE - to confirm]**.
  Conditions are written in plain language for the LLM-driven runtime tracker, with optional structured references to objects (characters, locations, items) so they can be evaluated against state and memories.
- **SB-439a** **Linking story events to the right quest object** is the hard part, because Archivist is reactive and infers quest data from memories. Scenario Builder uses **both** of these methods together:
  - **A. Archivist sees the quest objects.** Quest objects live in State Engine, so Archivist can already see defined quests and Scenario Builder gets the same visibility with no extra work. Archivist SHOULD relate its quest-flagged memories to those objects where it can. Whether and how well it can is an Archivist matter; perfect matching is not required (14.1, C6).
  - **B. A quest-only preset.** A separate State Engine preset (e.g. `sb quests`) covers the *active* quest objects and prompts their runtime variables (status, per-objective status, notes), so State Engine's own extraction tracks progress against the right object from the roleplay output and the user's input. Only active, relevant quests are included (SB-433) to limit prompt cost.
  B tracks progress; A supplies supporting memories. Together they should give better accuracy without much extra Scenario Builder processing.
- **SB-439b** **Ownership.** Scenario Builder owns the *quest objects*: it creates them, fleshes them out, and keeps them current. Archivist does not create quest objects (it never has); it flags quest-related memories (seeds, goals, plans, unfinished business). Scenario Builder takes that data and turns it into **fully fleshed-out quests**, adding detail inspired and supported by the rest of the setting's data (SB-430, SB-431). No Archivist change is needed for this.
- **SB-439c** Scenario Builder MUST be able to create the quest objects needed for tracking, including quests promoted from Archivist seeds and quests for which no object yet exists when the story reveals one.

### 9.6 Using Archivist memories and object runtime variables

- **SB-440** Archivist **memories** attached to characters and objects (`getMemoriesForEntity`, `entity_ids`, `witness_ids`, subtype, scope, importance, tags, tone) are a primary guidance source: recent and important events involving present characters and the current location, relationships (type, polarity, intensity, trend), unresolved threads, and secrets with their witnesses.
- **SB-441** Object **runtime variables** (mood, thought, intent, conditions, standing, quest status...) are read by **field role** through State Engine's Object API (`getObjectField`), so user renames do not break reading. They feed the cast, location and quest sections of the guidance and the validation of state (7.3).
- **SB-442** Memory use is selective: scoped by relevance (9.1), ordered by importance and recency, and capped by the budget. Scenario Builder summarises or quotes; it never writes Archivist memories (but see SB-154).
- **SB-443** Memory is never used to leak knowledge across characters (SB-422).
- **SB-444** Recompute is debounced on `MEMORIES_CHANGED_EVENT` and never blocks generation. If Archivist is missing or not yet compiled, guidance falls back to library data only.

## 10. Lifecycle

- **SB-500** Startup: dependency check -> register with State Engine (preset, variables, roles, capabilities) -> load settings -> bind the chat's setting (11.1) -> detect Archivist -> wait for chat load -> hydrate per-chat state -> compute initial guidance.
- **SB-501** On chat change: flush pending writes, load the new chat's state and setting, clear stale values, recompute. Never leak state between chats.
- **SB-502** On message events (received, edited, deleted, swiped): wait for State Engine extraction to finish, then validate (7.3), then rewrite the output variables. Do not race extraction; do not block generation on slow work (generation, Archivist).
- **SB-503** On disable, pause, or when the Scenario State preset is missing or inactive: outputs become empty, listeners stop (or idle), stored data remains.
- **SB-504** New chat with no scenario: offer to start from the character card, a library template, or empty. Scenario Builder stays inert (empty output) until a scenario is enabled.

## 11. Data, storage and APIs

### 11.1 Storage and the setting binding

State Engine already has **settings** (a setting owns objects and object presets and carries field roles; Pretty Panels uses them) and a **chat-to-setting** assignment. Scenario Builder's library is *per setting*, so it must use State Engine's setting, not a second concept.

- **SB-600** **One setting, selected once.** Scenario Builder MUST NOT ask the user to choose a setting itself. It expects to obtain the setting from State Engine through the existing Object API - `getChatSetting` (none yet -> `ensureChatSetting`, which makes State Engine ask the user), `listSettings`, `getSetting`, `createSetting`, `updateSetting`, `setChatSetting` (all present in State Engine's `object-api.js` and wrapped by Pretty Panels) - and follows changes (setting renamed, deleted, or switched for a chat). **[STATE ENGINE CHANGE only if needed]** If it turns out the assignment is not readable by other extensions, State Engine must expose it; that is State Engine's problem to solve, not Scenario Builder's.
- **SB-601** Scenario Builder's setting-level data (groups, tags, ordering, location tree until SB-145 is resolved, connections, GM notes, quest metadata, world definition, module overview, import sources) is stored **keyed by the State Engine setting id** and treated as an extension of that setting: in State Engine's setting record if extensions can attach data to it, otherwise in Scenario Builder's own extension settings keyed by `settingId`, cleaned up when the setting is deleted. **[OPEN-6]**
- **SB-602** *Setting level* holds library organisation; the **objects themselves** live in State Engine (SB-010/011).
- **SB-603** *Chat level* holds canonical state, in-play set, drift log, candidates, history, seeds. Keyed by chat id; handles rename, deletion, duplicate-named chats (as Archivist does).
- **SB-604** Documents are split (setting library vs per-chat) to keep settings saves fast.
- **SB-605** The setting is whatever State Engine assigns the chat. Scenario Builder shows the bound setting prominently in the catalog and lets the user switch it (via `setChatSetting`). Edge cases (the shared *Default* setting, branched or duplicated chats) follow State Engine's behaviour.

### 11.2 State Engine surface used

Object API (create/read/update/delete, fields by role, settings), variable read/write, presets (`createPreset`, `activatePreset`, `deactivatePreset`, `listPresets`) and roles registration, independent presets (for generation and import runs), capability registration, Variable Value API. **[OPEN-7: confirm exact functions and signatures for a third-party extension, and whether third-party presets can be hidden from the user picker and restored automatically.]**

### 11.3 Archivist surface used

`getMemoriesForEntity`, `getMemoriesBySubtype('secret')`, `getAllMemories`, `getCompiledMemory`, and `MEMORIES_CHANGED_EVENT` (debounced; never block generation). Plus, for lorebook import, the Archivist parse/compile pattern (6.6) and a possible lore-memory write path (SB-154).

### 11.4 World Info interop

See 6.6 (import) and 6.7 (export). Scenario Builder reads World Info for import and writes only the books it exports to; it never edits a user's other books.

### 11.5 Public API for other extensions

- **SB-640** Global `window.StateEngineScenarioBuilder` (readiness signal) plus ES exports, mirroring Archivist.
- **SB-641** Read-only: `getLibrary(type?)`, `getEntry(id)`, `getCurrentScene()`, `getLocationPath(id)`, `getPerspective(characterId)`, `getDrift()`, `getGuidance()`. Returned objects are copies.
- **SB-642** Events: `SCENARIO_CHANGED_EVENT`, `DRIFT_CHANGED_EVENT`. Documented in `docs/api.md`.

## 12. User interface

- **SB-700** Settings panel in the extensions drawer: enable/pause, token budget, section toggles, validation policies, generation connection profile, Curator status (whether `sb__guidance` is ticked there), the Scenario State preset shortcut and Scene Context hint (SB-204, SB-205).
- **SB-701** **Catalog workspace** (section 6.3) with additional tabs: Scene, State (current canonical values with override), Drift & Review (drift + candidate queue), History, Preview (guidance output), Generate (6.4), Import/Export (6.6, 6.7), and a Location tree (6.5).
- **SB-702** A compact **status line** in the chat: location, time, weather, scene, drift count; one-click override.
- **SB-703** Every automated change is attributable and undoable.
- **SB-704** The preview is always reachable and shows the guidance text exactly as Curator will send it.

## 13. Non-functional requirements

- **SB-800** Determinism (SB-015).
- **SB-801** Guidance assembly under 50 ms for a typical library (hundreds of entries); never blocks on network calls.
- **SB-802** Resilience: malformed data or missing dependencies fail visibly and safely without breaking SillyTavern.
- **SB-803** Privacy: nothing leaves the installation except through the user's configured LLM connections for explicit generation.
- **SB-804** Pure logic (relevance, time, weather, hierarchy, knowledge, validation, budgeting) in modules with no SillyTavern imports, unit-tested with Vitest.
- **SB-805** Layout follows the sibling extensions: `src/api/`, `src/extension.js`, `src/index.js`, plus `library/`, `preset/`, `state/`, `validate/`, `guidance/`, `store/`, `ui/`.
- **SB-806** Docs: `docs/README.md`, `docs/api.md`, `docs/architecture.md`.

## 14. Open questions and external changes

Resolved: Scene Context stays as-is and out of scope; Scenario Builder has its own preset, required and toggled through State Engine; output is narrative guidance (one primary variable); type validation is State Engine's; Scenario Builder owns quest objects and Archivist supplies supporting data; setting data is obtained from State Engine.

### 14.1 Changes needed in State Engine or Archivist (to confirm)

| # | Change | Why |
|---|--------|-----|
| C1 | **Location parent.** Add a baseline `parent` field (`ref` -> `location`) and the `location.parent` role to the default location type (today only `region` exists), and ideally an ancestors/path accessor (SB-145). | Location hierarchy as a shared State Engine fact. |
| C2 | **Quest `type` and `priority`.** Baseline enum fields on the quest type (SB-437, SB-438). | Quest classification and prioritisation. |
| C3 | **Lore memories (design needed).** Archivist is the preferred owner, but has no mechanism for another extension to add memories or trigger lorebook processing (SB-154, OPEN-14). | World Info import. |
| C4 | **Setting readability.** Only if the chat-to-setting assignment is not readable by other extensions (SB-600). | One-time setting selection. |
| C5 | **Third-party preset support.** Confirm a third-party extension can register, restore, hide and activate its own preset (SB-203, 11.2). | Scenario State preset. |
| C6 | **Quest linking (optional).** Archivist relates quest-flagged memories to existing quest objects where it can (SB-439a). Not required for Scenario Builder to work. | Supporting quest evidence. |
| C7 | **Quest status.** Add *Abandoned* to the quest status enum (SB-439). | Abandon conditions. |

### 14.2 Open questions

1. **OPEN-1** Final variable set of the `sb` preset: which Scene Context variables to keep (SB-201).
2. **OPEN-2** Confirm default drift-resolution policy per field (SB-222).
3. **OPEN-5** Default POV mode and whether omniscient ships in MVP.
4. **OPEN-6** Where setting-level library metadata lives (State Engine setting record vs Scenario Builder's own settings) (SB-601).
5. **OPEN-7** Exact third-party API surface and signatures (11.2).
6. **OPEN-10** Calendar model (single Gregorian-like vs per-world fantasy calendars), since `currentdate`/`currenttime` are dropped.
7. **OPEN-11** Whether one guidance variable is enough (SB-300).
8. **OPEN-12** Reuse Archivist's parse/compile code for lorebook import vs a parallel Scenario Builder pipeline (SB-152).
9. **OPEN-13** Quest tracking: exact variables of the quest-only preset and how Archivist's quest-flagged memories are matched to quest objects (SB-439a). Both methods are used.
10. **OPEN-14** How lorebook-derived memories reach Archivist (SB-154).
11. **OPEN-15** World definition: final enumerations, custom values, and multi-select tone (SB-139a, SB-139b).
12. **OPEN-16** Automatic conversion: which input kinds default to auto vs review, and the confidence thresholds (SB-133a).
13. **OPEN-17** Automatic enrichment: default on/off, default detail level, and cost controls (SB-133b).

## 15. Phasing

| Phase | Deliverable |
|-------|-------------|
| **0.1 MVP** | Dependency check, registration; setting obtained from State Engine; Scenario State preset (trimmed, canonical variables) with drawer shortcut and "Scene Context not needed" hint; minimal catalog for NPCs/locations (CRUD via Object API) with location tree; manual canonical location/weather/cast; `sb__guidance` (and optional `sb__state_block`) with `curator.inject` capabilities; preview. |
| **0.2** | Full catalog for all nine types, groups/tags/search; relevance selection; token budget; Archivist memories and runtime variables in guidance; content generation for all types and the randomizable world definition (6.4). |
| **0.3** | Validation: drift, candidates queue, history/undo, swipe/regeneration handling. |
| **0.4** | Lorebook export (narrative and structured) and import with round trip; World Info parsing to objects and memories (6.6, 6.7). |
| **0.5** | Quests: creation from Archivist seeds, fleshing out, objectives and conditions, quest-only preset, type/priority; events; perspectives and knowledge boundaries. |
| **Later** | Multi-POV, public API, Pretty Panels integration. |

## 16. Acceptance criteria (MVP 0.1)

- Without State Engine, Scenario Builder disables itself with a message; with it, the preset and capabilities are registered.
- If the Scenario State preset is missing or inactive, a clear message appears and the output is empty.
- Scenario Builder uses the chat's State Engine setting and never asks for a separate one.
- The user can create locations and NPCs in the catalog; they appear as State Engine objects with the correct id prefixes, and locations can be arranged in a tree.
- Setting a location, weather and cast updates the canonical variables and the guidance preview.
- In Curator's State Engine Variables bank `sb__guidance` is offered; ticking it injects the same text as the preview, and pausing makes it empty.
- The drawer shortcut activates/deactivates the Scenario State preset through State Engine, and shows a hint when Scene Context is also active.
- When the roleplay reply names a different location than the canonical one, the next guidance carries a correction or the item appears in Drift & Review according to policy.
- Switching chats never leaks state; data survives restarts.
- Without Archivist or Curator everything in the MVP still works.
