# Architecture

Scenario Builder follows the sibling extensions' layout (spec SB-805). Pure
modules import nothing from SillyTavern or State Engine and are unit-tested
(SB-804); everything else talks to State Engine only through `src/api/`.

```
src/
  index.js, extension.js     entry point; bootstrap in spec SB-500 order
  constants.js, settings.js  identity; persisted settings (extension_settings.scenarioBuilder)
  api/                       thin State Engine wrappers (one call each, no logic)
  store/                     schema.js (pure: document shapes, migrations)
                             setting-store.js, chat-store.js (the ONLY writers), chat-ref.js
  library/                   hierarchy.js (pure: location tree)
                             library.js (entries = State Engine objects + our metadata)
  preset/                    blueprint.js (pure data), scenario-preset.js (restore, status, toggle)
  state/                     canonical.js (the one entry point for canonical changes + history)
                             lifecycle.js (chat/message/generation events)
  validate/                  drift.js (pure: detect, classify, decide)
                             reconcile.js (runner, review queue, candidates, reverts)
  guidance/                  budget.js, build.js (pure), sync.js (gather + write outputs)
  generate/                  prompt.js (pure: generation prompts, answer parsing/validation),
                             run.js (context gathering), llm.js (the one model call), enrich.js (background queue)
  import/                    lorebook.js (pure: read entries, match, classify/extract prompts), run.js (analyse -> plan -> apply)
  generate/json.js           plugs in State Engine's parseModelJson when available
  library/story-relations.js relationships from Archivist dossiers
  library/intake.js          takes newly confirmed objects into the library; library/fields.js, world-options.js
  library/travel.js          (pure) ways of travel: each route's times on foot, riding, by car, transit, air, worked out from its walking time
  images/                    prompt.js (pure: Midjourney / SD / natural prompts), attach.js (upload, paste, Image Generation hand-off)
  state/narrative.js         the per-chat "current description" of an object
  library/relations.js       (pure) relationships from reference fields and the tree
  ui/                        settings-drawer.js; workspace.js (window shell), ws.js (shared state),
                             catalog.js (front page, chapters), sheet.js (entity sheet), image-panel.js,
                             panels.js (Scene, Review, History, Preview), graph.js (relationship graph);
                             catalog-model.js, graph-layout.js, status-model.js (pure)
  naming/                    the name generator (docs/DESIGN - NAMING.md): stocks/ (real-world
                             names by language), engine.js (pure: planName, namePool),
                             live.js (pure: live-play pools and the swap rule),
                             run.js (reads the world, records the registry)
  public-api.js              window.StateEngineScenarioBuilder
```

## Where data lives (SB-010)

| Datum | Owner |
|-------|-------|
| Objects (NPCs, locations, ...) and their fields | State Engine Object API. Never copied. |
| `sb__*` variable values | State Engine's variable store, written via `setVariableValue`. |
| Library organisation per setting: overview, location parents, environment, GM notes, tags, pinned, groups | `settings.library[settingId]` (OPEN-6: State Engine's setting record has no room for extension data). |
| Per-chat state: canonical values, in-play set, drift log, candidates, rejected names, corrections, history | `settings.chats[chatKey]`, keyed `char:<avatar>:<chatId>` / `group:<id>:<chatId>` like Archivist. |

Both documents carry a `schemaVersion` and are normalized on every read and
write (`store/schema.js`); `updateSettingDoc` / `updateChatDoc` are the only
writers (SB-014).

## The Scenario State preset

`preset/blueprint.js`, version-stamped and restored on startup (SB-206):

- **Observed** (prompted, from Scene Context): `scene_title`,
  `scene_summary`, `scene_location`, `scene_characters`, `scene_weather`,
  `scene_temperature`, `scene_isindoor`. Dropped for MVP (OPEN-1):
  date/time, deltatime, id, tags, calculated weather flags.
- **Canonical** (not prompted): `canon_location`, `canon_characters`,
  `canon_weather`, `canon_temperature`, `canon_setting`, `canon_time`,
  `canon_scene` - mirrors of the chat document, written by `guidance/sync.js`.
- **Outputs**: `guidance`, `state_block`.

Scenario Builder never activates the preset on its own (SB-203); the drawer
button calls State Engine's `activatePreset` / `deactivatePreset`.

## The turn loop

1. `GENERATION_STARTED` (not quiet/dry-run): validate, push canonical into the
   observed variables (except fields with an open question or candidate),
   rebuild and write the outputs (SB-213).
2. State Engine's prompted update fills the observed variables; it announces
   writes with `state_engine_variables_changed`. There is no "extraction
   finished" event, so validation is debounced on that event and only acts on
   observed values that changed since the last run - idempotent (SB-223) and
   immune to its own writes.
3. `drift.detectDrift` classifies each difference (consistent / natural /
   library match / candidate / contradiction / ambiguous) and picks an action
   from the field's policy (`DEFAULT_POLICIES`): accept, adopt (new object
   joins the library and the scene), adjust (write back + correction line for
   `correctionTurns` replies), ask (Review tab), or candidate (review queue).
4. Every canonical change goes through `state/canonical.setCanonical`, which
   records before/after in history and keeps State Engine presence in step
   with the cast.
5. Swipe/edit/delete: `reconcile.revertFromMessage(index)` undoes validation
   changes sourced from that message onward and drops its queue items
   (SB-224).

## Guidance

`guidance/build.js` turns gathered inputs into sections (overview, where and
when, scene, cast, corrections). `budget.fitToBudget` compacts, then drops,
lowest-priority sections first; location/time and corrections are `keep`
and never dropped (SB-305). Tokens are estimated as chars/4. No clock, no
randomness: identical inputs give identical bytes (SB-015). GM notes are
never read into the guidance (SB-123).

## Reaching the State Engine API

There is no global for the full API, so `src/api/` dynamically imports
`../../../SillyTavern-StateEngine/src/api/index.js` - only after
`api/dependency-check.js` has confirmed State Engine is running (it watches
for `window.StateEngineWI`). Adjust the path in `api/state-engine.js` and the
three template wrappers if your State Engine folder has another name.

## Open items decided for the MVP

| Open question | MVP choice |
|---------------|------------|
| OPEN-1 preset variables | As listed above. |
| OPEN-2 policies | The story leads: every field defaults to "story wins", and new objects the story invents are adopted (confirmed into the setting, marked `origin: 'story'`, a new place put next to the scene's previous location). A canon-only setting queues them for review instead. See ROADMAP.md, "Decisions that change the spec". |
| OPEN-5 POV | Not yet (knowledge boundaries are phase 0.5). |
| OPEN-6 setting data | Scenario Builder's own settings, keyed by setting id; pruned with `pruneSettingDocs`. |
| OPEN-10 calendar | No calendar: canonical time is a day number and a time of day. |
| OPEN-11 one variable | One guidance variable plus the optional state block. |
| SB-145 location parent | Kept in Scenario Builder metadata until State Engine has a `location.parent` field. |
