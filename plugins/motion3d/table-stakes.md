# motion3d: table stakes

motion3d is for games about a hero doing things: an action RPG, a tuned combat game. These six things are
what such a game needs before its animation feels right. Each entry says what was true in the code before,
what motion3d does now, and how that is proven. An entry is done when its proof passes, in a test and on
screen in `games/demo_motion3d` (its `dev.html` stations, each run through `dev.runNow` and its checks read).

| # | Table stake | Status |
|---|---|---|
| 1 | Input buffer and cancel timing | done |
| 2 | The jump | done |
| 3 | Clip markers | done |
| 4 | Additive layers | done |
| 5 | Attacks land on their target | done |
| 6 | Traversal from the walls themselves | done |

## 1. Input buffer and cancel timing

**Before.** The buffer was the demo's (`player.sim.ts`), one key deep, its cancel points a share of each
clip written by hand per pair of keys. A new game had none.

**Now.** motion3d's: `queue(me, w, key)` puts a key at the back of the buffer and `drive` plays the front
one once it may, for at most the motion3d file's `buffer.hold` seconds of steps it was free to play in.
A one-shot a key played is cut only from its cancel point, `buffer.cancel[<key playing>][<key pressed>]`,
a time in its clip: seconds, `"NN%"`, or `"strike"`, the second its blow lands as the bake measured it.
The demo's `player.sim.ts` has no buffer of its own; its cancel table is the X Bot's motion3d file's.

**Proof.** `motion3d.sim.test.ts`: a key during the backflip plays nothing before its cancel point, queued
plays there, and a key nothing plays is dropped after its hold. `demo_motion3d.sim.test.ts`: three lights
pressed in the first tenth of a second play `light1`, `light2`, `light3`, each from the step after the one
before's strike. On screen: the station `combo: three lights pressed at once chain` runs done.

## 2. The jump

**Before.** The body left the ground on the jump clip's first frame, and every jump went `jumpH` high.

**Now.** The `jump` behavior leaves the ground on the clip's takeoff (the second its last foot leaves the
ground, from the bake's touches) and plays a clip that comes down before its end at the rate that lands it
as the body lands. The rule's `jumpHeld` let go while the body rises keeps kinematics3d's `jump.cut` of
its upward speed. The demo binds the jump key as a hold too, `cut` 0.4.

**Proof.** `demo_motion3d.sim.test.ts`: the axe's jump leaves the ground on the step its playhead reaches the
takeoff and comes down within three steps of the clip's landing; a jump held rises 1.9 m, more than half
again a tapped one; a running jump goes more than 2 m further than a standing one. On screen: the station
`jump: a tap hops, a hold goes high` runs done.

## 3. Clip markers

**Before.** `animate` and `overStep` returned the markers each step crossed, and `motion3d.sim.ts` dropped them.

**Now.** A clip's `markers` are times or windows `[from, to]`, each a time in seconds, `"NN%"`, or a moment
the bake measured (`"peak"`, `"strike"`, `"takeoff"`, `"landing"`, `"plant"`), moved by seconds (`"strike-0.08"`).
Each step `drive` writes the row's `markers`, every one crossed by its clips and its upper half's and its
layers', and `windows`, those open now. Every attack clip of the X Bot holds a `blow` window about its
strike; the demo's dummy takes a hit only while it is open.

**Proof.** `motion3d.play.test.ts`: the strike, the takeoff, the landing and the plant measured off a body's
ends and touches, a clip with no hand plant refusing a time at its plant, and a window's opening and closing crossed. `motion3d.sim.test.ts`: the walk's step marked on
exactly the steps its playhead passes it, the backflip's tuck and strike window, a blow read only while the
window is open, the upper half's marker. On screen: the dummy's station shows `open blow` as the jab lands.

## 4. Additive layers

**Before.** A body was drawn from four slots: its clip, the one it fades from, and the upper half's two.

**Now.** A motion that says `add` is laid on top of whatever plays, at its `weight`, from its `over` bone
up: each bone turned on by the turn its clip makes from its first frame. With a `press` it plays as a
one-shot over anything; with none it is laid on while it fits. The server's `posed` and the page lay it
the same way. A kind's `lean` rolls a body running or walking into its turns by atan(speed · turn rate / g).

**Proof.** `motion3d.play.test.ts`: the chest turned by exactly the layer's share over the pose beneath, and
a layer from the arm leaving the chest as it was. `motion3d.plugin.test.ts`: the page lays it the same, the
same every frame. `motion3d.sim.test.ts`: a flinch over the walk, the legs walking on; breathing laid on
while still and taken off walking; leaning into a turn and upright again. `demo_motion3d.sim.test.ts`: H
while running flinches from the spine up over the run; a hard turn leans the body. On screen: the station
`flinch over a run, lean into a turn` runs done.

## 5. Attacks land on their target

**Before.** A clip was bent onto a point only at a station; an attack went where its clip carried it.

**Now.** A one-shot whose motion gives `warp: { until, reach, turn, accel }`, begun while the row has a
`target`, turns toward it and goes as much further as its blow falls short, eased in and out over the time
to its `until` (`"strike"` for every attack), no more than `reach` metres nor than `accel` allows before it. The demo's player targets the
nearest dummy within its `lock`; every attack gives a warp.

**Proof.** `demo_motion3d.sim.test.ts`: a light attack from a metre and a half off the dummy, from four sides,
turned 40° away, lands its blow within the dummy's reach and the dummy plays its hit; with no target, the
same jab misses. On screen: the dummy's station runs done with no faults.

A jab's strike comes 0.3 s in, so at an `accel` of 60 m/s² (the hips' speed changing no more than the dev
page allows in a step) it closes at most 0.9 m: from two metres it falls short. A longer attack closes more.

## 6. Traversal from the walls themselves

**Before.** Only a space with points placed by hand beside a wall offered a climb or a vault.

**Now.** An activity whose entry gives `solid` is offered by the upright sides of the scene's solid boxes
(shapes3d's `faces` mod): a side whose box stands on the body's ground, its top `over` the feet by a range,
the body `at` a range out of it and facing it. Its space is taken up with no key and at once, its points
standing off the side as the clips measure them. The demo's `vaultover` and `climbup` play on a run into a
box 0.7 to 0.9 m and 2.25 to 2.5 m high.

**Proof.** `demo_motion3d.sim.test.ts`: run at a plain box with no station placed, the body vaults it and
lands beyond it; at a head-high one it jumps up, catches its top and climbs onto it. On screen: the two
`traversal:` stations run done.

## 7. Every way onto a station is warped onto its point

**Before.** A vault begun on a slant was placed at once on a point straight out from where the body stood
and turned square to the box, eased only over the crossfade, its clip carrying it along the box's normal
from its first frame: a run in at 25° was pulled sideways off its line as it began.

**Now.** A motion on a space's point that gives `warp: { until }` begins where the body stands and facing as
it faces, its clip carried on the way it ran, and is bent onto the point by `until`, eased in and out. A
solid side's `point` stands where the way the body faces meets the side, and stays where it met it while
the body is in that space. A loop is bent too, over its first lap up to its `until`. Every motion of the
demo that takes the body from moving about onto a point, line or plane gives a warp, its `until` read off
its clip: the two vaults `"plant"`, the moment the first hand comes down; the jumps up to the ledge, the bar,
the ceiling and the head-high box, the pool and the walk-ins to the bed and the car `"takeoff"`; the chair,
the rope swing and the run wall the seconds their plants give (0.467, 0.4, 0.267); the loops entered from
walking (the rope, the beam, the climbing wall, the edge, the stairs, the desk) half a second.

**Proof.** `demo_motion3d.sim.test.ts`: run at the plain low box at 25°, the step the vault begins on moves
the body no more than a run's step and turns it less than 2°; against the same vault run square, frame by
frame, its extra turn falls from 25° to none by the plant, never back and less than 2° a step; from the
plant on it is the square vault exactly, moved along the box to where its line met it; and it lands beyond.
Every station test presses use through one check: a warped move begins with the step moving the body no
more than 0.15 m and turning it less than 2°; the climb onto the head-high box is held to the same. With the
chair's warp taken off, that check fails: the body snaps round 13° in one step.

## 8. Strafing mixes its directions

**Before.** A strafe picked the one clip that went most the way the stick pushed, and when the stick
turned past the middle between two, the other began from its first frame with a fresh fade: the step
cycle restarted mid-stride.

**Now.** A loop whose motion gives `mix: "way"` draws the two clips whose measured travel goes either
side of the way the body is walked, each by how near it is by angle, kept in step by the left foot coming
down (the start of the stretch the left ankle stands within the motion3d file's `down`, 0.02 m, of its
lowest, off the rig's `ends`, which every run clip has though the bake finds no plants in most of them).
The heavier is the body's clip, handed over in step with no fade, its rate scaled so it goes round as
often. The body is walked as fast as its clips go, each clip's speed by its share, as a blend space's
speed axis runs: as fast at 45° as straight on, the step cycle quicker there since two half strides laid
together make a shorter one (stride warping, which would lengthen the legs' reach instead, is leg IK). All
20 of the demo's guard walks, guard runs, strafes and aims mix.

**Proof.** `demo_motion3d.sim.test.ts`: the guard held and the stick swept from forward to left over a
second and a half, the body is drawn half the forward walk and half the left strafe at 45°, every mixed
clip exactly in step with the body's, the clip handed over once with no fade and no restart and going round
within 5% as often, and held at 45° the body goes half of each clip's speed; with `mix` taken off, the
same sweep restarts the strafe with a fresh fade. Every mixing motion's clips are loops that go somewhere with a foot coming down in
their lap. `motion3d.play.test.ts`: the foot coming down and the step kept, the weight shared, the mix
frozen as it fades. `motion3d.plugin.test.ts`: the page draws a mix, and a frozen one, at its share.

## 9. Walk and run mix by speed

**Before.** Walk and run were two motions switched by the run key: pressed, the run began from its first
frame with a fresh fade while the body was still at walking speed, and played slowed down until
kinematics3d had sped the body up.

**Now.** A loop whose motion gives `gait`, the motion of its activity it pairs with (each names the other),
draws both motions' clips: each set at its shares for the way, the other's share (`gaitW`) eased toward
where the body's speed stands between the two sets' speeds, no more than a step over the kind's `fade`, as
a blend space's weights are eased, so a hard speed-up draws no pose in at once. The body is walked at its
own motion's speed, so it speeds up through the mix. The pair hand over to each other in step with no
restart or fade. All 40 of the demo's walks and runs, plain, guarded, aimed and strafing, pair up.

**Proof.** `demo_motion3d.sim.test.ts`: walking, the run key held, the body never restarts or fades, every
clip stays in step, the run's share rises toward where the speed stands by no more than a step over the
fade and never falls back, the clip is handed from walk to run once going round within 5% as often, and the
body ends all run at run speed; with the rate's scaling taken off, that hand-over jumps 39%; with `gait`
taken off, the run restarts with a fresh fade. Strafing at 45° with the run key held, the walk's and the
run's forward and left clips are drawn at once, half forward and half left all through, in step, with no
fade. Every gait names its pair back.

## 10. Starts, stops and pivots

**Before.** Pushed from standing, the walk began at full stride; let go, the body stood where it was;
walked back the way it came, the run turned on the spot at the kind's turn rate.

**Now.** A one-shot's motion may give `begin` and `end`, times of its clip, and `yields`, over once its
description stops being true. A one-shot on the ground faces as the body faced when it began, turned by
its clip's own turn; one begun on a step that turned the body first is laid from where the body faced as
that step began. `steer` turns one toward the way the body is walked. The state `reversed` is the want
further than the kind's `move.reverse` from the way the body faces. The demo's walk activity plays
`Start Walking (2)` from standing, steering, handed to the walk at its second foot down and given way
when let go (the library's other two starts take half a second to move, measured); `Stop Walking` from
1.3 s, where it starts to stop, and `Run To Stop`, each given way when pushed again; `Walking Turn 180`
and `Running Turn 180` when walked back further than 135°. Held run from standing runs at once.

**Proof.** `demo_motion3d.sim.test.ts`: pushed to the side from standing, the start turns toward the
stick a little each step and is most of the way round by its end (without `steer`, still 74° off); it
hands over at its landing; let go during it, the stop takes over; pushed during a stop, the walk. Let go
walking or running, each stop carries the body on to rest. Flicked back walking or running, each 180 turns
the body by its clip's own turn to within half a degree, from where it faced before the flick (laid from
the turned facing instead, 32.6° short). `motion3d.kinematics3d.test.ts`: `reversed` either side of the
kind's reverse, and the throws for none and for one over 180; a steered turn as `move` turns.

## 11. Inertialization

**Before.** Every change of clip crossfaded: the clip left frozen and faded out under the new one over the
kind's `fade`, and the row's place eased across the gap. A change cut short by another kept the oldest
clip frozen and began the new one from nothing, dropping the one half faded in.

**Now.** A kind's `blend` is `cross` or `inertial`. Inertialized, the clip gone to is drawn whole and each
joint's offset from the pose left decays over the fade (Bollo's quintic, a speed away from the target
taken as none as he takes it), the place's jump folded into the hips; changes cut short decay side by
side. The server's `posed` and the page lay the same offsets. The demo's X Bot inertializes.

Carrying a joint's speed away from its target as well was tried and measured: it goes on only along the
joint's own axis, and walking let go into its stop the feet jolted 7.2 cm a step on a step against the
crossfade's 2.7 cm, so the clamp stays.

**Proof.** `motion3d.play.test.ts`: the decay starts where and as fast as the offset, never passes
nothing, and is gone by the fade; inertialized, the pose as the clip changes is the pose left, every
joint, and the new clip's once through, between them half way; a kind giving no blend, or another, throws.
`motion3d.plugin.test.ts`: the page draws the same three. `demo_motion3d.sim.test.ts`: walking let go into
the stop and pushed again half way through its fade, the hips and feet jolt 2.8 cm a step on a step,
against 13.4 cm crossfaded; every station, hang, drop and climb keeps its hands and hips steady.

## What the page's checks still flag

The dev page's checks (the hips' speed changing more than 1 m/s in a step, a foot under the floor, a pinned
hand short of its point) flag faults on the vault and the mantle onto a plain box; they are the same faults,
to the centimetre, the yard's own vault and ledge stations had on the committed code before this work, which
come from those clips. The run and the jump's jolts are fewer and smaller than on the committed code. A combo's
next swing cutting in at the strike jolts the hips 1.84 m/s in one step: the cut itself.
