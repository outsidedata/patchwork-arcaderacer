# melee3d

Swords and other blades held in a body's hands, swung through the world by the clips anim plays. It
knows where each blade and each limb stands on a step, follows a blade's path through a swing, and
hands back every limb and every other blade the swing met: where, which way it moved, and how fast.
Its npc3d mod gives an NPC a whole sword fight.

## Why use it

Use melee3d for a fight with swords, axes, clubs or knives, where the hit is decided by the swinging
blade and not by a range check: a cut lands on the limb it passed through, two blades that cross meet
each other, a blade resting on a body does nothing, and a hand cut off takes its sword with it. The
blades are the model's own, posed on the server from the same fields anim draws the body from, so the
server decides every blow from where the page shows the sword.

## How it works

**Blades.** A blade is a rigid weapon a body's rig names in its `blades`: one of the rig's `meshes`,
measured by anim's bake (`anim.export.py`) into the rig's `grips` as its guard and its tip on the joint
that carries it, for each body. A body holds a blade while its stance draws it (the rig's `show` for
the row's stance lists it, or the rig has no `show`), and while it still has the limb the blade's bone
hangs from. A blade the rig names that the grips do not have throws, telling you to bake it.

**Server half (`melee3d.sim.ts`).** It has no row and no rule of its own; a kind's rule calls it.

- `blades(from, me)`: every blade the body holds now, `{ blade, guard, tip }`, both ends in the world,
  in metres. The body is posed as anim's page half draws it from the row's fields (anim's `posed`):
  every clip it blends, the upper body's gestures and the pinned hips, then turned by the row's yaw
  and moved to its feet, as the kind's anim `reads` name them. A body lying limp has none.
- `limbs(from, me)`: every limb the body still has, `{ limb, a, b, radius }`, posed the same way. A
  limb listed on the row's `off` (dismember3d's) is gone. A body lying limp has none.
- `swing(w, me, dt, live)`: called each step of the body's rule, once anim has posed it. Where each
  blade stands now goes on the row's `edges`. `live` is the name of the swing the body is in, or null:
  with null nothing is met and `struck` is emptied; a new name starts a new swing with nothing struck.
  In a swing, each blade is followed from where it stood at the end of the last step to where it
  stands now, as points along it from guard to tip at most `spacing` apart, each moving in a straight
  line. A path that passes within a limb's radius meets that limb of another standing body of `kinds`;
  one that passes within `clash` of another body's blade meets that blade. A point moving slower than
  `edge` meets nothing. Each limb and blade is met once a swing, at the soonest point that reached it.
  It hands back what it met, soonest first: `{ what, id, part, point, dir, speed, u, blade }`, where
  `what` is `limb` or `blade`, `part` the limb or the other body's blade, `point` where the path came
  nearest, `dir` the unit direction it moved, `speed` in m/s, `u` how far through the step (0 to 1),
  and `blade` the name of the swinging blade.
- `liveOf(me, strikes)`: the swing a body is in now, to hand to `swing`. `strikes` is
  `{ <clip>: … }`, the clips that swing a blade. It is the clip on anim's upper channel while a gesture
  there has weight, else the clip the body plays as its act, if `strikes` names it; else null.

What to do with a contact is the rule's: hurt the body (hitscan3d's `strike`), cut the limb
(dismember3d), stop the swing on a blade, play a sound.

**Browser half (`melee3d.plugin.ts`).** A look for checking a fight. With `world.melee3d.show`, it
draws every blade each body of `kinds` holds as a rod from guard to tip, over everything else, so you
see where the server puts a blade beside the sword the model draws. With `show.limbs` it also draws
each limb as a line from bone to bone, and with `show.struck` a limb a swing in play has met in that
colour. With no `show` it draws nothing. It draws through render3d's scene.

**npc3d's sword fight (`melee3d.npc3d.ts`).** The behaviour `fight`, for an NPC on npc3d's walker body
that holds a blade. Its foes are the rows of the kinds its `at` list names that it has noticed, that
stand with `health` left, and whose team is not its own (the row's `team`, else its definition's,
else ''). Each step it picks a foe (turning to a nearer one), closes on it or, if enough of its team
already are, waits its turn on a ring round it; raises its guard against a swing it sees coming; and
attacks with a chain of strikes or a heavy one. With no blade (the hand cut off) it backs away; kneeling
in its crawl stance (a leg cut off) it crawls at its foe and does nothing else. A foe's swing is read
with `liveOf` of the foe's definition's `strikes`, and is judged coming until the foe's playhead
reaches the clip's `hit` marker. Its strike chain reads the `chain` and `cancel` markers of its clips;
a clip with no `cancel` marker holds the body until it ends.

Its settings, under the key in the NPC's `behaviors` (metres, seconds, degrees):

| Setting | What it is |
| --- | --- |
| `weight` | its score while it has a foe or its guard is up; 0 otherwise |
| `at` | the list of its definition's that names the kinds it fights |
| `speed` | `{ walk, run }`, m/s |
| `near` | within this of its foe it walks and faces it; further, it runs |
| `reach` | it strikes within this of its foe |
| `face` | it strikes when facing its foe within this many degrees |
| `ring`, `slots` | the radius of the ring a waiting NPC stands on round a foe, and the bearings on it, degrees from the way the foe faces, taken in turn |
| `attackers` | how many of a team engage one foe at once: the nearest, then by id |
| `retarget` | it turns to another foe standing nearer than this share of its foe's distance |
| `wait` | `[lo, hi]` seconds, rolled, between its attacks, counted down only while it is free |
| `chain`, `most` | the clips of its strike chain in order, and the most strikes one chain throws |
| `heavy`, `heavyOdds` | the clip of its heavy strike, and the odds it throws it instead of a chain |
| `sees` | metres within which a foe's swing, facing it within 60°, is judged |
| `guardOdds`, `react` | the odds its guard rises against a swing it judges, and `[lo, hi]` seconds of reaction before it does |
| `block` | `[start, hold, end]`, the clips of its guard |
| `unarmed` | with no blade it backs away at its walk until this far off |
| `crawl` | `{ stance, speed }`: kneeling in that stance of its rig, it crawls at that speed toward its foe |

Its row carries `target`, `wait`, `chain`, `queued`, `guard`, `guardFor`, `read`, `wary` and
`ticked`; a prefab starts them `null`, `null`, `0`, `null`, `false`, `0`, `null`, `null` and `null`.

## Using it

1. Give each kind that swings or is swung at an anim kind, and a rig whose `blades` names its weapons,
   baked so its `grips` has them.
2. Give `world.melee3d`:
   - `kinds`: the anim kinds whose blades and limbs it knows.
   - `limbs`: `{ <limb>: { from, to, radius } }`, each limb a capsule of `radius` metres round the line
     from bone `from` to bone `to`, named as dismember3d names its segments (`head`, `torso`, `armL`, …).
   - `spacing`: metres, the most between two points of a blade whose paths a swing follows.
   - `edge`: m/s, the slowest a point of a blade moves and still lands a blow.
   - `clash`: metres, how near a point's path passes another blade to meet it.
   - `show` (optional): `{ colour, radius, limbs?, struck? }` for the page's rods and lines.
3. Start each swinging body's prefab with `edges: {}`, `swing: null`, `struck: []`.
4. In the body's rule, after anim has posed it: `swing(w, me, dt, liveOf(me, strikes))`, and act on
   each contact it hands back.
5. To draw the rods and lines, list `melee3d` in the scene's `plugins` and give `world.melee3d.show`.
6. For NPCs that fight on their own: `world.npc3d.mods: { behaviors: 'melee3d' }`, a key `fight` (or
   one whose `as` is `fight`) in the NPC's `behaviors` with the settings above, `strikes` on each foe's
   definition, and the fight's fields on the NPC's prefab.

## Plugins it works with

- **anim**: poses every body (`posed`), and its bake measures each blade into the rig's `grips`.
- **npc3d**: `melee3d.npc3d.ts` hands it the behaviour `fight`, for NPCs on its walker body.
- **dismember3d**: a limb on a row's `off` is gone, and a blade hanging from it with it.
- **hitscan3d**: `strike` hurts a body a blade met, with the one `Struck` every `hit` act reads.
- **render3d**: the page half draws through its scene.
- **math**: deterministic maths.

## Keywords

melee, sword, sword fight, blade, axe, knife, club, swing, slash, cut, strike, combo, chain, heavy
attack, block, guard, clash, blade contact, hit detection, limbs, dismemberment, hand cut off,
NPC combat, surround, take turns, `blades`, `limbs`, `swing`, `liveOf`, `fight`,
`world.melee3d`
