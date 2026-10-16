# State Engine Scenario Builder

The narrative director for the State Engine + Archivist + Curator system.
Instead of leaving the roleplay model to infer where the scene is, who is
present and what is true, Scenario Builder holds that state, checks the
story against it, and hands the model short, deterministic guidance.

See the [requirements specification](SCENARIO%20BUILDER%20REQUIREMENTS%20SPECIFICATION.md)
for the full design, [architecture.md](architecture.md) for how the code is
laid out, and [api.md](api.md) for the public API.

## Requirements

- **State Engine** (required). Without it Scenario Builder shows one notice
  and stays off.
- **Curator** (optional, recommended) injects the guidance into the prompt.
  Without it the guidance is still written to `sb__guidance`, usable through
  State Engine's macros (e.g. in a World Info entry).
- **Archivist** (optional) - not used yet; memories feed the guidance in a
  later phase.

## Getting started

1. Install next to State Engine (`.../extensions/third-party/`), enable, reload.
2. Open a chat. In the **Scenario Builder** drawer (Extensions panel), click
   **Activate** to bind the *Scenario State* preset to the chat. If State
   Engine's *Scene Context* preset is also active, the drawer says so - it is
   not needed alongside Scenario State, but Scenario Builder never touches it.
3. Click **Open Scenario Builder**:
   - **Catalog** - the setting book: a front page (premise, tone, rules, the
     canon switch) and a chapter per type, browsed as cards, a list or (for
     locations) a drag-and-drop tree. Each entry opens as a sheet with
     Overview, Details, Relationships, Story (history and Archivist memories),
     Image and GM notes. Every entry is a State Engine object in the chat's
     setting.
   - **Image** (on a sheet) - a prompt written for Midjourney (or Stable
     Diffusion / natural language) in your chosen style, to copy out. Then
     upload, paste or link the picture, or generate one with SillyTavern's
     Image Generation extension.
   - **Scene** - set the canonical location, who is present, time, weather,
     the scene title and premise.
   - **Preview** - the exact guidance text, its token count and why each
     section is there.
4. In Curator's **State Engine Variables** bank, tick **Narrative guidance**
   (and optionally **Canonical scene state**).

## What happens each turn

1. Before a reply is generated, the canonical values are written into the
   scene variables and the guidance is rebuilt.
2. After the reply, State Engine extracts what the story says into the
   prompted `sb__scene_*` variables.
3. Scenario Builder compares that with canonical state. The story leads: by
   default its changes are **accepted**, and a place or character it invents
   is **adopted** into the library at once (Review → *New from the story*
   lists it so you can flesh it out, re-place it, or say it is not part of
   this world). Per field you can choose instead to **write the canonical
   value back** (with a correction line in the next guidance) or to **ask**.
   A setting marked **Canon only** sends inventions to Review instead.
4. Swiping, editing or deleting a reply reverts what it changed.
   Everything automated is in **History**, with undo.

## Outputs

| Variable | What it holds |
|----------|---------------|
| `sb__guidance` | Setting overview, location path and environment, time and weather, scene, characters present (with their mood and intent from State Engine), and active corrections - within a token budget. `''` when paused, disabled or the preset is inactive. |
| `sb__state_block` | The canonical state, one line per value. Optional. |

Both begin with `REFERENCE ONLY — DO NOT CONTINUE`, never name Scenario
Builder, and are byte-identical for identical inputs.

## Status (0.1)

Implemented: the MVP of the spec's phasing table (section 15) - dependency
check and registration, setting obtained from State Engine, the Scenario
State preset with drawer shortcut and Scene Context hint, a catalog for all
nine object types (CRUD through the Object API, duplicate guard, referrer
check before delete) with the location tree, manual canonical state,
`sb__guidance` / `sb__state_block` with Curator capabilities, preview -
plus, from 0.3, location/cast/weather validation with candidates, review
queue, corrections, history/undo and swipe handling, and a read-only public
API.

Since then: the catalog redesign (cards/list/tree, entity sheets, read
and edit modes, relationships, per-entry story, current description), image
prompts and attachments, story-led validation with adoption, and the canon
switches. The workspace window stays open until you close it.

Deferred work is tracked in [ROADMAP.md](ROADMAP.md). Not yet: relevance scoring across the wider library, groups and bulk
operations, Archivist memories in the guidance, content and world
generation, World Info import/export, quests and events, knowledge
boundaries. See the spec's phases 0.2-0.5.

## Development

```bash
npm install
```

```bash
npm test
```

Only the pure-logic modules (hierarchy, drift, guidance, budget, schema,
status text) are unit-tested; they import nothing from SillyTavern.
