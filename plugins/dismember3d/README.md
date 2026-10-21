# dismember3d

Limbs that come off a Mixamo body: shots land on the body's joints, each joint has hits, a limb cut
off becomes a physics piece that tumbles away with gore, the body draws without it, loses a leg and
crawls, loses its head and drops, and a car can crush it.

## Why use it

Use dismember3d for zombies, monsters, robots or soldiers that come apart under fire: shoot an arm
off, blow off a leg so the enemy crawls, a headshot that drops it, a car that ploughs through. The
cut is decided on the server, so every seat sees the same limb come off, and the piece is a box3d
body every seat sees fly the same way.

## How it works

**Server half (`dismember3d.sim.ts`).** The limbs are a Mixamo body's segments, named by the bone
each starts at: `head`, and on each side the upper arm, forearm and hand (`armL`, `forearmL`,
`handL`, …R) and the thigh, shin and foot (`uplegL`, `legL`, `footL`, …R). `LIMBS` gives each one:

- `piece`: the kind of the piece row it comes off as (a box3d kind of the game's, with no look of its
  own); `PIECES` is every piece kind once.
- `below`: the segments that go with it (the forearm and hand with an upper arm).
- `joint: { radius, hp, about? }`: the sphere a shot meets it in and the hits it takes.
- `push` and `spin`: how the piece is thrown and spun, in the body's frame, on top of its velocity.
- `kills` (the head: the body dies where it stands through ragdoll3d's `die`) and `crawls` (a leg:
  the body's rig goes to its `crawl` stance).

The joints are where anim's bake measured each segment's ends (the rig's `ends`), at the body's clip
and playhead this step. A body row writes `off` (the segments lost, `[]` in its prefab) and `hp`
(each joint's hits left, `{}` in its prefab).

- `joints(w, me)`: every joint a body still has, `{ segment, at, radius }`, in the world.
- `hit(w, me, struck)`: from the body's `hit` act, hitscan3d's `Struck`: the joint its `part` names
  loses `damage` hp, and at none the segment is lost.
- `lose(w, me, limb)`: the segment and everything `below` it come off; one piece row is spawned along
  them as they stand, thrown and spinning; then `crawls` and `kills`.
- `pieces(w, body)`: every piece cut off a body, for the body's rule to end when it clears it away.

A limp body is not cut.

**Browser half (`dismember3d.plugin.ts`).** Every triangle of the body's model is labelled with the
limb whose bones weigh most on its corners. A body draws every triangle but those of its `off`
limbs; a piece is drawn as its limbs' triangles baked to the pose they had the frame it came off,
into a plain mesh that box3d carries. A piece bursts its body kind's `gore.sever` particle3d effect
where it came off and carries `gore.drip` while it lies, both resting on the land.

## Using it

1. List it after `anim`, `box3d` and `particle3d` and before `render3d` in `plugins`.
2. Give `world.dismember3d: { kinds: { <kind>: { gore?: { sever?, drip? } } }, mods: { bodies?, land? } }`.
3. Give each piece kind in `PIECES` a `world.box3d.kinds` entry (the shape it tumbles as).
4. Give each body kind `off: []` and `hp: {}` in its prefab, draw it with anim, and have its `hit`
   act call `hit(w, me, struck)`.
5. Point hitscan3d at the joints: `world.hitscan3d.mods: { bodies: 'dismember3d' }`.

## Plugins it works with

- **hitscan3d**: the mod `dismember3d.hitscan3d.ts` (`world.hitscan3d.mods: { bodies: 'dismember3d' }`)
  hands a shot the joints of every body that comes apart, beside the bodies of the plugin
  `world.dismember3d.mods.bodies` names; a shot's `Struck` is what `hit` takes.
- **box3dvehicle**: the mod `dismember3d.box3dvehicle.ts` (`world.box3dvehicle.mods: { strike:
  'dismember3d' }`) has a car take off the arm and thigh on the side it met, kill the body and throw it
  along the way the car goes; every other row a car meets is struck as hitscan3d strikes it.
- **anim**: the body's model and pose, and the measured `ends` of every segment.
- **ragdoll3d**: `die` drops a body that lost its head or was run over.
- **box3d**: every piece is a box3d body, followed by its mesh.
- **particle3d**: the sever burst and the drip.
- **terrain3d**: the mod `terrain3d.dismember3d.ts` (`world.dismember3d.mods: { land: 'terrain3d' }`)
  is the ground the gore comes to rest on; with none, the flat floor at y 0.
- **render3d**: draws the bodies and pieces.

## Keywords

dismemberment, gore, limbs, sever, cut off, blow off, zombie, headshot, crawl, crawler, Mixamo,
skinned mesh, body parts, hit locations, hitboxes, joints, hp per limb, physics pieces, gibs, blood,
drip, run over, car crush, roadkill, ragdoll, `lose`, `hit`, `joints`, `pieces`, `LIMBS`,
`world.dismember3d`
