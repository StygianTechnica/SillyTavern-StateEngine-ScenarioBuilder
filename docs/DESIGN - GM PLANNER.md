# Design: the GM Planner

Status: **phases 1-4 built** (2026-10-18). Phase 1: the day plan,
CHECK and INSPIRE passes, the guidance queue, inspiration texts, pacing,
the GM PLAN section with BEAT lines and the GM Plan tab (src/planner/,
src/ui/gm-plan.js). Phase 2: story shapes and the tension aim
(src/planner/shapes.js), Archivist's tension readings (or CHECK's own),
the OUTLINE pass, and the outline with its chart in the GM Plan tab.
Phase 3: volumes (§5.1) - the chronicle, the RECAP pass, finishing or
closing a volume and beginning the next, the story so far - and the
/sb-request and /sb-requests slash commands (src/ui/slash-commands.js).
Phase 4: the IDEAS pass (frictions, open quests, lore not in play -> quest
hooks, quest detail, happenings, seeds), GM ideas to accept, edit or
dismiss, or silent creation per setting, and the agenda (fed to the day
plan, shown on the Calendar tab). Phase 5 (tuning) is still design.

Today the game master (src/director/) works one reply at a time. Before each
reply it reads the recent chat and the scene, then briefs the narrator on
what should probably happen next. It has no memory of intent: it does not
know where the story is heading, what today holds or what the user would
like to see. This design adds a **planner** that thinks ahead in the
background, and feeds the per-reply director a small private plan to carry
out silently.

## 1. Goals

1. **A long-term story outline**, shaped by a chosen *story shape* and
   steered along a target tension curve using Archivist's tension readings.
   The user can read and edit it.
2. **A plan for each in-game day**: the beats, the people's agendas and
   the off-screen moves for the day. The director carries it out through
   the guidance without announcing it. The plan is corrected as the player
   does things; it is never a script.
3. **Proactive worldbuilding.** In the background, the planner looks at
   factions, frictions, standing quests and lore that are *not* in the
   scene. It deepens standing quests with lore and detail, and invents new
   potential quests and happenings tied to the current story. This brings
   lore into play that would otherwise stay on the shelf.
4. **A calendar of happenings**: things scheduled for later in-game dates so
   they come up at the right time without disrupting the current scene.
5. **A user guidance queue**: "add an NPC", "I want a new quest", "visit
   somewhere new", in the user's own words. Requests shape the near-term
   plan without overturning the outline.
6. **Inspiration texts**: a story, a poem or song lyrics the user gives as
   inspiration. They are read for imagery, motifs and themes to weave in
   symbolically, never taken literally.
7. **Time keeps moving.** When a scene idles or the user's posts turn short
   and passive, the director closes the scene from the world's side and
   moves time on. It never rushes a user who is deeply engaged (§6.1).
8. **Volumes.** When a story reaches its end, the user can go on with a
   new volume of chapters. The finished volume is written up as a
   narrative recap, so the user has the full picture of what has happened
   so far, and the next volume grows out of it (§5.1).

## 2. Decisions so far

| Question | Decision |
|---|---|
| Where the planner's inventions land | **Per setting.** A setting option chooses *Proposals* (the default: the user accepts, edits or discards each one) or *Add silently* (they are created and listed in Review afterwards, like the director's additions today). |
| Spoilers | **Veiled by default, with an override.** The details (day plan, scheduled surprises, people's hidden agendas) are veiled, and the user can reveal them. It is a per-user preference: some people love surprises, some hate them. |
| Background model use | **Configurable.** Light / Moderate (default) / Heavy, plus per-pass overrides for those who want to tune further. |
| Target tension | **The user picks a story shape** for each chat (slow burn, adventure serial, thriller, mystery, intrigue...). The shape sets the target curve. |
| When a story ends | **The user may continue with a new volume.** A narrative recap of the finished volume is written and kept; the next volume starts a new outline (on the same or another shape) that grows out of it. |

Existing rules still hold:

- The player character is never written for.
- The director creates only what the scene needs: proposals are the
  planner's own ideas, *not* raw detections, so this is no second review
  of State Engine's object confirmation.
- Canon-only settings get no generated detail
  (`library.mayAddGeneratedDetail()`).
- Duplicates are never made (`prompt.js knownAs`).
- No wait before the user's message is accepted.

## 3. The pieces

```
                    ┌──────────────── user ─────────────────┐
                    │ story shape · outline edits · queue · │
                    │ inspiration texts · accept/discard    │
                    └───────────────┬───────────────────────┘
                                    ▼
 Archivist ──tension, threads──►  STORY OUTLINE  (long term: acts, beats,
 library ───factions, lore────►   │               threads to lean on, motifs)
                                  ▼
                 IDEAS PASS ──► proposals / new objects ──► AGENDA (dated happenings)
                                  │                              │
                                  ▼                              ▼
                               DAY PLAN  (today: beats, agendas, off-screen moves)
                                  │   ▲ corrections (CHECK pass, BEAT lines)
                                  ▼   │
                         per-reply DIRECTOR (existing) ──► guidance ──► narrator
```

### 3.1 Story outline (long term)

The outline is held per chat and is always available to the user (see §8 for
what is veiled):

- **Premise and themes**: what this story is about, in a few sentences.
  Seeded from the setting overview, the GM style notes, the inspiration
  motifs and the story so far.
- **Story shape** (§5) and the **current position** on it.
- **Acts → beats.** Each beat has a short summary, the threads/quests it
  leans on, a target tension band, its status (`pending`, `active`, `done`,
  `skipped` or `replaced`), and optionally the people, places and factions
  involved.
- **Seeds**: foreshadowing to plant early so a later beat pays off.
- **Motifs**: images and symbols distilled from the inspiration texts (§7)
  that recur through the story.

**A story already under way.** Many chats are joined in the middle, so the
first outline must not start the story over. When the chat is already long
(more than 12 messages), or the user says so, the OUTLINE pass is told it is
taking over a game in progress. It gets **the story so far**: the user's own
note, Archivist's story summary, its major events and open threads, and the
quests in play. It sums up the chapters already passed as *done* beats and
puts the active beat where the story is now. The user can also pick the
chapter the story is in ("The story is now in: Chapter 2"). The planner then
enforces it: every beat before that chapter is marked done, and the story
picks up there (`model.js startAt`). Both are used the next time the outline
is written or rewritten, so a wrong first outline is fixed with **Rewrite**.

Beats are deliberately loose ("the alliance with Graxx is tested by a
betrayal from within"). The day plan decides *how* and *when*. The user may
edit any beat or lock it so the planner keeps it as written. They may also
add a beat of their own or ask for an outline rewrite.

### 3.2 Day plan (one in-game day)

The day plan is made when the clock crosses into a new in-game day, and on
demand:

- **Moments**: two to five things that could happen today. Each has a rough
  time of day (morning, afternoon...), a trigger ("when Remus is at the
  forge"), a tie to an outline beat, an agenda item or a queued request,
  and a flag for whether it can be dropped.
- **Agendas**: for each person who matters today, what they want and what
  they will do about it, including anything they are hiding.
- **Off-screen**: what factions and absent people are doing meanwhile.
- **Tension aim** for the day: *build*, *hold* or *ease* (§5).

The director gets only the next one or two relevant moments, the agendas of
the people present and the tension aim, in a private section (§6). Moments
are opportunities, not obligations: when the player goes elsewhere, they
are skipped or moved, never forced.

### 3.3 Agenda (the calendar of happenings)

The agenda holds dated, one-off things scheduled for later: a festival
riot, an envoy's arrival, a death knight raid, a letter. Each happening has
an in-game date (or a window), what happens, who is involved, and a link to
an outline beat, a quest or an event object. The ideas pass and the user put
happenings on the agenda. When one comes within a day or two, the day plan
takes it in. The setting's recurring **holidays** stay as they are; the
agenda is per chat. It shows in the Calendar tab, veiled when spoilers are
hidden.

### 3.4 Ideas pass (proactive worldbuilding)

The ideas pass is a background pass over everything *not* in the current
scene:

- **Frictions**: Archivist's relationship map (hostile, wary, volatile
  trends), faction relations, broken or pending oaths, kept secrets.
- **Standing quests**: thin ones get lore, detail, complications and
  objectives (the objectives the quest model already has).
- **Shelf lore**: lore entries not used in this chat that could tie in.

Its output, up to a small number per pass:

- **Quest hooks**: new potential quests tied to the current story
  (never random: each must name what it grows out of, the same rule as the
  director's relevance).
- **Quest enrichments**: lore and complications for existing quests.
- **Happenings** for the agenda.
- **Seeds** for the outline.

How they land depends on the setting's creation mode (§2). In *Proposals*
mode they wait under **GM ideas**. In *Add silently* mode they are created
and listed in Review. Every idea goes through the same guards as the
director: relevance, `knownAs` (no duplicates under any type) and the
canon-only gate.

### 3.5 User guidance queue

The queue holds free-text requests with an optional urgency: *soon*,
*today*, or *whenever it fits*. Examples: "add an NPC who's a rival
smuggler", "I want a new quest", "let's visit somewhere new", "more
romance", "a quiet scene".

- A queued request is read by the next CHECK or day-plan pass, which turns
  it into one or more moments (and, if it needs one, an idea such as a new
  NPC or quest, proposed or created per the creation mode).
- The request is marked *planned*, then *done*. The user can withdraw it at
  any time.
- Requests bend the near-term plan, never the outline. A request that
  *would* change the outline ("make this a romance") is proposed as an
  outline change for the user to accept.
- A request with *soon* urgency also goes straight into the next director
  briefing as a private nudge, so it doesn't wait for a background pass.

**From the chat: `/sb-request`.** The user can queue a request without
opening Scenario Builder, by typing a slash command in the chat box:

```
/sb-request add an NPC - a rival smuggler
/sb-request urgency=soon a quiet scene by the fire
/sb-request urgency=today I want a new quest
```

- `urgency` is `soon`, `today` or `whenever` (the default, as in the tab).
- The request goes into the open chat's queue exactly as if it was added
  in the GM Plan tab. The command shows a short toast ("Queued for the game
  master") and returns the request's id, so STscript can chain it. Nothing
  is posted in the chat.
- `quiet=true` skips the toast.
- `/sb-requests` lists the open chat's open requests with their status, in
  a toast or as the command's result. It is an easy way to check what is
  still waiting.
- Without an open chat, a bound setting, or with the planner off, the
  command says why and queues nothing.

## 4. Passes and cadence

Every pass is a background call through `generate/llm.js callModel()`.
These calls run one at a time and are held while a reply is being written,
so they never delay a reply or cut it short on a single-slot local server.
The per-reply director keeps its own call. It does no extra planning work;
it only *reads* the plan, so reply latency does not change.

| Pass | What it does | Moderate (default) | Light | Heavy |
|---|---|---|---|---|
| **CHECK** | Short. Given the plan and the last few messages: which moments happened, which can no longer happen, any queued requests to fit in. Small JSON. | every 3 replies, and when the director reports a skipped beat | when the director reports one | every reply |
| **DAY** | Plans the in-game day (§3.2). | each new in-game day | each new in-game day | each new in-game day, plus re-plan after a big deviation |
| **OUTLINE** | Reviews the outline against the story and the tension readings; moves the position on; rewrites beats not yet reached if needed (never locked ones). | every 15 replies, or after an Archivist compile | on demand | every 8 replies, and after each compile |
| **IDEAS** | Proactive worldbuilding (§3.4). | every 20 replies | on demand | every 10 replies |
| **INSPIRE** | Distils an inspiration text into motifs (§7). | once per text added | once per text added | once per text added |

All the numbers are user settings. *Off* turns the whole planner off, and
the director works as it does today. A **Plan now** button runs DAY (and
OUTLINE if there is none). Each pass records its time and outcome in a short
log for the GM Plan tab, so a user who finds the calls too much can see
what ran and turn passes down.

A pass is skipped while the previous one of the same kind is still queued.
A pass whose inputs haven't changed since it last ran (hashed, as the
director does) is skipped too.

## 5. Story shapes and tension

**Archivist's readings.** Archivist's `getCompiledMemory()` gives `tension:
[{ message_index, threat, uncertainty, emotional, overall, reason }]` (one
per compile batch) and `tension_now`. Scenario Builder doesn't read these
yet. The planner uses `overall` (0-5) and looks at the three parts to
decide *what kind* of pressure to add or release.

**Shapes** are small built-in definitions, plus the user's own later
(stored on the setting, so they are shared by its chats). A shape gives:

- acts with a share of the story each, and per act a **target band**
  (min-max overall tension) and a pattern (a steady rise; waves of rise
  and relief; a long low simmer with sharp spikes...);
- the **lean**: which of threat, uncertainty or emotional it favours (a
  mystery leans uncertainty, a romance emotional, a thriller threat);
- how often it wants a breather.

Starting set: *Slow burn*, *Adventure serial* (episodic rise and fall, each
episode ending on a hook), *Thriller*, *Mystery*, *Intrigue*, *Romance*,
*Slice of life* (low, gentle waves).

**Position.** Story progress can't be measured from the message count
alone, so the position is the outline's beat progress (beats done out of
beats planned), corrected by the OUTLINE pass. Given the position, the
shape gives a target band, and comparing it with `tension_now` gives the
**tension aim**:

- *build*: below the band; bring in pressure along the shape's lean.
- *hold*: inside the band.
- *ease*: above the band, or overdue a breather; give a quiet moment, a
  relief or a small win.

The day plan and the director's private section carry the aim as a word
and a sentence ("build: uncertainty - someone isn't who they claim").

**Without Archivist**, or before its first compile, the CHECK pass gives
its own 0-5 reading on the same three scales. The UI shows where each
reading comes from.

**Graph.** The GM Plan tab draws the target band along the outline next to
the readings: a small chart of the story so far against the shape.

### 5.1 Volumes: when a story ends

One outline on one shape is a **volume**; its acts are shown as its
**chapters**. A volume ends; the story need not. (SillyTavern's Story Mode
extension does something similar: it summarises the story so far and
starts a fresh one. Here the summary is written from the planner's own
record and the new volume carries on in the same world, with the same
library and the same chat.)

**When a volume is complete.** A volume is complete when every beat of its
last chapter is done or skipped. The planner notices (no extra call) and
stops reviewing the outline. The Outline view says the volume is complete
and offers:

- **Continue with a new volume**: writes the recap, then starts the next
  volume (below).
- **Keep going in this one**: an epilogue. The director keeps winding the
  story down at the last chapter's tension, and nothing changes until the
  user chooses.

The user can also **close a volume early** at any point ("this arc is
done; let's move on"). The beats still to come are kept in the record as
*not reached*.

**The recap (RECAP pass).** A narrative of the finished volume for the
user: several paragraphs of prose in the past tense, telling what happened
from beginning to end. Who did what, what was won and lost, what changed
between people, what was left unresolved. It is written for the user, not
for the narrator, so it may tell what the player character did (as
history, never as a decision for the future). The pass draws on:

- the volume's outline: premise, themes, every beat with how it played out
  (the notes the director's BEAT lines and the CHECK pass leave);
- the volume's **chronicle**: one line kept for each beat or moment the
  story played out, and each quest finished, while the volume ran (cheap,
  no call);
- Archivist, when it has compiled: its story summary and the major events
  of its timeline within the volume's messages;
- the quests opened, finished, failed or still open.

The same pass names the volume (a title the user can change) and lists the
**threads carried forward**: what is still open and should matter in the
next volume. The user can edit the recap and the threads; their edits are
kept.

**The next volume.** The user picks a shape (the same one by default) and
may add a line of direction ("the war comes to Redhaven", "something
quieter"). The first OUTLINE pass of the new volume gets the previous
volumes as background: the latest recap in full, earlier ones as their
first paragraph, and the threads carried forward. It is asked to grow the
new volume out of them, not to retell them. The tension chart starts again
at the new volume's beginning. Readings belong to the volume they were
taken in, and the chart shows the current volume's. The day plan, the
queue, the inspirations and pacing carry on unchanged.

**The story so far.** A **Volumes** section in the GM Plan tab lists the
finished volumes, newest first. Each has its title, shape, in-game dates
and reply span, and its recap, collapsed until opened. Recaps are never
veiled: they are the past. The whole story so far, every recap in order,
can be copied, or saved as a Markdown file. The planner's passes get a
short "story so far" (the latest recap's first paragraph and the threads
carried forward). The director gets nothing more than the outline it
already has, so the guidance stays lean.

## 6. How the director uses the plan

`buildDirectorPrompt()` gets one more dossier section, after the threads
and before the latest chat:

```
GM PLAN (private - never mention it; it guides what you choose, it is not a script)
- Aim: build (uncertainty) - the story wants questions it can't yet answer.
- Pace: move on - the talk has run its course; close the meal and let the
  evening pass toward the envoy.
- Coming up: [m3] Envoy from the Pale Choir arrives at the gate (afternoon; if the
  scene is at the fortress) - lets Niamh test Graxx's offer.
- Agendas: Graxx wants Remus committed before nightfall; hides that he already
  sent word to the Choir.
- Requested by the user: a new NPC - fit one in where it is natural.
- Motif: a cracked bell; things that ring false.
```

The director stays in charge of the moment. Its instructions say: weave a
coming moment in only where the player's action leaves room; never steer the
player character; drop a moment that no longer fits. New format lines report
back cheaply, so a CHECK pass is needed less often:

```
BEAT | m3 | done | <how it played out, a few words>
BEAT | m2 | skipped | <why>
```

These are parsed like the existing MOVE and ENTERS lines and update the day
plan straight away. A *skipped* report triggers a CHECK (in Light mode, the
only trigger).

The budget for the private section is small (target under 150 words) and
counts in the guidance budget the same way the briefing does.

### 6.1 Pacing: keeping time moving

The director already says how much time each reply covers (the TIME line),
but it only follows the story. It should also **keep the story moving**:
when a scene has run its course, move on in time rather than letting it
idle. When the user is deeply engaged, never rush them.

**Signals.** These are measured in code from the chat, with no extra model
call:

- **User engagement**: the length of the user's recent posts compared with
  their own usual length in this chat, and whether the posts carry dialogue,
  questions put to others, or deliberate actions. Short, passive posts
  ("I nod.", "ok", "*listens*") mean low engagement.
- **Scene age**: replies since the scene began (a MOVE, a new SCENE title
  or a time skip resets it) and in-game time spent in it.
- **Scene activity**: whether the last few replies changed anything. A
  beat was done, someone entered or left, a quest moved, the tension
  reading changed. Otherwise the scene is idle.
- **The plan's pull**: the next moment of the day plan or a due agenda
  happening is later in the day or somewhere else, or a queued request
  asks for something new ("visit somewhere new").

**The pace aim.** Each reply, the signals combine into one of three
words, given to the director in the GM PLAN section next to the tension
aim:

- *linger*: the user is engaged and the scene is alive. Give it room;
  time moves only as the story says.
- *steady*: the default. Ordinary time per reply.
- *move on*: low engagement, an idle or long scene, and/or the plan
  pulling elsewhere. Bring the scene to a natural close and move time on.

**How the director moves on.** It must never decide for the player
character, so it does not write "you leave" or "you sleep". It closes the
scene from the world's side and lets time pass:

- the others wrap up: the meal ends, someone takes their leave, the
  conversation reaches its point;
- the world intervenes: a messenger, nightfall, the bell for the watch, a
  coming moment from the day plan arriving;
- a soft cut: the narrator is told to summarise briefly ("the evening
  wears on...") up to the next moment worth playing, with the TIME line
  covering the gap (an hour, "the next morning"). The cut stops short of
  anything the player character would choose to do.

It ends on a hook that hands the decision back to the player: where the
story could go next.

**Restraint.** *Move on* is never chosen while the user's last post asks
something, starts something or holds dialogue still in progress, or
during a high-tension beat (a fight, a confrontation). A big time skip (more
than a few hours) needs both low engagement *and* idleness. Only the plan's
pull is not enough. A user who writes `[stay]` or similar out of character,
or adds "linger here" to the queue, holds *linger* until the scene changes.

**Settings.** *Pacing* has four values: Off, Gentle (default: *move on* only
after several idle, low-engagement replies), Brisk, and Fast. It sets how
readily the signals tip into *move on* and how long a soft cut may span.

**Day rollovers.** Moving time on also answers open question 1: a chat no
longer spends 40 replies in one evening unless the user is clearly enjoying
it, so day plans turn over naturally.

## 7. Inspiration texts

The user pastes or uploads text (a story, a poem, lyrics) on the GM Plan
tab, for the chat or for the setting (a setting's text inspires all its
chats). The INSPIRE pass distils each text into **motifs, images, emotional
tones and themes**: "a lighthouse keeper's loneliness, lamps that go out one
by one, a promise kept too long". Only these distilled motifs are used by
the other passes. The source text is not sent again, the outline never
quotes it, and the story is told never to copy it. The text stays on the
user's machine in the setting or chat document, and the user can remove it.
The OUTLINE and IDEAS passes are asked to work motifs in *symbolically*: as
recurring images, echoes and turns of fate, never as literal events or
retold plot.

## 8. User interface

A **GM Plan** workspace tab:

- **Outline**: the current volume's chapters (acts) and beats on the
  shape's tension chart. The user can edit, lock, add, finish or remove
  beats (edited in place, never in a pop-up), **regenerate one beat** (a
  small BEAT pass, with an optional steer), or **regenerate the outline**
  with an optional steer, keeping or dropping the beats they locked or
  wrote (what the story has done is always kept). Chapters still to come are veiled (see
  *Spoilers* below). When the volume is complete (or the user closes it):
  continue with a new volume, or keep going in this one.
- **Volumes**: the finished volumes with their recaps (§5.1), to read,
  edit, copy or save.
- **Queue**: add a request (with urgency), see each one's status
  (*waiting*, *planned*, *done*), withdraw. Requests can also be added from
  the chat with `/sb-request` (§3.5).
- **Inspiration**: add or remove texts; see the motifs drawn from each and
  edit them.
- **GM ideas** (Proposals mode): proposed quests, enrichments, happenings
  and seeds. Each can be accepted (created through the normal library
  path), edited, or discarded (remembered so it isn't proposed again).
- **Today**: the day plan (moments, agendas, off-screen moves) and the
  tension aim.
- **Agenda**: dated happenings. They also appear in the Calendar tab.
- **Activity**: the pass log (what ran, when, outcome), plus **Plan now**
  and the cadence settings.

**Spoilers.** One per-user preference, *Show spoilers* (off by default),
kept in the user's settings rather than the chat. While it is off:

- Today's moments, agenda happenings and hidden agendas show as veiled
  rows ("3 moments planned for today", "a happening on the 14th of
  Frostfall"), each with a *peek* control for a single item.
- The outline shows the *current* act and the beats already done; future
  beats are veiled the same way.
- The queue, inspiration texts and GM ideas are never veiled: the user
  made or must decide on them. One exception: an idea's twist can be
  veiled if it gives away a hidden agenda.

Turning *Show spoilers* on asks once ("You'll see what's planned - the
story will hold fewer surprises"). That is the override for the
determined.

## 9. Data

Chat documents live inside SillyTavern's settings.json, so the plan has to
stay small. It holds only what the plan needs now and trims its history.

```
CHAT DOCUMENT  + gm: {
    shape,                      // shape id; '' = none chosen (planner asks)
    outline: { premise, themes, position, acts: [{ id, title, share, beats: [beat] }],
               seeds: [{ id, text, payoffBeatId, planted }], motifs: [text],
               updatedAt, lockedIds: [beatId] },
      beat = { id, text, ties: [objectId], band: [min, max], status, note }
    day: { day,                 // the in-game day index it was made for
           aim: { word, lean, why },
           moments: [{ id, text, when, trigger, ties, source, droppable, status, note }],
           agendas: [{ who, wants, will, hidden }], offscreen: [text], madeAt },
    agenda: [{ id, at, window, text, ties: [objectId], source, status }],
    queue: [{ id, text, urgency, status, at, plannedAs: [momentId], doneAt }],
    inspirations: [{ id, title, text, motifs: [text], at }],    // chat-level ones
    ideas: [{ id, kind, name, text, why, ties, status, at }],   // proposals
    dismissedIdeas: [nameKey],
    tensionOwn: [{ at, threat, uncertainty, emotional, overall }],   // without Archivist; last 50
    log: [{ pass, at, ms, outcome, error }],                     // last 30
    join: { act, note },        // a story under way: the chapter it is in (-1: judge), the user's note
    volume: { number, startedTurn, startedDay, startedIndex,   // the volume under way
              chronicle: [{ at, day, text }] },                // what played out; last 80
    volumes: [{ number, title, shape, premise, themes, recap, threads: [text],
                beats: [{ text, status }], startedTurn, endedTurn, startedDay, endedDay,
                startedIndex, endedIndex, endedAt, closedEarly, editedByUser }],
    counters: { repliesSinceCheck, repliesSinceOutline, repliesSinceIdeas },
    pace: { sceneStartedAt, sceneReplies, idleReplies, userBaselineWords, aim, hold } }

SETTING DOCUMENT  + gm: { creation: 'proposals' | 'silent', inspirations: [...],
                          shapes: [custom shape] }
EXTENSION SETTINGS + planner: { enabled, level: 'light' | 'moderate' | 'heavy' | 'custom',
                          every: { check, outline, ideas }, maxTokens: { ... },
                          pacing: 'off' | 'gentle' | 'brisk' | 'fast',
                          showSpoilers: false }
```

Days done are dropped (a one-line summary goes into the log). Moments,
agenda happenings and queue requests that are *done* are kept for a while
and then trimmed.

## 10. Code layout

- `src/planner/model.js`: pure. Shapes, tension aim, position, the
  cadence decisions, the pace signals and aim, trimming, the private
  director section. Fully tested.
- `src/planner/prompts.js`: pure. Prompt builders and parsers for the
  CHECK, DAY, OUTLINE, RECAP, IDEAS and INSPIRE passes (JSON replies through
  `generate/json.js parseModelJson`).
- `src/planner/run.js`: scheduling (counters, day rollover from the
  clock, Archivist compile events), the calls, and applying the results
  through the library (creation mode, guards).
- `src/director/prompt.js`: the GM PLAN section and the BEAT line parser.
- `src/ui/gm-plan.js`: the tab; Calendar tab shows the agenda.
- `src/ui/slash-commands.js`: `/sb-request` and `/sb-requests`, registered
  through SillyTavern's SlashCommandParser at startup.
- `src/store/schema.js`: `gm` normalisers for the chat and setting
  documents.

Triggers are hooked in `src/state/lifecycle.js` *after* a reply ends (the
same place validation is scheduled), so the passes run while the user is
reading and typing.

## 11. Phases

1. **Foundations.** The `gm` data, the queue, inspiration texts and the
   INSPIRE pass, the DAY and CHECK passes, the GM PLAN section with BEAT
   lines, pacing (§6.1), the Today and Queue views, the spoiler preference,
   and cadence settings. *Usable on its own: a director that keeps a day
   plan, honours requests and keeps time moving.*
2. **Story outline and tension.** Story shapes, reading Archivist's
   tension (or the planner's own), the OUTLINE pass, the Outline view with
   its chart, and editing and locking beats.
3. **Volumes and recaps** (§5.1), and the `/sb-request` and
   `/sb-requests` slash commands (§3.5). Completing or closing a volume, the
   chronicle, the RECAP pass with title and threads carried forward,
   starting the next volume on a chosen shape with the previous volumes as
   background, per-volume tension readings, and the Volumes section (read,
   edit, copy, save as Markdown).
4. **Proactive worldbuilding.** The IDEAS pass, GM ideas (Proposals) and
   silent creation per setting, the agenda with its Calendar tab display,
   and quest enrichment.
5. **Tuning.** Custom shapes, per-pass token budgets, and measuring how
   often moments land versus get skipped, to tune the prompts.

## 12. Open questions

1. **What makes a "day" when time barely moves?** Pacing (§6.1) mostly
   prevents this. For a user who lingers on purpose, a day plan also
   expires after N replies (the Moderate default is 25) and is re-planned
   as "the rest of the day".
2. **Outline at the start of a chat.** Should a new chat ask for a shape
   and make an outline right away, or wait a few replies to learn what the
   story is? Proposal: ask for the shape on first use of the GM Plan tab,
   and outline after the first five replies, or on **Plan now**.
3. **Group chats and several player characters.** Out of scope for now:
   one player character per setting, as today.
4. **Archivist "rebuild"** restarts its tension readings. Should the
   planner keep its own copy of past readings for the chart? Proposal: yes,
   the last 50 readings.
5. **Ideas in canon-only settings.** No new objects. Should happenings and
   moments (which only live in the plan) still be allowed? Proposal: yes,
   since they add no detail to the canon. Quest enrichments are off.
6. **A new volume in a new chat?** Story Mode starts a fresh chat. Long
   chats get slow and costly, so a user may want the next volume in a new
   chat that starts from the recap. Proposal: the next volume stays in the
   same chat by default. A later option, **Continue in a new chat**,
   carries the volumes, the canonical scene (place, time, cast) and the
   planner's state into a new chat of the same character, and opens it
   with the recap as its first message.
7. **How long should a recap be?** Proposal: about 400-800 words for a
   volume, more for a very long one, set by the planner's token budget. The
   user can always edit it.
