# crowd3d

Crowds of Mixamo bodies in a 3D scene. Every body draws in one draw call per material, however many
people it has. Each person is a row that holds a course, not a place: where it stood, when, where
its line ends, how fast it goes and which way it faces. Each frame the GPU poses it from a single bake of clips that every
body shares, and the clock places it along that course. A row that keeps its course never changes,
so a seat is sent nothing for it. People hold things on places of the body (a sword in the right
hand, a helmet on the head), each item drawn in one draw call per material however many hold it.

crowd3d draws in the browser and has no row of its own. `crowd3d.sim.ts` is what the page and the
server both read: where a person's course puts it at any moment, so a rule (npc3d's, a hit test) knows
where a person stands without the row changing. It is not `anim`: it has no blending, layers, aim or
ragdoll. A person plays the clip its row names, on a loop unless the clip is held, moves along the line
from its row's `pos` to its `to` at its row's speed, or along the spline through `through`, up or down
with it, and holds what its row's `holding` names.

## Using it

List it after the loader and with render3d:

```json
"plugins": ["loader", "crowd3d", "render3d"]
```

crowd3d asks the loader for its models in its first tick. If it is listed before the loader, it
throws. If the scene names no render3d, it throws.

### `world.crowd3d`

| field      | what it is |
| ---------- | ---------- |
| `bodies`   | `{ <body>: <model> }`. Each body is a loader `model` entry: a glb of a Mixamo character with its clips baked on. anim's export (`plugins/anim/anim.export.py`) names each animation after the rig's clip. |
| `clips`    | `[<clip>]`, the clips to bake. Each is an animation of that name in the first body's glb. |
| `rate`     | Frames per second that each clip is baked at. |
| `hold`     | `[<clip>]`, the clips played once and held on their last frame, never looped. A death clip held this way leaves its person lying. Before its start, a held clip holds its first frame. Left out, every clip loops. |
| `kinds`    | `[<kind>]`, the kinds whose rows are people. |
| `poolSize` | How many people the pool holds. 512 when left out. |
| `poses` | A loader `json` entry whose file's `poses` is pose name to `{ clip, frame, at }`, each a frame of one of `clips` (Poses, below). Left out when no one is posed. |
| `fade` | Seconds a change of clip or pose fades over (The tween, below). 0 when left out: the change snaps. |
| `items`    | `{ <item>: { model, <place>: { at, turn, scale } } }`, the things people hold (Items, below). Left out when nobody holds anything. |
| `reach`    | Metres: how near one path's end stands to another's for a person to go on from the one onto the other (Paths, below). Left out when nobody walks paths. |
| `mods`     | `{ paths }`: the plugin that hands crowd3d the paths its people walk (Paths, below). |

### Paths

A person can walk the paths the shapes of the scene lay down, and the shape says what is played on
it. With `"mods": { "paths": "shapes3d" }`, every `line` and `spline` point of a shapes3d kind whose
`data` has a `crowd3d` block is a path, played as the block says (`shapes3d.crowd3d.ts`):

```json
"walkway": { "shape": { "box": { "size": [2, 1, 30] } }, "activities": [],
  "points": { "lane": { "line": { "from": [0, 0, -15], "to": [0, 0, 15] } } },
  "data": { "crowd3d": { "clip": "walk", "speed": 1.67 } } },
"skyway": { "shape": { "box": { "size": [4, 16, 42] } }, "activities": [],
  "points": { "arc": { "spline": { "points": [[0, 0, -21], [0, 12, 0], [0, 0, 21]] } } },
  "data": { "crowd3d": { "clip": "cruise", "speed": 7 } } }
```

A person's rule calls `travel(me, w, time)` from `crowd3d.sim.ts` once a step. Once the person has
got to the end of its path, it goes on along another path with an end within `reach` of where it got
to, the die choosing, or back along the one it was on when there is none. It plays the new path's
clip or pose at the new path's speed, and crowd3d fades it from the one before. So a person walks a
walkway, comes to the foot of a flight path and flies it in that path's pose, and lands and walks on.
A person that walks paths starts with `"path": null`: its first `travel` sets it out on the path with a
place nearest where it stands, from there on along it, the die choosing the way where both go on.
From then on `travel` keeps its `path`, `{ id, point, back }`, the shape's row, the name of its point,
and whether it walks it from its last place to its first, and writes its `pos`, `to`, `through`,
`yaw`, `since`, `clip` and `speed` each time it sets out. A row with no `path` walks none: its course
is whatever its rule writes. A scene whose people walk paths and whose `mods` names no `paths`, or
that gives no `reach`, throws.

All the bodies must share the one Mixamo skeleton: the same bones, named the same, in the same
order, one skeleton per body.

### Items

An item is a loader `model` entry, a glb of plain meshes, and for each place it's held on, how it
sits there:

```json
"items": {
  "sword":  { "model": "sword",  "rightHand":   { "at": [0, 0.08, 0], "turn": [0, 0, -90] } },
  "shield": { "model": "shield", "leftForearm": { "at": [0, 0.15, -0.07], "turn": [0, 180, 0] } },
  "helmet": { "model": "helmet", "head":        { "at": [0, 0.09, 0] } }
}
```

| key     | what it is |
| ------- | ---------- |
| `at`    | `[x, y, z]` metres from the place's bone, in the bone's own frame. `[0, 0, 0]` when left out. |
| `turn`  | `[x, y, z]` degrees, three's Euler in XYZ order, in the bone's own frame. `[0, 0, 0]` when left out. |
| `scale` | A number or `[x, y, z]`. 1 when left out. |

`at` is in metres whatever the armature's own scale; a Mixamo armature's centimetres are undone. An
item lists only the places it is held on. Holding a mug in the left hand as well is one more line,
`"leftHand": { … }`, on the mug.

A place names one bone of the Mixamo skeleton:

| place | bone | place | bone |
| ----- | ---- | ----- | ---- |
| `hips` | Hips | `head` | Head |
| `chest` | Spine2 | `back` | Spine2 |
| `neck` | Neck | | |
| `leftArm` | LeftArm | `rightArm` | RightArm |
| `leftForearm` | LeftForeArm | `rightForearm` | RightForeArm |
| `leftHand` | LeftHand | `rightHand` | RightHand |
| `leftThigh` | LeftUpLeg | `rightThigh` | RightUpLeg |
| `leftShin` | LeftLeg | `rightShin` | RightLeg |
| `leftFoot` | LeftFoot | `rightFoot` | RightFoot |

A bone is found by its name after `mixamorig`, any digits, and a colon, so `mixamorig:RightHand`,
`mixamorigRightHand` and `mixamorig1:RightHand` are all the right hand.

In a Mixamo rig a hand's y axis runs along the fingers, and the head's y is up and its z forward.
To find how a bone's frame lies in a pose, `holds` (What the page can ask) hands back the matrix an
item goes through.

### People

A row of a kind that `kinds` names is drawn as a person. Its fields:

| field   | what it is |
| ------- | ---------- |
| `pos`   | `[x, y, z]`, the point in metres where the feet stood at `since`. |
| `since` | Seconds on the step's clock, `n × dt` once `n` steps have been taken: when the person stood at `pos`. |
| `to`    | `[x, y, z]`, the point in metres where its line ends. Every row has one; a row without it throws, naming it. |
| `speed` | Metres per second across the ground, from `pos` toward `to`. 0 for a person standing still. |
| `yaw`   | Radians, the way the person faces. Yaw θ faces (sin θ, cos θ), as the `walker` plugin has it. The line does not turn it: whoever writes the course faces it the way it walks. |
| `body`  | One of `bodies`. |
| `clip`  | One of `clips`. |
| `through` | Left out or `null` for a straight course. A list of `[x, y, z]` makes the course the shapes3d spline through `pos`, each of these and `to`, a curved stair or a path round a tower. |
| `normal` | `[x, y, z]`, a unit vector: the up of the ground under `pos`, for a person on a wall or a ceiling. Left out, it is `[0, 1, 0]`. |
| `normalTo` | `[x, y, z]`, a unit vector: the up of the ground under `to`. Left out, it is `normal`. |
| `holding` | `{ <place>: <item> }`, what the person holds and where, such as `{ "rightHand": "sword", "head": "helmet" }`. Left out or `{}` when it holds nothing. |
| `path` | For a person that walks paths: `null` until `travel` first sets it out, then `{ id, point, back }` (Paths, above). Left out for one that walks none. |

A change to `holding` is drawn on the next frame: an item goes into a hand or out of it with one row
write.

The row doesn't move. A person stands on the straight line from `pos` to `to`, shapes3d's `line`, as far along it as
`speed` × (now − `since`) is of the line's length across the ground, and at `to` once it has gone
that far. Its height goes along the line with it, so a line from the foot of a stair to its top
climbs the stair. A line whose ends stand one over the other, no way apart across the ground, is at
`to`. A person with a `speed` of 0 stands at `pos`. crowd3d works that out on the GPU, and any rule
that needs where a person is now (a hit test, a check for the end of a walk) works it out the same
way, with `where(row, time)` from `crowd3d.sim.ts`.

The ground under a person need not be a floor. Along the line its up turns from `normal` to
`normalTo` with the metres walked, so a person crossing from a floor onto a wall leans over as it
goes. "Across the ground" is across the ground under the line: the line with its part along the up
halfway along it taken out, which on `[0, 1, 0]` is its length in x and z. `yaw` is the way it faces
in its ground's own frame, the frame `[0, 1, 0]` is turned onto the up by (`frame`, the least turn that
does it; straight down is half a turn about x). The person is placed, turned by `yaw` about
`[0, 1, 0]`, then turned onto the up halfway along the line and on to the up where it stands. With
neither field, all of it is what it always was. `standing(row, time)` gives where it stands, the up
there and the way it faces in that up's frame; `facing(a, b, n, yaw)` gives the yaw of the way from
`a` to `b` on ground whose up is `n`.

A course with `through` is walked the same way, a straight piece at a time: the pieces shapes3d draws
the spline in, each walked at `speed` across the ground, the next starting where and when the last
ends. crowd3d writes the piece the clock is on into the person's slot, and writes it again the frame
the clock reaches the next one, so the shader only ever walks a straight line. Each piece's ups are
the turn from `normal` to `normalTo` by how far along the spline its ends are. The clip goes on across
the pieces. `piece(row, time)` and `ends(row)` in `crowd3d.sim.ts` give the piece walked at a moment
and when the course ends.

To change what a person does, write its row once: `pos` where it stands now, `since` now, and its
new `to`, `through`, `speed`, `yaw`, `clip`, `body`, `normal` or `normalTo`. A change to any of `since`, `body`, `clip`,
`speed`, `yaw`, `to`, `normal` or `normalTo` rewrites its slot, and on a spline, so does the clock reaching its next piece.
Nothing else does.

The row has no clip time. A new clip starts at `since`: a held clip at its first frame, so a death
plays from when it happened, and a looped clip at a point picked from the row's id (the id times the
golden ratio's fraction, wrapped round 1), so people standing together aren't in step. A write that
keeps the clip keeps it going: a person setting out on its next line, or turning, keeps its stride. Two pages may show
the same person at different points in a loop.

For a walker's feet to stay planted, give it `speed = travel(body, clip)`.

## What the page can ask

| call                   | returns |
| ---------------------- | ------- |
| `ready()`              | `true` once every body has been baked and every item built. |
| `travel(body, clip)`   | How fast that clip carries that body, in metres per second along its facing: the length of the hips' steady line through the clip, in the world, divided by the clip's length. |
| `counts()`             | `{ <body>: { copies, groups } }`: how many people of each body are drawn, and that body's draw calls per light. |
| `items()`              | `{ <item>: { copies, groups } }`: how many copies of each item are drawn (one for each place anyone holds it on), and that item's draw calls per light. |
| `pool()`               | `{ size, used, writes }`: the slots, how many hold a person, and how many slot writes there have been since the start. |
| `pose(body, clip, t, from?)`  | `{ bones, matrices }`: the bone names, and the column-major matrix for each bone that the pose pass writes for a person of `body` standing at the origin facing +z, `t` seconds into `clip` (a pose stands at its frame whatever `t`). With `from`, `{ clip, t, share }`, the same mixed from that clip, which keeps `share` of every bone, as the pass draws a fade. It works them out the same way the pass does, for a testbed to compare against three's own mixer. |
| `holds(body, clip, t, item, place)` | The column-major matrix the item goes through on such a person: the place's bone's matrix from `pose`, times the place's offset. |
| `close()`              | Takes everything crowd3d made off the scene and disposes of it. The next tick makes the pool and bakes everything again from the scene's numbers as they are then. |

## How it works

### The bake

Once every body's model has landed, crowd3d plays every clip on the first body, standing at the
origin, with three's own `AnimationMixer`. It samples each clip at `rate` frames per second from 0 to
the clip's length, keeping both ends. At each frame it reads each bone's rotation as its turn from the
bone's rest (rest⁻¹ × rotation), and writes one texel per bone and one row per frame. The clips go one
after another into one float texture that every body reads. A Mixamo clip baked onto each body is
the same turn from each body's own rest, so the turns belong to the clip and the rests belong to the
body.

The hips' travel across the ground is taken off. The hips are put where their rest puts them, plus
however far the clip puts them off the steady line from where the clip starts them to where it ends
them, and up and down as the clip has them. So every clip is drawn in place, and a walk's travel
comes from the row. Up is the world's up read in the frame of the hips' parent, because a Mixamo
armature is Z-up. How far the hips then stand off their rest is the last texel of each row.

Each body is one row of a bodies texture: the armature's matrix at the origin, then each bone's rest
rotation, rest position and inverse bind matrix.

### The pool

On the first tick, before any body has landed, crowd3d makes one float texture of `poolSize` slots,
eight texels per slot. It is never made again or resized. Each person is one slot:

- `[x, y, z, yaw]`: where it stood.
- `[first row, frames, length, clip time]`: its clip, and how far into the clip it was at `since`.
  A clip the slot already played goes on where it had got to by then. A new clip starts at 0 when it
  is held, and at the id's point when it loops. A pose's clip time is its frame's.
- `[then, speed, held, body]`: the row's `since`, its speed, 1 for a held clip or 2 for a pose, and
  its body's place in `bodies`.
- `[x, y, z, 0]`: where its course ends, the row's `to`.
- `[x, y, z, 0]`: the up of the ground where it stood, the row's `normal`, `[0, 1, 0]` without one.
- `[x, y, z, 0]`: the up of the ground where its course ends, the row's `normalTo`.
- `[first row, frames, length, clip time]`: the clip it fades from (The tween, below), as the second
  texel had it.
- `[then, held, began, fade]`: that clip's `since` and how it was held, the moment the fade began, and
  `fade`.

On a spline the slot holds the straight piece it walks now: where that piece starts and ends, its way as
the yaw, when it set out on it as `then`, and the ups of its ends.

The exact layout is under Memory layout, below. A slot is written when its row arrives, and again only when the row's `since`, `body`, `clip`,
`speed`, `yaw`, `to`, `normal` or `normalTo` changes, or the clock reaches the next piece of its spline. When the row goes, its slot is freed for the next one. Only the slots that were
written get sent to the GPU, each one by itself.

### The clock

The clock is the step's: `(n − 1 + between) × dt`, the moment render3d draws (`steps`,
`engine/browser.ts`). With time stopped (`between` is 1), it stands still. A person stands on the
line from where its slot put it to where its course ends, as far along it as its speed times the time
since its row's `since` is of the line's length across the ground, and at the end once it has gone
that far; its height goes along the line with it, and the up it stands on turns from the slot's first
up to its second with it. Its clip time is the slot's clip time plus the time since, wrapped round the clip's length.
For a held clip it is clamped between 0 and the clip's length instead. For a pose it is the slot's
clip time, its frame's, whatever the clock.

### Poses

A pose is a frame of a clip, held. `world.crowd3d.poses` names a loader `json` entry whose file's
`poses` gives each pose's clip, frame and time, `{ clip, frame, at }`: anim's export measures them
into a rig file from the `.poses.json` beside each clip's FBX (`plugins/anim/anim.export.py`). A row
names a pose in its `clip`, as it names a clip. Every pose's clip is one of `clips`, so its frames are
already in the bake; the pose is that frame's row of it.

### The tween

With `world.crowd3d.fade` given, a person changing clip, or pose, is not snapped into the new one. The
slot written for the new clip keeps the one it had in its last two texels: where that clip was, by its
own `since`, how it was held, the moment the change came (the row's new `since`), and `fade`. For `fade`
seconds after that, the pass works out both clips' times as ever and mixes them bone by bone, each
bone's turn and the hips' offset, by how far through the fade the clock is. It is the same blend the
pass draws between two baked frames of one clip. A slot with no clip before it, or with no `fade`, is
drawn in its clip alone, and so is every slot once its fade is through. A slot written again for the
next piece of a spline keeps its clip and its fade.

### The pose

Each frame, before render3d draws, one pass through the renderer writes every person's bone matrices
into a float target: one row per person, four texels per bone. For each bone it walks the chain up
from the bone to the hips. Each bone in the chain gets its rest position (the hips' moved by the
clip) and its rest rotation times the clip's turn, where the turn blends the two baked frames on
either side and normalises the result. Then it applies the person's place and facing, the facing
turned onto the up it stands on, the armature,
and the bone's inverse bind. The rows hold the first body's people, then the second's, and so on,
in the order given by a texture of slots.

### The draw

A body's meshes are merged by material and attributes. Each mesh's vertices go through its bind
matrix first, so each mesh group becomes one geometry. Each group is one mesh, drawn as many times
as the body has people: one draw call, plus one more for each light's shadow.

The group's material is a clone of the glb's, dressed by render3d (`dress`) with a surface that
skins each vertex by four bones from that copy's row of the pose. The row is the body's first row
plus `gl_InstanceID`. There are no instance matrices, and render3d's between-steps does not move the
mesh. Shadows are cast through a depth material and a distance material dressed with the same
surface. A group is never culled as a whole, because its people can stand anywhere.

### The items

Each item's meshes are put through where each stands in its glb and merged by material and
attributes, the same way a body's are. Each group is one mesh, drawn once for every place anyone
holds the item on: one draw call, plus one more for each light's shadow, whatever the number of
copies.

A copy is posed by its holder's bone. Its surface reads, from the item's held texture, the copy's
row of the pose, the place's bone, and the matrix that comes after that bone's skin:

```
bone's skin × bone's bind × the armature's scale undone × the place's offset (at, turn, scale)
```

The bone's skin times its bind is the bone's own place in the world, so the item rides the bone.
That matrix is worked out once for each body, item and place, and kept. The held texture is written
whole whenever a person comes, goes, changes body or changes what it holds.

## Memory layout

Everything below is read off `crowd3d.plugin.ts`. `B` is the number of bones in the one skeleton,
`P` is `poolSize`, and `WIDE` is 1024. Every texture is RGBA 32-bit float (16 bytes a texel), read
with `texelFetch` (no filtering), except the order texture, which is one 32-bit float channel. A
texel is written `[r, g, b, a]`. A matrix takes four texels, one column each, column-major as three
stores it (`Matrix4.elements`).

### The textures

| texture | uniform | width × height | made | sent to the GPU |
| ------- | ------- | -------------- | ---- | --------------- |
| pool | `crowdPeople` | `WIDE` × ⌈8P / `WIDE`⌉ | first tick | each written slot, 8 texels, copied from a CPU copy (`slotted`) that shares its array |
| order | `crowdOrder` | `WIDE` × ⌈P / `WIDE`⌉ | first tick | whole, whenever a row comes or goes or changes body |
| clips (the bake) | `crowdClips` | (B + 1) × Σ(frames + 1) | once every body has landed | once |
| bodies | `crowdBodies` | (4 + 6B) × number of bodies | once every body has landed | once |
| pose (render target) | `crowdPose` | 4B × P | once every body has landed | never: the pass writes it on the GPU every frame |
| held, one per item | `crowdHeld` | `WIDE` × ⌈5 · P · places / `WIDE`⌉, its places the ones the item lists | once every model has landed | whole, whenever a person comes, goes, changes body or what it holds |

`P` must be no more than the GPU's `maxTextureSize`, since the pose target is `P` rows tall.

### Pool: one slot a person

Slot `s` is texels `8s` to `8s + 7`, counted along rows of `WIDE`. Texel `i` is at
(`i mod WIDE`, `⌊i / WIDE⌋`). `WIDE` is a multiple of 8, so a slot always sits in one row.

| texel | r | g | b | a |
| ----- | - | - | - | - |
| `8s` | x | y | z | yaw |
| `8s + 1` | first row of the clip in the bake | frames | length, seconds | clip time at `since`, seconds |
| `8s + 2` | `since`, seconds | speed, m/s | held: 0 looped, 1 held, 2 a pose | body: its place in `bodies` |
| `8s + 3` | `to`'s x | `to`'s y | `to`'s z | 0 |
| `8s + 4` | `normal`'s x | `normal`'s y | `normal`'s z | 0 |
| `8s + 5` | `normalTo`'s x | `normalTo`'s y | `normalTo`'s z | 0 |
| `8s + 6` | first row of the clip it fades from | frames | length, seconds | its clip time at its `since` |
| `8s + 7` | that clip's `since` | its held, as `8s + 2` | when the fade began, seconds | `fade`, seconds; 0, no fade |

The pose pass reads a slot through `slot(s, k)`. The vertex surface reads only `crowdPose` and `crowdStart`, so a material that wants a
person's slot needs `crowdOrder` and `crowdPeople` handed to its surface, and looks up its slot as
the pass does.

A slot's index comes from a free list: a gone row's slot is taken by the next new row, and a slot
never used is taken after that, counting up from 0.

### Order: which slot each pose row is

Entry `a` is texel (`a mod WIDE`, `⌊a / WIDE⌋`), its red channel a slot index. Entries are laid out
one body after another, in the order of `bodies`, each body's people one run. A body's run starts
at its `start` (the `crowdStart` uniform of its materials), and the run's length is the
`instanceCount` of its groups. Pose row `a` is the person in slot `order[a]`.

### Clips: the bake

One row per baked frame. A clip of length `dur` is baked at `frames = max(1, round(dur × rate))`
and takes `frames + 1` rows, both ends kept. Clips follow each other in the order of `clips`, so a
clip's first row is the sum of `frames + 1` over the clips before it.

| texel | r g b a |
| ----- | ------- |
| `j` for bone `j` < B | that bone's turn from its rest, rest⁻¹ × rotation, as a quaternion x y z w |
| `B` | the hips' offset from their rest, x y z, with the travel taken off; a is 0 |

### Bodies: one row a body

| texels | holds |
| ------ | ----- |
| 0 to 3 | the armature's matrix at the origin (the hips' parent's `matrixWorld`), column-major |
| `4 + 6j` | bone `j`'s rest rotation, a quaternion x y z w |
| `4 + 6j + 1` | bone `j`'s rest position, x y z; a is 0 |
| `4 + 6j + 2` to `4 + 6j + 5` | bone `j`'s inverse bind matrix, column-major |

### Pose: one row a person

Row `a` is the person in slot `order[a]`. Texel `4j + c` of that row is column `c` of bone `j`'s
skinning matrix:

```
place × armature × (bone chain from the hips down to j) × inverse bind of j
```

`place` is the person's facing, its `yaw` about `[0, 1, 0]`, turned by `frame` of the up halfway along
its line and on by the least turn from that to the up where it stands, and where it stands now on its
line. Each link of the chain is
`compose(rest position, rest rotation × turn)`, and the hips' rest position is moved by the bake's
offset. Each frame the pass draws one triangle over the first `used` rows (viewport and scissor set
to 4B × `used`), one fragment a texel.

How the pass reads a clip, with `t` the clip time now:

```
u  = t / length × frames
f  = min(floor(u), frames − 1)
a  = u − f
r0 = first row + f,  r1 = r0 + 1
turn   = normalize(mix(q(r0), q(r1) flipped to the same side, a))
offset = mix(offset(r0), offset(r1), a)
```

### Held: one entry a copy of an item

Copy `k` is texels `5k` to `5k + 4`, counted along rows of `WIDE`. Texel `i` is at
(`i mod WIDE`, `⌊i / WIDE⌋`); a copy may cross a row.

| texel | holds |
| ----- | ----- |
| `5k` | `[pose row, bone, 0, 0]`: the holder's row of the pose and the place's bone |
| `5k + 1` to `5k + 4` | the columns of bind × armature scale undone × the place's offset |

Copies are written in the order of the slots, each person's places in the order its `holding` lists
them. The group's instance count is the number of copies. A copy is put through
`crowdPose[row][bone] × that matrix`.

### Vertices

An item's meshes are merged into one `InstancedBufferGeometry` per group, each vertex put through
where its mesh stands in the glb, with `position`, `normal`, and `uv` and `tangent` when its first
mesh has them, and an index as below. They have no skin attributes.

Each body's meshes are merged by material and attributes into one `InstancedBufferGeometry` per
group:

| attribute | type | holds |
| --------- | ---- | ----- |
| `position` | float × 3 | through the mesh's bind matrix |
| `normal` | float × 3 | through the bind matrix's normal matrix, normalised |
| `uv` | float × 2 | as in the glb, when its first mesh has one |
| `tangent` | float × 4 | xyz turned by the bind matrix, w kept, when its first mesh has one |
| `crowdBones` | uint16 × 4 | the four skin indices |
| `crowdWeights` | float × 4 | the four skin weights |
| index | uint16, or uint32 past 65,535 vertices | each mesh's indices offset by the vertices before it |

The vertex surface skins a vertex by `Σ weight × crowdPose[row = crowdStart + gl_InstanceID][bone]`.

## It throws when

- the scene's world has no `crowd3d`;
- crowd3d is listed before the loader, or the scene names no render3d;
- `poolSize` is not a whole number above 0;
- the pool is more rows than the GPU's textures can hold;
- there are more people than `poolSize`, naming both;
- a row has no `to` [x, y, z], naming it;
- a row's `body` is none of `bodies`, or its `clip` is none of `clips` and no pose of `poses`;
- a pose of `poses` is of a clip `clips` does not list, naming both;
- a body's model has no skinned mesh, has a mesh not bound where it stands, or has meshes skinned
  to other bones or bound differently from its first mesh;
- a body's bones differ from the first body's, naming the bone;
- the first body's first bone is not the one root of its skeleton;
- the first body's glb lacks one of `clips`, naming both;
- an item names a key other than `model` that is no place, or a place whose bone the skeleton
  hasn't got, or its model has no mesh;
- a row holds an item on no place, an item none of `items`, or an item on a place the item doesn't
  list;
- `travel`, `pose` or `holds` is asked about a body that has not been baked, a clip that does not
  exist, or an item on a place it doesn't list.

## Tests

`crowd3d.plugin.test.ts` runs crowd3d on render3d with no canvas, on two bodies built by the test
from the one skeleton. It checks:

- one bake poses both bodies as three's mixer does, from the hips, on a baked frame and between two;
- the hips' travel is taken off every clip and handed out in metres per second, the same for each
  body;
- held clips, before and after their length, against looped clips;
- the one pool and its default size;
- a slot written once and rewritten only on a change of course (`since`, clip, speed, heading or the
  end of its line);
- a clip going on where it had got to when its person sets out on a new line, and a new clip starting
  afresh;
- a row on a spline, the piece the clock is on written into its slot, and again as the clock reaches
  each next one, its clip going on;
- each body's copies and groups;
- a full pool, a row of no body or no end to its line, and a body of other bones;
- an item sits on its place's bone as a child of that bone sits in three, in metres, on both bodies;
- an item's vertices where they stand in its glb, one copy for each place anyone holds it on, each
  copy's pose row, bone and matrix, and a change of what a row holds or the row going;
- an item on no place, of no item, on a place its item doesn't list, or on a bone the skeleton
  hasn't got;
- the listing order;
- `close`.

`crowd3d.sim.test.ts` checks where a course puts a person: on a line, as far along it as its speed
carries it across the ground, its height with it, at its end once there, at its end when its ends
stand one over the other, and at its start at a speed of 0; on a spline, each of shapes3d's pieces in
turn, across the ground at its speed, facing along it, and at `to` once past its end.

```
yarn vitest run plugins/crowd3d/crowd3d.plugin.test.ts
yarn vitest run plugins/crowd3d/crowd3d.sim.test.ts
```

## Plugins it works with

- **shapes3d**: a course is shapes3d's `line`, and with `through` its spline, walked a piece at a time
  as `drawn` cuts it; and its `paths` mod (`shapes3d.crowd3d.ts`) hands crowd3d the lines and splines
  of its shapes, each played as its kind's `data.crowd3d` says.
- **npc3d**: the `crowd3d` body, an NPC whose orders write its course.
- **loader**: the bodies' and the items' models.
- **render3d**: its scene, `dress`, and the clock it draws at.
