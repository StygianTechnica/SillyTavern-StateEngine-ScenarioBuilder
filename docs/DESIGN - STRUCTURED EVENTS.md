# Design - Structured events

The reason these extensions exist: guardrails so the model can run a
sequenced event inside a roleplay - a tournament, a dungeon crawl, an arena,
a programme of missions - without skipping ahead, repeating a step,
inventing the next opponent, or losing count. The GM planner and story
triggers are loose guidance; an event is a fixed order of steps that
Scenario Builder keeps, and the story is held to it.

Status: phase 1 (the arena) is built. The rest is the plan.

## 1. What an event is

An event is a **programme of stages**, kept in the chat document
(`doc.event`, one running per chat; finished ones go to `doc.eventsDone`).

```
event = {
  id, kind: 'arena' | 'tournament' | 'crawl' | 'programme',
  name,                       "The Pit of Brassport"
  placeId,                    where it is held (a location), or ''
  intro, close,               what opens and ends it (a herald, a crowd)
  prize,                      what winning brings
  onLoss: 'ends' | 'continue' an arena ends when the player loses a bout;
                              a programme may go on
  status: 'planned' | 'running' | 'won' | 'lost' | 'ended'
  current,                    index of the stage under way
  stages: [stage],
  startedTurn, endedTurn,
}

stage = {
  id, kind: 'bout' | 'moment',
  title,                      "Bout 2"
  opponents: [{ name, objectId }]   a bout: who comes out
  note,                       what this stage is about, for the director
  status: 'pending' | 'current' | 'won' | 'lost' | 'done' | 'skipped',
  startedTurn, endedTurn,     replies (doc.turn) it began and ended
}
```

- A **bout** is a fight with its opponents. It ends when the fight tracker
  (src/director/fight.js) says so: every foe down or fled - won; a foe who
  won - lost. A fight that stops with foes still standing is not an end:
  the bout goes on.
- A **moment** is one reply of the programme that is not a fight: the
  herald presents the entrants, the crowd roars, a rest between bouts, the
  victor crowned. It lasts one reply.
- Later kinds of stage (section 5): a **room** (a crawl), a **match** off
  screen (a tournament), a **wait** until a time on the calendar.

## 2. The guardrails

The whole point. Every reply while an event runs:

- **The director sees the current stage only** (a dossier section, THE
  EVENT): what the event is, which stage of how many, what this stage is,
  who is faced, what ends it - and that it may not introduce the next
  opponent, skip, repeat or end the stage on its own. It writes the
  briefing (FIGHT lines for a bout, ENTERS for the opponent) as it would
  for any fight.
- **The narrator is told the same, shorter** (a guidance section, "The
  event"), and that the next stage is unknown until this one ends.
- **Only Scenario Builder moves the event on.** At the start of a reply's
  briefing, a stage that ended in an earlier reply gives way to the next
  (or the event ends); after the briefing, the fight's state decides a
  bout. Swipes and regenerations brief the same reply again and never move
  it on twice (stages are keyed to `doc.turn`).
- **The user can always step in**: mark a stage won or lost, skip it, or
  end the event (the GM Plan tab).
- **No extra model call.** Everything rides on the director's ordinary
  briefing and the fight tracker. (Section 5's tournament and crawl add no
  calls either; generated events, section 6, cost one call when made.)

The director is required: without it there is no briefing to hold the
story to the stage. The event is shown as paused when it is off.

## 3. Phase 1 - the arena (built)

Opponents come out one after another; each is fought until beaten (or the
player is), then the next.

- Set up in the GM Plan tab: a name, the place, the opponents in order (one
  per line - a name, matched to a library character or creature when there
  is one), an introduction, a prize. Moments are put around the bouts:
  the introduction first, the close last.
- Start: the event runs from the next reply. Its stages, from the setup:
  `moment (introduction)`, `bout 1`, ..., `bout N`, `moment (the close)`.
- A lost bout ends an arena (`onLoss: 'ends'`): the close is skipped, the
  event is lost, and the director is told so once.
- Panels (Pretty Panels): `sb__event_active`, `sb__event_name`,
  `sb__event_stage` ("Bout 2 of 4: Graxx the Pit-Wolf"),
  `sb__event_progress` ("2 / 4").

## 4. Where it lives

- `src/events/model.js` - pure: normalizing, the arena's stages from a
  setup, the reply's stage (beginReply), a bout's result from the fight
  (afterFight), the user's overrides, and the text for the director,
  the narrator and the panels.
- `src/events/run.js` - reads and writes the chat document around the
  director's briefing (src/director/run.js) and the guidance
  (src/guidance/build.js, sync.js).
- `src/ui/gm-plan.js` - the Event card.

## 5. Later phases

**Tournament.** Entrants and a bracket. Each round the player's match is a
bout; the other matches are decided off screen (by the entrants' power
ratings - Combat in ROADMAP.md - or at random) and reported by a moment.
Rounds at times on the calendar ("round one at noon, the final the next
day"): a **wait** stage holds the event until the clock reaches it, the
story free meanwhile. The bracket is shown in a panel.

**Dungeon crawl.** Not a timeline: places linked by routes (the location
tree and src/library/routes.js), each a **room** stage with what waits
there, entered in any order the routes allow. State per room: cleared,
looted, a door opened, something still lurking. The current stage is the
room the scene is in (sb__canon_location), so moving decides it; a room
is cleared by its bout(s), or by a story flag (a story trigger) for a
puzzle or a trap. The director sees this room and the ways on, never
what waits beyond.

**Programme.** A free sequence of moments and bouts (a festival, a
trial): the general case the arena is one setup of.

**Missions** are already built (src/quests/missions.js) and stay quests.

## 6. Templates and generation

- Templates for each kind, kept per setting, so an event set up once can
  run in any chat on the world.
- Generated: the user gives loose guidance ("a tournament in the capital,
  five rounds") and one planner call fills the event from the setting -
  entrants from the library (new ones proposed like any planner idea),
  places, prizes.
- The planner reads the story for events ("the tournament at midsummer"):
  put on the calendar, set up when the day comes - within the director's
  restraint (events arise from the world, never for the player).
