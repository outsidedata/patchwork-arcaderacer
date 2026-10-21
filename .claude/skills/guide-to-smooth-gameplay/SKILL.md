---
name: guide-to-smooth-gameplay
description: Use in core, or any clone of it, whenever a thing on screen slides, streaks, judders, stutters, flips, spins the long way, pops, lags a frame or jumps when it should not - and before writing a teleport, a portal, a door to elsewhere, a respawn, a reset onto the track, a camera cut, a pooled object handed to another owner, or a look that moves a thing on the page's own clock. Covers drawing between steps, `userData.teleport`, the page's clock, prediction's easing, and how a smooth game is measured.
---

# A guide to smooth gameplay

The truth steps at a fixed rate (`prefabs.engine.dt`, 1/60 in a new game). A display draws at its own
rate. What makes the two meet smoothly is already built; a game's job is to feed it right, and to say
so in the one place it cannot know: a jump.

## What is drawn every frame

- **A step behind the clock, between the last two steps.** The page hands each frame `between`, how far
  its clock is past the step it took, from 0 to 1 (`index.html`: `page.frame(owed / dt)`; `client.html`:
  `predict` hands it). render3d puts every object of its scene and overlay, and the camera, that far
  between where the last two steps left it: position in a straight line, turn the short way round,
  scale; then puts each back where it was set (`steps` in `engine/browser.ts`, Between steps in
  `plugins/render3d/render3d.plugin.ts`). So a look writes its object from its row as the row is, every
  frame, and never eases, lerps or extrapolates it: a second blend on top lags and wobbles.
- **An InstancedMesh's copies** are drawn where they are set, not between.
- **A thing moved on a frame that took no step** (an animation, a particle, a camera turned on the page's
  clock) is drawn where it is set for the rest of that step and all of the next, and between steps
  again once a whole step has gone by with only the steps moving it (`engine/browser.ts`).
- **A thing new on the newest step** is not drawn until the clock reaches its step, then drawn where it
  was set (`engine/browser.ts`).
- **The steps gone back** (the editor's seek): everything drawn where it is set.

## A jump: `userData.teleport`

The blend cannot tell a teleport from fast travel. Unflagged, a camera put 40 metres on through a door
is drawn sliding the 40 metres, and turning part way, for a step. So the look says it:

- On the frame it puts the object somewhere new, the look sets `object.userData.teleport = true`. That
  object is drawn where it is set on that frame and every other frame of that step, never between.
- On a later frame the look sets it back to `false`. From the next step the object is drawn between
  steps again, from where it was put.
- Left `true`, the object is never drawn between: a light moved from lamp to lamp.
- The flag is the object's own. A child moved with its parent needs none; a child moved itself needs its
  own. The camera is an object: a first-person jump flags the camera.

render3d only (`plugins/render3d/render3d.plugin.ts`, A teleport). render2d has no such flag.

The rule says a jump happened with a **count** on the row, bumped on the step it moves the row: a field
set for one step and cleared is missed whenever two packets land in one frame, a count is not. The look
raises the flag on the frame the count changes:

```ts
// player.sim.ts: the step the player crosses door A's plane inside its width
me.data.pos = out    // door B's point, the crossing carried through
me.data.yaw = turned // the facing turned by the angle between the doors
me.data.jumps += 1

// player.client.ts, for the row that is `mine`
let jumps = 0
export function setup(row: Row) { jumps = row.data.jumps }
export function tick(row: Row, plugins: Plugins) {
  const camera = plugins.render3d.camera
  if (!camera) return
  camera.userData.teleport = row.data.jumps !== jumps
  jumps = row.data.jumps
  camera.position.set(row.data.pos[0], row.data.pos[1] + eye, row.data.pos[2])
  camera.quaternion.setFromAxisAngle(up, row.data.yaw)
}
```

Every other mesh that jumps with it (the player's body for the other seats, a held thing) flags itself
the same way, off the same count.

## The rules that keep it smooth

- **Turns are set whole**, as a quaternion: `quaternion.setFromAxisAngle`, `quaternion.fromArray`.
  Never `.rotation` (`rotation.y = yaw`, `rotation.set(...)`), anywhere, on any object or the camera.
  A `.rotation` set judders. This is certain, not a maybe: doom's enemy sprites (sprite3d's
  `rotation.y`) and its camera (`rotation.set(0, yaw, 0)`) wiggled, and setting the quaternion instead
  fixed it completely (2026-10-21). When something wiggles, find every `.rotation` set and replace it
  with the quaternion. That is the fix; don't probe, measure or doubt it first (`writing-the-look`, A
  kind's look).
- **Motion is a law solved exactly over `dt`**, so it moves the same at every step rate
  (`tuning-feel`, step 1). The three `dt`s (`prefabs.engine.dt` in the manager, `prefabs.scenemanager.dt`
  beside it, each child's `prefabs.engine.dt`) change together.
- **What the seat's press moves is on its `player` row**, so on `client.html` it is drawn from the page's
  copy the frame after the key (`designing-a-seat`). A camera follows that row.
- **A one-step event is a ledger entry**, not a field set and cleared (`input-and-seats`, Presses and
  ledgers).
- **Rules compute with `plugins/math`**, never `Math`'s transcendental functions: node and Chrome differ
  in the last bit and the page's copy drifts.
- **Prediction eases corrections** (`addons/predict/predict.addon.ts`, Easing a jump): each number a
  late press or a reload moved by no more than `world.predict.snap` is eased out over `halflife`
  milliseconds; one that moved further is drawn where it now is at once. A correction across a teleport
  is past `snap` and is not eased. `snap` is in the rows' units: a scene in metres gives a `snap` well
  under the shortest teleport.

## What goes wrong

| Seen | Cause | Fix |
|---|---|---|
| The camera slides across the level for a frame on a teleport or respawn | not flagged | `userData.teleport` on the frame it is put there |
| It still slides for part of the step | the flag set and lowered in the same `tick`, before render3d drew | lower it on a later frame |
| A thing that jumps every step (a lamp pool) streaks | blended | leave its flag up |
| A turn spins the long way, or a sprite, camera or mesh wiggles | `.rotation` set (`rotation.y = …`, `rotation.set(…)`) | the whole quaternion, `quaternion.setFromAxisAngle`: this is the cause, every time |
| A look's own smoothing lags and wobbles | a second blend over render3d's | write the object from the row as it is |
| The flag on a group, and a child still slides | the child moved itself | flag the child |
| A jump missed on some frames | a one-step boolean on the row | a count |
| A thing jumps a step ahead of what it rides, now and then (a driver in a car) | its look recomputes it every frame through a matrix round trip, reading back what it wrote the frame before (`decompose` of its own `matrixWorld`, its scale kept from it), so its numbers change in the last bit on frames of no step and it drops out of the blend | set its `position` and `quaternion` straight from the inputs, and never read back its own scale: the same inputs give the same bits every frame |

## Off the blend, in the console

render3d blends a thing between the steps only while nothing but the steps moves it. A thing whose
numbers (position, quaternion, scale) differ in **any bit** on a frame that took no step is drawn where
it is set for the rest of that step and all of the next (`steps`, `engine/browser.ts`). There is no
error: the only sign is a stutter now and then, and float noise from a matrix round trip is enough.

`render3d.drifted(f)` names it. `f` is handed `{ object, path, step, was, now }` the moment an object
stops being blended, once per step it drifts in: the object, its names from the scene down (`name` or
`type`, joined with ` > `), the step, and its numbers on the step's frame and now. An object with
`userData.teleport` up is not handed over. Nothing is checked while nothing listens; it hands back a
function that stops it.

A game's `dev.html` listens and warns, for each scene's render3d, as drive's does:

```js
if (r3 && r3 !== watched) {
  stopWatching?.()
  watched = r3
  stopWatching = r3.drifted(d => console.warn(`drifted off the blend, step ${d.step}: ${d.path}`, { was: d.was, now: d.now, object: d.object }))
}
```

Play with the console open. A thing that stutters and is warned about is changed by its look or a plugin
on frames of no step; compare `was` and `now` to see which numbers move and by how much. Last-bit
differences are a recompute with a different rounding; large ones are a look moving it on the page's
clock (which is then either meant, a particle, or a look that should move it only from the row). A
thing that stutters and is never warned about is blended: the trouble is in what the row holds.

## How it is seen and measured

- `render3d.drifted(f)`: each object the moment it drops out of the blend (Off the blend, above).
- `render3d.drew(f)`: every frame, where the camera and each mesh stand as drawn, between the steps
  (`plugins/render3d/render3d.plugin.ts`). The frame a drawn value leaves the row's is the bug.
- The simulator's `standoff`: how much the camera's distance to the seat's row changes frame to frame
  (`tuning-feel`, Measure).
- Chrome, at the display's own rate: walk through the door and watch for any frame between the places.

Related: `writing-the-look`, `tuning-feel`, `designing-a-seat`, `going-multiplayer`, `proving-a-game`.
