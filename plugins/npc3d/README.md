# npc3d

NPCs in a 3D scene: people and soldiers that see, hear, notice, remember, choose what to do and do
it. What an NPC senses and what it does are written once, in its kind's definition. Each NPC walks on
one of two bodies: a `walker` drawn by `anim`, or a person drawn by `crowd3d`. Every order it gives
goes to its body. A body does what it can of an order and drops the rest, so one definition works on
either body.

## Why use it

Use npc3d when a game wants townspeople who idle, wander and chat, guards who patrol, hear a noise,
chase and shoot an intruder, crowds that run from a threat, or a squad sent to a place. The rules are
numbers in the definitions. The behaviours come built in, and a game's own plugin can deliver more
through a mod, such as going to see a noise it has not yet been to.

## Using it

npc3d has a server half, `npc3d.sim.ts`, and a browser half, `npc3d.plugin.ts`, which draws what the
NPCs sense and do for a testbed. List it before render3d:

```json
"plugins": ["loader", "scenemanager", "player", "crowd3d", "anim", "npc3d", "render3d"]
```

The scene's `world.defs` names its definitions file, and the scene has one `npc3d` actor, the plugin's
row:

```json
"prefabs": { "npc3d": { "time": 0, "sounds": [], "next": 1 } },
"actors": [{ "is": "npc3d" }]
```

Each NPC kind's rule is npc3d's own:

```ts
import { npc } from '#plugins/npc3d/npc3d.sim.ts'

export const guard = npc
```

### The `npc3d` row

| field    | what it is |
| -------- | ---------- |
| `time`   | The seconds its truth has run, the steps taken times `dt`, the same clock crowd3d counts on the page. It is set in `before`, so every rule in the step reads the same time (`now`). |
| `sounds` | A ledger of the sounds made (Hearing, below). Each one stays until its `last` seconds are up, and the page draws each one once, by its id. |
| `next`   | The id the next sound takes. |

In its `tick` it asks every NPC that is due to `think` (Choosing, below).

### `world.npc3d`

| field  | what it is |
| ------ | ---------- |
| `mods` | `{ sight, shot, route, behaviors }`, each naming the plugin that hands npc3d that knowledge (Plugins it works with, below). Leave out any it does not need. |

## Bodies

Every kind npc3d reads a place or a facing from names its body in its definition, `body`. That includes
the kinds an NPC looks at, not only NPCs.

### `walker`

Its row holds walker's body and anim's fields: `pos` [x, y, z], the metres where its feet stand; `yaw`
(yaw θ faces (sin θ, cos θ)); and walker's intents. Where it stands is known only for the step its row
is from. The page draws it between steps. After the NPC's own work each step, it walks (walker's
`walk`, on the ground `world.walker.mods` makes) and is animated (`animate`).

- **Standing** stops whatever anim is playing as an act, then plays the clip as one. If the clip is
  its rig's `still` role, it plays nothing, and its gears play the clip as it stands. A clip stood on
  to be held stays on its last frame, and the body goes `limp` when it gets there.
- **Walking** sets `goal`. Walker's `seek` takes it there at its walker kind's `seekSpeed`, round
  anything solid, its gears playing as it moves. The walk ends within the definition's `arrive` metres
  of the goal, or where it is held up: closing on the goal slower than `stall.speed` metres a second
  for `stall.time` seconds in a row (its row's `gap` and `stalled`), which happens when bodies it keeps
  apart from stand on the place. The walk's clip and speed are dropped.
- **With no goal** it walks by its `want`: none once it has stood or halted, or the way a behaviour
  that steers it itself has written there (melee3d's `fight`).
- **Facing** sets walker's `face`, which it turns to at walker's `turnRate`, standing or walking.
  Walking one way while facing another, its legs take the matching gear, so it strafes.
- **Its hands** play on anim's upper channel, and its legs carry on as they were.
- It keeps apart from the bodies its walker kind's `bodies` names.

### `crowd3d`

Its row is a crowd3d course: `pos` [x, y, z], the metres where its feet stood at `since`, seconds on
npc3d's clock; `to` [x, y, z], where the course ends; `speed`, metres a second across the ground from
`pos` toward `to`; `through`, null on a straight course; `yaw`; and `clip`, `body` and `holding`. Its
feet stand on its course, height and all, as crowd3d draws it (`crowd3d.sim.ts`): the shapes3d line
from `pos` to `to`, or with `through` the shapes3d spline through `pos`, each of `through` and `to`. On
a spline it faces the way the piece it walks goes. The row is written only when an order changes it.
Where it stands is known for any moment.

- **Standing** writes a course of speed 0 that ends where it stands, on the clip. Whether it holds the
  last frame or loops is crowd3d's `hold`.
- **Walking** writes one straight course to the place, its height with it, or a spline course along a
  route's spline leg, at the order's speed, on its clip. The walk ends at the time worked out from how far the place is across the ground and the
  speed. When the NPC next thinks, the course is cut back to where it had got to then, the place
  itself.
- It plays one clip and faces the way it walks. Standing, it turns at once. Facing while walking is
  dropped. Its hands stop it where it is, on their clip.
- It walks through every other body.
- **On walls and ceilings.** A row that carries crowd3d's `normal`, or a walk handed an up (a route leg
  with a `normal`), stands on that ground (crowd3d, the ground's up). Walking writes `normal`, the up
  where it stands, and `normalTo`, the leg's, `[0, 1, 0]` where the leg gives none; "across the
  ground" is across the ground under the leg, and its `yaw` is in that ground's frame. Standing,
  halting and facing write both ups as the one where it stands, and the way it faces in its frame. A
  row with no `normal` that is handed none is written as it always was.

### Places

Every place an order sends a body to is [x, y, z]. A walker's feet stand on its ground wherever it
walks, so it reads the place across the ground alone; a person's course goes to the place's height. A
behaviour sends a body to a place whose height it knows (a row's feet, a fact's `position`, a route's
node), and to one it rolls across the ground (`wander`, `flee`) at the height its feet stand.

### NPC fields on a row

Every NPC row carries these as well as its body's fields:

| field | what it is |
| ----- | ---------- |
| `look` | Radians its head is turned off its body. |
| `gaze` | The yaw in the world it wants its eyes to face, or null for straight ahead. |
| `seen` | The ids of the rows it sees, lowest first. |
| `noticing` | `{ <id>: { kind, aware, time } }`, how far it has got to noticing each row (Noticing). |
| `facts` | What it knows (Facts). |
| `doing` | The key it is doing, `''` before its first think. |
| `until` | When its task ends, or 0 for one that does not end of itself. |
| `wake` | When something it sensed has it think again, or 0 for none. |
| `arrived` | True from the step a walker gets where it walked until the NPC next thinks. |
| `told` | [x, y, z], the place it was told (`order`, `chase`), or null. |
| `route` | `{ points, leg, speed, clip }`, or null (Routes). |

The behaviours read and write more fields of their own: `target`, `next` and `shot` for `attack`; and
`hp`, `dead` and `hurt` for an NPC that can be killed.

## Senses

### Looking

Its eyes face the way its body faces, turned by its head (`eyes`), so when the body turns the eyes
turn with it. The definition's `look` is `{ rate, reach }`. Each step the head turns toward `gaze`,
less the way the body faces, kept within `reach` degrees either side, at most `rate` radians a second.
Neither body draws the head. It is only where the NPC sees from.

### Seeing

The definition's `sight` is `{ eye, at, cone, range, edge: { cone, range, weight }, kinds }`. It looks
at the rows of the kinds `kinds` lists, never itself, from `eye` metres over its own feet to `at`
metres over theirs. A row is in view when its feet stand within `range` metres and within half of
`cone` degrees of the way its eyes face, or within the edge's `range` and half its `cone`. A row is
seen when it is in view and nothing stands between the two points, as the `sight` mod says. With no
`sight` mod named, nothing stands between any two points. `seen` is written as a new list only when it
changes.

### Noticing

The definition's `notice` is `{ time, fall }`. Each step it sees a row, that row's `aware` rises by
dt / `time` times the weight it is seen with:

- in the cone: 1, less half of (how far it stands over `range`), less half of (how far it stands off
  the way the eyes face over half the cone). A row near and dead ahead is noticed in `time` seconds,
  and one at the cone's far corner never is;
- in the edge only: the edge's `weight` times 1 less how far it stands over the edge's `range`.

At 1 the row is noticed. When it is not seen: a noticed row stays noticed until `memory` seconds have
gone since it was last seen, so seen again it is noticed at once; a row not yet noticed has its `aware`
fall by dt / `fall`, and at 0 it is let go. A row that has ended is let go.

### Hearing

`raise(w, by, type, position, loud, last)` makes a sound, `{ id, type, position, time, loud, last, by }`,
on the ledger: `position` [x, y, z], `loud` the metres it carries, `last` the seconds it stays for the
page, `by` the row that made it. Every NPC except `by` whose definition gives `hearing`, and whose
feet stand within `hearing` × `loud` metres of `position`, gets the sound as a fact.

### Facts

Everything an NPC knows is a fact, `{ type, position, time }`: a `type` (the kind of a row seen, such
as `intruder`, or a sound, such as `shot`), the `position` [x, y, z] it was at, and the `time`. Its
`facts` holds the newest fact of each type. A newer fact of a type replaces the old one. A fact is let
go once `memory` seconds have passed since its time. What an NPC has done about a fact is not npc3d's:
a behaviour that cares, a game's own delivered by a mod, keeps that on the row itself, by the fact's
type and time.

A fact reaches an NPC in only two ways: each step it sees a row it has noticed, a fact of the row's
kind where it stands; and on hearing a sound, a fact of the sound's type where it was made. Every
behaviour acts on facts alone, never on how they arrived.

### Passing on what it knows

There is one way for anything to tell an NPC something: `raise`. Seeing has no `raise`: a fact of a
row's kind only ever comes from that NPC's own cone. So whatever is passed on, a bark heard or an
intruder seen, arrives at the NPC it is passed to as a sound, a heard fact, whatever sense it began as.

What `raise(w, by, type, position, loud, last)` does, exactly:

- it makes a new fact, `{ type, position, time }`, with `time` now, the step it is raised. It is not
  the raiser's memory handed over: only a name and a place travel, and the time is the time of the
  telling, not of the seeing;
- `position` is any place, not only where `by` stands: a fact's own `position` passes on where the
  thing was;
- it reaches every NPC but `by` whose definition gives `hearing` and whose feet stand within `loud` ×
  `hearing` metres of `position`, measured from `position`, not from `by`. A `loud` of `1e9` reaches
  every NPC that hears, wherever it stands;
- each NPC it reaches holds it as the newest fact of its `type`, in the place of the one it held, and
  thinks again `react` seconds later;
- it reaches every NPC in range whatever its name. Which NPCs act on it is which of them have a
  behaviour that names its `type`, through a list of their definition's (`at`, `from`) or a game
  behaviour's own settings. An NPC with none holds it, thinks again, and goes on as it was.

So a name is a channel. `radio_common` is one every member of a squad acts on; `radio_member0` one
only the first member acts on; `report_intruder` one only the leader acts on. Nothing is sent to one
NPC: every NPC in range is reached, and the name decides who cares.

Passing a fact on is a behaviour's work, not npc3d's: a game's behaviour (delivered by a mod) that
reads a fact its NPC holds and raises a new one. npc3d has no behaviour that passes facts on.

#### A bark, passed up and down a squad

1. The dog's rule raises it: `raise(w, dog, 'bark', dog.data.pos, loud, last)`.
2. A member within `loud` × its `hearing` of the dog holds a fact `bark` at the dog's place.
3. A behaviour of the member's, naming `bark`, reports it to the leader under a name of its own:
   `raise(w, me, 'report_bark', bark.position, 1e9, last)`.
4. The leader, whose behaviour names `report_bark`, holds a fact `report_bark` at the dog's place, and
   tells the squad: `raise(w, leader, 'radio_common', report.position, 1e9, last)`, or one member,
   `raise(w, leader, 'radio_member0', report.position, 1e9, last)`.
5. The members whose behaviours name `radio_common` (or the first member, naming `radio_member0`) hold
   it at the dog's place and act on it: a `chase` whose `at` names a list holding `radio_common` walks
   there.

#### An intruder seen, passed on as a sound

1. A member's cone takes in the intruder, and once noticed, each step it sees it the member holds a
   fact `intruder` (the kind's name) where the intruder stands, its time that step.
2. A behaviour of the member's, naming `intruder`, reports it: `raise(w, me, 'report_intruder',
   intruder.position, 1e9, last)`. From here on it is a sound: the leader hears it, it never sees it.
3. The leader, naming `report_intruder`, tells the squad on `radio_common` at that place, as in the
   bark.
4. A member that hears `radio_common` holds that, not `intruder`: it knows an intruder was reported
   there, not that it saw one, and its behaviours can treat the two apart.

#### What keeps it from going round for ever

- **Pass a fact on under a new name.** A member that passed on `intruder` as `intruder` would reach
  every other member's `intruder`, each of which, passing on what it holds, would raise it again: a
  telling that never ends. Under `report_intruder` only the leader acts on it, and the leader's
  `radio_common` is a name no member passes on.
- **A seen fact is new every step.** While a member sees a noticed row, its fact of that kind is learned
  again each step with that step's time, so a behaviour that passes it on each step raises it each
  step. Pass it on once per fact the game cares about, by its time, as a game's behaviour keeps what it
  has done about a fact on its own row.
- **`by` is never reached by its own raise**, but every other NPC in range is, the raiser's squad and
  everyone else's alike, so two squads keep apart by their names (`radio_common_red`,
  `radio_common_blue`).

#### What a raise cannot carry

- More than a name, a place and a time: "attack row 12" is a name of its own, or something the game
  keeps elsewhere.
- Two of one name at once: each NPC holds the newest fact of a name, so a second `radio_common` in
  the same step takes the place of the first.
- The time it was first seen: a passed-on fact's time is the time of the telling, so a memory let go
  after `memory` seconds is kept again as long as it is passed on.

A leader nobody sees is an NPC like any other: a kind whose definition gives `sight` (its `kinds` may
be empty, `[]`) so npc3d takes it for an NPC, a `body`, since where it stands is its body's, `hearing`
so it is reached, and `behaviors` so it chooses. Nobody sees it while no NPC's `sight.kinds` lists its
kind; but in a scene naming `world.hitscan3d.mods: { bodies: 'npc3d' }` it stands as a cylinder of its
`radius` and `tall` like every NPC, which a shot can meet, so give it a place out of the way.
With the `sounds` view on, a raise of `loud` `1e9` draws a ring that spreads past the whole scene.

## Choosing

An NPC whose definition gives `behaviors` chooses what it does. One without stands as it is and only
senses. The definition:

| field | what it is |
| ----- | ---------- |
| `think` | Seconds between its thinks. Each NPC's start is offset by its id, so a crowd's thinks spread over the steps. |
| `stay` | Score added to the key it is doing while that is not over, so it is not dropped for one that scores a hair higher. |
| `whim` | The most score added to each key at each think, rolled, so two NPCs alike in every way choose differently. |
| `react` | [lo, hi] seconds, rolled: how long after it notices a row or hears a sound it thinks again. |
| `dies` | The key it starts when it is killed (`hit`). |
| `behaviors` | `{ <key>: { <settings> } }`, what it can do. |
| any other | A list of kinds under any name, such as `"threats": ["guard"]`, which a behaviour's settings name (`"at": "threats"`). A setting naming a list the definition does not have throws, naming both. |

Each key's behaviour is the one its `as` names, or the one named after the key, so one behaviour can
serve several keys with settings of their own. The highest score wins, and a tie goes to the key listed
first. A key that scores 0 or less is not chosen. With nothing to choose, the NPC goes on as it is. A
key whose settings give `commit` is not scored against until its task is over.

The `npc3d` row has an NPC think when its task has ended, when its `wake` has come, and every `think`
seconds. When a walk ends and its behaviour has an `arrive`, the NPC is arriving, not done: it keeps
its stay, and `arrive` does what it went there for. When a task is over, its behaviour's `end` runs
first, and may say the NPC is gone. Starting a key puts down what the NPC held, sets `gaze` back to
null and `until` to 0.

### Acts

| act | what it does |
| --- | ------------ |
| `think(time)` | Chooses what to do, as above. The `npc3d` row asks for it. |
| `force(key)` | Starts a key now, whatever it was doing. |
| `order(key, x, y, z)` | Writes `told` [x, y, z], then starts the key now. |
| `hit({ damage })` | hitscan3d's `Struck`. Takes `damage` off `hp` and writes `hurt`. At 0 or below, it is `dead` and starts its definition's `dies` key. A dead NPC is hurt no more. |

### The behaviours

A behaviour's `at` and `from` name a list of the definition's (`"at": "threats"`), whose names are
types of facts: the kinds of rows it sees, or the types of sounds.

| behaviour | what it does |
| --------- | ------------ |
| `idle` | Stands on a clip rolled from `clips` for seconds rolled within `for`. Scores its `weight`. |
| `wander` | Walks on `clip` at `speed` to a place rolled within `reach` metres, kept within `bounds` [x, z] of the middle, and ends there. Scores its `weight`. |
| `visit` | Goes to the nearest row of the kind `near` names. Scores `weight` times how near it is, 0 at `range`. Walks on `walk` at `speed` to `off` [x, z] metres from the row, rolled within `spot` [x, z]; there it faces the row and plays a clip rolled from `clips` for seconds rolled within `for`, holding what `holding` names (crowd3d's `{ <place>: <item> }`). |
| `go` | Walks on `clip` at `speed` to `told`, and stands there on `stand`. Never chosen: it is what `order` starts. |
| `chase` | Goes to the nearest fact of the list `at` names. Scores `weight` times how near, 0 at `range`. Walks on `clip` at `speed`, eyes on it, walking again once the nearest such fact is more than `near` from where it is going; there it stands on `stand` and is over. |
| `flee` | Runs from the nearest fact of the list `from` names within `range`. Scores `weight` times how near the threat is, 0 at `range`. Runs on `clip` at `speed`, `away` metres straight from the threat, kept within `bounds` [x, z] (`away`), and stands there on a clip rolled from `clips` for seconds rolled within `for`. |
| `attack` | Shoots the nearest row of the list `at` names that it has noticed, sees now and is not `dead`, within `range`. Scores `weight` times how near, 0 at `range`. Stands on `stand` facing it, eyes on it, for seconds rolled within `for`. Each step it turns to it and, `rate` times a second, shoots from its sight's `eye` at `aim` metres over the row's feet, turned off by up to `spread` degrees each way, rolled, through the `shot` mod, hurting what it meets by `damage`. Each shot is written on its row as `shot` `{ from, to, time }`, plays `clip` on its hands, and raises a `shot` sound that carries `loud` metres and stays `last` seconds. The target dead, gone or out of sight ends it. Throws if the scene names no `shot` mod. |
| `die` | Never chosen: it is the key `dies` names. Stands on `clip`, held on its last frame, for `for` seconds, then the row ends. |

A plugin delivers more behaviours through `world.npc3d.mods.behaviors` (one name or a list). Each mod
exports `behaviors()`, returning `{ <name>: Behavior }`. A mod's behaviour with a built-in name takes
its place, and a later mod's replaces an earlier one's. A key naming a behaviour none of them has
throws, naming it.

```ts
type Behavior = {
  score(me, w, set, time, body, k): number
  start(me, w, set, time, body, k): void
  arrive?(me, w, set, time, body, k): void
  tick?(me, w, set, time, body, k): void
  end?(me, w, set, time, body, k): boolean // true when the NPC is gone
}
```

`set` is the key's settings, `body` the NPC's body, `k` its definition. `travel`, `away`, `raise`,
`recall`, `seeing`, `inView`, `listOf`, `roll`, `pick`, `nearness`, `toward`, `now`, `bodyOf` and `eyes`
are exported for a behaviour to use. `travel(me, w, time, body, to, speed, clip)` walks it to `to`
[x, y, z] (Routes) and hands back when it gets there. `away(me, w, set, time, body, from)` runs it from
`from` [x, y, z] on `set`'s `clip` at `speed`, `away` metres across the ground, kept within `bounds`, to
a place at the height its feet stand, and writes its `until`.

## Routes

A walk follows a route when the scene names a `route` mod: `(w, from, to) → [leg, …] | undefined`,
the legs to walk in turn from `from` [x, y, z], the last of them ending at `to`, or undefined when there
is no way. A leg is a place [x, y, z] with its height, walked to along the shapes3d line from the place
before; or `{ at, normal }`, the place with the up of the ground there; or `{ spline: { points },
normal? }`, the shapes3d spline from the place before through `points` to the last of them, a graph
link's course (a curved stair), with the up at its end. A person walks each leg onto its up; a walker
drops it. With no mod, no way, or a straight way, `route` is null and the walk goes straight to the
place, onto the up of its one leg where it has one.

The body walks one leg at a time, so a person goes up a stair the route climbs leg by leg. A walker within `arrive` of a place with more left goes on to
the next in the same step, and walks a spline leg to each of its points in turn. A person is given one
course per leg, a line or the leg's spline, and when it reaches the end of one, the next starts from
where and when that one ended. Only the last place ends the walk. A
walker held up on the way to a place before the last asks for a new route to the last from where it
stands. Held up on the way to the last, its walk ends there. A walk that ends, a new key and a walk
sent somewhere else all put `route` back to null.

## What the page draws

The browser half draws on render3d's scene. Each view starts off and is on while its flag is true; a
testbed turns them on (`plugins.npc3d.cones = true`).

| flag | what it draws |
| ---- | ------------- |
| `cones` | Under every NPC whose sight looks at any kind, two flat fans on the ground, turned the way its eyes face: its cone, and fainter, its edge. |
| `facts` | A ring under every row some NPC sees and is noticing, yellow to red as the most aware of them is of it; and a dim ring at every fact some NPC holds from before this step. |
| `sounds` | Every sound on the ledger: a ring spreading to its `loud` metres over 0.6 seconds and fading out over its `last`. |
| `shots` | Every NPC's last shot, a line from where it left to where it ended, for 0.08 seconds. |
| `cards` | Over every NPC that chooses, at its definition's `label` metres over its feet, the key it is doing. |
| `routes` | For every NPC walking a route, a line from where it stands through each place it has still to go to, each at its own height, a spline leg along its curve. |

A thing that goes with a crowd3d person is placed at the moment render3d draws, as crowd3d draws the
person. One that goes with a walker is placed where its step left it, and render3d draws it between
steps as it draws the body. `close()` takes everything off the scene and disposes of it.

## Plugins it works with

- **walker** and **anim**: the `walker` body.
- **crowd3d**: the `crowd3d` body, which stands where `crowd3d.sim.ts` says its course puts it.
- **shapes3d**: lines and splines, the courses and route legs a body walks.
- **hitscan3d**: `hitscan3d.npc3d.ts` hands npc3d `sight` (hitscan3d's `sees`) and `shot` (hitscan3d's
  `shoot`, `{ point, id }`, `id` set when it met a body): `world.npc3d.mods: { sight: 'hitscan3d', shot:
  'hitscan3d' }`. The other way, `npc3d.hitscan3d.ts` hands hitscan3d `bodies`: an upright cylinder for
  each row of a kind whose definition names a `body`, of its definition's `radius` and `tall`, standing
  where its body says on npc3d's clock: `world.hitscan3d.mods: { bodies: 'npc3d' }`.
- **nav3d**: `nav3d.npc3d.ts` hands npc3d `route`, nav3d's `route` over the scene's one graph, a step
  over a link with a course as that link's spline: `world.npc3d.mods: { route: 'nav3d' }`. A scene that names no graph in `world.nav3d.graphs`, or more
  than one, throws, naming them.
- **melee3d**: `melee3d.npc3d.ts` hands npc3d the behaviour `fight`, a sword fight for an NPC on the
  walker body that holds a blade: `world.npc3d.mods: { behaviors: 'melee3d' }`. Its header has its
  settings and the fields it keeps on the row.
- **loader**: the definitions file.
- **math**: the deterministic maths it measures with. Every roll is on the truth's die.

## It throws when

- a kind's definition names a body npc3d has not got;
- a behaviour's setting names a list the definition has not got;
- a key names a behaviour npc3d and its mods have not got;
- a key is started that the definition's `behaviors` has not got;
- an NPC attacks and the scene names no `shot` mod;
- the `route` mod is nav3d's and the scene names no graph, or more than one.

## Tests

`npc3d.sim.test.ts`, beside the plugin, checks the `crowd3d` body on ground whose up is not
`[0, 1, 0]`: walking from the floor onto an edge writes both ups and faces along the ground under it, a
walk up a wall takes as long as the wall is tall, and a row that carries no up and is handed none is
written as it always was.

npc3d's other tests boot the scenes of the game it was built in, `demo_npc3d` (`demo_npc3d.sim.test.ts`),
which a clone of core does not have. They check:

- a sentry sees who stands in its cone or its edge with nothing between, and nobody else;
- a sentry grows aware of what it sees, notices it, remembers it once it turns away, and forgets it;
- a walking person sees the way it walks, on every step, whichever way it turns;
- a guard turns its head to a noise within its reach of the way its body faces;
- a noise is heard by the guards within its reach, who go to see it (the game's `investigate`);
- ordered to one place, the walkers stop near it apart from each other, and the people walk straight
  onto it;
- sent across a wall, a walker and a person go round it along their routes and stop where they were
  sent;
- a walker held up on the way to a place on its route asks for a new route from where it stands;
- in the town, the guards hunt the intruders down, and the people run from the shots.

`demo_castle` (`demo_castle.sim.test.ts`) checks the people climbing: a visitor goes to a roof of
castle-plus's fortress along its route, its feet rising leg by leg up the stair, its course written once
a leg.

```
yarn vitest run plugins/npc3d/npc3d.sim.test.ts
yarn vitest run games/demo_npc3d/demo_npc3d.sim.test.ts
yarn vitest run games/demo_castle/demo_castle.sim.test.ts
```

## Keywords

NPC, AI, enemy AI, guard, townspeople, crowd, bystander, perception, sight cone, line of sight,
hearing, awareness, noticing, memory, facts, utility AI, behaviour scoring, idle, wander, chase, flee, attack, die, order, patrol, route, `npc`, `raise`, `world.npc3d`
