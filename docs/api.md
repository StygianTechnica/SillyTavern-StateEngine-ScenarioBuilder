# Public API

Read-only, for other extensions (spec 11.5). Every result is a copy.

```js
const sb = window.StateEngineScenarioBuilder; // set once Scenario Builder is ready
```

or `import { scenarioBuilderApi } from '.../SillyTavern-StateEngine-ScenarioBuilder/src/public-api.js'`.

| Call | Returns |
|------|---------|
| `getLibrary(type?)` | `Promise<entry[]>` - the open chat's setting library (all types, or one: `'character'`, `'location'`, ...). An entry is a State Engine object plus `meta: { parentId, gmNotes, tags, pinned, excluded, environment }`. |
| `getEntry(id)` | `Promise<entry \| null>` |
| `getCurrentScene()` | The open chat's canonical state `{ locationId, castIds, weather, temperature, indoor, dayPart, day, sceneTitle, scenePremise }`, or `null`. |
| `getLocationPath(id)` | `Promise<string[]>` - location names, root first. |
| `getPerspective(characterId)` | `null` for now (knowledge boundaries come in phase 0.5). |
| `getDrift()` | `{ pending, candidates, recent }` for the open chat, or `null`. |
| `getGuidance()` | `{ text, tokens, stateBlock, inert, reason }` - the latest outputs. |

## Events

On SillyTavern's `eventSource`:

| Event | Payload | When |
|-------|---------|------|
| `SCENARIO_CHANGED_EVENT` (`scenario_builder_scenario_changed`) | chat key | The chat's canonical state, queue or history changed. |
| `DRIFT_CHANGED_EVENT` (`scenario_builder_drift_changed`) | chat key | Validation added or resolved drift or candidates. |

## Capabilities declared with State Engine

`curator.inject:sb__guidance`, `curator.inject.role:user:sb__guidance`,
the same pair for `sb__state_block`, `scenario.library`, `scenario.state`.
