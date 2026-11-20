// motion3d: how a rigged body moves through the world, or is held in place, while it plays animation.
// One flat system for every thing a body does with its clips: walking, dancing in a zone, hanging off a
// ledge, sitting in a chair, climbing a rope, driving a car. It plays the body's clips itself, one at a
// time, a change of clip faded over the kind's `fade` (`motion3d.play.ts`), and draws the body itself.
// Its server half (this file) has no row of its own: the functions a body's rule calls on its own row. Its browser half (`motion3d.plugin.ts`) draws a body held to a moving
// space on that space as the page draws it, hangs its props, and bends its limbs itself.
//
// motion3d decides nothing. The game's own rule picks the body's activity, its motion and the point of
// a space it plays against; motion3d plays the motion's clip and puts the body there; kinematics3d moves
// the body's place on its target (`plugins/kinematics3d`), a space's point or the triangles beneath it,
// by the behaviors motion3d delivers it (`move`, `jump`; `motion3d.kinematics3d.ts`), and lets it fall,
// so a scene names motion3d in `world.kinematics3d.mods.behaviors` and `states`.
//
// One held path. Every body is held to its move's target and moved along the target's ways: free is held
// with more directions. The ground is a target as a line or a plane is, `triangles`, its ways x and z
// with no ends. Each step the clip runs, kinematics3d moves the place (`along`) by the move's behavior,
// and the body is placed there by its clip (`advance`).
//
// The character's motion3d file. `world.motion3d.kinds.<kind>` is `{ motion, baked }` beside the body's
// own (`motion3d.play.ts`: `rig`, `measured`, `model`, `glb`, `fade`, `reads`, `props`), `<kind>` the
// row's `as` when it names one, else its kind: `motion` the loader `json` entry of its motion3d file
// (`xbot.motion3d.json`), and `baked` of what motion3d's bake made of it (`xbot.motion3d.baked.json`,
// `motion3d.offsets.ts`). A kind the table does not name throws naming it. The motion3d file is `{ rig,
// moves, turns, buffer?, carries?, activities }` (`buffer`: The buffer, below), each activity `{ normal?,
// motions }`:
//   normal   [x, y, z], a unit vector: the up the activity holds the body to on any point, in place of
//            the point's own normal (walking stands upright on a slope); none, the point's own
//   motions  `{ <motion>: { target?, behavior?, clips, press?, stick?, from?, when?, then?, over? } }`:
//            the first the one the activity starts with, where nothing fits (`fill`); a motion's `when`
//            is its description of the situation it plays in:
//     target    the kind of target it plays against, `point`, `line`, `plane` or `triangles` (Targets,
//               below)
//     behavior  how kinematics3d moves the body while it plays: `move` or `jump`
//               (`motion3d.kinematics3d.ts`); `move` when it names none
//     clips   the names of clips of the body's rig; none, for the whole body a move that hands it to
//             the stack, for the upper half a held motion where it names a carry
//     press   the key that plays it
//     stick   the way the stick must point: `forward`, `back`, `across`, `none`
//     from    the moves it may follow, the body's or its upper half's; none, any (a move a space offers is
//             played by `press` from none)
//     when    the states that must be true of the body (kinematics3d's `is`), `!word` one that must not
//     then    the move played once it is over (A motion ends, below): one of its activity by its name, or
//             one of another activity the same shape offers, `<activity>.<motion>`; none, the stack
//     over    the bone the move's clip is played from, over the body (Over, below)
//     carry   the carry the body holds its prop by while the move plays (Carries, below)
//     add     true: an additive layer, laid on top of whatever the body plays (Layers, below)
//     weight  an additive layer's weight, 0 to 1; 1 when it gives none
//     mix     `way`: a loop on the triangles whose clips are drawn together, each by how near the way it
//             goes is to the way the body is walked, kept in step (Mixes, below); none, its one clip
//             that goes the way the body is walked
//     gait    the motion of the same activity, a loop on the triangles that names this one back, whose clips
//             this one's are mixed with by the body's speed (Mixes, below): a walk's run, a run's walk
//     begin   a time of its one-shot's clip (seconds, "NN%" or a moment) it begins at; none, its start
//     end     a time of its one-shot's clip it is over at, its `then` or the stack following; none, its end
//     yields  true: a one-shot with no key that is over once its description stops being true, as a loop
//             is (a stop the stick pushed again, a start let go); none, it plays through
//     steer   true: a one-shot on the triangles that turns toward the way the body is walked as it plays,
//             as a walk turns (a start), its travel turned with it; none, it goes the way its clip carries
//             it (Facing, below)
//     warp    a clip bent from where the body is onto where it must be by `until`, a time in its clip
//             (seconds, "NN%" or a moment, `motion3d.play.ts`'s Moments): on the triangles `{ until,
//             reach, turn, accel }`, metres, degrees and m/s², its blow at `until` laid on the row's
//             `target`; on a space's point `{ until }`, begun where the body stands and bent onto the
//             point (Warp, below)
//
// Carries. The motion3d file's `carries`, `{ <name>: { prop, anchor, limbs } }`, each how the body holds a
// prop of its kind's `props` (`prop`, its loader model) while a move that names it plays:
//   anchor  `{ bone, at, turn, point }`: the prop set so its `point` empty (a rifle's `stock`) stands at
//           the frame of the first bone whose name ends with `bone`, that frame's scale taken off, moved
//           by `at` (metres) and turned by `turn` (degrees, an XYZ Euler) in it
//   limbs   `[{ bones: [upper, lower, end], target, pole }]`: each limb reaches the empty `target` inside
//           the prop, its end bone there and turned as it is, its middle joint toward `pole`, a direction
//           in the body root's frame
// at the share its move's clip is drawn by (whole for a move with no clips): the upper half's move's first, else the body's
// (`carrying(w, me)`). The browser half bends them (`motion3d.plugin.ts`, ik3d's solve), and draws a
// prop some carry holds only while it is carried (`carriedProps(w, me)`): it is in the hands only then.
//
// Over. A move with `over` is played on the upper half alone: its clip on the bone `over` names and every
// bone under it, over whatever the body plays, the body's own move going on beneath it, one at a time as
// the body's are, faded in and out over the kind's `fade` (`motion3d.play.ts`'s `over`). The upper half
// is a part of the body of its own (The stack): its move, `upperMotion`, of the activity `upperActivity`
// of the shape `upperSpace`, comes and goes as the stack has it. One with no clips lets the upper half go,
// but one that names a carry holds the upper half on that carry, nothing played over the body: a held
// motion, over as a loop is. It never moves the body and has no target.
//
// Targets. A move plays against its `target`: on `triangles`, or on a `plane` with a clip whose spot is
// the feet on the floor at the frame it is on its point (`on`), the triangles beneath the body (terrain3d's
// `triangles`), facing the way the body faces less the clip's `beginTurn`, held to the ground's up there;
// else the one point of that kind the space has (a space with none or more than one throws, naming
// them); a move with no `target`, none: it plays where it stands. On a target whose ways span the ground
// (kinematics3d's `spans`: the ground, a ceiling, the water), the body turns the way the stick goes, as
// `move` turns it (the row's `facing`), and faces that way less the clip's `beginTurn`.
//
// The want. A body is moved as fast as its clip carries it. A loop: as its lap carries its spot, as hard
// as the stick pushes the way the clip goes, or, on a target whose ways span the ground, the stick's way
// (the row's `want`, the camera-relative stick) at the lap's speed, by `move`. A one-shot whose move is
// `move`: as far as its root's travel goes along the target's ways this step, walls and edges stopping it,
// the rest of its travel placing the body. A one-shot of another behavior (`jump`): the stick's way at
// the speed it goes across the ground, its travel placing the body. A move on `triangles` stands its root
// on its place (the land's clips are measured from the root on the floor); any other is placed by its
// offsets (Offsets, below).
//
// The stack. The shapes holding the body are a stack, best ranked first (a space's `priority`, its
// distance, its id), the anywhere shape at the bottom (`world.motion3d.anywhere`). A shape whose `data`
// says `motion3d.autoChange` takes its activities up with no key; the anywhere shape is one. The body has
// two parts: the whole body, whose motions name no `over`, and the upper half, whose motions do. Each part
// takes its motion from the highest of those shapes with one that fits: no `press`, may follow what the
// body and its upper half play (`from`), and describes the situation (its `when` and `stick` hold).
// What a shape does not list is inherited from the shapes under it, down to the anywhere shape.
//
// A motion ends, then the next is found. A motion remembers the shape it started in (`space`,
// `upperSpace`). A one-shot is over when it plays out. A loop, or a held motion with no clip, is over
// when its shape no longer holds the body, when its description stops being true, or, as its clip comes
// round (each step for one with no clip), when a higher ranked shape holding the body has a motion of its
// part that fits. Over: its `then`, when it names one; else the search through the stack; else, nothing
// fitting, `fill` from the anywhere shape: its first activity, its first motion (the upper half let go).
// A motion of the whole body found so plays the clip of its own that goes the way the body is walked
// (strafing: a walk of eight clips, one each way).
//
// Moves. A shape that takes nothing up with no key, a station, is entered by a key, and holds the body in
// its activity as long as it stands (its point may stand outside it: a seat beside its desk): a one-shot
// played out, its `then`, else the stack; on a loop, the first move of its activity with no `press` and a
// `stick` or a `when`, that may follow it and whose stick and states hold, its clip the one that goes the
// way the stick pushes. A key plays, through the shapes holding the body and the station it is in, best
// ranked first, down to the anywhere shape, the first motion with that `press` whose stick and states
// hold: one over the body that may follow what the body and its upper half play (one with no `from`, any
// but itself); one of the whole body whose `from` names the move it plays, in any activity; one with no
// `from`, in an activity the body is not in, of a shape ranked above the one it is in.
// The baked file is `{ held, offsets }`: `held.<clip>`, each clip's spot, `{ spot, on, facing?, after? }`
// (its sidecar's, `motion3d.offsets.ts`'s header), and `offsets.<body>.<clip>`, its two offsets for the
// row's body, its kind's `model` (Offsets, below). A clip it has no offsets of throws, naming it.
//
// Held to a point. A space's points are what its shape names under `points`, placed in the world as its
// row stands, each a constraint: a `point` (a place and a facing), a `line` (from one place to another,
// and a facing), or a `plane` (a rectangle, its middle, its two axes and a facing), each with the
// `normal` its shape gives it, the way it faces out. Its frame is its up, the activity's `normal`, else
// its own, else straight up; its ahead, its facing laid square to its up (or, where its facing is its up,
// up the world laid square to it); and its left, the third way. A point is a kinematics3d target, the
// same data under the same word, and the body's place on it, `along`, kinematics3d's place: metres along
// a line from its `from`, [across, along] metres on a plane from its middle, nothing on a point.
//
// Offsets. `beginOffset` is where the clip's spot stands from the point at its first frame, and
// `endOffset` at its last, [x, y, z] metres in the point's frame; `beginTurn` the way the body faces at
// the first frame from the point's facing, degrees, positive to its left; for a spot on its point all
// through, all are zero. The spot is the middle of the bones `held.<clip>.spot` names (the hands on a bar,
// the hips on a seat, the feet against a wall), none the root.
//
// Tilt. A clip is measured against a thing that faces some way: a wall its feet kick off faces out of
// it, toward the body; a seat or a floor faces up. Its offsets' `normal` is that way, in the body's frame
// at the clip's first frame, straight up where they give none. Held to a point whose up is another way,
// the body is tilted by the turn that lays the one onto the other, about its root: a climber leans onto
// a wall that leans back. The row carries the tilt, `tilt` [x, y, z, w], a quaternion over its facing,
// or null; it is eased in and out as the root is (Easing), and the browser half draws it. A point that
// carries `up`, the way up along the thing it is on (shapes3d's, for a space turned by `rot`), turns the
// body about the point's normal as well, its own up onto that way: on a face that leans to one side the
// climber stands along the face, and climbs up it.
//
// Each step the body is placed by its clip's offsets alone. The spot is where the body is drawn (`spotIn`:
// the middle of the bones, `drawnAt`, the measured `ends`, each bone where its segment starts, for a
// one-shot that carries travel the hips held at their rest across the ground and the body turned back by
// the curve's turn, as they are pinned; from the root where the clip's measured travel carries it,
// `carries`, turned as it is), in the clip's frame at its start. The body faces the point's facing turned
// by `beginTurn`, and the clip's frame at its start is put so that its spot stands `beginOffset` from
// the point. Where its last frame would stand the spot short of `endOffset`, the difference is made up in
// step with the playhead. The root then goes where the clip carries it from there. The place on a line or
// a plane is set as the body comes onto it, nearest where the spot would stand less its `beginOffset`,
// the clip begun where the root stands, and kept short of its edges by how far the spot's bones reach
// along each of its ways. A motion held to another point comes onto that one afresh. A looping clip moves
// its place by how far a lap carries its spot as it plays, at its own rate and the row's: its measured
// travel across the ground over a lap, which is drawn none of, and how far the clip draws the spot on
// from its first frame to its last, its climb among it. That is the want motion3d hands kinematics3d,
// which moves the place and stops it at the point's edges; a move that would carry a bone of the spot past
// an edge, as the clip has it this step, is not made. With no bone named, a loop's spot is the root risen
// as far as the clip climbs its hips into its lap. Whether the target holds the body up is kinematics3d's
// to say (its `grounded`); its `vel` is the speed `move` moves it along the target at, from rest as it
// comes onto a space.
//
// Easing. A body whose kind's `blend` is `inertial` (`motion3d.play.ts`, Inertialization) is not eased:
// the jump of its place as its clip changes is folded into the change inertialized (`inertRoot`), its
// hips going on from where they were drawn. One whose kind crossfades is eased so. A body's clip fades
// into the one it starts over its kind's `fade`, each
// clip drawn about the root, and each clip's bones stand at their own heights over it: a hang's wrists
// 1.919 m over the root, a shimmy's 2.370 m. So the root is eased as the clips fade: the gap from where
// the clip fading out stood it (`eased.from`, the body's place when its clip was at full weight) to
// where the clip coming in had it as it began (`eased.to`) laid on where that one has it now, by as
// much as is still fading out, so a body the clip coming in carries keeps its own way; in all, from it to
// where the clip coming in has it, at the share the one coming in is drawn by (its `blend`), so the
// bones the two clips land on a point stay on it all through the fade. Handed from a space's point to
// the triangles, its place there is where its feet are, and kinematics3d stands it there or lets it
// fall, the root eased the same way. With no fade running, nothing is eased.
//
// The limbs. While a body is held to a target, each hand and foot of its clip's spot (`LeftHand`,
// `RightHand`, `LeftFoot`, `RightFoot`) is bent onto the nearest place of that target for
// the frames the bake says it is planted (`plantsOf`), eased in over `world.motion3d.ease` seconds
// from the run's start and out over as long to its end, but at an end of the clip's own (a one-shot's
// start or end, a loop held all its lap), where the crossfade eases it; in a crossfade, each of the two
// clips by its share. Each bends as its clip bends it (`asDrawn`). `reachesOf(w, me)` is every limb bent
// this step, `{ bone, bones, pole, at, turn, weight }`. A scene that bends a limb and gives no
// `world.motion3d.ease` throws.
//
// Spaces: anything a plugin hands motion3d through the `spaces` mod, `world.motion3d.mods.spaces: '<a>'`,
// `spaces(w, at)`, every space there is, each `{ id, activities, priority?, data?, points?, holds, far }`:
// the row id of the thing that offers it, the activity words it offers, its priority, its `data` (its
// `motion3d.autoChange`), its points placed in the world, whether it holds the point `at` [x, y, z], and
// how far its middle is from `at`. shapes3d is one (`shapes3d.motion3d.ts`). A space whose row moves
// carries the body held to its points with it. Priority: the anywhere shape's own; a space's, 1 when it
// gives none.
//
// Layers. A motion that says `add` is an additive layer (`motion3d.play.ts`, Additive layers): its clip
// laid on top of whatever the body and its upper half play, at its `weight`, from its `over` bone up or
// over the whole body, never in place of them. One with a `press` is played by its key as a one-shot
// over anything, the buffer's cancel points aside (a flinch as a blow lands, the legs running on): the
// first such motion whose stick and states hold and that may follow what the body plays, through the
// shapes holding the body as any key's. One with none is laid on while some shape holding the body that
// takes up its activities with no key offers it and it fits (no `from`, or one naming what plays; its
// stick and states hold), and let go once it does not: breathing while still, a lean held while it runs.
// Each fades in and out over the kind's `fade`; the row carries them as `adds`, each named
// `<activity>.<motion>`.
//
// Solids. An activity whose motion3d file entry gives `solid` is offered by the upright sides of the
// scene's solid boxes (the `faces` mod, `world.motion3d.mods.faces`: shapes3d's), so a body run into a
// plain box vaults it, climbs it or mantles onto it with no space placed by hand. `solid` is `{ over,
// at, facing, priority?, points }`: a side offers the activity while its box's top stands `over` [low,
// high] metres over the body's feet, the body stands `at` [near, far] metres out of it, the way it faces
// meets it short of its ends by a third of a metre, and faces into it within `facing` degrees; and while the box stands
// on the ground the body stands on, its foot no more than 0.3 m over the body's feet (a bar hung in the
// air offers nothing). Its space takes the
// activity up with no key, and at once, not as the body's clip comes round (`data.motion3d.cut`), at the
// `priority` (2 when it gives none). Its `points`, each by name, stand where the clips its motions play
// against measure them from the side, all facing into it:
//   point  `{ out }`: on the ground at the side's foot where the way the body faces meets it (where it
//          stands along it while it faces further from square to it than `facing`), `out` metres out of it,
//          short of its ends by a third of a metre: where a vault starts the root, on the line the body
//          runs in on
// For the space the body is in, its points stand where it met the side as it came into it (the row's
// `met`), so they stay put under it while it plays.
//   line   `{ out, down }`: along the side's top edge, `down` metres under it and `out` out of it: a lip
//          the wrists hang from
//   plane  `{ out }`: the side itself, `out` metres out of it, its normal out of it: a face to climb
//
// Warp. Motion warping: a clip whose motion gives `warp` is bent, as the playhead goes from the clip's
// start to its `until`, from where the body is onto where it must be, eased in and out (3s² − 2s³), the
// rest of the clip its own. On the triangles only a one-shot is bent; on a space's point a loop is too,
// over its first lap up to its `until`, and once the lap comes round the bend is over.
//
// On the triangles, a one-shot that begins while the row has a `target` (a place [x, y, z] in the world;
// its rule's: the enemy it fights) is bent so its blow lands on it: where the clip at `until` puts the
// limb that strikes (its strike's, `motion3d.play.ts`, Moments), from where the body stands as the clip
// begins, is laid onto the target across the ground. The body turns toward it, no more than `turn`
// degrees, and goes as much further as the blow falls short or past, no more than `reach` metres nor
// than `accel` lets it go eased in and out before `until` (accel · until² / 6); walls stop it as they
// stop any travel. The row carries it as `warp`, `{ on: 'target', from, to, by, until }` (the facing it
// began at and the one it turns to, radians; the metres [x, z] it is carried further; `until`, seconds);
// a one-shot begun with no `target` is not bent.
//
// On a space's point, the clip begins where the body stands and facing as it faces, its first frame laid
// there and carried on from it the way the body faces, and is bent onto the point as it plays: by `until`
// it stands and faces as the point places it (Held to a point), and from then on is held there. A body
// run at a vault on a slant runs on into it on its own line, and its hand comes down where the point puts
// it. The row carries it as `warp`, `{ on: 'point', from, start, until }` (where the body stood and faced
// as the clip began and where the point placed its first frame, each [x, y, z, yaw]; `until`, seconds).
// The one on the triangles is kept until the next motion begins; the one onto a point until the playhead
// passes its `until` or the loop comes round, then null.
//
// Mixes. A loop on the triangles whose motion gives `mix: "way"` is drawn from its clips together, as a
// blend space draws them: each clip goes the way its measured lap carries it (its travel, not its name),
// and for the way the body is walked, in its own frame, the two clips whose ways stand either side of it,
// nearest round, are drawn, each by how near it is (by angle), one that goes exactly that way wholly. The
// heavier is the body's `clip`, the other its `mix` (`motion3d.play.ts`, Mixes), each in step with it by
// the left foot coming down; as the way turns past the middle, the other becomes the body's clip where it
// stands in step, with no fade. The body is walked as fast as its clips go, each clip's speed by its
// share (a blend space's speed axis: half a forward walk and half a strafe as fast as either), and the
// clips play at the rate it went, the laps' shorter way together going round that much faster. With the
// stick let go the mix stands as it was.
//
// A loop on the triangles whose motion gives `gait`, the motion it pairs with (a walk's run, a run's
// walk; each names the other), is mixed with that motion by the body's speed: each motion's own clips
// at their shares for the way (by the way where it mixes, else wholly the one clip that goes that way),
// each set going as fast as its clips carry it at their own rates, and the body's speed across the
// ground, between the two, the share of the other's it heads for. The share drawn, the row's `gaitW`, is
// eased toward that by no more than a step over the kind's `fade`, as a blend space's weights are, so a
// body sped up hard in one step draws no pose in at once. The body is walked at the speed of its own
// motion's set, as kinematics3d eases it there (its `move.accel`), so a body that has just begun to run is
// drawn still mostly walking, the run coming in as it speeds up; the clips play at the rate it goes, and
// as the heavier clip is handed over, the row's `rate` is scaled from the one clip's lap to the other's so
// it goes round as often. One motion of the pair followed by the other carries on in step, with no
// restart or fade, its `gaitW` turned round to the other's.
//
// Facing. A one-shot on the triangles faces the way the body faced as it began, turned by its clip's own
// turn where it keeps it (`motion3d.play.ts`'s `carries`: a turn of the file's `turns` degrees or more, a
// pivot): nothing else turns it. One begun on a step that turned the body first (a run walked back the
// way it came turns toward the stick on the step the pivot that cuts it short begins) is laid from the
// way the body faced as that step began (`turnFrom`), so the clip turns it the whole way. One whose
// motion gives `steer` turns toward the way the body is walked as kinematics3d's `move` turns a walk (its
// `toward`), held where the stick is let go, its travel turned with it.
//
// Lean. A kind's `lean`, `{ most, ease }` (radians, seconds), leans a body walking on the triangles, a
// loop playing (a walk, a run; a one-shot turns as its own clip turns it), into its turns, as a runner does: by atan(speed · turn rate / g), g 9.81 m/s², no further than `most`
// either way, eased toward it over `ease`; the row's `lean`, radians, positive leaning to its left (into
// a turn its yaw grows by), laid into its `tilt` about the way it faces. A kind with none does not lean.
//
// The buffer. A one-shot a key played (an attack, a roll) is cut by the next key only from its cancel
// point: the motion3d file's `buffer.cancel[<key that played it>][<key pressed>]`, else
// `[<key that played it>]["*"]`, else `["*"][<key pressed>]`, else `["*"]["*"]`, a time in its clip
// (seconds, "NN%", or a moment the bake measured, "strike" where its blow lands; `motion3d.play.ts`,
// Moments). Before it, `press` plays nothing for that key; a file with no `buffer.cancel` lets any key cut
// any move. `queue(me, w, key)` puts a key at the back of the buffer (`queued`, `[{ key, age }]`), and
// each step `drive` hands the one at its front to `press` until a move plays it, for at most
// `buffer.hold` seconds of steps it was free to play in: a step before its cancel point, or while the
// upper half plays a one-shot (a draw, a shot), does not count, nor does a step a key waits behind
// another. So a light pressed three times during the first swing plays the whole chain, each swing as the
// one before strikes.
//
// Markers. Each step `drive` writes what the body's clips marked (`motion3d.play.ts`, the rig's clips'
// `markers`): `markers`, every marker its clip and its upper half's crossed this step, in order, each
// `{ name, clip }`, a window's opening by its name and its closing by its name and `.end`; and
// `windows`, the names of the windows open now on the clip it plays and the one its upper half plays.
// A rule reads them off the row after `drive`: a blow lands while `strike` is open, a footstep sounds
// on `step`.
//
// What the rule calls, each on its own row:
//   drive(me, w, dt, stick)   once a step: writes `offered`, the activity words of the spaces that hold
//                          the body, highest priority first, and `lookAround`, those spaces as
//                          `holding` hands them, its last step's moved to `previousLookAround` first: a
//                          space in `lookAround` and not in `previousLookAround` is one the body has just
//                          come into; hands the body back to its `anywhere` when
//                          its space is gone, or no longer holds it while it is held to nothing; and
//                          moves and plays it (Moves), the stick [right, forward] its want along a target
//   press(me, w, key, stick)  a key: plays the move it starts (Moves, Over), once it may cut what plays
//                          (The buffer); whether one was played
//   queue(me, w, key)      a key held in the buffer, played by `drive` once it may (The buffer)
//
// The body's row carries `activity`, the word of the activity it is in; `motion`, the move it plays, or
// null; `space`, the row id of the space whose activity it is in, or null; `root`, the target it is
// held to, the name of a point of its space or the triangles beneath it it was handed, or null; `along`, its
// place on its target, or null; `eased`, `{ from, to }` while its root is eased, each [x, y, z, yaw] and
// the tilt after it when it had one, `from` where the clip fading out stood it and `to` where the one
// coming in had it as it began, else null; `met`, [x, y, z, yaw], where it stood and faced as it came
// into its space (Solids); `warp` (Warp); `gaitW`, the share of its motion's gait it draws, or null (Mixes);
// `offered`, `lookAround` and `previousLookAround`; `queued` (The buffer); `markers` and `windows` (Markers); `tilt`; `stopped`, the way the stick pushed when its place stopped at an edge, or false;
// `facing`, the way `move` turned it on a target whose ways span the ground, or null; and `upperMotion`,
// `upperActivity` and `upperSpace`, the move its upper half plays, its activity and its shape, or null.
// motion3d fills each the first time it moves the row: the anywhere shape's first activity, nothing else
// yet. Its rule sets `want`, the stick's way across the ground [x, z], and `face`, the way to face, or
// null.
//
// The numbers, `world.motion3d`: `kinds` (above, each with its `lean`, Lean), `anywhere`, `ease` (The
// limbs), seconds, and `mods`: `spaces`, `faces` (Solids), and the browser half's `object`
// (`motion3d.plugin.ts`).
// The anywhere shape, `world.motion3d.anywhere`, `{ shape: { box: { size } }, activities, priority, data
// }`: a box at the middle of the world, 1e9 m a side, holding every point, priority 0, under every other
// shape; its `activities` the ones a body has everywhere, the first the one it starts in (`fill`).
import type { Row, W } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { animate as animated, blowOf, carries, playKind as animKind, clipOf, ends, fill as fillPlay, inStep, lay, layStep, lift, movesOf, numbersOf, open as openIn, over, overStep, plantsOf, play as playClip, posed, readsOf, rigOf, secondsIn, settle, under, type Body, type Layer, type Limb, type Marker, type Mix, type Time } from './motion3d.play.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { at as atOn, is, joined, nearest as nearestOn, parts, spans, step as moveOn, ways as waysOf, type Place, type Target } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import { cutShort, fill as fillBody, toward as steered } from './motion3d.kinematics3d.ts'
import * as math from '#plugins/math/math.sim.ts'
import { add, axes, dot, drawnAt as clipDrawnAt, onFloor as clipOnFloor, fromBody, inBody, rootIn as clipRootIn, scaled, segmentOf, spotIn as clipSpotIn, sub, type Held as Spot, type Offsets } from './motion3d.clip.ts'

// A clip's two offsets (Offsets, the header): metres in its point's frame, degrees, and the normal of
// what it was measured against.
export type { Offsets }
export type Stick = 'forward' | 'back' | 'across' | 'none'
export type Motion = { target?: 'point' | 'line' | 'spline' | 'plane' | 'triangles'; behavior?: 'move' | 'jump'; clips: string[]; press?: string; stick?: Stick; from?: string[]; when?: string[]; then?: string; over?: string; carry?: string; add?: boolean; weight?: number; warp?: Warp; mix?: 'way'; gait?: string; steer?: boolean; begin?: Time; end?: Time; yields?: boolean }
// A motion's warp (Warp, the header): on the triangles toward the row's `target`, on a space's point onto it.
export type Warp = { until: Time; reach: number; turn: number; accel: number } | { until: Time }
// How the body carries a prop (Carries, the header): the prop set by one of its points against a bone,
// and the limbs that reach points of it.
export type Carry = {
  prop: string
  anchor: { bone: string; at: number[]; turn: number[]; point: string }
  limbs: { bones: [string, string, string]; target: string; pole: number[] }[]
}
// How an activity is offered by the upright sides of solid boxes (Solids, the header).
export type SolidPoint = { point: { out: number } } | { line: { out: number; down: number } } | { plane: { out: number } }
export type Solid = { over: [number, number]; at: [number, number]; facing: number; priority?: number; points: Record<string, SolidPoint> }
export type Activity = { normal?: number[]; solid?: Solid; motions: Record<string, Motion> }
// An upright side of a solid box, as the `faces` mod hands it (shapes3d's).
export type Face = { id: number; side: number; at: number[]; normal: number[]; along: number[]; half: number; base: number; top: number }
export type Faces = (w: W, at: number[], r: number) => Face[]
// The input buffer (The buffer, the header): how long a key is held, and when a one-shot a key played may
// be cut by the next, by the key that played it and the key pressed.
export type Buffer = { hold: number; cancel?: Record<string, Record<string, Time>> }
export type File = { rig: string; moves: number; turns: number; buffer?: Buffer; carries?: Record<string, Carry>; activities: Record<string, Activity> }
export type Baked = { held: Record<string, Spot>; offsets: Record<string, Record<string, Offsets>> }
export type Held = { ended: boolean; stopped: boolean; clip: string }
// A limb bent onto its point this step (`reachesOf`): the bone it ends in, its chain of three bones by
// name, its pole, and where its end bone reaches, in the body's frame (x left, y up, z ahead, from the
// root): `at` [x, y, z] metres and `turn` [x, y, z, w] the end bone's turn as the clip has it, and
// `weight`, how much of it is pinned.
export type Reach = { bone: string; bones: [string, string, string]; pole: number[]; at: number[]; turn: number[]; weight: number }
// A space's point placed in the world: metres, and `yaw` the facing a body takes on it, radians (yaw θ
// faces (sin θ, cos θ)); a plane's `u` and `v` its two axes, unit vectors, along its `size`.
// `normal`, when the point gives one, the way it faces out, a unit vector.
export type Constraint =
  | { point: { at: number[]; yaw: number; normal?: number[] } }
  | { line: { from: number[]; to: number[]; yaw: number; normal?: number[] } }
  | { spline: { points: number[][]; yaw: number; normal?: number[] } }
  | { plane: { at: number[]; u: number[]; v: number[]; size: number[]; yaw: number; normal?: number[] } }
  | { triangles: { yaw?: number; normal?: number[] } }
export type Space = { id: number; activities: string[]; priority?: number; data?: { motion3d?: { autoChange?: boolean; cut?: boolean }; [plugin: string]: unknown }; points?: Record<string, Constraint>; holds: boolean; far: number }
export type Spaces = (w: W, at: number[]) => Space[]
export type Kind = Body & { motion: string; baked: string; lean?: { most: number; ease: number } }
export type Numbers = { kinds: Record<string, Kind>; anywhere: Anywhere; ease?: number; still: number }

// The priority of a space that gives none.
const OFFERED = 1
// How far over the body's feet a solid box's foot may stand and the box still stand on its ground.
const STANDS = 0.3
const DEG = Math.PI / 180
const UP = [0, 1, 0]
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

const kindOf = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

function kindNumbers(w: W, me: Row): Kind {
  const k = (w.world.motion3d as Numbers | undefined)?.kinds?.[kindOf(me)]
  if (!k) throw new Error(`motion3d has no kind ${kindOf(me)}: world.motion3d.kinds names none`)
  return k
}

// The anywhere shape (`world.motion3d.anywhere`): a box at the middle of the world holding every point,
// under every other shape, its activities the ones a body has everywhere.
export type Anywhere = { shape: { box: { size: number[] } }; activities: string[]; priority: number; data?: Space['data'] }
export function anywhereShape(w: W): Anywhere {
  const a = (w.world.motion3d as Numbers | undefined)?.anywhere
  if (!a?.activities?.length) throw new Error('motion3d: world.motion3d.anywhere names no activities')
  return a
}
export const anywhere = (_me: Row, w: W): string[] => anywhereShape(w).activities

// The fields motion3d keeps on a row, filled the first time it moves it: the first activity of its
// `anywhere`, nothing else yet; kinematics3d's beside them (its `fill`).
function fill(me: Row, w: W) {
  const d = me.data
  fillBody(me)
  fillPlay(d)
  if (d.activity == null) d.activity = anywhere(me, w)[0]
  for (const k of ['motion', 'space', 'root', 'along', 'eased', 'tilt', 'upperMotion', 'upperActivity', 'upperSpace', 'warp', 'met', 'gaitW']) d[k] ??= null
  d.stopped ??= false
  d.markers ??= []
  d.windows ??= []
  d.queued ??= []
  d.offered ??= []
  d.lookAround ??= []
  d.previousLookAround ??= []
}
const fileOf = (w: W, me: Row): File => json(w, kindNumbers(w, me).motion)
const bakedOf = (w: W, me: Row): Baked => json(w, kindNumbers(w, me).baked)

export function activityOf(w: W, me: Row, word: string): Activity {
  const a = fileOf(w, me).activities[word]
  if (!a) throw new Error(`motion3d: ${kindOf(me)}'s motion3d file has no activity ${word}`)
  return a
}

export const motionOf = (a: Activity, name: string | null): Motion | undefined => (name === null ? undefined : a.motions[name])

const rank = (s: Space) => s.priority ?? OFFERED

// Every space, and of them those that hold the body, in the order an offer looks through them: the
// `spaces` mod's, and those the sides of solid boxes offer (Solids, the header).
function spacesOf(me: Row, w: W): { all: Space[]; here: Space[] } {
  const spaces = mod<Spaces>(w.world, 'motion3d', 'spaces')
  const all = [...(spaces ? spaces(w, me.data.pos) : []), ...solidsOf(me, w)]
  return { all, here: all.filter(s => s.holds).sort((a, b) => rank(b) - rank(a) || a.far - b.far || a.id - b.id) }
}

// The spaces the upright sides of solid boxes offer the body (Solids, the header): for each activity of
// its motion3d file that gives `solid`, each side within the furthest of their `at` and a metre more.
// A side's space is numbered below 0, by its box's row, its side and the activity, so it stays the same
// space from step to step.
// The last answer for each body, kept while it asks again from the same place, facing the same way,
// in the same world, within one `drive` or one `press` (each lets it go as it begins, as a box may have
// moved since): a step asks many times over.
const solidsKept = new WeakMap<Row, { world: object; key: string; spaces: Space[] }>()
function solidsOf(me: Row, w: W): Space[] {
  const faces = mod<Faces>(w.world, 'motion3d', 'faces')
  if (!faces) return []
  const offered = Object.entries(fileOf(w, me).activities).filter(([, a]) => a.solid)
  if (!offered.length) return []
  const d = me.data
  const key = `${d.pos[0]} ${d.pos[1]} ${d.pos[2]} ${d.yaw}`
  const had = solidsKept.get(me)
  if (had && had.world === w.world && had.key === key) return had.spaces
  const spaces = solidsFrom(me, faces, offered, w)
  solidsKept.set(me, { world: w.world, key, spaces })
  return spaces
}

function solidsFrom(me: Row, faces: Faces, offered: [string, Activity][], w: W): Space[] {
  const d = me.data
  const far = Math.max(...offered.map(([, a]) => a.solid!.at[1])) + 1
  const out: Space[] = []
  for (const f of faces(w, d.pos, far)) {
    // How far out of the side's foot the body stands across the ground.
    const out_ = (d.pos[0] - f.at[0]) * f.normal[0] + (d.pos[2] - f.at[2]) * f.normal[2]
    const into = math.atan2(-f.normal[0], -f.normal[2])
    offered.forEach(([word, a], i) => {
      const s = a.solid!
      const id = -1 - ((f.id * 4 + f.side) * 64 + i)
      const tall = f.top - d.pos[1]
      const faces = Math.abs(wrap(d.yaw - into)) <= s.facing * DEG
      const meets = meetsOf(f, d.pos, d.yaw, faces)
      // Its points stand where the body met the side: as it came into the space, for the space it is
      // in, so they stay put under it as it plays; else where it is now.
      const met = id === d.space ? meetsOf(f, d.met, d.met[3], Math.abs(wrap(d.met[3] - into)) <= s.facing * DEG) : meets
      // Short of its ends by a third of a metre.
      const on = Math.max(-f.half + 0.3, Math.min(f.half - 0.3, met))
      // A box standing on the ground the body stands on, its foot no higher than its kinematics3d step.
      const grounded = f.base <= d.pos[1] + STANDS
      const holds = grounded && f.half > 0.3 && Math.abs(meets) <= f.half - 0.3 && out_ >= s.at[0] && out_ <= s.at[1]
        && tall >= s.over[0] && tall <= s.over[1] && faces
      const at = (out: number, y: number, by = on) => [f.at[0] + f.normal[0] * out + f.along[0] * by, y, f.at[2] + f.normal[2] * out + f.along[2] * by]
      const points: Record<string, Constraint> = {}
      for (const [name, p] of Object.entries(s.points)) {
        if ('point' in p) points[name] = { point: { at: at(p.point.out, f.base), yaw: into } }
        else if ('line' in p) points[name] = { line: { from: at(p.line.out, f.top - p.line.down, -f.half), to: at(p.line.out, f.top - p.line.down, f.half), yaw: into } }
        else points[name] = { plane: { at: at(p.plane.out, (f.base + f.top) / 2, 0), u: f.along, v: UP, size: [2 * f.half, f.top - f.base], yaw: into, normal: f.normal } }
      }
      out.push({
        id,
        activities: [word],
        priority: s.priority ?? 2,
        data: { motion3d: { autoChange: true, cut: true } },
        points,
        holds,
        far: Math.abs(out_),
      })
    })
  }
  return out
}

// How far along a side a body standing at `pos` and facing `yaw` meets it (Solids, the header): where
// the way it faces meets the side, while it `faces` into it within the activity's `facing`; where it
// stands along it otherwise.
function meetsOf(f: Face, pos: number[], yaw: number, faces: boolean): number {
  const rel = [pos[0] - f.at[0], pos[2] - f.at[2]]
  const out = rel[0] * f.normal[0] + rel[1] * f.normal[2]
  const along = rel[0] * f.along[0] + rel[1] * f.along[2]
  // The way it faces across the ground: how fast it goes into the side, and along it.
  const inward = -(math.sin(yaw) * f.normal[0] + math.cos(yaw) * f.normal[2])
  const across = math.sin(yaw) * f.along[0] + math.cos(yaw) * f.along[2]
  return faces && inward > 0 && out > 0 ? along + (out * across) / inward : along
}

export const holding = (me: Row, w: W): Space[] => spacesOf(me, w).here

// ---------------------------------------------------------------- held to a point

// The rig, the body and the moves and turns a row is measured by (`motion3d.clip.ts`).
const measured = (w: W, me: Row) => {
  const kind = animKind(me)
  return { rig: rigOf(w, kind), body: numbersOf(w, kind).model, anim: movesOf(w, kind) }
}

// Where a segment's start stands in the body's frame `t` seconds into `clip`, as it is drawn.
function drawnAt(w: W, me: Row, seg: string, clip: string, t: number): number[] {
  const { rig, body, anim } = measured(w, me)
  return clipDrawnAt(rig, body, anim, clip, seg, t)
}

// A clip's offsets for the row's body (Offsets, the header), from the baked file; none throws, naming it.
const offsetsOf = (w: W, me: Row, clip: string): Offsets => {
  const { body } = measured(w, me)
  const o = bakedOf(w, me).offsets[body]?.[clip]
  if (!o) throw new Error(`motion3d: the baked file has no offsets of ${clip} for ${body}: bake it (motion3d.offsets.ts)`)
  return o
}

// The bones of a clip's spot, from the baked file; none for the root.
function spotOf(w: W, me: Row, clip: string): string[] {
  const h = bakedOf(w, me).held[clip]
  if (!h) throw new Error(`motion3d: the baked file has no held of ${clip}: bake it (motion3d.offsets.ts)`)
  return h.spot ?? []
}

// Where the root stands `t` seconds into `clip`, in the clip's frame at its start, and how far it has
// turned (`motion3d.clip.ts`'s `rootIn`).
const rootIn = (w: W, me: Row, clip: string, t: number) => clipRootIn(measured(w, me).rig, movesOf(w, animKind(me)), clip, t)

// Where the clip's spot stands `t` seconds into `clip`, in the clip's frame at its start.
function spotIn(w: W, me: Row, clip: string, t: number): number[] {
  const { rig, body, anim } = measured(w, me)
  return clipSpotIn(rig, body, anim, clip, spotOf(w, me, clip), t)
}

// How far the spot's bones stand from their middle at the clip's start along the world direction `dir`
// (a unit vector), the body turned `turn`, the most of either way: how far short of a line's or a plane's
// edge their middle must stay as the body comes onto it.
function reachOf(w: W, me: Row, clip: string, turn: Turn, dir: number[]): number {
  const bones = spotOf(w, me, clip)
  if (!bones.length) return 0
  const drawn = bones.map(b => turned(turn, drawnAt(w, me, segmentOf(b), clip, 0)))
  const mid = [0, 1, 2].map(i => drawn.reduce((s, p) => s + p[i], 0) / drawn.length)
  return Math.max(...drawn.map(p => Math.abs(dot(sub(p, mid), dir))))
}

const pointOf = (space: Space | undefined, name: string): Constraint => {
  const c = space?.points?.[name]
  if (!c) throw new Error(`motion3d holds the body to ${name}, which the space ${space?.id} has no point of`)
  return c
}

// Whether a clip has the feet on the floor at the frame its spot is on its point (`motion3d.clip.ts`'s
// `onFloor`).
function onFloor(w: W, me: Row, clip: string): boolean {
  const { rig, body } = measured(w, me)
  return clipOnFloor(rig, body, clip, spotOf(w, me, clip), bakedOf(w, me).held[clip].on)
}

// A constraint's own numbers, under whichever word it is.
const dataOf = (c: Constraint) => Object.values(c)[0] as { yaw: number; normal?: number[]; up?: number[] }

// The up a body is held to on a constraint (Held to a point, the header): its activity's `normal`, else
// the constraint's, else straight up.
const upOf = (w: W, me: Row, c: Constraint): number[] => activityOf(w, me, me.data.activity).normal ?? dataOf(c).normal ?? UP

// A constraint's frame (Offsets, the header): `motion3d.clip.ts`'s `axes` of its facing and its up.
function axesOf(w: W, me: Row, c: Constraint): { x: number[]; y: number[]; z: number[] } {
  return axes(dataOf(c).yaw, upOf(w, me, c))
}

// An offset [x, y, z] in a constraint's frame from its place `at`, in the world.
function inFrame(w: W, me: Row, c: Constraint, at: number[], o: number[]): number[] {
  const { x, y, z } = axesOf(w, me, c)
  return [0, 1, 2].map(i => at[i] + x[i] * o[0] + y[i] * o[1] + z[i] * o[2])
}

// How a body is turned on a constraint for `clip` (Tilt, the header): its facing, and the tilt that lays
// the normal the clip was measured against, turned with the body, onto the constraint's up; null for none.
type Turn = { yaw: number; tilt: Quaternion | null }
function turnOf(w: W, me: Row, c: Constraint, clip: string): Turn {
  const o = offsetsOf(w, me, clip)
  // The way the body faces on a target whose ways span the ground, as kinematics3d's `move` turned it,
  // else the target's own.
  const yaw = (me.data.facing ?? dataOf(c).yaw) + o.beginTurn * DEG
  const n = upOf(w, me, c)
  const m = fromBody(yaw, o.normal ?? UP)
  const tilt = new Quaternion().setFromUnitVectors(new Vector3(m[0], m[1], m[2]).normalize(), new Vector3(n[0], n[1], n[2]))
  // A constraint that says which way is up along it (`up`): the body's own up, as the tilt leaves it,
  // turned about the constraint's normal onto that way, so a body on a thing that leans to one side
  // stands along the thing. Where either lies along the normal there is no such turn.
  const along = dataOf(c).up
  if (along) {
    const out = new Vector3(n[0], n[1], n[2])
    const flat = (v: Vector3) => v.addScaledVector(out, -v.dot(out))
    const mine = flat(new Vector3(0, 1, 0).applyQuaternion(tilt)), its = flat(new Vector3(along[0], along[1], along[2]))
    if (mine.lengthSq() > 1e-6 && its.lengthSq() > 1e-6) tilt.premultiply(new Quaternion().setFromUnitVectors(mine.normalize(), its.normalize()))
  }
  return { yaw, tilt: 1 - Math.abs(tilt.w) < 1e-9 ? null : tilt }
}

// A vector in the frame of a body turned `turn` (x left, y up, z ahead), in the world.
function turned(turn: Turn, v: number[]): number[] {
  const f = fromBody(turn.yaw, v)
  if (!turn.tilt) return f
  const p = new Vector3(f[0], f[1], f[2]).applyQuaternion(turn.tilt)
  return [p.x, p.y, p.z]
}

// The tilt a row carries, [x, y, z, w], or null.
const tiltOf = (q: Quaternion | null): number[] | null => (q ? [q.x, q.y, q.z, q.w] : null)

// Where a body coming onto a constraint is on it: the clip begun where the root stands, the body facing as
// it takes the constraint, the place on it nearest where its spot would stand less its `beginOffset`.
// Kept short of its edges (`kept`). With no clip, the place nearest the root.
function onto(w: W, me: Row, c: Constraint, clip: string | undefined, root = false): Place {
  const d = me.data
  if (clip === undefined || root) return nearestOn(w, c as Target, d.pos, me)
  const spot = add(d.pos, turned(turnOf(w, me, c, clip), spotIn(w, me, clip, 0)))
  const target = sub(spot, inFrame(w, me, c, [0, 0, 0], offsetsOf(w, me, clip).beginOffset))
  return kept(w, me, c, clip, nearestOn(w, c as Target, target, me))
}

// The world place of `along` on a constraint (kinematics3d's `at`).
const onIt = (w: W, me: Row, c: Constraint, along: Place): number[] => atOn(w, c as Target, along, me).at

// Where the body stands `t` seconds into `clip`, held to the constraint `c` at its place `along`
// (Offsets, the header): its root, the way it faces and its tilt.
function placing(w: W, me: Row, c: Constraint, along: Place, clip: string, t: number): { pos: number[]; turn: Turn } {
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const o = offsetsOf(w, me, clip)
  const at = onIt(w, me, c, along)
  const turn = turnOf(w, me, c, clip)
  const root = rootIn(w, me, clip, t)
  // What of the root's travel the place carries (`travels`): the travel along the target's ways, which
  // kinematics3d has moved the place by, taken off where the clip stands the root.
  const all = travels(w, me, clip) ? waysOf(w, c as Target, along, me) : []
  const travel = turned(turn, root.at)
  const carried = all.reduce((p, way) => add(p, scaled(way.dir, dot(travel, way.dir))), [0, 0, 0])
  const turnTo = { yaw: turn.yaw + root.turn, tilt: turn.tilt }
  // A move on the triangles stands its root on its place, gone on by the rest of its travel.
  if (rooted(w, me)) return { pos: add(at, sub(travel, carried)), turn: turnTo }
  // The clip's frame at its start, so that its spot stands its `beginOffset` from the point.
  const start = sub(inFrame(w, me, c, at, o.beginOffset), turned(turn, spotIn(w, me, clip, 0)))
  // How far the clip's last frame stands its spot from its `endOffset`, taken off in step with the playhead.
  const off = sub(inFrame(w, me, c, at, o.endOffset), add(start, turned(turn, spotIn(w, me, clip, r.dur))))
  const s = r.dur > 0 ? clamp(t / r.dur, 0, 1) : 0
  return { pos: sub(add(add(start, travel), scaled(off, s)), carried), turn: turnTo }
}

// Whether the body's move plays on `triangles` (its motion's `target`), so stands its root on its place:
// the land's moves are measured from the root on the floor.
function rooted(w: W, me: Row): boolean {
  const d = me.data
  const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
  return m?.target === 'triangles'
}

// Whether the body's place on its target carries the root's travel of `clip` (The want, the header): a
// one-shot its motion moves by `move` (none named), whose travel kinematics3d moves the place along the
// target's ways by, walls and edges stopping it; the rest of its travel the body is placed by.
function travels(w: W, me: Row, clip: string): boolean {
  if (clipOf(rigOf(w, animKind(me)), clip).loop) return false
  const m = typeof me.data.activity === 'string' ? motionOf(activityOf(w, me, me.data.activity), me.data.motion) : undefined
  return (m?.behavior ?? 'move') === 'move'
}

// How far `clip` carries the root along a target's ways from `t0` seconds in to `t1`, the body turned
// `turn`: one number to each way, metres.
function carriedBy(w: W, me: Row, c: Constraint, clip: string, t0: number, t1: number): number[] {
  const turn = turnOf(w, me, c, clip)
  const moved = sub(turned(turn, rootIn(w, me, clip, t1).at), turned(turn, rootIn(w, me, clip, t0).at))
  return waysOf(w, c as Target, me.data.along, me).map(way => dot(moved, way.dir))
}

// The body placed `t` seconds into `clip`, held to the constraint `c` (the header).
function place(w: W, me: Row, c: Constraint, clip: string, t: number) {
  const d = me.data
  const { pos, turn } = placing(w, me, c, d.along, clip, t)
  d.tilt = tiltOf(turn.tilt)
  if (d.warp?.on !== 'point') {
    d.pos = pos
    d.yaw = turn.yaw
    return
  }
  // Bent onto its point (Warp, the header): the clip laid where the body stood and turned the way it
  // faced, carried on from there, and drawn onto where the point places it by as much as the playhead
  // has come to `until`.
  const { from, start, until } = d.warp
  const by = wrap(from[3] - start[3])
  const k = bentBy(t, until)
  const rel = sub(pos, start.slice(0, 3))
  const cos = math.cos(by), sin = math.sin(by)
  const laid = [from[0] + rel[0] * cos + rel[2] * sin, from[1] + rel[1], from[2] - rel[0] * sin + rel[2] * cos]
  d.pos = laid.map((v, i) => v + (pos[i] - v) * k)
  d.yaw = turn.yaw + by * (1 - k)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// A place on a target kept short of its edges by how far the spot's bones reach along each of its ways
// (kinematics3d's `ways`), for a body facing as it takes the constraint for `clip`. A way too short for
// the bones keeps them at its middle.
function kept(w: W, me: Row, c: Constraint, clip: string, along: Place): Place {
  const turn = turnOf(w, me, c, clip)
  const all = waysOf(w, c as Target, along, me)
  const at = parts(along).map((v, i) => {
    const { dir, lo, hi } = all[i]
    const r = Math.min(reachOf(w, me, clip, turn, dir), (hi - lo) / 2)
    return clamp(v, lo + r, hi - r)
  })
  return joined(at, along)
}

// Where each of the spot's bones stands along the world direction `dir` (a unit vector) from `from`,
// `t` seconds into the clip, the body placed at `along` (`placing`): the least and the most. With no
// bone named, the place `along` itself.
function spreadAt(w: W, me: Row, c: Constraint, along: Place, clip: string, t: number, from: number[], dir: number[]): number[] {
  const bones = spotOf(w, me, clip)
  if (!bones.length) {
    const at = dot(sub(onIt(w, me, c, along), from), dir)
    return [at, at]
  }
  const { pos, turn } = placing(w, me, c, along, clip, t)
  const at = bones.map(b => dot(sub(add(pos, turned(turn, drawnAt(w, me, segmentOf(b), clip, t))), from), dir))
  return [Math.min(...at), Math.max(...at)]
}

// Whether a place on one way of a target, moved from `was` to `want`, keeps every bone of the spot within
// that way's bounds `[lo, hi]` from `from`, as the clip has the bones `t` seconds in: a move that would
// carry one past a bound, outward, does not. The `move` behavior asks it (`motion3d.kinematics3d.ts`).
export function fits(w: W, me: Row, c: Constraint, clip: string, t: number, from: number[], dir: number[], was: number, want: number, moved: Place, lo: number, hi: number): boolean {
  if (want === was) return true
  const [a, b] = spreadAt(w, me, c, moved, clip, t, from, dir)
  return want > was ? b <= hi : a >= lo
}

// How far a lap of a looping clip carries its spot, in the body's frame (x left, y up, z ahead): its
// measured travel across the ground, and how far the clip draws the spot on from its first frame to its
// last.
function lapOf(w: W, me: Row, clip: string): number[] {
  const r = clipOf(rigOf(w, animKind(me)), clip)
  return add([r.measure.left * r.scale, 0, r.measure.forward * r.scale], sub(spotIn(w, me, clip, r.dur), spotIn(w, me, clip, 0)))
}

// The way a clip goes as the stick points, [x right, y forward], a unit vector: across for its travel to
// the left or the right, forward for ahead or up; none for a clip that goes nowhere.
function wayOf(w: W, me: Row, clip: string): number[] {
  const lap = lapOf(w, me, clip)
  const way = [-lap[0], lap[1] + lap[2]]
  const m = math.hypot(way[0], way[1])
  return m > 1e-9 ? [way[0] / m, way[1] / m] : [0, 0]
}

// The share of each clip of a motion that mixes by the way (Mixes, the header) for a body walked `way`,
// [right, forward] in its own frame: the two clips whose ways stand either side of it, nearest round,
// each by how near it is by angle; one going exactly that way, wholly. A clip that goes nowhere has no
// way to mix by, and throws.
function mixOf(w: W, me: Row, m: Motion, way: number[]): Map<string, number> {
  const TAU = 2 * Math.PI
  const round = (a: number) => ((a % TAU) + TAU) % TAU
  const at = math.atan2(way[0], way[1])
  const ways = m.clips.map(clip => {
    const v = wayOf(w, me, clip)
    if (v[0] === 0 && v[1] === 0) throw new Error(`motion3d mixes ${clip} by the way it goes, and it goes nowhere`)
    return { clip, a: math.atan2(v[0], v[1]) }
  }).sort((p, q) => p.a - q.a)
  if (ways.length === 1) return new Map([[ways[0].clip, 1]])
  for (let i = 0; i < ways.length; i++) {
    const p = ways[i], q = ways[(i + 1) % ways.length]
    const span = i === ways.length - 1 ? round(q.a - p.a) || TAU : q.a - p.a
    const off = round(at - p.a)
    if (off > span) continue
    const s = span > 0 ? off / span : 0
    return new Map([[p.clip, 1 - s], [q.clip, s]])
  }
  throw new Error(`motion3d found no two clips of ${m.clips.join(', ')} either side of the way ${way.join(', ')}`)
}

// A motion's own shares for the way the body is walked (Mixes, the header): by the way for one that
// mixes, else wholly its one clip that goes that way.
function ownShares(w: W, me: Row, m: Motion, way: number[]): Map<string, number> {
  return m.mix === 'way' ? mixOf(w, me, m, way) : new Map([[toward(w, me, m, way), 1]])
}

// How fast a set of clips at their shares carries the body across the ground, m/s: each clip's speed (its
// lap across the ground over its length, at its own rate) by its share, as a blend space's speed axis
// runs: half a forward walk and half a strafe as fast as either, not the shorter way their two laps make
// laid together.
function speedOf(w: W, me: Row, shares: Map<string, number>): number {
  const rig = rigOf(w, animKind(me))
  let v = 0
  for (const [clip, s] of shares) {
    const c = clipOf(rig, clip)
    const lap = lapOf(w, me, clip)
    v += (s * math.hypot(lap[0], lap[2]) * c.rate) / c.dur
  }
  return v
}

// The other motion of a gait (Mixes, the header), checked: one of the same activity, a loop on the
// triangles, that names this one back.
function gaitOf(w: W, me: Row, activity: string, name: string, m: Motion): Motion {
  const g = motionOf(activityOf(w, me, activity), m.gait!)
  if (!g) throw new Error(`motion3d's ${activity}.${name} mixes by speed with ${m.gait}, which ${activity} has no motion of`)
  if (g.gait !== name) throw new Error(`motion3d's ${activity}.${name} mixes by speed with ${m.gait}, which does not name it back as its gait`)
  if (m.target !== 'triangles' || g.target !== 'triangles') throw new Error(`motion3d's ${activity}.${name} and ${m.gait} mix by speed, and only loops on the triangles do`)
  return g
}

// A gait's two sets for the way the body is walked (Mixes, the header): the motion's own and its gait's,
// and where the body's speed stands between their speeds, 0 at its own and 1 at its gait's.
function gaitSets(w: W, me: Row, activity: string, name: string, m: Motion, way: number[]): { own: Map<string, number>; other: Map<string, number>; at: number } {
  const own = ownShares(w, me, m, way)
  const other = ownShares(w, me, gaitOf(w, me, activity, name, m), way)
  const a = speedOf(w, me, own), b = speedOf(w, me, other)
  return { own, other, at: a === b ? 0 : Math.max(0, Math.min(1, (me.data.speed - a) / (b - a))) }
}

// The shares of a gait: its own set's and its gait's, the gait's at `s`.
function gaitShares(sets: { own: Map<string, number>; other: Map<string, number> }, s: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const [clip, x] of sets.own) out.set(clip, (out.get(clip) ?? 0) + x * (1 - s))
  for (const [clip, x] of sets.other) out.set(clip, (out.get(clip) ?? 0) + x * s)
  return out
}

// One step of a gait's share (Mixes, the header): the row's `gaitW`, the share of its motion's gait,
// eased toward where the body's speed stands between the two by no more than dt over the kind's `fade`;
// taken where the speed stands when it has none; none in a motion with no gait or with the stick let go.
function paced(me: Row, w: W, dt: number) {
  const d = me.data
  const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
  const way = wayWalked(me)
  if (!m?.gait || (way[0] === 0 && way[1] === 0)) {
    if (!m?.gait) d.gaitW = null
    return
  }
  const { at } = gaitSets(w, me, d.activity, d.motion, m, way)
  const { fade } = numbersOf(w, animKind(me))
  const most = fade > 0 ? dt / fade : Infinity
  d.gaitW = d.gaitW == null ? at : d.gaitW + Math.max(-most, Math.min(most, at - d.gaitW))
}

// The speed the body is walked at in a motion that mixes (Mixes, the header): its own set's, for the way
// it is walked; none for one that mixes nothing, or with the stick let go.
function paceOf(w: W, me: Row): number | null {
  const d = me.data
  const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
  const way = wayWalked(me)
  if ((!m?.gait && !m?.mix) || (way[0] === 0 && way[1] === 0)) return null
  return speedOf(w, me, ownShares(w, me, m, way))
}

// The clips mixed with the body's clip, by their shares (Mixes, the header), each set in step with it;
// with no shares (the stick let go) the mix as it was, set in step.
function mixIn(me: Row, w: W, shares: Map<string, number> | null) {
  const d = me.data
  const by = shares ?? new Map((d.mix as Mix[]).map(m => [m.clip, m.w]))
  d.mix = [...by].filter(([clip, s]) => clip !== d.clip && s > 0).map(([clip, s]) => ({ clip, t: inStep(w, me, d.clip, d.clipT, clip), w: s }))
}

// How far a lap of the body's clip carries its spot with the clips mixed with it (Mixes, the header):
// each one's lap at its share, the laps going round together as they are kept in step.
function lapMixed(w: W, me: Row, clip: string): number[] {
  const mix = (clip === me.data.clip ? me.data.mix ?? [] : []) as Mix[]
  const own = 1 - mix.reduce((s, m) => s + m.w, 0)
  return mix.reduce((lap, m) => add(lap, scaled(lapOf(w, me, m.clip), m.w)), scaled(lapOf(w, me, clip), own))
}

// How hard the stick pushes the way a clip goes: 0 to 1.
const push = (w: W, me: Row, clip: string, stick: number[]) => {
  const way = wayOf(w, me, clip)
  return Math.max(0, Math.min(1, stick[0] * way[0] + stick[1] * way[1]))
}

// A looping clip's place on its target moved on by kinematics3d (the header), by the `move` behavior
// wrapping it (`motion3d.kinematics3d.ts`). The want, in the world: on a target whose ways span the
// ground, the stick's way (the row's `want`) at the clip's lap speed (in a motion that mixes, its own set's
// speed, Mixes); on any other, how far a lap carries
// its spot a second at the clip's own rate, as hard as the stick pushes the way the clip goes. `move` lays
// it along the target's ways and makes no move that stops at an edge or carries a bone of the spot past
// one. The clip plays at the rate kinematics3d moved the body, its share of the lap's own speed (a clip
// that travels none at its own); `pushed` whether the stick pushed it at all, `stopped` when it did and
// the body went nowhere, and `speed` how fast it went along the target, m/s.
function slide(w: W, me: Row, c: Constraint, clip: string, dt: number, stick: number[]): { pushed: boolean; stopped: boolean; rate: number; speed: number } {
  const d = me.data
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const all = waysOf(w, c as Target, d.along, me)
  const turn = turnOf(w, me, c, clip)
  const full = all.length ? scaled(turned(turn, lapMixed(w, me, clip)), r.rate / r.dur) : [0, 0, 0]
  const fast = math.hypot(full[0], full[1], full[2])
  if (!(fast > 1e-9)) {
    // A clip that goes nowhere: the body's step all the same, held where it is, so kinematics3d asks what
    // holds it up.
    d.along = moveOn(w, { move: c }, d.along, [0, 0, 0], dt, me)
    return { pushed: false, stopped: false, rate: 1, speed: 0 }
  }
  const across = spans(all)
  const p = across ? Math.min(1, math.hypot(d.want[0], d.want[1])) : push(w, me, clip, stick)
  // Walked at the clips' lap speed; in a motion that mixes, at its own set's (Mixes).
  const pace = across ? paceOf(w, me) ?? fast : fast
  const want = across ? [d.want[0] * pace, 0, d.want[1] * pace] : scaled(full, p)
  const was = parts(d.along)
  d.along = moveOn(w, { move: c }, d.along, want, dt, me)
  // How far the body went along the target this step, and how far the full lap's speed goes along it.
  const now = parts(d.along)
  const went = math.hypot(...now.map((v, i) => v - was[i]))
  const along = across ? fast : math.hypot(...all.map(way => dot(full, way.dir)))
  const rate = along > 1e-9 ? went / (along * dt) : p
  return { pushed: p > 0, stopped: p > 0 && went === 0, rate, speed: went / dt }
}

// ---------------------------------------------------------------- the activities

// The body's place as it stands, [x, y, z, yaw], and its tilt after when it has one.
const placed = (d: any): number[] => [d.pos[0], d.pos[1], d.pos[2], d.yaw, ...(d.tilt ?? [])]

// The share the clip coming in is drawn at: its `blend` while a crossfade runs, else the whole.
const share = (d: any): number => (d.from != null ? d.blend : 1)

// The place the clip fading out stands the root at, kept as the clip itself is kept: taken from where
// the body stands when the clip it plays is at full weight, or when nothing was eased; while a crossfade
// runs, the clip it fades from is kept, and so is its place kept (Easing, the header).
function easeFrom(d: any, to: number[] | null) {
  const from = d.eased === null || d.eased === undefined || share(d) >= 1 ? placed(d) : d.eased.from
  d.eased = { from, to }
}

// A body whose kind inertializes (`motion3d.play.ts`, Inertialization): the place it stood at as its clip
// changed (`from`, [x, y, z, yaw] and its tilt after) against the place the clip gone to stands it at now,
// the turn and move from the one to the other in its own frame, folded into the change being inertialized
// (its `left` and `root`), so its hips go on from where they were drawn and the jump decays with the pose;
// its place is not eased.
const kindInertial = (w: W, me: Row) => numbersOf(w, animKind(me)).blend === 'inertial'
function inertRoot(me: Row, from: number[]) {
  const d = me.data
  d.eased = null
  const last = (d.inert ?? [])[d.inert.length - 1]
  if (!last || last.to !== d.clip || last.s !== 0) return
  const frame = (p: number[]) => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p[3])
    if (p.length > 4) q.premultiply(new Quaternion(p[4], p[5], p[6], p[7]))
    return new Matrix4().compose(new Vector3(p[0], p[1], p[2]), q, new Vector3(1, 1, 1))
  }
  const root = frame(placed(d)).invert().multiply(frame(from))
  d.inert = [...d.inert.slice(0, -1), { ...last, left: from.slice(), root: root.toArray() }]
}

// The root eased (Easing, the header): the gap between where the clip fading out stood it and where the
// clip coming in had it as it began (`eased.to`, taken the first time this is asked after it begins)
// laid on where the clip coming in has it now, by as much of it as is still fading out, so a body the
// clip coming in carries on (a blow bent toward its target) keeps its own way through the fade; once the
// one coming in is whole, nothing is eased.
function ease(d: any) {
  if (!d.eased) return
  const t = share(d)
  if (t >= 1) {
    d.eased = null
    return
  }
  d.eased.to ??= placed(d)
  const [x, y, z, yaw, ...tilt] = d.eased.from
  const [tx, ty, tz, tyaw, ...ttilt] = d.eased.to
  const left = 1 - t
  d.pos = [d.pos[0] + (x - tx) * left, d.pos[1] + (y - ty) * left, d.pos[2] + (z - tz) * left]
  d.yaw = d.yaw + wrap(yaw - tyaw) * left
  const q4 = (v: number[]) => (v.length ? new Quaternion(v[0], v[1], v[2], v[3]) : new Quaternion())
  // The turn from the tilt the one coming in began at to the one the one fading out stood at, laid on.
  const gap = q4(tilt).multiply(q4(ttilt).invert())
  const now = d.tilt ? new Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]) : new Quaternion()
  const q = new Quaternion().slerp(gap, left).multiply(now)
  d.tilt = 1 - Math.abs(q.w) < 1e-9 ? null : tiltOf(q)
}

// The space the body's activity is offered by, or undefined for its `anywhere`.
const spaceOf = (me: Row, w: W): Space | undefined => spacesOf(me, w).all.find(s => s.id === me.data.space)

// What a move of `clip` plays against (Targets, the header): the triangles beneath the body for a move on
// `triangles`, or on a `plane` with the clip's feet on the floor, facing as the body does less the clip's `beginTurn`, held to the ground's up where the
// clip's feet are on it (where the clip starts them, or, for one on it at its end, where it ends them, as
// it plays from where the body stands); else the one point of the move's `target` kind the space has, by
// its name; none for a move with no `target`.
function rootFor(w: W, me: Row, space: Space | undefined, m: Motion, clip: string): string | Constraint | null {
  if (!m.target) return null
  if (m.target === 'triangles' || (m.target === 'plane' && onFloor(w, me, clip))) {
    const d = me.data
    const facing = d.yaw - offsetsOf(w, me, clip).beginTurn * DEG
    const end = onFloor(w, me, clip) && bakedOf(w, me).held[clip].on === 'end'
    const spot = add(d.pos, fromBody(facing, spotIn(w, me, clip, end ? clipOf(rigOf(w, animKind(me)), clip).dur : 0)))
    const under: Target = { triangles: {} }
    const { normal } = atOn(w, under, nearestOn(w, under, spot, me), me)
    return { triangles: { yaw: facing, normal } }
  }
  const names = Object.entries(space?.points ?? {}).filter(([, c]) => Object.keys(c)[0] === m.target).map(([name]) => name)
  if (names.length !== 1) throw new Error(`motion3d plays a move against the ${m.target} of the space ${space?.id}, which has ${names.length} of them: ${names.join(', ') || 'none'}`)
  return names[0]
}

// The target the body is held to now: its space's point by name, or the triangles beneath it it was handed.
function pointFor(me: Row, w: W): Constraint {
  const root = me.data.root
  return typeof root === 'string' ? pointOf(spaceOf(me, w), root) : root
}

// Whether the stick points the way a move asks (`stick`): `forward` pushed ahead, `back` pulled back,
// `across` pushed left or right, `none` let go; any way for a move that asks none.
function stickOk(m: Motion, stick: number[]): boolean {
  switch (m.stick) {
    case undefined: return true
    case 'forward': return stick[1] > 0
    case 'back': return stick[1] < 0
    case 'across': return stick[0] !== 0
    case 'none': return stick[0] === 0 && stick[1] === 0
  }
}

// Whether every state a move's `when` names is true of the body (kinematics3d's `is`), a word written
// `!word` that it is not.
const whenOk = (w: W, me: Row, m: Motion): boolean => (m.when ?? []).every(word => (word.startsWith('!') ? !is(me, w, word.slice(1)) : is(me, w, word)))

// Whether a move may follow the one the body plays or the one its upper half plays: any for a move with
// no `from`.
const fromOk = (me: Row, m: Motion): boolean => !m.from || m.from.includes(me.data.motion) || m.from.includes(me.data.upperMotion)

// Of a move's clips, the one that goes the way the stick pushes hardest; its first when none goes that way.
function toward(w: W, me: Row, m: Motion, stick: number[]): string {
  let best = m.clips[0], most = 0
  for (const c of m.clips) {
    const p = push(w, me, c, stick)
    if (p > most) { most = p; best = c }
  }
  return best
}

// The move `name` of the activity `activity` of the space `space` (null for the body's `anywhere`)
// played: its clip `clip`, or the one that goes the way the stick pushes. A move with no clips hands the
// body back to walking.
function begin(me: Row, w: W, activity: string, space: number | null, name: string, stick: number[], clip?: string) {
  const d = me.data
  const m = motionOf(activityOf(w, me, activity), name)
  if (!m) throw new Error(`motion3d's activity ${activity} has no motion ${name}`)
  if (!m.clips.length) return leave(me, w)
  const s = space === null ? undefined : spacesOf(me, w).all.find(s => s.id === space)
  if (space !== null && !s) throw new Error(`motion3d plays ${activity} in the space ${space}, which is gone`)
  if (m.mix && m.target !== 'triangles') throw new Error(`motion3d's ${activity}.${name} mixes its clips, and plays on ${m.target ?? 'no target'}; only a loop on the triangles is mixed`)
  // Mixed (Mixes, the header): the shares for the way the body is walked, by the way and, in a gait, by its
  // speed, none with the stick let go; its clip the heaviest, or, while none, the one it plays. A motion
  // carries on from the one before it in step where both are its own or its gait's.
  const mixes = !!m.mix || m.gait !== undefined
  const way = mixes ? wayWalked(me) : null
  const walkedOn = way !== null && (way[0] !== 0 || way[1] !== 0)
  const carries = mixes && d.state === 'act' && d.clip != null && d.activity === activity && (d.motion === name || d.motion === m.gait)
  // A gait's share as this motion has it: the row's, turned round when it was its gait's; where the
  // speed stands when it has none or the motion is come to afresh.
  const gaitW = carries && typeof d.gaitW === 'number' ? (d.motion === name ? d.gaitW : 1 - d.gaitW) : null
  const sets = walkedOn && m.gait !== undefined ? gaitSets(w, me, activity, name, m, way!) : null
  const shares = !walkedOn ? null : sets ? gaitShares(sets, gaitW ?? sets.at) : mixOf(w, me, m, way!)
  if (m.gait !== undefined) d.gaitW = gaitW ?? sets?.at ?? null
  const chosen = shares ? [...shares].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : carries ? d.clip : clip ?? toward(w, me, m, stick)
  d.layer = null
  // Handed from a space's point to the triangles: its place is where its feet are, and kinematics3d
  // stands it there or lets it fall.
  const was = d.root
  const root = rootFor(w, me, s, m, chosen)
  const handed = d.space !== space && root !== null && typeof root !== 'string' && typeof was === 'string' && d.clip != null
  const feet = handed ? underFeet(w, me, d.clip, d.clipT).slice(0, 3) : null
  if (d.activity !== activity || d.space !== space) {
    // Where it stood and faced as it came into the space: a solid's points stand where it met the side
    // (Solids, the header).
    if (d.space !== space) d.met = [d.pos[0], d.pos[1], d.pos[2], d.yaw]
    if (space !== null && d.space !== space) d[readsOf(w, animKind(me)).vel] = [0, 0, 0]
    d.activity = activity
    d.space = space
    d.stopped = false
  }
  // The triangles beneath it it was handed keep its place from one move on them to the next; a point of
  // a space is come onto afresh.
  const kept = root !== null && typeof root !== 'string' && was !== null && typeof was !== 'string'
  if (!kept && root !== was) d.along = null
  if (typeof root !== 'string' || root !== was) d.facing = null
  d.root = root
  if (root !== null && d.along === null) d.along = feet ?? onto(w, me, pointFor(me, w), chosen, m.target === 'triangles')
  // Mixed, carried on from itself or its gait: the heaviest clip the body's, where it stands in step with
  // the one before, with no restart or fade (Mixes, the header).
  if (carries) {
    if (d.clip !== chosen) {
      // Going round as often as it went: the row's rate scaled from the one clip's lap to the other's.
      const rig = rigOf(w, animKind(me))
      const a = clipOf(rig, d.clip), b = clipOf(rig, chosen)
      d.rate = (d.rate * (a.rate / a.dur)) / (b.rate / b.dur)
      d.clipT = inStep(w, me, d.clip, d.clipT, chosen)
      d.clip = chosen
    }
    d.motion = name
    mixIn(me, w, shares)
    return
  }
  if (d.motion === name && d.clip === chosen && d.state === 'act') return
  d.motion = name
  easeFrom(d, null)
  playClip(me, chosen)
  // Begun where its motion's `begin` says, else at its start.
  if (m.begin !== undefined) d.clipT = secondsIn(w, me, chosen, 'begin', m.begin)
  if (mixes) mixIn(me, w, shares)
  // The change of clip inertialized from where the clip begins, as its mix has it (`motion3d.play.ts`).
  settle(me)
  // Where the body stood and faced as the clip began, before its target placed it.
  const stood = placed(d)
  d.warp = null
  if (root !== null) place(w, me, pointFor(me, w), chosen, 0)
  d.warp = warpOf(me, w, m, chosen, root, stood)
  // Bent onto its point: begun where the body stood (Warp, the header).
  if (d.warp?.on === 'point') place(w, me, pointFor(me, w), chosen, 0)
  // Its place's jump eased by the crossfade, or folded into the change inertialized.
  if (kindInertial(w, me)) inertRoot(me, d.eased.from)
  else ease(d)
}

// The bend of a one-shot (Warp, the header), or null for none, its `until` in seconds on the body. On the
// triangles, toward the row's `target`: the facing it begins at and the one that turns its blow toward
// the target, within the motion's `turn`, and the metres across the ground that carry the blow the rest
// of the way, within its `reach`; none when the row has no `target`. On a space's point: where the body
// stood and faced as the clip began (`stood`), and where the point placed the clip's first frame (the
// body's place now). A clip whose `until` is its first frame has nothing to bend over: none.
const BONES: Record<Limb, string> = { handL: 'LeftHand', handR: 'RightHand', footL: 'LeftFoot', footR: 'RightFoot' }
type Bend = { on: 'target'; from: number; to: number; by: number[]; until: number } | { on: 'point'; from: number[]; start: number[]; until: number }
function warpOf(me: Row, w: W, m: Motion, clip: string, root: string | Constraint | null, stood: number[]): Bend | null {
  const d = me.data
  if (!m.warp) return null
  const until = secondsIn(w, me, clip, 'warp', m.warp.until)
  if (!('reach' in m.warp)) {
    if (typeof root !== 'string') throw new Error(`motion3d's motion ${d.motion} warps ${clip} onto a space's point, and it plays on ${m.target ?? 'no target'}; on the triangles its warp gives reach, turn and accel`)
    if (!(until > 0)) return null
    return { on: 'point', from: stood.slice(0, 4), start: placed(d).slice(0, 4), until }
  }
  if (clipOf(rigOf(w, animKind(me)), clip).loop) throw new Error(`motion3d's motion ${d.motion} warps ${clip}, a loop, toward the row's target; only a one-shot's blow is bent`)
  if (!rooted(w, me)) throw new Error(`motion3d's motion ${d.motion} warps ${clip} toward the row's target, and it plays on ${m.target ?? 'no target'}; on a space's point its warp gives only until`)
  if (!Array.isArray(d.target) || !(until > 0)) return null
  const { limb } = blowOf(w, me, clip)
  const { rig, body, anim } = measured(w, me)
  // The blow, in the clip's frame at its start: where the clip at `until` puts the limb that strikes.
  const blow = clipSpotIn(rig, body, anim, clip, [BONES[limb]], until)
  const beginTurn = offsetsOf(w, me, clip).beginTurn * DEG
  const from = d.yaw - beginTurn
  const [px, , pz] = d.pos
  const [tx, , tz] = d.target as number[]
  const turnBy = Math.max(-m.warp.turn * DEG, Math.min(m.warp.turn * DEG, wrap(math.atan2(tx - px, tz - pz) - math.atan2(blow[0], blow[2]) - d.yaw)))
  const yaw = d.yaw + turnBy
  const lands = fromBody(yaw, blow)
  const short = [tx - (px + lands[0]), tz - (pz + lands[2])]
  const far = math.hypot(short[0], short[1])
  // No further than its reach, nor than eased in and out over the time to the strike at its `accel`.
  const most = Math.min(m.warp.reach, (m.warp.accel * until * until) / 6)
  const by = far > most ? short.map(v => (v * most) / far) : short
  return { on: 'target', from, to: from + turnBy, by, until }
}

// The share of a bend made by `t` seconds of the time `until` its strike: eased in and out
// (3s² − 2s³), so the body's speed rises and falls smoothly.
const bentBy = (t: number, until: number) => {
  const s = Math.min(1, Math.max(0, t / until))
  return s * s * (3 - 2 * s)
}

// Where the body stands under its feet as `clip` has them `t` seconds in: the root raised to the lower
// of its toes' tips.
function underFeet(w: W, me: Row, clip: string, t: number): number[] {
  const d = me.data
  const floor = Math.min(ends(w, me, 'footL', { clip, clipT: t })[4], ends(w, me, 'footR', { clip, clipT: t })[4])
  return [d.pos[0], d.pos[1] + floor, d.pos[2], d.yaw]
}

// One step of a body on its target (One held path, the header): its clip run a step; its place moved
// along the target by kinematics3d, by the motion's behavior: a loop as hard as the stick pushes its way
// and played at the rate it went (`slide`), a one-shot by `move` as far as its travel carries it along
// the target's ways, one by another behavior (`jump`) at the stick's way at the speed it goes across the
// ground; then placed there by its clip's offsets. A body with no target is played where it stands.
function advance(me: Row, w: W, dt: number, stick: number[]): { ended: boolean; clip: string; markers: Marker[] } {
  const d = me.data
  const clip: string = d.clip
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const t0: number = d.clipT
  const { markers } = animated(me, w, dt)
  const ended = d.state !== 'act'
  // A bend onto a point is over once the playhead has passed its `until`, or a loop has come round
  // (Warp, the header): from then on the point places the body alone.
  if (d.warp?.on === 'point' && (d.clipT >= d.warp.until || d.clipT < t0)) d.warp = null
  if (d.root !== null) {
    const c = pointFor(me, w)
    const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
    const behavior = m?.behavior ?? 'move'
    if (!ended && r.loop) {
      // Stopped at an edge stays stopped until the stick pushes another way.
      if (d.stopped && (stick[0] !== 0 || stick[1] !== 0) && !(dot([...stick, 0], [...d.stopped, 0]) > 0)) d.stopped = false
      const slid = slide(w, me, c, clip, dt, stick)
      // At rest (kinematics3d's), a loop whose lap carries the body nowhere (an idle: less than the
      // motion3d file's `moves`, the distance that counts as travel) plays on at its own rate; one that
      // carries it (a climb) holds still, at the rate the place went.
      const lap = lapOf(w, me, clip)
      const nowhere = math.hypot(lap[0], lap[1], lap[2]) <= movesOf(w, animKind(me)).moves
      d.rate = nowhere && is(me, w, 'rest') ? 1 : slid.rate
      // Stopped where it was pushed and went nowhere; no longer once its place moves.
      if (slid.stopped) d.stopped = stick.slice()
      else if (slid.speed > 0) d.stopped = false
      d.speed = slid.speed
    } else if (behavior === 'move') {
      // A one-shot carried along the target's ways as far as its travel goes this step, and, bent toward
      // the row's target (Warp, the header), its share of the bend's metres.
      const was = parts(d.along)
      const facing0: number = d.facing ?? dataOf(c).yaw
      const all = waysOf(w, c as Target, d.along, me)
      const by = ended ? all.map(() => 0) : carriedBy(w, me, c, clip, t0, d.clipT)
      const toward = d.warp?.on === 'target'
      const k = toward ? bentBy(d.clipT, d.warp.until) - bentBy(t0, d.warp.until) : 0
      const bent = k > 0 ? by.map((v, i) => v + dot([d.warp.by[0] * k, 0, d.warp.by[1] * k], all[i].dir)) : by
      d.along = moveOn(w, c as Target, d.along, bent.map(v => v / dt), dt, me)
      // Turned toward it by as much of the bend's turn as the playhead has come to its `until`; else, one
      // that steers turned toward the way it is walked (Facing, the header).
      if (toward) d.facing = d.warp.from + (d.warp.to - d.warp.from) * bentBy(d.clipT, d.warp.until)
      else if (m?.steer) {
        const pushed = d.want[0] !== 0 || d.want[1] !== 0
        d.facing = pushed ? steered(me, w, facing0, math.atan2(d.want[0], d.want[1]), dt) : facing0
      }
      d.speed = math.hypot(...parts(d.along).map((v, i) => v - was[i])) / dt
    } else {
      const speed = math.hypot(d.vel[0], d.vel[2])
      d.along = moveOn(w, { [behavior]: c }, d.along, [d.want[0] * speed, 0, d.want[1] * speed], dt, me)
    }
    place(w, me, c, clip, ended ? r.dur : d.clipT)
  }
  if (!ended) ease(d)
  return { ended, clip, markers }
}

// ---------------------------------------------------------------- the stack

// A shape holding the body (The stack, the header): a space, or the anywhere shape (`id` null); its
// rank, whether a body takes up its activities with no key (`data.motion3d.autoChange`), and the
// activities it offers.
type Shape = { id: number | null; rank: number; auto: boolean; activities: string[] }
type Part = 'body' | 'upper'
// A motion found: its activity, the shape it is in, its name.
type Found = { word: string; space: number | null; name: string }

// Every shape holding the body, best ranked first, the anywhere shape last; with `kept`, the station the
// body is in beside them while it stands, its point maybe outside it (a seat beside its desk).
function stackOf(me: Row, w: W, kept = false): Shape[] {
  const a = anywhereShape(w)
  const { all, here } = spacesOf(me, w)
  const mine = kept ? all.find(s => s.id === me.data.space && !here.includes(s)) : undefined
  const spaces = mine ? [...here, mine].sort((p, q) => rank(q) - rank(p) || p.far - q.far || p.id - q.id) : here
  return [
    ...spaces.map(s => ({ id: s.id, rank: rank(s), auto: s.data?.motion3d?.autoChange === true, activities: s.activities })),
    { id: null, rank: a.priority, auto: a.data?.motion3d?.autoChange === true, activities: a.activities },
  ]
}

// The shape `id` while it holds the body; undefined once it does not.
const shapeOf = (me: Row, w: W, id: number | null): Shape | undefined => stackOf(me, w).find(s => s.id === id)

// Whether a motion describes the situation: its `when` and its `stick` hold.
const describes = (w: W, me: Row, m: Motion, stick: number[]): boolean => stickOk(m, stick) && whenOk(w, me, m)

// The first motion of `part` (one over the body for the upper half, else one of the whole body) that
// takes no key, may follow what the body plays and describes the situation, through every shape holding
// the body that takes up its activities with no key, best ranked first, down to the anywhere shape.
function search(me: Row, w: W, part: Part, stick: number[]): Found | undefined {
  for (const s of stackOf(me, w)) {
    if (!s.auto) continue
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (m.add || !!m.over !== (part === 'upper') || m.press || !fromOk(me, m) || !describes(w, me, m, stick)) continue
        return { word, space: s.id, name }
      }
    }
  }
  return undefined
}

// When nothing fits (`fill`): the anywhere shape's first activity, its first motion of the whole body.
function filled(me: Row, w: W): Found {
  const word = anywhere(me, w)[0]
  const name = Object.entries(activityOf(w, me, word).motions).find(([, m]) => !m.over && !m.add)?.[0]
  if (name === undefined) throw new Error(`motion3d's activity ${word} has no motion of the whole body`)
  return { word, space: null, name }
}

// The rank of the shape a found motion is in.
const rankOf = (me: Row, w: W, f: Found): number => shapeOf(me, w, f.space)?.rank ?? anywhereShape(w).priority

// Of a move's clips on a shape that takes it up with no key, the one that goes the way the body is
// walked, in its own frame [right, forward].
function walked(w: W, me: Row, m: Motion): string {
  return toward(w, me, m, wayWalked(me))
}

// The way the body is walked in its own frame, [right, forward]: its `want` across the ground.
function wayWalked(me: Row): number[] {
  const b = inBody(me.data.yaw, [me.data.want[0], 0, me.data.want[1]])
  return [-b[0], b[2]]
}

// The motion a `then` names, played in the shape the one it follows was in: a motion of the same
// activity by its name, or one of another activity the same shape offers as `<activity>.<motion>` (a
// weapon put away, then the next drawn). One the activity has no motion of throws, naming it.
function following(me: Row, w: W, word: string, space: number | null, then: string): Found {
  const dot = then.indexOf('.')
  const f = dot < 0 ? { word, space, name: then } : { word: then.slice(0, dot), space, name: then.slice(dot + 1) }
  if (!motionOf(activityOf(w, me, f.word), f.name)) throw new Error(`motion3d: ${word}'s then ${then} names no motion of ${f.word}`)
  return f
}

// The body handed to what the stack holds it in: the search, else `fill`.
function leave(me: Row, w: W, stick: number[] = [0, 0]) {
  const next = search(me, w, 'body', stick) ?? filled(me, w)
  begin(me, w, next.word, next.space, next.name, stick, walked(w, me, motionOf(activityOf(w, me, next.word), next.name)!))
}

// The motion of the whole body (A motion ends, the header), after its step. In a shape a key put it in
// (one that takes nothing up with no key, a station), as that activity has it: a one-shot played out,
// its `then`, else the stack; a loop, the first move of its activity with no `press` and a `stick` or a
// `when`, that may follow it and whose stick and states hold. Anywhere else: a one-shot plays through,
// then its `then`, else the stack; a loop is over once its shape no longer holds the body, its
// description stops being true, or, as its clip comes round, a higher ranked shape holding the body has a
// motion of the whole body that fits, and is followed by its `then`, else the stack; else it plays on, its
// clip the one that goes the way the body is walked.
function select(me: Row, w: W, h: { ended: boolean; clip: string }, stick: number[], lapped: boolean) {
  const d = me.data
  const a = activityOf(w, me, d.activity)
  const cur = motionOf(a, d.motion)
  const here = shapeOf(me, w, d.space)
  const loop = clipOf(rigOf(w, animKind(me)), h.clip).loop
  const then = (name: string): Found => following(me, w, d.activity, d.space, name)
  // A station is held to as long as it stands (`step` hands the body back once it is gone): its point may
  // stand outside its shape, a seat beside its desk.
  const station = d.space !== null && spaceOf(me, w)?.data?.motion3d?.autoChange !== true
  // A one-shot is over at its clip's end, or at its motion's `end`.
  const done = h.ended || (!!cur && cur.end !== undefined && d.clipT >= secondsIn(w, me, h.clip, 'end', cur.end))
  if (station) {
    if (!loop) {
      if (!done) return
      if (cur?.then) {
        const f = then(cur.then)
        begin(me, w, f.word, f.space, f.name, stick)
      } else leave(me, w, stick)
      return
    }
    for (const [name, m] of Object.entries(a.motions)) {
      if (m.add || m.over || m.press || (!m.stick && !m.when?.length) || !fromOk(me, m) || !describes(w, me, m, stick)) continue
      begin(me, w, d.activity, d.space, name, stick)
      return
    }
    return
  }
  let next: Found | undefined
  if (!cur) next = search(me, w, 'body', stick) ?? filled(me, w)
  else if (!loop) {
    // One that yields gives way once its description stops being true, to what the stack finds.
    if (!done && cur.yields && !cur.press && !describes(w, me, cur, stick)) next = search(me, w, 'body', stick) ?? filled(me, w)
    else if (!done) return
    else next = cur.then ? then(cur.then) : search(me, w, 'body', stick) ?? filled(me, w)
  } else {
    // As its clip comes round; at once where a shape holding the body says `cut` (a wall run into).
    const cut = spacesOf(me, w).here.some(s => s.data?.motion3d?.cut === true)
    const higher = (lapped || cut) && here ? search(me, w, 'body', stick) : undefined
    const over = !here || !describes(w, me, cur, stick) || (higher !== undefined && rankOf(me, w, higher) > here.rank)
    if (over) next = cur.then ? then(cur.then) : higher ?? search(me, w, 'body', stick) ?? filled(me, w)
  }
  const found = next ?? { word: d.activity, space: d.space, name: d.motion }
  const m = motionOf(activityOf(w, me, found.word), found.name)!
  if (!m.clips.length) return leave(me, w, stick)
  begin(me, w, found.word, found.space, found.name, stick, walked(w, me, m))
}

export function drive(me: Row, w: W, dt: number, stick: number[]) {
  const d = me.data
  step(me, w)
  if (d.motion === null || d.clip == null) leave(me, w, stick)
  buffered(me, w, dt, stick)
  const t0: number = d.clipT
  const yaw0: number = d.yaw
  const motion0 = d.motion, clip0 = d.clip
  const h = advance(me, w, dt, stick)
  // A jump whose key is let go while it rises is cut short (`motion3d.kinematics3d.ts`).
  cutShort(me, w)
  select(me, w, h, stick, clipOf(rigOf(w, animKind(me)), h.clip).loop && d.clipT < t0)
  turnFrom(me, w, motion0, clip0, yaw0)
  paced(me, w, dt)
  leaned(me, w, dt, yaw0)
  const above = upper(me, w, dt, stick)
  const laid = layers(me, w, dt, stick)
  // What the clips marked this step, and the windows open now (Markers, the header).
  d.markers = [...h.markers, ...above, ...laid]
  d.windows = [
    ...(d.state === 'act' && d.clip != null ? openIn(w, me, d.clip, d.clipT) : []),
    ...(typeof d.upper === 'string' ? openIn(w, me, d.upper, d.upperT) : []),
  ]
}

// A one-shot on the triangles whose clip keeps its turn, begun this step (Facing, the header), laid from
// the way the body faced as the step began, `yaw0`: what cut it short (a run walked back the way it
// came) may have turned the body toward the stick on this step before it began, and the clip turns it
// the whole way itself.
function turnFrom(me: Row, w: W, motion0: string | null, clip0: string | null, yaw0: number) {
  const d = me.data
  if ((d.motion === motion0 && d.clip === clip0) || d.state !== 'act' || !rooted(w, me)) return
  const r = clipOf(rigOf(w, animKind(me)), d.clip)
  if (r.loop || !carries(r, movesOf(w, animKind(me))).turns) return
  const root = d.root as { triangles: { yaw: number; normal: number[] } }
  d.root = { triangles: { ...root.triangles, yaw: yaw0 - offsetsOf(w, me, d.clip).beginTurn * DEG } }
  d.facing = null
  if (kindInertial(w, me)) {
    // Its place's jump folded into the change inertialized anew, from where it stood as it changed.
    const left = (d.inert ?? [])[d.inert.length - 1]?.left
    place(w, me, pointFor(me, w), d.clip, d.clipT)
    if (left) inertRoot(me, left)
    return
  }
  if (d.eased) d.eased.to = null
  place(w, me, pointFor(me, w), d.clip, d.clipT)
  ease(d)
}

// The motion `name` of the activity `word` of the shape `space` played on the upper half (Over, the
// header): one of its clips, picked on the die; with none, nothing played over the body, held while it
// carries, else the upper half let go.
function overBegin(me: Row, w: W, f: Found) {
  const d = me.data
  const m = motionOf(activityOf(w, me, f.word), f.name)!
  d.upperActivity = f.word
  d.upperSpace = f.space
  if (!m.clips.length) {
    under(me)
    d.upperMotion = m.carry !== undefined ? f.name : null
    if (d.upperMotion === null) d.upperActivity = d.upperSpace = null
    return
  }
  over(me, m.clips[Math.floor(w.die() * m.clips.length)], m.over!)
  d.upperMotion = f.name
}

// One step of the upper half (Over, A motion ends, the header): a one-shot played out, its `then`, else
// the stack; a loop or a held motion with no clips is over once its shape no longer holds the body, its
// description stops being true, or a higher ranked shape holding the body has a motion over it that
// fits, and is followed by its `then`, else the stack; with nothing over the body, the stack. Nothing
// found, the upper half is let go.
function upper(me: Row, w: W, dt: number, stick: number[]): Marker[] {
  const d = me.data
  const m = d.upperMotion === null ? undefined : motionOf(activityOf(w, me, d.upperActivity), d.upperMotion)
  const { ended, markers } = overStep(me, w, dt, !!m?.then)
  let next: Found | undefined
  if (m) {
    const then = m.then ? following(me, w, d.upperActivity, d.upperSpace, m.then) : undefined
    const oneShot = m.clips.length > 0 && !clipOf(rigOf(w, animKind(me)), m.clips[0]).loop
    if (oneShot) {
      if (!ended) return markers
      next = then ?? search(me, w, 'upper', stick)
    } else {
      const here = shapeOf(me, w, d.upperSpace)
      const higher = search(me, w, 'upper', stick)
      const over = !here || !describes(w, me, m, stick) || (higher !== undefined && rankOf(me, w, higher) > here.rank)
      if (!over) return markers
      next = then ?? higher
    }
  } else next = search(me, w, 'upper', stick)
  if (next) {
    if (!motionOf(activityOf(w, me, next.word), next.name)?.over) throw new Error(`motion3d's ${d.upperActivity}.${d.upperMotion} is played over the body, and what follows it, ${next.word}.${next.name}, is not`)
    overBegin(me, w, next)
  } else if (m) {
    under(me)
    d.upperMotion = d.upperActivity = d.upperSpace = null
  }
  return markers
}

// ---------------------------------------------------------------- layers

// The additive motion `name` of the activity `word` laid on (Layers, the header): one of its clips,
// picked on the die.
function layOn(me: Row, w: W, word: string, name: string, m: Motion) {
  if (!m.clips.length) throw new Error(`motion3d's ${word}.${name} is an additive layer with no clip`)
  const clip = m.clips[Math.floor(w.die() * m.clips.length)]
  lay(me, `${word}.${name}`, clip, { most: m.weight ?? 1, loop: clipOf(rigOf(w, animKind(me)), clip).loop, bone: m.over ?? null })
}

// One step of the additive layers (Layers, the header): each motion with no key that fits laid on, each
// that no longer does let go; then every layer run a step. The markers its clips crossed.
function layers(me: Row, w: W, dt: number, stick: number[]): Marker[] {
  const d = me.data
  const wanted = new Map<string, { word: string; name: string; m: Motion }>()
  for (const s of stackOf(me, w)) {
    if (!s.auto) continue
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (!m.add || m.press || !fromOk(me, m) || !describes(w, me, m, stick)) continue
        wanted.set(`${word}.${name}`, { word, name, m })
      }
    }
  }
  const on = d.adds as Layer[]
  for (const l of on) {
    const dot = l.name.indexOf('.')
    const m = motionOf(activityOf(w, me, l.name.slice(0, dot)), l.name.slice(dot + 1))
    if (!m?.press && !l.ending && !wanted.has(l.name)) lift(me, l.name)
  }
  for (const [key, f] of wanted) if (!on.some(l => l.name === key && !l.ending)) layOn(me, w, f.word, f.name, f.m)
  return layStep(me, w, dt)
}

// The lean into a turn (Lean, the header): the row's `lean` eased toward atan(speed · turn rate / g),
// within the kind's `most`, the body walking on the triangles; toward none anywhere else. Laid into its
// `tilt`, about the way it faces.
function leaned(me: Row, w: W, dt: number, yaw0: number) {
  const d = me.data
  const k = kindNumbers(w, me).lean
  if (!k || !(dt > 0)) return
  // Off the triangles the body's tilt is its point's, placed afresh each step by nothing here: no lean.
  if (!rooted(w, me)) {
    d.lean = 0
    return
  }
  const rate = wrap(d.yaw - yaw0) / dt
  // Leaning while it goes about on a loop (a walk, a run); a one-shot turns as its clip turns it.
  const going = d.grounded !== false && d.clip != null && clipOf(rigOf(w, animKind(me)), d.clip).loop
  const want = going ? Math.max(-k.most, Math.min(k.most, Math.atan((d.speed ?? 0) * rate / 9.81))) : 0
  d.lean = (d.lean ?? 0) + (want - (d.lean ?? 0)) * (k.ease > 0 ? 1 - Math.exp(-dt / k.ease) : 1)
  if (Math.abs(d.lean) < 1e-6) return
  // Rolled about the way it faces, after any tilt the ground or a point gave it: its up turned by the
  // lean toward its left, (cos yaw, 0, −sin yaw), the side a growing yaw turns it to.
  const roll = new Quaternion().setFromAxisAngle(new Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw)), -d.lean)
  const was = d.tilt ? new Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]) : new Quaternion()
  d.tilt = tiltOf(roll.multiply(was))
}

// ---------------------------------------------------------------- the buffer

// The second of the clip the body plays from which `key` may cut it (The buffer, the header): none while
// the body plays no one-shot a key played, or its file gives no `buffer.cancel`.
function cancelAt(me: Row, w: W, key: string): number | undefined {
  const d = me.data
  if (d.state !== 'act' || d.clip == null || typeof d.activity !== 'string') return undefined
  const m = motionOf(activityOf(w, me, d.activity), d.motion)
  if (!m?.press || clipOf(rigOf(w, animKind(me)), d.clip).loop) return undefined
  const c = fileOf(w, me).buffer?.cancel
  if (!c) return undefined
  const at: Time | undefined = c[m.press]?.[key] ?? c[m.press]?.['*'] ?? c['*']?.[key] ?? c['*']?.['*']
  return at === undefined ? undefined : secondsIn(w, me, d.clip, `cancel ${m.press} by ${key}`, at)
}

// Whether `key` may not yet cut the one-shot the body plays.
function lockedFor(me: Row, w: W, key: string): boolean {
  const at = cancelAt(me, w, key)
  return at !== undefined && me.data.clipT < at
}

// Whether the upper half plays a one-shot of its own (a draw, a putting away, a shot).
function upperBusy(me: Row, w: W): boolean {
  const d = me.data
  return typeof d.upper === 'string' && !clipOf(rigOf(w, animKind(me)), d.upper).loop
}

// A key held in the buffer (The buffer, the header): put at the back of `queued`, the keys pressed and
// not yet played, each with how long it has been free to play.
export function queue(me: Row, w: W, key: string) {
  fill(me, w)
  if (!fileOf(w, me).buffer) throw new Error(`motion3d: ${kindOf(me)}'s motion3d file gives no buffer, which a queued key ${key} is held by`)
  me.data.queued = [...me.data.queued, { key, age: 0 }]
}

// The key at the front of the buffer handed to `press`, once it may cut what plays; dropped once played,
// or once it has been free to play for `buffer.hold` seconds and nothing played it. The keys behind it
// wait their turn, their seconds not counted.
function buffered(me: Row, w: W, dt: number, stick: number[]) {
  const d = me.data
  const [q, ...rest] = d.queued as { key: string; age: number }[]
  if (!q || lockedFor(me, w, q.key)) return
  if (press(me, w, q.key, stick)) {
    d.queued = rest
    return
  }
  if (upperBusy(me, w)) return
  const age = q.age + dt
  d.queued = age > fileOf(w, me).buffer!.hold ? rest : [{ key: q.key, age }, ...rest]
}

// Whether a move played over the body may follow what the body and its upper half play: any but itself
// for one with no `from`.
const overFromOk = (me: Row, name: string, m: Motion): boolean =>
  m.from ? m.from.includes(me.data.motion) || m.from.includes(me.data.upperMotion) : me.data.upperMotion !== name

// A key (Moves, the header): through the shapes holding the body, best ranked first, down to the
// anywhere shape, the first motion with that `press` whose stick and states hold: one over the body that
// may follow what the body and its upper half play; one of the whole body with a `from` that names the
// move the body plays, in any of their activities; one with no `from` in another activity, of a shape
// ranked above the one the body is in.
export function press(me: Row, w: W, key: string, stick: number[]): boolean {
  const d = me.data
  solidsKept.delete(me)
  fill(me, w)
  const all = stackOf(me, w, true)
  // An additive layer the key plays, over anything (Layers, the header).
  for (const s of all) {
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (!m.add || m.press !== key || !fromOk(me, m) || !describes(w, me, m, stick)) continue
        layOn(me, w, word, name, m)
        return true
      }
    }
  }
  if (lockedFor(me, w, key)) return false
  const at = all.find(s => s.id === d.space)?.rank ?? anywhereShape(w).priority
  for (const s of all) {
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (m.add || m.press !== key || !describes(w, me, m, stick)) continue
        if (m.over) {
          if (!overFromOk(me, name, m)) continue
          overBegin(me, w, { word, space: s.id, name })
          return true
        }
        const mine = word === d.activity && s.id === d.space
        if (m.from ? !m.from.includes(d.motion) : mine || s.rank <= at) continue
        begin(me, w, word, s.id, name, stick)
        return true
      }
    }
  }
  return false
}


// ---------------------------------------------------------------- the limbs

// Each bone a limb ends in, its chain from the shoulder or the hip, and the limb the bake says when is
// planted (`plantsOf`).
const LIMBS: Record<string, { bones: [string, string, string]; limb: Limb }> = {
  LeftHand: { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], limb: 'handL' },
  RightHand: { bones: ['RightArm', 'RightForeArm', 'RightHand'], limb: 'handR' },
  LeftFoot: { bones: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], limb: 'footL' },
  RightFoot: { bones: ['RightUpLeg', 'RightLeg', 'RightFoot'], limb: 'footR' },
}

// How much of a limb is pinned `t` seconds into a clip it is planted in over `runs`: whole inside a
// run, eased in over `ease` seconds from the run's start and out over `ease` to its end, except at an
// end that is the clip's own (a one-shot's start or end, a loop held all its lap), where the crossfade
// eases it. A loop's run past its end holds the next lap's start.
function pinned(runs: number[][], t: number, dur: number, loop: boolean, ease: number): number {
  let most = 0
  for (const [a, b] of runs) {
    if (loop && a <= 1e-6 && b >= dur - 1e-6) return 1
    for (const at of loop ? [t, t + dur] : [t]) {
      if (at < a || at > b) continue
      const into = !loop && a <= 1e-6 ? 1 : ease > 0 ? (at - a) / ease : 1
      const out = !loop && b >= dur - 1e-6 ? 1 : ease > 0 ? (b - at) / ease : 1
      most = Math.max(most, clamp(Math.min(into, out), 0, 1))
    }
  }
  return most
}

// The place on a constraint nearest `p`, in the world (kinematics3d's `nearest`, then its `at`).
const nearest = (w: W, me: Row, c: Constraint, p: number[]): number[] => onIt(w, me, c, nearestOn(w, c as Target, p, me))

// The props some carry of the body's motion3d file holds, by their loader model.
export const carriedProps = (from: W, me: Row): string[] => Object.values(fileOf(from, me).carries ?? {}).map(c => c.prop)

// What the body carries this step (Carries, the header): the carry its upper half's move names, at the
// share that move's clip is drawn by, else the carry its body's move names, at its; none.
export function carrying(from: W, me: Row): { carry: Carry; weight: number } | undefined {
  const d = me.data
  if (typeof d.activity !== 'string') return undefined
  const up = typeof d.upperActivity === 'string' ? motionOf(activityOf(from, me, d.upperActivity), d.upperMotion ?? null) : undefined
  const body = motionOf(activityOf(from, me, d.activity), d.motion ?? null)
  const named = up?.carry !== undefined ? { name: up.carry, weight: !up.clips.length ? 1 : d.upper != null ? d.upperW : 0 } : body?.carry !== undefined ? { name: body.carry, weight: share(d) } : undefined
  if (!named || !(named.weight > 0)) return undefined
  const carry = fileOf(from, me).carries?.[named.name]
  if (!carry) throw new Error(`motion3d: ${kindOf(me)}'s motion3d file has no carry ${named.name}`)
  return { carry, weight: named.weight }
}

export function reachesOf(from: W, me: Row): Reach[] {
  const d = me.data
  // A move on the triangles stands its root on its place and pins no limb.
  if (typeof d.activity !== 'string' || d.clip == null || d.root == null || rooted(from, me)) return []
  // The hands and feet of the clip's own spot, each pinned onto the target the body is held to.
  const limbs = spotOf(from, me, d.clip).filter(bone => LIMBS[bone])
  if (!limbs.length) return []
  const ease = (from.world.motion3d as Numbers).ease
  if (typeof ease !== 'number') throw new Error(`motion3d pins the limbs of ${d.activity}.${d.motion} by world.motion3d.ease, which the scene does not give`)
  const target = pointFor(me, from)
  const rig = rigOf(from, animKind(me))
  // The parts the body is drawn by, each at its weight, each pinning only its own spot's limbs.
  const parts = [{ clip: d.clip as string, t: d.clipT as number, w: share(d) }]
  if (d.from != null && share(d) < 1) parts.push({ clip: d.from, t: d.fromT, w: 1 - share(d) })
  const pose = posed(from, me)
  const body: Turn = { yaw: d.yaw, tilt: d.tilt ? new Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]) : null }
  // A world direction in the body's frame, its tilt taken off and then its facing.
  const inTurned = (r: number[]) => {
    if (!body.tilt) return inBody(body.yaw, r)
    const v = new Vector3(r[0], r[1], r[2]).applyQuaternion(body.tilt.clone().invert())
    return inBody(body.yaw, [v.x, v.y, v.z])
  }
  const out: Reach[] = []
  for (const bone of limbs) {
    const { bones, limb } = LIMBS[bone]
    const weight = parts.reduce((s, p) => {
      if (!spotOf(from, me, p.clip).includes(bone)) return s
      const c = clipOf(rig, p.clip)
      return s + p.w * pinned(plantsOf(from, me, p.clip)[limb], p.t, c.dur, c.loop, ease)
    }, 0)
    if (!(weight > 0)) continue
    const m4 = pose.get(bone)
    if (!m4) throw new Error(`motion3d bends ${bone}, which ${animKind(me)}'s glb has no joint of`)
    const p = new Vector3(), q = new Quaternion()
    m4.decompose(p, q, new Vector3())
    // The bone as drawn in the world, the nearest place of its point to it, and the reach between.
    const drawn = add(d.pos, turned(body, [p.x, p.y, p.z]))
    const to = nearest(from, me, target, drawn)
    const at = drawn.map((v, i) => v + (to[i] - v) * weight)
    const r = [at[0] - d.pos[0], at[1] - d.pos[1], at[2] - d.pos[2]]
    out.push({ bone, bones, pole: asDrawn(me, from, bone), at: inTurned(r), turn: [q.x, q.y, q.z, q.w], weight })
  }
  return out
}

// A pole that bends a limb the way its clip bends it this step: from the line between its first bone and
// its end to its middle joint, as the body is drawn (`posed`), in the body's frame.
export function asDrawn(me: Row, w: W, bone: string): number[] {
  const chain = LIMBS[bone]
  if (!chain) throw new Error(`motion3d bends no limb ending in ${bone}: ${Object.keys(LIMBS).join(', ')}`)
  const pose = posed(w, me)
  const [a, b, c] = chain.bones.map(n => new Vector3().setFromMatrixPosition(pose.get(n)!))
  const line = c.clone().sub(a)
  const len2 = line.lengthSq()
  const foot = len2 > 0 ? a.clone().addScaledVector(line, b.clone().sub(a).dot(line) / len2) : a
  const out = b.clone().sub(foot)
  return [out.x, out.y, out.z]
}

export function step(me: Row, w: W) {
  const d = me.data
  solidsKept.delete(me)
  fill(me, w)
  // Last step's answer kept before this step's is worked out.
  d.previousLookAround = d.lookAround
  const { all, here } = spacesOf(me, w)
  d.lookAround = here
  d.offered = here.flatMap(s => s.activities)
  for (const word of d.offered) activityOf(w, me, word)
  if (d.space !== null) {
    const mine = all.find(s => s.id === d.space)
    // Its space gone: its place on it goes with it, and it is handed back from where its feet are.
    if (!mine) {
      d.root = null
      d.along = null
    }
    if (!mine || (!mine.holds && d.root === null)) leave(me, w)
  }
}
