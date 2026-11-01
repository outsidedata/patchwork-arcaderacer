# motion3d

How a rigged body moves through the world, or is held in place, while it plays animation, in one flat
system: walking, crawling in a low space, carrying a torch in a cave, hanging off a ledge, sitting in a
chair, climbing a rope, driving a car. Just being somewhere makes an animation happen: walk into a shape
and what it offers plays, with no key.

## Why use it

Use motion3d for anything a character does with its animations. What a character can do is data, its
motion3d file; where it does it is data, the shapes of the scene; nothing about what an activity is
lives in motion3d's code.

## How it works

**Activities and motions.** The character's motion3d file (`xbot.motion3d.json`) holds its
activities: an activity is what the body is doing (getting around, crawling, carrying a torch, hanging
from the ledge), small and flat. Each has motions: how the activity looks in one situation. A motion's
`when` is its description of that situation, the states (kinematics3d's `is`) that must hold, `!word`
one that must not; its `target` the kind of thing it plays against (`triangles`, `point`, `line`,
`spline`, `plane`); its `clips`, more than one for a move that goes each way (a walk of eight clips, the
one that goes the way the stick pushes played);
`over`, the bone it is played from over the body (the upper half); `press`, the key that plays it;
`stick`; `from`, the moves it may follow; `then`, what follows it; `carry`, the prop it holds;
`behavior`, how kinematics3d moves the body (`move`, `jump`, or a word another plugin delivers
kinematics3d, the demo's `launch`). An activity's `normal` is the up it
holds the body to on any point, in place of the point's own (walking stands upright on a slope). The
file's `carries`, `{ <name>: { prop, anchor, limbs } }`, are how the body holds a prop of its kind's
`props`: the prop set by one of its empties against a bone, and the limbs that reach empties in it.
Beside every clip's FBX is its sidecar (`<clip>.motion3d.json`, `{ spot, on, facing?, after? }`): its
spot, the bones held to the point (the hands on a bar, the hips on a seat; none, the root), and how the
spot meets it (`both`, `begin`, `end`, `face` against the wall its touches measured, `after` from where
another clip ends). The bake writes each clip's offsets (`xbot.motion3d.baked.json`,
`motion3d.offsets.ts`): where its spot stands from the point at its first frame and its last, and the
way the body faces.

**Shapes are a stack.** The shapes holding the body are a stack, best ranked first, the anywhere shape
at the bottom: `world.motion3d.anywhere`, a box at the middle of the world holding every point,
priority 0. Other shapes come from the `spaces` mod (shapes3d's kinds that list `activities`). A shape
whose `data.motion3d.autoChange` is true takes its activities up with no key; the anywhere shape is one.
The body has two parts, the whole body and the upper half (motions with `over`). Each part takes its
motion from the highest such shape with one that fits (no `press`, may follow, describes the
situation); what a shape does not list is inherited from the shapes under it. The cave lists only the
torch for the arms, so the legs walk as the anywhere shape has them.

**A motion ends, then the next is found.** A motion remembers the shape it started in. A one-shot is
over when it plays out; a loop, or a held motion with no clip (holding the torch), when its shape no
longer holds the body, its description stops being true, or, as its clip comes round, a higher ranked
shape has a motion of its part that fits. Then its `then`, else the search through the stack, else
`fill`: the anywhere shape's first activity, its first motion.

**Stations.** A shape that takes nothing up with no key (a ledge, a chair, a car) is entered by a key
and holds the body in its activity while it stands; its motions re-pick within it by their stick and
`when`.

**Arriving in a shape.** Each step, before it works out the shapes holding the body, motion3d moves
the body's `lookAround` (last step's answer, the shapes holding it as `holding` hands them) to
`previousLookAround`, then writes this step's answer to `lookAround`. Both stay on the body's row, so
after `drive` any rule or plugin diffs them: a shape in `lookAround` and not in `previousLookAround` is
one the body came into this step, and one the other way round is one it left. On the next step the
shape is in both, so a trigger fires once each time the body arrives, and again only once it has left
and come back.

The demo's jump pad is this and nothing else. Its own plugin, `jumppad` (`games/demo_motion3d/plugins/`),
makes a shapes3d `pad` for each entry of `world.jumppad.pads`, `{ pos, yaw, velocity }`, the row carrying
its `velocity`, and the pad offers the `jumppad` activity. The player rule calls the plugin after
`drive`; it diffs the two answers, and on the step the body arrives on a pad it presses `jumppad`, which
plays that activity's `launch`, the `jump` clip with `behavior: 'launch'`. `launch` is the plugin's,
delivered to kinematics3d by its mod (`world.kinematics3d.mods.behaviors: [..., 'jumppad']`): on the
body's next move it sets the body's whole `vel` to the pad's `velocity`, and kinematics3d's gravity
takes it from there. A pad of another strength or direction is another entry; a knockback, a speed strip
or a spring wall is another behavior delivered the same way.

**One held path.** Every body is held to its move's target and moved along the target's ways by
kinematics3d, by the move's behavior; free is held with more directions. The land is the `triangles`
target. A move on the triangles stands the body's root on its place; any other places it by its clip's
offsets. A loop goes as its lap carries it, as hard as the stick pushes; a one-shot's travel along the
target's ways moves its place, so a roll stops at a wall and falls off an edge. A move that would carry
a bone of the spot past a line's or a plane's edge is not made, so a shimmy stops with its hands on
the ledge. At rest (kinematics3d's `rest`), a loop whose lap carries the body nowhere (an idle) plays on
at its own rate, and one that carries it (a climb) holds still. Falling is kinematics3d's: a fall clip
is only a picture, a motion described `falling`.

**Tilt.** A clip measured against a wall faces out of it; a seat or a floor faces up. Held to a point
whose normal is another way, the body is tilted by the turn that lays the one onto the other, so a
climber leans onto a wall that leans back. The row carries it as `tilt`, eased in and out with the
root.

**Easing.** A change of clip fades over the kind's `fade`, and the root is eased with it, from where the
clip fading out stood it to where the one coming in has it, so the bones the two land on a point stay
on it all through the fade.

**Playing and drawing.** `motion3d.play.ts` plays the clips, one at a time, a change faded over the
kind's `fade`, the upper half's over them; its `pose(me, w, name)` plays one of the rig's `poses` (a
frame of a clip, named in the `.poses.json` beside the clip's FBX, anim's README), the clip held still
at that frame and faded in as any clip is. `motion3d.plugin.ts` draws every body from its row: the mixer
scrubbed to the row's clips, a body held to a moving space drawn on it (the `object` mod's three.js
object, a car rolling on its springs), a tilted body drawn tilted, props hung on bones, the carried prop
set at its anchor, and the limbs a held clip plants bent onto its point with ik3d's solve, for the
frames the bake says each is planted, eased in and out over `world.motion3d.ease` seconds. A row's
`aim`, a direction in the world, turns the upper half while its move plays a loop, the turn shared
among the bones from the move's `over` bone up to the anchor bone, so the carried prop points along it
and the hands follow it.

**The clip analyzer.** `node --experimental-strip-types plugins/motion3d/scripts/clipanalyzer.ts
[port]` serves a page that plays any clip of a game's rig on its body, raw, held to nothing, with what
the bake measured laid over it: the root's path, the spot's path and its ends, each plant, the wall
its touches found, and along the bottom when each hand and foot is planted and the heights and travel.
It shows the clip's `held` and the offsets the baked file stores, and says whether they match the same
worked out again from the measures. A clip of the clip collection's packs is baked onto the body from
the page.

The clip collection, where the clips' FBX and their sidecars are, is `PATCHWORK_CLIPS` from the
environment, else `~/troupe-collection`; the offsets bake and the clip analyzer both read it.

## Using it

1. Write the character's motion3d file and a sidecar beside each clip's FBX, and add motion3d's step to
   the game's bake (`motion3d.offsets.ts <rig.json> <motion3d.json>`).
2. Give `world.motion3d: { kinds: { xbot: { motion, baked, rig, measured, model, glb, fade, reads,
   props? } }, anywhere: { shape: { box: { size: [1e9, 1e9, 1e9] } }, activities: ['walk', ...],
   priority: 0, data: { motion3d: { autoChange: true } } }, ease, mods: { spaces: 'shapes3d', object? }
   }`, `object` naming the plugin that hands the three.js object a space is drawn by, and
   kinematics3d's numbers and mods (its README). List `motion3d` before `render3d`.
3. List activities on shapes3d kinds: a station `{ shape, points, activities: ['ledge'] }`; a place
   that takes its activity up with no key `{ shape, activities: ['crawl'], priority: 2, data: {
   motion3d: { autoChange: true } } }`.
4. In the body's rule: `drive(me, w, dt, stick)` once a step, `press(me, w, key, stick)` for each key.
5. The row carries `activity`, `motion`, `space`, `upperActivity`, `upperMotion`, `upperSpace`, `root`,
   `along`, `eased`, `offered`, `lookAround`, `previousLookAround`, `tilt`, `stopped`, `facing`;
   motion3d fills them. The rule sets `want`,
   the stick's way across the ground [x, z], `face`, the way to face or null, and `aim` when the body
   aims.

## Plugins it works with

- **kinematics3d**: moves every body, by `move` and `jump` (`motion3d.kinematics3d.ts`) or a behavior
  another plugin delivers it, and applies gravity.
- **shapes3d**: `shapes3d.motion3d.ts` hands its spaces, their points and their `data`.
- **loader**: the rig, the motion3d files, the model and its glb.
- **render3d**: motion3d draws into its scene.
- **ik3d**: motion3d imports its solve; a scene lists no ik3d.

## Keywords

activity, motion, clip, stack, anywhere shape, autoChange, priority, inherit, when, then, fill, over,
upper half, carry, torch, crawl, zone, ledge, hang, climb, chair, rope, wall, stairs, pool, car, walk,
run, jump, fall, target, point, line, spline, plane, triangles, root, spot, sidecar, offsets, held, spaces,
easing, crossfade, IK, tilt, aim, carry, prop, clip analyzer, arrive, trigger, jump pad, launch,
`lookAround`, `previousLookAround`, `drive`, `press`, `world.motion3d`
