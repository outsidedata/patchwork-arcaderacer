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

**The input buffer.** `queue(me, w, key)` holds a key, and `drive` plays it once a move may, in the
order the keys came. A one-shot a key played (an attack, a roll) is cut by the next key only from its
cancel point, the motion3d file's `buffer.cancel[<key that played it>][<key pressed>]` (with `"*"` for
any), a time in its clip: seconds, `"NN%"`, or `"strike"`, the second its blow lands as the bake
measured it. A key free to play that nothing plays is dropped after `buffer.hold` seconds. So three
lights pressed during the first swing play the whole chain, each swing from the one before's strike.

**The jump.** The `jump` behavior leaves the ground on its clip's takeoff, the second the clip's feet
leave it, not its first frame, and plays a clip that comes down again before its end at the rate that
lands it as the body lands. Its rule sets `jumpHeld`; let go while the body rises, the jump keeps the
kind's `jump.cut` of its upward speed, so a tap hops and a hold jumps `jumpH` high.

**Layers.** A motion that says `add` is laid on top of whatever plays, at its `weight`, from its `over`
bone up or over the whole body: each bone turned on by as much as its clip turns it from its first
frame. One with a `press` plays as a one-shot by its key over anything (a flinch, the legs running on);
one with none is laid on while a shape holding the body offers it and it fits (breathing while still).
The row carries them as `adds`; the page lays them as the server does. A kind's `lean`, `{ most, ease }`,
leans a body on the triangles into its turns by atan(speed · turn rate / g), in its `tilt`.

**Warp.** Motion warping: a one-shot whose motion gives `warp` is bent from where the body is onto where it
must be, eased in and out over the clip from its start to its `until` (seconds, `"NN%"` or a moment,
`"strike"`, `"plant"`), the rest of the clip its own. On the triangles, `{ until, reach, turn, accel }`,
begun while its row has a `target` (a place in the world, its rule's): its blow at `until` lands there,
the body turning toward it at most `turn` degrees and going as much further as the blow falls short or
past, at most `reach` metres. Walls stop it as they stop any travel. On a space's point, `{ until }`: the
clip begins where the body stands and facing as it faces, carried on the way it ran, and by `until` it
stands and faces as the point places it, with no snap: a body run at a vault on a slant runs on into it
on its own line and its hand comes down where the point puts it.

**Mixes.** A loop on the triangles whose motion gives `mix: "way"` is drawn as a blend space: of its
clips, the two whose measured travel goes either side of the way the body is walked, each by how near it
is by angle, the heavier the row's `clip` and the other in its `mix`, `[{ clip, t, w }]`. They are kept in
step by the left foot coming down (`downOf`, the start of the stretch the left ankle stands within the
motion3d file's `down` metres of its lowest), and the heavier is handed over in step, with no restart or
fade, as the way turns past the middle, the row's `rate` scaled from the one clip's lap to the other's so
it goes round as often. The body is walked as fast as its clips go, each clip's speed by its share (a
blend space's speed axis: as fast at 45° as straight on), the clips going round faster where their laps
together make a shorter way. `play` freezes the mix into `fromMix` as it fades out with the clip. Both
halves draw it from the same parts.

**Gaits.** A loop on the triangles whose motion gives `gait`, the motion of its activity it pairs with by
speed (a walk's run, a run's walk, each naming the other), is drawn with both motions' clips: each set at
its shares for the way, and the other's share, the row's `gaitW`, eased toward where the body's speed
stands between the two sets' speeds by no more than a step over the kind's `fade`. The body is walked at
its own motion's speed and eased there by kinematics3d, so a body that has just begun to run is still
drawn mostly walking. One motion of a pair followed by the other carries on in step with no restart or
fade.

**Inertialization.** A kind's `blend`, `cross` or `inertial`, is how its body goes from one clip to the
next over its `fade`. Inertialized, the clip it goes to is drawn whole at once, and each joint's offset
from the pose it left in decays to nothing over the fade (Bollo's quintic), the jump of the body's place
folded into its hips; the row carries each change as an entry of `inert`. A change cut short by another
goes on from the pose drawn, where a crossfade drops the clip half faded in. The page lays the same
offsets as the server, read off the kind's `glb`.

**Starts, stops and pivots.** A one-shot's motion may give `begin` and `end`, times of its clip it begins
and is over at (a start handed to the walk at its second foot down, a stop begun where it starts to
stop), and `yields: true`, over once its description stops being true as a loop is (a stop the stick
pushes again, a start let go). A one-shot on the ground faces as the body faced when it began, turned by
its clip's own turn where it keeps one (a 180); one begun on a step that turned the body first is laid
from where the body faced as that step began, so the clip turns it the whole way. One with `steer: true`
turns toward the way the body is walked as a walk does (a start pushed off to the side). The state
`reversed`, the want further than the kind's `move.reverse` degrees from the way the body faces, is what
a pivot's `when` asks, and its walk and run say `!reversed`.

**Solids.** An activity whose entry gives `solid: { over, at, facing, priority?, points }` is offered by
the upright sides of the scene's solid boxes (the `faces` mod, shapes3d's): a side whose box stands on
the body's ground with its top `over` [low, high] metres over its feet, the body `at` [near, far] metres
out of it and facing into it within `facing` degrees. Its space takes the activity up with no key and at
once (`cut`), and its `points` stand off the side where the clips measure them: a `point` `{ out }` at
the side's foot where the way the body faces meets it, a `line` `{ out, down }` along its top edge, a
`plane` `{ out }` on the side itself. The space the body is in keeps its points where it met the side as it
came into it (the row's `met`). So a body run into a plain box vaults it or mantles onto it with no
station placed.

**Then.** A motion's `then` names a motion of its own activity, or `<activity>.<motion>`, one of another
activity the same shape offers (a weapon put away, then the next drawn).

**Markers.** A clip of the rig names its `markers`, each a time or a window `[from, to]`: seconds,
`"NN%"`, or a moment the bake measured of it, `"peak"`, `"strike"`, `"takeoff"` (where its feet leave
the ground), `"landing"` or `"plant"` (where its first hand comes down on something), maybe moved by seconds, `"strike-0.08"`. Each step `drive` writes `markers`, every one its clips crossed (a window's
opening by its name, its closing by its name and `.end`), and `windows`, the names of those open now, on
the body's row: a blow lands while `strike` is open, a footstep sounds on `step`.

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
   }`, `faces: 'shapes3d'` for activities its solid boxes offer, `object` naming the plugin that hands the three.js object a space is drawn by, and
   kinematics3d's numbers and mods (its README). List `motion3d` before `render3d`.
3. List activities on shapes3d kinds: a station `{ shape, points, activities: ['ledge'] }`; a place
   that takes its activity up with no key `{ shape, activities: ['crawl'], priority: 2, data: {
   motion3d: { autoChange: true } } }`.
4. In the body's rule: `drive(me, w, dt, stick)` once a step, and for each key `queue(me, w, key)`, held
   in the buffer, or `press(me, w, key, stick)`, played now or not at all.
5. The row carries `activity`, `motion`, `space`, `upperActivity`, `upperMotion`, `upperSpace`, `root`,
   `along`, `eased`, `offered`, `lookAround`, `previousLookAround`, `queued`, `markers`, `windows`,
   `adds`, `mix`, `fromMix`, `inert`, `gaitW`, `lean`, `warp`, `met`, `leapt`, `tilt`, `stopped`, `facing`;
   motion3d fills them. The rule sets `want`,
   the stick's way across the ground [x, z], `face`, the way to face or null, `aim` when the body
   aims, `target` when its attacks bend onto something, and `jumpHeld` when its jump may be cut short.

## Plugins it works with

- **kinematics3d**: moves every body, by `move` and `jump` (`motion3d.kinematics3d.ts`) or a behavior
  another plugin delivers it, and applies gravity.
- **shapes3d**: `shapes3d.motion3d.ts` hands its spaces, their points and their `data` (`spaces`), and
  the upright sides of its solid boxes (`faces`).
- **gpgpu3d**: `motion3d.gpgpu3d.ts` hands gpgpu3d each body's `capsules`
  (`world.motion3d.kinds.<kind>.capsules`, `[{ from, to, radius }]` between bones), of anim's word
  `capsule`, so a cape drapes on a body motion3d draws and hair lies on it.
- **fabric3d**, **hair3d**: `motion3d.fabric3d.ts` (`sources`) and `motion3d.hair3d.ts` (`skins`) hand
  every body motion3d draws, to hold a fabric to and to grow hair on.
- **loader**: the rig, the motion3d files, the model and its glb.
- **render3d**: motion3d draws into its scene.
- **ik3d**: motion3d imports its solve; a scene lists no ik3d.

## Keywords

activity, motion, clip, stack, anywhere shape, autoChange, priority, inherit, when, then, fill, over,
upper half, carry, torch, crawl, zone, ledge, hang, climb, chair, rope, wall, stairs, pool, car, walk,
run, jump, fall, target, point, line, spline, plane, triangles, root, spot, sidecar, offsets, held, spaces,
easing, crossfade, IK, tilt, aim, carry, prop, clip analyzer, arrive, trigger, jump pad, launch,
input buffer, cancel, combo, chain, marker, window, strike, takeoff, landing, damage window, additive,
layer, flinch, lean, warp, motion warping, target, traversal, vault, mantle, solid, face, jump cut,
`lookAround`, `previousLookAround`, `drive`, `press`, `queue`, `world.motion3d`
