# Public API

Read-only, for other extensions (spec 11.5), except the actions below. Every result is a copy.

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
| `getRelationships(id)` | `Promise<[{ otherId, otherName, kind, note, direction }]>` - the relationships the user wrote for an entry, seen from it; they take precedence over the story's for the pair. |

## Actions

What a button on another extension's panel can do (Pretty Panels' Action
Buttons) - each the same as doing it in Scenario Builder.

| Call | Returns |
|------|---------|
| `getActions()` | `[{ id, label, icon, scope, description }]` - `scope: 'object'` acts on one object (a card's), `'panel'` needs none. `icon` is a Font Awesome name without `fa-`. |
| `runAction(id, objectId?)` | `Promise<{ ok, message }>` - `message` says why when it did nothing. |
| `openEntry(id)` | `Promise<boolean>` - opens the entry's page in Scenario Builder. |

| Action | Scope | Does |
|--------|-------|------|
| `open` | object | Opens its page in Scenario Builder. |
| `leave` | object | Takes them out of the scene (cast, or a creature kind), as a LEAVES from the game master would. |
| `map` | panel | Opens the map of the world's places. |
| `workspace` | panel | Opens Scenario Builder. |

## Events

On SillyTavern's `eventSource`:

| Event | Payload | When |
|-------|---------|------|
| `SCENARIO_CHANGED_EVENT` (`scenario_builder_scenario_changed`) | chat key | The chat's canonical state, queue or history changed. |
| `DRIFT_CHANGED_EVENT` (`scenario_builder_drift_changed`) | chat key | Validation added or resolved drift or candidates. |

## Capabilities declared with State Engine

`curator.inject:sb__guidance`, `curator.inject.role:user:sb__guidance`,
the same pair for `sb__state_block`, `scenario.library`, `scenario.state`.
