# Design: the world meanwhile (off-scene simulation)

Status: **phase 1 built** (2026-10-28): ripples and stakeholders in code,
schemes moved by the DAY pass at the Quiet level (no call of its own), the
side log, MEANWHILE lines (rumours, news, traces, approaches - an approach
lets its people turn up, director/whereabouts.js), and the World card on
the GM Plan tab with the level and surfacing settings (src/world/,
src/ui/world-card.js). **Phase 2 built** (2026-10-29): the Lively and
Turbulent levels with a WORLD pass of their own (src/planner/run.js
runWorld, before the day plan so it takes in what the world brings);
arrivals, happenings on the agenda (an approach too, at those levels) and
quest hooks into GM ideas; the stir budget from the tension aim
(model.js stirOf); quieting the world for some days and leaving people
alone; HEARD lines from the director; `/sb-world`. Traces stay MEANWHILE
lines kept to their place rather than story triggers - no State Engine
variable needed. **Phase 3 built** (2026-10-30): see "Phase 3 as built" at
the end. Phase 4 is still design.

The GM planner (docs/DESIGN - GM PLANNER.md) thinks ahead about the
*story*: the outline, today's moments, ideas and the agenda. Its day plan
already holds a few one-line `offscreen` notes ("the Pale Choir sends a
rider north"), but they are written fresh each day, remember nothing and
change nothing. People and factions who are not in the scene do not
*pursue* anything.

This design adds a layer that does. After something happens - in the
story or off it - it asks who would care, what they would do about it,
and lets them get on with it while the player is elsewhere. What they do
is kept in a side log, and some of it reaches the visible story: a
rumour, a headline, someone coming to find the player character, a place
that has changed, a quest. The world keeps stirring, and people reach
their goals while they are off the page.

## 1. Goals

1. **Consequences.** A recent happening (a sighting of Cyril Moriarty,
   who everyone believes is dead) is read for who has a stake in it (his
   family, the faction he ran, the people who think they killed him, the
   player character's enemies) and what each would do (send someone to
   find out, close ranks, hunt him, sell the story).
2. **People pursue things off the page.** Each such effort is a
   **scheme**: who, what they want, why, the steps to it, how far along it
   is. Schemes move on as in-game time passes, succeed or fail, and leave
   their mark. A character's own goals (their Goals field) can be
   schemes too, so a rival who wants the guild seat works for it while
   the player is at sea.
3. **Wider situations.** Schemes that collide grow into **situations**
   that change the setting for a while: a faction war, a feud between two
   houses, public peace talks, a crackdown, a plague. A situation has a
   stage, sides, and a **public face**: what the news and the street say
   about it.
4. **Changes to places.** An off-scene act can leave a place changed: the
   Gilded Swan burned, the bank vault robbed, the bridge under guard. The
   place's description reflects it from then on (§3.6).
5. **It reaches the story.** The layer turns its work into things the
   director can use: a character who comes to the player character, a
   rumour or a headline, a happening on the agenda, a quest hook, a
   trigger waiting at a place (§4).
6. **The user is in control.** Off, or throttled from a quiet background
   to a turbulent one. It follows the tension the story wants, more
   conflict when the story should build and less when it should ease
   (§5).

## 2. Decisions so far

| Question | Decision |
|---|---|
| Is it a separate system? | **Part of the GM planner**, with its own pass (WORLD), its own data under `doc.gm.world` and its own setting. It replaces the day plan's free `offscreen` lines with the schemes' current steps. |
| Model calls | **No per-reply call.** Background only, through `callModel()`, held while a reply is written. In the *Quiet* level it costs no call at all: the DAY pass advances the schemes (§6). |
| Default | **Off** until the user turns it on (the call budget rule). Then *Quiet*. |
| What it may change | Its own records (schemes, situations, the log) freely. Things the story shares (a place's description, who knows a secret, where someone is) **for this chat only**, through overlays (§3.6). Making a change part of the setting is the user's choice. |
| Where new things land | The setting's creation mode, as for ideas: *Proposals* or *Add silently*. |
| Spoilers | Veiled like the day plan. What has gone public (a headline, a rumour the player has heard) is never veiled. |

Existing rules still hold:

- The player character is never written for. A scheme may be *about* the
  player character (watch them, approach them, frame them); it acts on the
  world around them, never on their choices.
- Every scheme names what it grows out of (relevance). No random colour.
- No duplicates under any type (`knownAs`).
- Canon-only settings: schemes, situations and the log are allowed (they
  live in the plan), but no new objects and no generated detail on
  existing ones (`library.mayAddGeneratedDetail()`).
- Where people are matters (`director/whereabouts.js`): someone days away
  cannot arrive tomorrow. Travel time is part of a scheme's steps.
- Deaths: an off-scene death of a named character needs the user's
  say-so in *Proposals* mode, and never touches a *plot device* or
  *unkillable* character. The dead stay dead (`state/death.js`).

## 3. The pieces

```
  story ──► RIPPLES (code: what just happened that someone would react to)
                │
                ▼
         STAKEHOLDERS (code: who cares - ties, knowledge, memberships, enemies)
                │
                ▼
   WORLD pass ──► SCHEMES (who wants what, steps, progress, visibility)
                │       │
                │       └─ collide / escalate ──► SITUATIONS (war, talks, feud)
                ▼
        THE WORLD MEANWHILE (side log, dated)        OVERLAYS (places, knowledge,
                │                                     whereabouts - this chat)
                ▼
   SURFACING (§4) ──► GM PLAN section · day plan moments · agenda · ideas · triggers
                                         │
                                         ▼
                                 per-reply DIRECTOR ──► narrator
```

### 3.1 Ripples (what someone would react to)

A ripple is a recent happening worth a reaction. They are gathered in code
with no call, after each reply and when the day turns:

- a **belief shaken** - someone saw the subject of a belief
  (`knowledge.js`, `beliefsSeen`): "Cyril Moriarty is dead", and a
  dockhand saw him on the quay;
- a **secret revealed**, an **oath broken** or kept;
- a **quest** finished, failed or abandoned; a mission done;
- a **death**, a capture, a fight won or lost (the fight tracker);
- a **beat** or **moment** done (BEAT lines), a **happening** played out;
- Archivist's **major events** and relationship turns (hostile, volatile);
- a **scheme's own step** off scene (the robbery happened: now the
  owners and the watch react) - this is what keeps the world turning;
- the **user's own**: "Rumour: Cyril was seen in Port Vael" from the GM
  Plan tab or `/sb-world rumour ...`.

Each ripple: `{ id, kind, text, at, day, ties: [objectId], public }`.
`public` says who could know of it: only those present, the
neighbourhood, or everyone (a fight in the market vs a whisper in a cell).
Ripples are kept a short while (the last 20) and marked *taken up* once a
pass has read them.

### 3.2 Stakeholders (who cares)

For each ripple, code picks who might react, from what the library already
holds:

- people and factions it **ties** to, and their reference fields
  (`relationsOf`) - family, employer, rival, members;
- **knowledge**: who knows the secret, who holds the belief, who is owed
  the oath;
- **faction memberships** (`faction-sync.js`);
- Archivist's relationship map: hostile or wary towards those tied;
- the player character's **enemies** and rivals, and anyone with a scheme
  already about the player character;
- a **power** whose champion or interests are touched (rarely - powers
  act through others).

Only those **not in the scene** take part (the director already plays the
ones present). Each stakeholder carries a short dossier: their goals and
personality fields, where they are, what they know, their standing with
the others. At most a handful per pass (Quiet 3, Lively 5, Turbulent 8),
the closest ties first. An entry can be marked **keeps to themselves**
(never simulated) or **always in play** (considered every pass).

### 3.3 Schemes (people pursuing things)

The WORLD pass decides what the stakeholders do. A scheme:

- **who**: a person or a faction (or several in league);
- **aim** and **motive**: "learn whether Cyril lives - he owes the family
  his silence"; the motive is what keeps it honest;
- **from**: the ripple or goal it grows out of;
- **steps**: three to five, each a sentence with where it happens
  ("send Ines to Port Vael", "question the dockhand", "find where he
  sleeps", "bring him home, or bury him for real"). Travel time is a step;
- **progress**: which step it is on, and the in-game day the next is due;
- **about**: whether it touches the player character, and how (watches,
  seeks, opposes, would help);
- **visibility**: *hidden* (only the log), *traces* (clues can be found:
  a stranger asking questions), *rumoured* (people talk), *public* (it is
  news). It rises as a scheme goes on;
- **status**: *under way*, *stalled*, *done*, *failed*, *dropped*;
- **outcome** when it ends, and what it changes (§3.6).

Schemes move one step at a time, when their day comes, so a busy world
still moves at the pace of the calendar. A big time skip moves several at
once (one pass covers the span). A scheme the story has overtaken (the
player found Cyril first) is closed by the pass, or right away when its
target is in the scene and the director's lines show it resolved.

**Goals as schemes.** A character's Goals field is a standing scheme in
waiting. When the IDEAS or WORLD pass finds someone who matters but has
been off the page a long time, it may start a scheme from their goal, so
they come back changed: promoted, married, ruined, armed.

### 3.4 Situations (the setting changes for a while)

Some things are bigger than one person's scheme: two factions' schemes
against each other, a scheme that goes public, or a ripple that touches
the whole place (the duke's death). The pass can raise a **situation**:

- **kind**: conflict (war, feud, gang war, rebellion), schism (a
  faction's own leaders falling out, which may split it in two), accord (peace
  talks, alliance, wedding, treaty), crisis (plague, famine, crackdown,
  storm), contest (election, succession, trial);
- **sides** and what each wants; the schemes that belong to it;
- **stage**: *brewing*, *open*, *turning*, *ending*, *over* - moved on by
  its schemes and the story;
- **where**: the places it touches (the docks are a war zone, the capital
  is full of envoys);
- **public face**: the headline and the street's version, which may
  differ from the truth ("talks go well" while one side arms);
- **effects** while it lasts: a stance between two factions (allies,
  wary, at war), a line for each place it touches ("patrols on every
  corner"), prices, curfews.

A situation is the world's weather: it is in the background of every
scene it touches until it ends. The director gets its line only for a
place it touches or people it involves.

### 3.5 The world meanwhile (the side log)

Every step a scheme takes, every situation's turn, is one dated line in a
side log: "14 Frostfall - Ines reached Port Vael and began asking after a
grey-eyed man." The log is the off-scene story. The user can read it on
the GM Plan tab (veiled lines show as "the Moriarty family made a move"),
and a line once surfaced is unveiled. The RECAP pass reads it, so a
volume's recap can tell what went on behind the scenes.

### 3.6 What changes: overlays

Off-scene acts leave marks. They are kept as **overlays** on the chat
document, so another playthrough of the setting starts clean - the same
reason `beliefsSeen` lives with the chat:

- **Places.** A place condition: "burned three nights ago - blackened
  timbers, the roof fallen in, watchmen posted", or "robbed: the vault
  door hangs open, clerks sweep up glass". The place's description is
  given to the director and the narrator *with* its condition from then
  on, and the location image prompt sees it too. A condition can be
  lasting (a ruin) or fade (rebuilt after N days, the guards leave after
  a week).
- **People.** Where they are now (the whereabouts read the overlay
  before the history), what they have learned (a knowledge item gains a
  `knownBy`, a belief is dispelled for a faction), their state (wounded,
  in hiding, promoted, dead - §2's rules).
- **Factions.** Stance between factions, held by the situation. A
  schism that ends in a split makes a **breakaway faction**: a new object,
  always a proposal whatever the creation mode (it is a large change to the
  setting), with its leaders, the members who went with it (their
  memberships move, for this chat), and its stance towards the faction it
  left. Canon-only settings keep the split as a situation only.
- **Things.** An item taken in a robbery changes hands (only items that
  are real plot points; the rest stay in prose).

**Making it canon.** Each overlay has *Make it part of the setting*:
the place's description is rewritten (or, if State Engine's object
variants fit, an "after the fire" variant is added and made active), a
knowledge item is updated. In *Add silently* mode the user still chooses
this; nothing in the setting changes on its own. Canon-only settings keep
overlays per chat and never write them back.

## 4. Surfacing: how it reaches the story

The point of the layer is content for the visible story. A scheme step or
situation turn can surface in one of these ways, chosen by the pass and
checked in code:

| Way | What the director gets | Example |
|---|---|---|
| **Approach** | Someone comes to the player character: who, why, what they want, what they hide. A moment in the day plan, with a trigger where it fits. | Ines Moriarty finds the player in the tavern and asks if they've seen her uncle. |
| **Rumour** | A line people in the scene may let drop, true or not, if it fits who is here. | "They say a dead man walks the quay at Port Vael." |
| **News** | A headline for heralds, broadsheets, feeds, the town crier, the bar's TV - the setting's own medium. | "Peace talks open in Halvren; the Tidecourt sends no envoy." |
| **Trace** | Something the player could find, at a place. A place trigger. | The dockhand's room has been searched. |
| **Changed place** | The overlay (§3.6) - shown when the scene reaches it. | The Gilded Swan is a shell; the watch asks everyone what they saw. |
| **Happening** | A dated agenda item. | The family's ship docks on the 17th. |
| **Quest hook** | An idea through the existing pipeline (proposals or silent). | "Find Cyril before the Moriarty family does." |
| **Arrival** | Someone the scheme brings *near*, so the whereabouts allow them to turn up. | Ines is now in the city. |

**In the GM PLAN section** the director gets, at most, two or three lines
under a heading of their own, inside the planner's budget:

```
MEANWHILE (private - what the world is doing; use it only where it fits)
- Word going round: a dead man walks the quay at Port Vael (true - Cyril Moriarty).
  Anyone from the docks may mention it.
- Coming: Ines Moriarty is in the city asking after Cyril; she may seek out the
  player character, who was last seen near him. She hides that the family wants
  him silenced, not saved.
- In the news: peace talks in Halvren.
```

The rumour and news lines are chosen for the scene: a rumour about the
docks in a dockside tavern, the talks in the capital. A line is shown a
few times and then retired, so the same rumour is not repeated every reply.
The director's existing restraint holds: it uses a line only where the
player's action leaves room.

### 4.1 Checking in: finding things changed

Most of what the world does is never pushed at the player. It waits to be
found. When the player character comes back to a faction they once
belonged to (or a town, or an old friend), the story should show what has
become of it while they were away, and two visits weeks apart should not
look the same.

**A faction's condition.** Each faction the layer touches keeps a short
condition, rewritten whenever its schemes or situations move:

- **standing**: *steady*, *thriving*, *strained*, *at war*, *divided*,
  *split*, *broken*, *gone to ground*;
- **leadership**: who leads now and who has fallen ("Enrique holds the
  council; Aldous Moriarty has left the table");
- **mood**: how its people are, in a line ("tense, suspicious of
  outsiders, recruiting");
- **what it is caught up in**: its situations and the stage each is at;
- **its places**: the overlays on its halls, warehouses and safehouses.

**Last contact.** Code records when the player character last had contact
with each faction and person: in a scene with them or their members, or
at one of the faction's places. It comes from the canonical history the
whereabouts already replay, so no call.

**When the scene touches it**, meaning the player character is at one of
its places, with its members, or asking about it, the director gets a
**since you were last here** line instead of the ordinary MEANWHILE ones:
the faction's condition, and the log lines about it since the last
contact, shown as what can be *seen* and what people will *say*:

```
MEANWHILE - the Medina Syndicate (last seen 40 days ago)
- Now: divided. The Moriartys and Enrique no longer sit at one table; the
  other leaders are choosing sides. Mood: tense, every stranger a spy.
- Here (the Syndicate hall): half the chairs empty; Moriarty men keep to one
  end of the room. Old friends greet the player character warily - asking
  which side they're on.
- What they'll tell an old member, if asked: Cyril is alive; Enrique tried to
  kill him; the warehouse on Salt Street burned last week.
```

What people tell depends on who they are: a loyalist gives their side's
version, a frightened clerk gives half of it, and an enemy lies. The
truth stays in the log. A faction that has split shows the split: the hall
belongs to one side now, and the other side's people are somewhere else.
A faction that hasn't changed gets nothing, and the story plays as normal.

The same works for **people** (an old friend who is now in hiding, or now
in charge) and for **places** (the town after the war passed through).

**A cheap report line.** The director may answer with
`HEARD | <scheme id> | <how>` when the player character learns of a scheme
in the story (overheard it, was told it). The scheme's visibility rises,
and its next steps can react ("they know we're looking").

## 5. Stir: following the story's tension

How much the world stirs, and in which direction, comes from three things
the planner already has:

1. **The user's level** (§6): the ceiling.
2. **The tension aim** (GM planner §5):
   - *build*: more schemes may surface, their next steps lean
     confrontational, situations may escalate a stage; new schemes may
     start from the shape's **lean** (threat: someone moves against the
     player; uncertainty: a rumour that doesn't add up; emotional: a
     friend's trouble, family strife);
   - *hold*: schemes move as scheduled, surface as their visibility says;
   - *ease*: schemes go on quietly but only good or neutral things surface
     (the talks make progress, a friend writes); hostile approaches wait
     (pushed to later days, not dropped); no escalation.
3. **The moment**: nothing new surfaces during a high-tension beat (a
   fight, a confrontation, a structured event's stage), and nothing while
   the pacing aim is *linger*: the world can wait for a scene the user is
   enjoying.

Code turns these into a **stir budget** per in-game day: how many
surfacings it allows and of what temper. The pass is told the budget;
code enforces it (extra surfacings are kept for later, not lost).

## 6. Levels, cadence and the call budget

| Level | Calls | Schemes under way | Surfacings per in-game day | Situations |
|---|---|---|---|---|
| **Off** | none | none | none | none |
| **Quiet** | **none of its own.** The DAY pass gets the schemes and the ripples and returns their steps along with the day plan (its `offscreen` becomes this). | up to 3 | 1 | none (only existing ones carry on) |
| **Lively** (suggested once on) | one WORLD pass when the day turns, and after a major ripple (at most one more a day) | up to 6 | 2 | up to 1 at a time |
| **Turbulent** | as Lively, plus every 12 replies when ripples are waiting | up to 10 | 4 | up to 2 |

The numbers are settings, like the planner's. As with every pass: one at a
time, held while a reply is written, skipped when its inputs have not
changed since the last run (hashed), logged in the Activity view so the
user can see what ran and turn it down.

**Throttle switches**, besides the level:

- **Surfacing**: *all*, *rumours and news only* (no approaches or quest
  hooks: the world goes on, the player hears about it), *log only* (the
  world goes on silently - read it on the GM Plan tab).
- **Changes to places**: on / ask / off.
- **Off-scene deaths**: ask (default) / allow / never.
- Per entry: *keeps to themselves*, *always in play*.
- **Quiet the world** now: pauses surfacing for N in-game days (also
  `/sb-world quiet 3`), for when the story needs to breathe.

## 7. The WORLD pass

Input:

- the ripples not yet taken up; the stakeholders and their dossiers;
- the schemes under way (with their next steps), the situations;
- the outline's current beat, the tension aim and lean, the stir budget;
- where the player character is and who is with them (so approaches can
  be aimed, and so the story isn't contradicted);
- the in-game date, days since the last pass, travel times between the
  places involved (from routes);
- the setting's medium for news (from the overview: criers, broadsheets,
  feeds), and canon-only.

Output (JSON through `parseModelJson`), small:

```
{ "schemes": [ { "id": "<existing, or empty for new>", "who": ["<names>"],
                 "aim": "...", "motive": "...", "from": "<ripple id or goal>",
                 "steps": ["..."], "step": 1, "next_in_days": 2,
                 "about_player": "seeks|watches|opposes|helps|none",
                 "visibility": "hidden|traces|rumoured|public",
                 "status": "under way|stalled|done|failed|dropped",
                 "log": "<what happened off scene this time, one sentence>",
                 "surface": { "way": "approach|rumour|news|trace|place|happening|hook|arrival",
                              "text": "...", "where": "<place>", "in_days": 0 },
                 "changes": [ { "kind": "place|whereabouts|knows|state|stance|split|item",
                                "target": "<name>", "text": "...", "lasting": true } ] } ],
  "situations": [ { "id": "", "kind": "...", "name": "...", "sides": [...],
                    "stage": "...", "where": ["..."], "headline": "...",
                    "truth": "...", "effects": ["..."] } ] }
```

Code then checks everything before anything lands: names resolve to
known objects (or become proposals for new ones), no one in the scene is
moved, travel time is honoured, the player character is never acted for,
deaths follow §2, the budget is kept, duplicates are dropped.

## 8. A worked example: Cyril Moriarty and the Medina Syndicate

The Moriartys are one of the families at the head of the Medina
Syndicate. Everyone believes Cyril Moriarty is dead. The truth, known to
Cyril and to Enrique (another of the Syndicate's leaders): Enrique tried
to murder him, and believes he succeeded.

1. **Ripple.** The director's reply has a dockhand swear he saw Cyril on
   the quay. The belief "Cyril Moriarty is dead" is shaken for one
   holder. Ripple: *belief shaken, neighbourhood*.
2. **Stakeholders** (code): the Moriarty family (Cyril's reference
   fields: niece Ines, brother Aldous); Enrique (the secret's `knownBy`:
   he has the most to lose); the Medina Syndicate itself (the faction both
   belong to); Inspector Hale (closed the case).
3. **WORLD pass** (Lively, aim *build*, lean *uncertainty*):
   - Moriarty family: *learn whether he lives* - Ines to Port Vael (2
     days), question the dockhand, find him. Hidden, rising to traces.
   - Enrique: *make sure he stays dead, quietly* - find the dockhand
     first, then Cyril. Hidden: he cannot be seen to care.
   - Hale: stalled - doesn't believe it (yet).
4. **Surfacing** that day (budget 2): a rumour in dockside scenes ("a
   dead man walks the quay"), and a trace (a stranger has been asking the
   harbourmaster about grey-eyed men).
5. **Two days on**: Ines arrives (arrival - now she *can* turn up), and
   the day plan gets a moment: she seeks out the player character, who
   was seen near the quay. The dockhand's lodging is found burned (a
   place change, Enrique's step).
6. **The secret comes out off scene.** Ines finds Cyril, or the dockhand
   talks before Enrique reaches him. Either way the Moriartys learn who
   tried to kill Cyril. The overlay adds the family to the secret's
   `knownBy`; the player character's knowledge is untouched.
7. **A situation: the Syndicate fractures.** The family's new scheme is
   *make Enrique answer for it*; Enrique's is *hold the Syndicate's
   leaders to his side*. Two leaders' schemes against each other inside
   one faction raise a **schism** (§3.4): sides (the Moriartys and those
   loyal to them; Enrique and his), stage *brewing*. Its public face starts
   as nothing at all, then "the Syndicate's leaders no longer sit at one
   table". Other leaders become stakeholders and choose sides one pass at
   a time - and a leader the player knows may come to them for help.
8. **Open schism.** A step goes public (a Moriarty warehouse is hit, an
   Enrique man is found in the harbour). The docks' places get a line
   ("shuttered stalls, both sides' men on the corners"). If the schism
   ends with the faction split, the pass proposes the **breakaway
   faction** as a new object (§3.6, *Factions*): its name, its leaders,
   which members went with it, and its stance towards the old Syndicate.
   The IDEAS pipeline gets a hook: "Get Cyril out of the city before the
   war finds him."
9. The player chooses. If they bring Cyril home, or bring proof to the
   other leaders, the schism may turn: Enrique cast out, or a truce
   brokered in public - talks in the news.

## 9. User interface

A **World** view in the GM Plan tab:

- **Meanwhile**: the side log, newest first, veiled per spoilers
  (surfaced lines are open).
- **Schemes**: each with who, aim, progress, visibility; veiled rows
  show only "a scheme of the Tidecourt's". Pause, end, or nudge one ("make
  it go public", "have them come to the player"); dismiss one that
  doesn't fit (remembered).
- **Situations**: name, stage, sides, headline; edit or end.
- **Changes**: the overlays (places, people, factions), with *Make it
  part of the setting* and *Undo*.
- **Add a rumour / a happening off scene**: a ripple of the user's own.
- The level, the throttle switches and *Quiet the world*.

The **Calendar** tab shows situation spans and scheme steps due (veiled).
A place's sheet shows its current condition; a person's sheet their
schemes. `/sb-world rumour <text>`, `/sb-world quiet <days>` and
`/sb-world` (what's going on, public only) from the chat.

## 10. Data

```
CHAT DOCUMENT  gm.world: {
    ripples:    [{ id, kind, text, at, day, ties, public, takenUp }],         // last 20
    schemes:    [{ id, who, aim, motive, from, steps, step, nextDay,
                   aboutPlayer, visibility, status, outcome, heard, at }],
    situations: [{ id, kind, name, sides, stage, where, headline, truth,
                   effects, schemeIds, startedDay, endedDay }],
    log:        [{ day, text, schemeId, situationId, veiled }],               // last 120
    overlays:   { places: { [placeId]: { text, since, until, lasting } },
                  people: { [personId]: { locationId, state, since } },
                  stances: [{ a, b, stance, situationId }],
                  factions: { [factionId]: { standing, leadership, mood, since } } },
    lastContact: { [objectId]: { turn, day } },                               // from the history
    surfaced:   [{ id, way, text, where, shown, until }],                     // lines for the director
    quietUntil, counters: { lastDay, repliesSincePass }, dismissed: [key] }

ENTRY META     world: { keepsToThemselves, alwaysInPlay }

EXTENSION SETTINGS  world: { level: 'off' | 'quiet' | 'lively' | 'turbulent' | 'custom',
                             maxSchemes, perDay, maxSituations, every,
                             surfacing: 'all' | 'talk' | 'log', places: 'on' | 'ask' | 'off',
                             deaths: 'ask' | 'allow' | 'never' }
```

Kept small (chat documents live in settings.json): finished schemes
leave a log line and go; the log is trimmed oldest first.

## 11. Code layout

- `src/world/model.js`: pure. Ripples from the chat's records, the
  stakeholders, the stir budget from the level and the tension aim,
  scheme progress by day, visibility, the checks on the pass's answer,
  overlays, and the MEANWHILE lines for a scene. Fully tested.
- `src/world/prompts.js`: pure. The WORLD prompt and its parser; the part
  added to the DAY prompt in *Quiet*.
- `src/world/run.js`: scheduling (with the planner's queue), the pass,
  applying results through the library and the planner (moments, agenda,
  ideas, triggers).
- `src/director/prompt.js`: the MEANWHILE section and the HEARD line.
- `src/director/whereabouts.js`, place descriptions in the guidance, and
  the image prompt: read the overlays.
- `src/ui/gm-plan.js` (World view), the Calendar tab, the sheets;
  `src/ui/slash-commands.js` for `/sb-world`.
- `src/store/schema.js`: the `gm.world` normaliser.

## 12. Phases

1. **Schemes and the side log, Quiet only.** Ripples and stakeholders in
   code; the DAY pass advances schemes (no new call); the log; the World
   view (Meanwhile, Schemes); MEANWHILE lines for rumours and approaches;
   the level setting. *Usable alone: absent people pursue things and the
   player hears of it.*
2. **Surfacing in full and the stir.** The WORLD pass (Lively,
   Turbulent); news, traces, arrivals, happenings, hooks and triggers; the
   stir budget from the tension aim; the throttle switches; HEARD lines;
   `/sb-world`.
3. **Situations and changes.** Situations with their stages, headlines
   and effects; faction conditions, last contact and the "since you were
   last here" lines (§4.1); overlays for places, people and factions; *Make it part of
   the setting*; off-scene deaths under §2; the Calendar and sheet views.
4. **Tuning.** How often surfacings are taken up by the director against
   ignored, stakeholder limits, prompt trimming for small models.

## 13. Open questions

1. **The news medium.** Read it from the setting overview each pass, or
   a setting field ("how news travels here: criers and broadsheets")?
   Proposal: a setting field, guessed once from the overview and editable -
   it differs a lot between a fantasy town, a 1920s city and a cyberpunk
   feed.
2. **Shared world across chats.** Overlays are per chat. Should a user be
   able to carry a chat's world state (situations, changed places) into a
   new chat or volume? Proposal: yes, with *Continue in a new chat* (GM
   planner open question 6).
3. **Factions in State Engine.** Faction stance today comes from
   Archivist and reference fields. Should a situation's stance be written
   to State Engine's faction tracking where a setting uses it?
4. **Object variants for changed places.** Check whether State Engine's
   `activeVariant` suits "after the fire" before relying on it; otherwise
   *Make it part of the setting* rewrites the description and keeps the
   old one in the change record for *Undo*.
5. **How much the player hears.** A rumour is cheap and atmospheric, but a
   small model may latch on to it. Proposal: a rumour line is shown at
   most three replies, only in a scene it fits, and retired once the
   narrator uses it (matched in the reply, as with BEAT lines).

## Phase 3 as built (2026-10-30)

The pure half is `src/world/situations.js`; `applyWorld` (model.js) takes
the new parts of an answer through it, and `src/world/run.js` does the rest.

- **Situations** (§3.4): the WORLD pass may begin one when the level has
  room (Quiet 0, Lively 1, Turbulent 2 open at once - `LEVEL_LIMITS.situations`;
  at Quiet, ones under way still move). A stage only goes forward; while
  the story eases or the world is quieted no conflict, schism or crisis
  begins or opens. Ending one drops the stances it held. A situation's
  headline reaches `/sb-world` once it is past *brewing*.
- **Changes** (§3.6): each scheme step may carry `changes` - `place`,
  `whereabouts`, `state`, `death`, `stance`, `split`. Checked in code:
  never anyone in the scene, the scene's own place or the player
  character. Places follow the *Changes to places* setting (on / ask /
  off); deaths the *Deaths off scene* setting (ask / allow / never) and
  never a plot device, an unkillable character or anyone the chat's "Who
  can die" spares. What asks waits under *Waiting for your say* on the
  World card (let go after 7 in-game days). A death allowed is marked with
  source `world` and stays (it is not undone by taking a reply back). A
  split marks the faction *split*; the breakaway is always a GM idea of
  kind `faction` (none in a canon-only setting).
- **Make it part of the setting**: a changed place's description takes the
  change in as a new paragraph; the old description is kept for Undo. Not
  offered in a canon-only setting or on an entry that takes no generated
  detail. (State Engine object variants were not used - open question 4.)
- **Faction conditions and last contact** (§4.1): the pass gives a
  faction's standing, leadership and mood when they change. After each
  reply code notes contact with the people here, their factions, the
  places the scene is in and factions tied to them by reference fields; a
  gap of more than two replies makes the next contact a new visit.
- **THE WORLD HERE NOW**: a section before the GM PLAN, shown even while
  the scene is tense (they are facts): the scene's place if it changed,
  situations touching the place or the people here, someone here the
  world has changed, and - for the first few replies of a visit to a
  faction or person (here, their place, or named by the player) - their
  condition and the log lines tied to them since the last contact.
- **Whereabouts**: someone the world moved counts as last seen there, now;
  their state goes with them under OTHERS WHO COULD TURN UP.
- **UI**: the World card lists situations, what waits for the user's say,
  and the changes (Undo, Make it part of the setting, and Undo of that); a
  sheet shows "Off scene, in this chat" for a place, person or faction; the
  Calendar shows schemes' next steps and when situations began and ended,
  veiled like the World card.
- The log keeps `ties` (who a line is about) and `situationId`.

Not done: the location image prompt does not read a place's change yet,
and the places a situation touches get no effect line of their own outside
THE WORLD HERE NOW.
