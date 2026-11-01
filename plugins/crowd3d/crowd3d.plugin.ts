// crowd3d: crowds of Mixamo bodies, every body of one kind drawn in a draw call per material, however
// many there are, and the things they hold, every item drawn in a draw call per material however many
// hold it. It has no row and no server half. It is not anim: no blending, no layers, no aim, no
// ragdoll. Every person is a row, and plays the clip its row names, on a loop unless `hold` names it,
// moving along its facing at its row's speed, holding what its row's `holding` names.
//
// `world.crowd3d`:
//   bodies    `{ <body>: <model> }`: each body a loader `model` entry, a glb of a Mixamo character
//             with its clips baked on (anim's export, `plugins/anim/anim.export.py`, names each
//             animation after the rig's clip). Every body has the one Mixamo skeleton: the same bones,
//             named alike, in the same order, one skeleton a body; a body whose bones differ from the
//             first body's throws, naming the bone.
//   clips     `[<clip>]`: the clips baked, each an animation of that name in the first body's glb; a
//             glb that lacks one throws, naming both.
//   rate      frames a second each clip is baked at.
//   hold      `[<clip>]`: the clips played once and held on their last frame, never looped: a death
//             leaves its person lying. Before its start such a clip holds its first frame. Left out,
//             every clip loops.
//   kinds     `[<kind>]`: the kinds whose rows are people (below).
//   poolSize  the people the pool holds, 512 when left out (Pool, below).
//   poses     a loader `json` entry whose file's `poses` is pose name to `{ clip, frame, at }`: a frame
//             of one of `clips`, `at` seconds into it (anim's export measures a rig's, from the
//             `.poses.json` beside each clip's FBX, `plugins/anim/anim.export.py`), left out when no
//             one is posed. A row names a pose in its `clip` as it names a clip (People, below). A pose
//             of a clip `clips` does not list throws, naming both.
//   fade      seconds a change of clip fades over, 0 when left out: a person changing clip, or pose,
//             is drawn mixed from the one it had into the one it has over `fade` (The tween, below).
//   reach     metres: how near one path's end stands to another's for a person to go on from the one
//             onto the other (`crowd3d.sim.ts`, Paths); a scene whose people walk no paths leaves it out.
//   mods      `{ paths }`: the plugin that hands crowd3d the paths its people walk, each a line or spline
//             of a shape whose data says the clip and speed played on it (`crowd3d.sim.ts`, Paths).
//   items     `{ <item>: { model, <place>: { at, turn, scale } } }`, left out when nobody holds
//             anything: each item a loader `model` entry, a glb of plain meshes, and for each place it
//             is held on how it sits there, in that place's bone's frame (Items, below). A key of an
//             item other than `model` that is no place throws, naming the places.
//
// The bake. Once every body's model has landed, every clip is played on the first body standing at
// the origin by three's own AnimationMixer, at `rate` frames a second from 0 to the clip's length,
// both ends kept, and at each frame each bone's rotation is read as its turn from the bone's rest,
// rest⁻¹ × rotation, one texel a bone, one row a frame, the clips one after another in one float
// texture every body reads. A Mixamo clip baked onto each body is the same turn from each body's own
// rest, so the turns are the clip's and the rests are the body's. The hips' travel across the ground is
// taken off: the hips are put where their rest puts them, plus how far the clip puts them off the
// steady line from where it starts them to where it ends them, and up and down as the clip has them,
// so every clip is drawn in place and a walk's travel is the row's. Up is the world's up read in the
// hips' parent's frame, since a Mixamo armature is Z-up. Where the hips then stand off their rest is
// the row's last texel: a Mixamo clip baked onto each body moves the hips the same off each body's own
// rest. `travel(body, clip)` is the steady line's length in the world over the clip's length for that
// body, metres a second along its facing: what a row walks at for its feet to stay planted.
//
// A body is a row of a texture of bodies: the armature's matrix at the origin, and each bone's rest
// rotation, rest position and inverse bind matrix.
//
// Pool. On the first tick, before any body lands, one float texture of `poolSize` slots is made, eight
// texels a slot, and it is never made again or resized. Each person is one slot: [x, y, z, yaw] where
// it stood, [first row, frames, length, clip time] of its clip and where in it it was then, [then,
// speed, held, body] its row's `since`, its speed, 1 for a held clip or 2 for a pose, and its body's
// place in `bodies`, [x, y, z, 0] where its course ends, [x, y, z, 0] twice, the up of the ground where
// it stood and where its course ends (`crowd3d.sim.ts`, The ground's up), and the clip it fades from
// (The tween): [first row, frames, length, clip time] of it and where in it it was at its own then,
// and [then, held, the moment the fade began, fade]; on a spline, of the straight
// piece it walks now, its `since` when it set out on it, its yaw the piece's way and its ups the
// piece's ends'. A clip the slot already played goes on at `since` where
// it had got to, so a person setting out on its next line keeps its stride. A new clip starts then: a held
// one at its start, a looped one as far into its length as the row's id puts it, the id times the golden
// ratio's fraction taken round 1, so no two people near each other play in step, and each page may have
// its own. A slot is written when its row comes, and again only
// when the row's `since`, `body`, `clip`, `speed`, `yaw`, `to`, `normal` or `normalTo` changes, or the clock reaches the next
// piece of its spline; when the row goes its slot is
// free for the next. Only the slots written are sent to the GPU, each by itself. More rows than
// `poolSize` throws, naming both.
//
// The clock is the step's, `(n − 1 + between) × dt`, the moment render3d draws (`steps`,
// `engine/browser.ts`); with time stopped (`between` 1) it stands still. A person stands on the straight
// line from where its slot put it to where its course ends, as far along it as its speed carries it
// across the ground in the time since, the line's length across the ground taken as the whole of it,
// its height along the line with it; at the end it stands there. Across the ground is across the ground
// under the line, its part along the up halfway along it taken out, and the up it stands on turns from
// the slot's first to its second with the way gone (`crowd3d.sim.ts`, The ground's up). A course whose
// ends stand one over the other, no way apart across the ground, is at its end. Its clip time is the slot's plus the time
// since, taken round the clip's length, or for a held clip kept between 0 and its length; a pose's is
// the slot's, its frame's time, whatever the clock.
//
// The tween. A slot written for a new clip (or pose) keeps the one it had in its last two texels, where
// that one had got to by its own then, when the change came (the row's `since`) and `fade`. For the
// `fade` seconds after the change, the pass draws each bone's turn and the hips' offset mixed from the
// clip it had, its time worked out from its own texels as ever, into the one it has, by how far through
// the fade the clock is: the same blend it draws between two baked frames of one clip. A slot with no
// clip before it, or with `fade` 0, is drawn in its clip alone, and so is every slot once its fade is
// through. A slot written again for the next piece of a spline, its clip kept, keeps its fade.
//
// The pose. Each frame, before render3d draws, a pass through the renderer writes every person's bone
// matrices into a float target, one row a person, four texels a bone: for each bone the chain from
// the hips down, each bone its rest position (the hips' moved by the clip) and its rest rotation times
// the clip's turn, the turns of the two baked frames either side blended and normalised, then the
// person's place, its facing turned onto the up it stands on (`frame` and `turn` of `crowd3d.sim.ts`),
// the armature, and the bone's inverse bind. The rows are the people of the
// first body, then the second, and so on, by a texture of slots in that order.
//
// The draw. A body's meshes are merged by material and attributes, each mesh's vertices put through
// its bind matrix first, so a mesh group is one geometry, and each group is one mesh drawn as many
// times as the body has people: one draw call, and one more for each light's shadow. Its material is a
// clone of the glb's, dressed by render3d (`dress`) with a surface that skins each vertex by four
// bones of the copy's row of the pose, the body's first row plus `gl_InstanceID`; it has no instance
// matrices, and render3d's between-steps does not move it. The shadow casts through a depth material
// dressed with the same surface. It is never culled whole, since its people stand anywhere.
//
// Items. A place is a name for one bone of the Mixamo skeleton (PLACES): `hips`, `chest` and `back`
// (Spine2), `neck`, `head`, `leftArm`, `leftForearm`, `leftHand`, `leftThigh`, `leftShin`,
// `leftFoot`, and the same on the right. A bone is found by its name after `mixamorig`, its digits and
// a colon. An item's place sits at `at` [x, y, z] metres from the bone, turned by `turn` [x, y, z]
// degrees (three's Euler, XYZ), scaled by `scale`, a number or [x, y, z], 1 when left out: in the
// bone's own frame, its axes as the bone's, in metres whatever the armature's scale. An item lists only
// the places it is held on; a place an item lists whose bone the skeleton has not got throws. Each
// item's meshes, put through where each stands in its glb, are merged by material and attributes, and
// each group is one mesh drawn once for every place any person holds it on, one draw call and one
// more a light's shadow, posed by a surface that reads the copy's pose row, bone and offset from the
// item's held texture: the bone's skin × its bind × the armature's scale undone × the place's offset.
// The held texture is written whole when a person comes, goes, changes body or what it holds.
//
// Memory, B bones, P `poolSize`, every texture RGBA float but the order, a matrix four texels of its
// columns (README.md, Memory layout, has the whole of it):
//   pool    `crowdPeople`, WIDE × ⌈8P / WIDE⌉; slot s is texels 8s to 8s + 7 along rows of WIDE:
//           [x, y, z, yaw], [first row, frames, length, clip time], [since, speed, held, body],
//           [x, y, z, 0] where the course ends, [x, y, z, 0] the up where it stood, [x, y, z, 0] the up
//           where the course ends, [first row, frames, length, clip time] of the clip it fades from,
//           [since, held, began, fade] of that fade. Each written slot is copied from `slotted`.
//   order   `crowdOrder`, red float, WIDE × ⌈P / WIDE⌉; entry a is the slot of pose row a, each
//           body's people one run from its `start`, in the order of `bodies`. Sent whole on a change.
//   clips   `crowdClips`, (B + 1) × Σ(frames + 1); a row a frame, texel j bone j's turn, texel B the
//           hips' offset; each clip `frames + 1` rows, after the clips before it.
//   bodies  `crowdBodies`, (HEAD + BONE·B) × bodies; texels 0–3 the armature, then for bone j at
//           HEAD + BONE·j its rest rotation, rest position (a 0) and inverse bind.
//   pose    `crowdPose`, the target, 4B × P; texel 4j + c of row a is column c of bone j's skin of
//           the person in slot order[a]. The pass writes the first `used` rows each frame.
//   held    `crowdHeld`, one an item, WIDE × ⌈HELD·P·places / WIDE⌉, its places the ones it lists;
//           copy k is texels HELD·k to HELD·k + 4 along rows of WIDE: [pose row, bone, 0, 0], then
//           the four columns of its bind × unscale × offset. Sent whole when written.
//
// People. A row of a kind `kinds` names is drawn as a person: its fields `pos` [x, y, z] metres where
// the feet stood at `since`, seconds on the step's clock (`n × dt` once `n` steps are taken), `to`
// [x, y, z] metres where its course ends, `speed` metres a second across the ground from `pos` toward
// `to`, `yaw` radians, the way it faces (yaw θ faces (sin θ, cos θ), as the `walker` plugin has it),
// whichever way its course goes, `body` and `clip`, a clip of `clips` or a pose of `poses`. The row is a course, not a place: it changes only
// when the person turns, stops, starts, changes clip or body, or sets out on another line, with `pos`
// where it stands then and `since` then, and a rule that needs where it stands now works it out as the
// pass does (The clock, above). A person standing still has a `speed` of 0, and stands at `pos`
// whatever its `to`. A course is a shapes3d line from `pos` to `to`; a row whose `through` is a list of
// [x, y, z] walks the shapes3d spline through `pos`, each of them and `to` instead, a straight piece of it
// at a time (`crowd3d.sim.ts`, which a rule reads to know where it stands): its slot holds the piece the
// clock is on, written again each frame the clock has gone on to the next, its clip going on across
// them, so the pass walks a line as ever. `normal` and `normalTo`, left out on ground whose up is
// [0, 1, 0], are the ups the course stands on (`crowd3d.sim.ts`, The ground's up). A row with no `to` [x, y, z] throws, naming it. `holding`, `{ <place>: <item> }`, left
// out when it holds nothing, is what it holds and where; it is read when it changes. A row whose body
// is none of `bodies`, or that holds an item on no place, an item none of `items`, or an item on a
// place the item does not list, throws, naming them.
//
// `ready()` is true once every body and item is built. `travel(body, clip)` as above. `counts()` is `{
// <body>: { copies, groups } }`, the people drawn of each body and its draw calls a light; `items()`
// is the same of each item, its copies the places it is held on. `pool()` is `{ size, used, writes }`:
// the slots, those holding a person, and the slots written since the start. `pose(body, clip, t)` is
// the bone matrices the pass writes for a person of `body` standing at the origin facing +z, `t`
// seconds into `clip`, `{ bones, matrices }`, the bones' names and a column-major matrix each, worked
// out as the pass works them, for a testbed to hold against three's own mixer; `clip` may be a pose, at
// its frame whatever `t`; and `pose(body, clip, t, from)`, `from` `{ clip, t, share }`, the same drawn
// mixed from `from`, its share of every bone, as the pass draws a fade. `holds(body, clip, t,
// item, place)` is the column-major matrix the item's surface puts it through on such a person, the
// bone's matrix of `pose` times the place's offset.
//
// It reaches the loader and render3d through `plugins` and is listed after the loader, whose models
// it asks for in its first tick. `close` takes everything it made off the scene and disposes it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { listed } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { piece, type Piece } from './crowd3d.sim.ts'

type Three = typeof import('three')
// How an item sits on a place: metres from the bone, degrees turned, and its scale.
export type Sit = { at?: [number, number, number]; turn?: [number, number, number]; scale?: number | [number, number, number] }
export type Item = { model: string } & { [place: string]: Sit | string }
export type Numbers = { bodies: Record<string, string>; clips: string[]; rate: number; hold?: string[]; kinds: string[]; poolSize?: number; items?: Record<string, Item>; poses?: string; fade?: number; reach?: number; mods?: { paths?: string } }
// A pose: a frame of a clip, `at` seconds into it.
export type Pose = { clip: string; frame: number; at: number }

// Texels a slot; the pool's and the order's width.
const PER = 8
const WIDE = 1024
const POOL = 512
// A body's texels before its bones, and a bone's.
const HEAD = 4
const BONE = 6
// Texels a held copy: its pose row and bone, and its offset's four columns.
const HELD = 5

// The places a person holds things on, each the Mixamo bone it means, by its name after `mixamorig`.
export const PLACES: Record<string, string> = {
  hips: 'Hips', chest: 'Spine2', back: 'Spine2', neck: 'Neck', head: 'Head',
  leftArm: 'LeftArm', leftForearm: 'LeftForeArm', leftHand: 'LeftHand', leftThigh: 'LeftUpLeg', leftShin: 'LeftLeg', leftFoot: 'LeftFoot',
  rightArm: 'RightArm', rightForearm: 'RightForeArm', rightHand: 'RightHand', rightThigh: 'RightUpLeg', rightShin: 'RightLeg', rightFoot: 'RightFoot',
}
const mixamo = (bone: string) => bone.replace(/^mixamorig\d*:?/, '')

// One bone's matrix of one row of the pose.
const fetching = `
uniform highp sampler2D crowdPose;
mat4 crowdBone( int row, float bone ) {
  int x = int( bone ) * 4;
  return mat4( texelFetch( crowdPose, ivec2( x, row ), 0 ), texelFetch( crowdPose, ivec2( x + 1, row ), 0 ),
    texelFetch( crowdPose, ivec2( x + 2, row ), 0 ), texelFetch( crowdPose, ivec2( x + 3, row ), 0 ) );
}`

// A surface that puts each vertex and its normal through `matrix`, a function of the copy.
const posed = (uniforms: Record<string, unknown>, common: string, matrix: string) => ({
  uniforms,
  vertex: {
    common: fetching + common,
    '?beginnormal_vertex': `
#define CROWD_POSED
mat4 crowdM = ${matrix};
objectNormal = mat3( crowdM ) * objectNormal;
#ifdef USE_TANGENT
objectTangent = mat3( crowdM ) * objectTangent;
#endif`,
    begin_vertex: `
#ifndef CROWD_POSED
mat4 crowdM = ${matrix};
#endif
transformed = ( crowdM * vec4( transformed, 1.0 ) ).xyz;`,
  },
})

// What an item's copy is put through: its bone's matrix of its pose row, times its offset.
const holding = (pose: { value: THREE.Texture }, held: { value: THREE.Texture }) => posed({ crowdPose: pose, crowdHeld: held }, `
uniform highp sampler2D crowdHeld;
vec4 crowdHeldAt( int n ) {
  int i = gl_InstanceID * ${HELD} + n;
  return texelFetch( crowdHeld, ivec2( i % ${WIDE}, i / ${WIDE} ), 0 );
}
mat4 crowdHold() {
  vec4 at = crowdHeldAt( 0 );
  return crowdBone( int( at.x ), at.y ) * mat4( crowdHeldAt( 1 ), crowdHeldAt( 2 ), crowdHeldAt( 3 ), crowdHeldAt( 4 ) );
}`, 'crowdHold()')

// The skin, as a render3d surface: four bones of the copy's row of the pose.
const skinning = (pose: { value: THREE.Texture }, start: { value: number }) => posed({ crowdPose: pose, crowdStart: start }, `
uniform float crowdStart;
attribute vec4 crowdBones;
attribute vec4 crowdWeights;
mat4 crowdSkin() {
  int row = int( crowdStart ) + gl_InstanceID;
  mat4 skin = mat4( 0.0 );
  for ( int k = 0; k < 4; k ++ ) {
    float w = crowdWeights[ k ];
    if ( w == 0.0 ) continue;
    skin += w * crowdBone( row, crowdBones[ k ] );
  }
  return skin;
}`, 'crowdSkin()')

// The pose pass: one fragment a texel of the pose, a column of one bone's matrix of one person.
const posing = (parents: number[]) => `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D crowdPeople;
uniform sampler2D crowdOrder;
uniform sampler2D crowdBodies;
uniform sampler2D crowdClips;
uniform float crowdTime;
const int BONES = ${parents.length};
const int PARENT[ BONES ] = int[ BONES ]( ${parents.join(', ')} );
layout( location = 0 ) out highp vec4 crowdPosed;
vec4 slot( int s, int k ) { int i = s * ${PER} + k; return texelFetch( crowdPeople, ivec2( i % ${WIDE}, i / ${WIDE} ), 0 ); }
vec4 body( int b, int x ) { return texelFetch( crowdBodies, ivec2( x, b ), 0 ); }
vec4 turn( int row, int bone ) { return texelFetch( crowdClips, ivec2( bone, row ), 0 ); }
vec4 qmul( vec4 a, vec4 b ) {
  return vec4( a.w * b.xyz + b.w * a.xyz + cross( a.xyz, b.xyz ), a.w * b.w - dot( a.xyz, b.xyz ) );
}
// The ground's up, as crowd3d.sim.ts has it: the up f of the way from a to b, the least turn of a onto
// b (its turn), and the turn of [0, 1, 0] onto n (its frame).
vec3 blend( vec3 a, vec3 b, float f ) {
  if ( a == b ) return a;
  vec3 m = mix( a, b, f );
  float l = length( m );
  return l > 0.0 ? m / l : a;
}
mat3 onto( vec3 a, vec3 b ) {
  vec3 v = cross( a, b );
  float c = dot( a, b );
  if ( c <= - 1.0 + 1e-6 ) return mat3( 1.0 );
  float k = 1.0 / ( 1.0 + c );
  return mat3(
    1.0 - k * ( v.y * v.y + v.z * v.z ), v.z + k * v.x * v.y, - v.y + k * v.x * v.z,
    - v.z + k * v.x * v.y, 1.0 - k * ( v.x * v.x + v.z * v.z ), v.x + k * v.y * v.z,
    v.y + k * v.x * v.z, - v.x + k * v.y * v.z, 1.0 - k * ( v.x * v.x + v.y * v.y ) );
}
mat3 frame( vec3 n ) {
  if ( n.y <= - 1.0 + 1e-6 ) return mat3( 1.0, 0.0, 0.0, 0.0, - 1.0, 0.0, 0.0, 0.0, - 1.0 );
  return onto( vec3( 0.0, 1.0, 0.0 ), n );
}
mat4 compose( vec3 p, vec4 q ) {
  float x = q.x, y = q.y, z = q.z, w = q.w;
  return mat4(
    1.0 - 2.0 * ( y * y + z * z ), 2.0 * ( x * y + z * w ), 2.0 * ( x * z - y * w ), 0.0,
    2.0 * ( x * y - z * w ), 1.0 - 2.0 * ( x * x + z * z ), 2.0 * ( y * z + x * w ), 0.0,
    2.0 * ( x * z + y * w ), 2.0 * ( y * z - x * w ), 1.0 - 2.0 * ( x * x + y * y ), 0.0,
    p, 1.0 );
}
// Where a clip stands at the clock: its two baked rows either side and how far between them, by its
// [first row, frames, length, clip time], its slot's then and how it is held (0 looped, 1 held, 2 a pose).
struct At { int r0; int r1; float a; };
At where( vec4 clip, float then, float held ) {
  float raw = clip.w + crowdTime - then;
  float t = held > 1.5 ? clip.w : held > 0.5 ? clamp( raw, 0.0, clip.z ) : mod( raw, clip.z );
  float u = t / clip.z * clip.y;
  float f = min( floor( u ), clip.y - 1.0 );
  int r0 = int( clip.x + f );
  return At( r0, r0 + 1, u - f );
}
// A bone's turn at a clip's place, the two baked frames either side blended and normalised.
vec4 turned( At c, int j ) {
  vec4 q0 = turn( c.r0, j ), q1 = turn( c.r1, j );
  if ( dot( q0, q1 ) < 0.0 ) q1 = - q1;
  return normalize( mix( q0, q1, c.a ) );
}
vec3 offset( At c ) { return mix( turn( c.r0, BONES ).xyz, turn( c.r1, BONES ).xyz, c.a ); }
void main() {
  ivec2 at = ivec2( gl_FragCoord.xy );
  int bone = at.x / 4, column = at.x % 4;
  int s = int( texelFetch( crowdOrder, ivec2( at.y % ${WIDE}, at.y / ${WIDE} ), 0 ).r );
  vec4 stood = slot( s, 0 ), clip = slot( s, 1 ), more = slot( s, 2 ), end = slot( s, 3 );
  vec4 was = slot( s, 6 ), fading = slot( s, 7 );
  float since = crowdTime - more.x;
  At now = where( clip, more.x, more.z );
  // The share of the clip it has, through the fade from the one it had (The tween).
  float share = fading.w > 0.0 && was.z > 0.0 ? clamp( ( crowdTime - fading.z ) / fading.w, 0.0, 1.0 ) : 1.0;
  At then = where( was.z > 0.0 ? was : clip, fading.x, fading.y );
  int b = int( more.w );
  mat4 m = mat4( 1.0 );
  int j = bone;
  for ( int k = 0; k < BONES; k ++ ) {
    if ( j < 0 ) break;
    vec4 qt = turned( now, j );
    if ( share < 1.0 ) {
      vec4 qf = turned( then, j );
      if ( dot( qf, qt ) < 0.0 ) qf = - qf;
      qt = normalize( mix( qf, qt, share ) );
    }
    vec4 q = qmul( body( b, ${HEAD} + j * ${BONE} ), qt );
    vec3 p = body( b, ${HEAD} + j * ${BONE} + 1 ).xyz;
    if ( j == 0 ) p += share < 1.0 ? mix( offset( then ), offset( now ), share ) : offset( now );
    m = compose( p, q ) * m;
    j = PARENT[ j ];
  }
  mat4 armature = mat4( body( b, 0 ), body( b, 1 ), body( b, 2 ), body( b, 3 ) );
  int i = ${HEAD} + bone * ${BONE} + 2;
  mat4 inverse = mat4( body( b, i ), body( b, i + 1 ), body( b, i + 2 ), body( b, i + 3 ) );
  float c = cos( stood.w ), n = sin( stood.w );
  vec3 n0 = slot( s, 4 ).xyz, n1 = slot( s, 5 ).xyz;
  vec3 halfway = blend( n0, n1, 0.5 );
  vec3 way = end.xyz - stood.xyz;
  float across = length( way - dot( way, halfway ) * halfway );
  float gone = across > 0.0 ? clamp( more.y * since / across, 0.0, 1.0 ) : 1.0;
  vec3 where = mix( stood.xyz, end.xyz, gone );
  mat3 facing = onto( halfway, blend( n0, n1, gone ) ) * frame( halfway ) * mat3( c, 0.0, - n, 0.0, 1.0, 0.0, n, 0.0, c );
  mat4 place = mat4( vec4( facing[ 0 ], 0.0 ), vec4( facing[ 1 ], 0.0 ), vec4( facing[ 2 ], 0.0 ), vec4( where, 1.0 ) );
  crowdPosed = ( place * armature * m * inverse )[ column ];
}`

// Where each clip's frames start in the bake.
type Clip = { row: number; frames: number; dur: number }
// One mesh group of a body.
type Group = { mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material> }
type Body = { index: number; groups: Group[]; start: { value: number }; count: number; scale: number }
// An item as drawn: its mesh groups, its held texture and how many copies it holds of the `room` it has.
type Ware = { groups: Group[]; held: { value: THREE.DataTexture }; count: number; room: number }
// What a row's slot was written from, the clip time it was written with, and what it holds, as its row
// has it and as pairs of place and item.
type Slot = {
  index: number; since: number; body: string; clip: string; speed: number; yaw: number; to: number[]; normal: number[]; normalTo: number[]
  start: number; holding: string; held: [string, string][]
}
// How a slot is held: 0 looped, 1 held on its last frame, 2 a pose.
const LOOP = 0, HOLD = 1, POSE = 2

// How far into a looped clip a person is at its `since`, as a fraction of the clip: its id times the
// golden ratio's fraction, taken round 1.
const phase = (id: number) => (id * 0.6180339887498949) % 1

// The clock (The clock, the header): the step's, the moment render3d draws.
const clock = (wire: Plugins['wire']) => (wire.between === undefined ? wire.n : wire.n - 1 + wire.between) * (wire.scene.prefabs.engine.dt as number)

export function crowd3d() {
  let three: Three | undefined
  let numbers: Numbers | undefined
  let scene: THREE.Scene | undefined
  let wire: Plugins['wire'] | undefined
  let started = false
  let starts = 0
  let size = 0
  // The pool, its order, the bodies and the bake, and the pass that poses them. `slotted` is the pool's
  // numbers as a texture three never sends, which three's copy reads a slot's texels out of.
  let people: THREE.DataTexture | undefined
  let slotted: THREE.DataTexture | undefined
  let order: THREE.DataTexture | undefined
  let bodiesTexture: THREE.DataTexture | undefined
  let clipsTexture: THREE.DataTexture | undefined
  let target: THREE.WebGLRenderTarget | undefined
  let pass: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> } | undefined
  const pose = { value: undefined as unknown as THREE.Texture }
  const time = { value: 0 }
  // The bake, read back for `pose` and `travel`.
  let bones: string[] = []
  let parents: number[] = []
  let clips = new Map<string, Clip>()
  let travels = new Map<string, number>()
  const bodies = new Map<string, Body>()
  const landed = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>()
  // The items, their models as they land, each body's inverse binds, the bone of each place the
  // skeleton has, and each offset of a body, item and place once worked out.
  const wares = new Map<string, Ware>()
  const stocked = new Map<string, { scene: THREE.Object3D }>()
  let inverses: THREE.Matrix4[][] = []
  const boneOf = new Map<string, number>()
  const offsets = new Map<string, THREE.Matrix4>()
  // Each row's slot, the slots free, the next never used, the slots to send, and the order to send;
  // each slot's pose row, and whether the held textures are to be written again.
  const slots = new Map<number, Slot>()
  const free: number[] = []
  let next = 0
  let written = 0
  const sending = new Set<number>()
  let reorder = false
  let used = 0
  const rowOf = new Map<number, number>()
  let arming = false

  const heldOf = (clip: string) => numbers!.hold?.includes(clip) ?? false
  const clipOf = (clip: string) => {
    const c = clips.get(clip)
    if (!c) throw new Error(`crowd3d has no clip ${clip}: world.crowd3d.clips is ${numbers!.clips.join(', ')}`)
    return c
  }
  // The scene's poses, off the file `poses` names, each of a clip of `clips`.
  const posesOf = (): Record<string, Pose> => {
    if (numbers!.poses === undefined) return {}
    const all = (json(wire!, numbers!.poses) as { poses?: Record<string, Pose> }).poses ?? {}
    for (const [name, p] of Object.entries(all)) if (!numbers!.clips.includes(p.clip)) throw new Error(`crowd3d's pose ${name} is of ${p.clip}, which world.crowd3d.clips does not list`)
    return all
  }
  // What a row's `clip` plays: a clip of `clips`, looped or held; or a pose, its clip at its frame's time.
  const playOf = (name: string): { clip: Clip; how: number; at: number } => {
    if (clips.has(name)) return { clip: clips.get(name)!, how: heldOf(name) ? HOLD : LOOP, at: 0 }
    const p = posesOf()[name]
    if (!p) throw new Error(`crowd3d has no clip or pose ${name}: world.crowd3d.clips is ${numbers!.clips.join(', ')}`)
    return { clip: clipOf(p.clip), how: POSE, at: p.at }
  }

  // A row's slot, from the straight piece of its course it walks now (`crowd3d.sim.ts`'s `piece`: the
  // line itself, or the piece of a spline). Its clip time at the piece's `since`: the clip it had goes on
  // where it had got to (a looped one taken round its length); a new clip starts at its start, held, or
  // at the row's phase.
  // A pose's clip time is its frame's, whatever the clock. A slot written for a new clip keeps the one it
  // had, where it had got to by its own then, as the clip it fades from (The tween), the fade beginning at
  // the piece's `since`; one written for the same clip keeps the fade it had.
  const write = (s: Slot, r: Row, p: Piece) => {
    const { clip: c, how, at } = playOf(r.data.clip)
    const on = s.start + p.since - s.since
    const changed = s.clip !== r.data.clip
    const start = how === POSE ? at : changed ? (how === HOLD ? 0 : phase(r.id) * c.dur) : how === HOLD ? on : on % c.dur
    const d = people!.image.data as Float32Array, o = s.index * PER * 4
    if (changed) {
      const fade = numbers!.fade ?? 0
      if (s.clip && fade > 0) {
        d.copyWithin(o + 24, o + 4, o + 8)
        d[o + 28] = d[o + 8]; d[o + 29] = d[o + 10]; d[o + 30] = p.since; d[o + 31] = fade
      } else d.fill(0, o + 24, o + 32)
    }
    d[o] = p.pos[0]; d[o + 1] = p.pos[1]; d[o + 2] = p.pos[2]; d[o + 3] = p.yaw
    d[o + 4] = c.row; d[o + 5] = c.frames; d[o + 6] = c.dur; d[o + 7] = start
    d[o + 8] = p.since; d[o + 9] = r.data.speed; d[o + 10] = how; d[o + 11] = bodies.get(r.data.body)!.index
    d[o + 12] = p.to[0]; d[o + 13] = p.to[1]; d[o + 14] = p.to[2]; d[o + 15] = 0
    d[o + 16] = p.normal[0]; d[o + 17] = p.normal[1]; d[o + 18] = p.normal[2]; d[o + 19] = 0
    d[o + 20] = p.normalTo[0]; d[o + 21] = p.normalTo[1]; d[o + 22] = p.normalTo[2]; d[o + 23] = 0
    s.since = p.since; s.body = r.data.body; s.clip = r.data.clip; s.speed = r.data.speed; s.yaw = p.yaw; s.to = p.to; s.start = start
    s.normal = p.normal; s.normalTo = p.normalTo
    sending.add(s.index)
    written++
  }

  // What a row holds, as pairs of place and item, each place one of PLACES that the item lists.
  const heldBy = (r: Row): [string, string][] => {
    const held = Object.entries((r.data.holding ?? {}) as Record<string, string>)
    for (const [place, item] of held) {
      if (!(place in PLACES)) throw new Error(`crowd3d: ${r.kind} ${r.id} holds ${item} on ${place}, which is no place: ${Object.keys(PLACES).join(', ')}`)
      const it = numbers!.items?.[item]
      if (!it) throw new Error(`crowd3d: ${r.kind} ${r.id} holds ${item}, which is none of world.crowd3d.items`)
      if (!it[place]) throw new Error(`crowd3d: ${r.kind} ${r.id} holds ${item} on ${place}, which world.crowd3d.items.${item} does not list`)
    }
    return held
  }

  // The matrix a copy of `item` on `place` of a person of `body` is put through after its bone's skin:
  // the bone's bind, the armature's scale undone, and the place's offset.
  const offsetOf = (body: Body, item: string, place: string) => {
    const key = `${body.index}|${item}|${place}`
    const known = offsets.get(key)
    if (known) return known
    const T = three!
    const sit = numbers!.items![item][place] as Sit
    const scale = sit.scale ?? 1
    const deg = (sit.turn ?? [0, 0, 0]).map(a => (a * Math.PI) / 180)
    const offset = new T.Matrix4().compose(
      new T.Vector3(...(sit.at ?? [0, 0, 0])),
      new T.Quaternion().setFromEuler(new T.Euler(deg[0], deg[1], deg[2])),
      typeof scale === 'number' ? new T.Vector3(scale, scale, scale) : new T.Vector3(...scale),
    )
    const m = inverses[body.index][boneOf.get(place)!].clone().invert()
      .multiply(new T.Matrix4().makeScale(1 / body.scale, 1 / body.scale, 1 / body.scale))
      .multiply(offset)
    offsets.set(key, m)
    return m
  }

  // Every item's held texture written whole: a copy for each place each person holds it on.
  const arm = () => {
    for (const ware of wares.values()) ware.count = 0
    for (const s of slots.values()) {
      for (const [place, item] of s.held) {
        const ware = wares.get(item)!
        const d = ware.held.value.image.data as Float32Array, o = ware.count++ * HELD * 4
        d[o] = rowOf.get(s.index)!; d[o + 1] = boneOf.get(place)!; d[o + 2] = 0; d[o + 3] = 0
        d.set(offsetOf(bodies.get(s.body)!, item, place).elements, o + 4)
      }
    }
    for (const ware of wares.values()) {
      for (const g of ware.groups) g.mesh.geometry.instanceCount = ware.count
      ware.held.value.needsUpdate = true
    }
  }

  // Every row of `kinds` in a slot of its own, written when it comes, changes course, or, on a spline,
  // sets out on the next piece by the clock `at`.
  const fill = (rows: Row[], at: number) => {
    const kinds = numbers!.kinds
    const mine = rows.filter(r => kinds.includes(r.kind))
    for (const r of mine) {
      if (!bodies.has(r.data.body)) throw new Error(`crowd3d: ${r.kind} ${r.id}'s body ${r.data.body} is none of world.crowd3d.bodies`)
      if (!(Array.isArray(r.data.to) && r.data.to.length === 3)) throw new Error(`crowd3d: ${r.kind} ${r.id} has no to [x, y, z], where its course ends`)
    }
    if (mine.length > size) throw new Error(`crowd3d's pool of ${size} is full: ${mine.length} people (world.crowd3d.poolSize)`)
    const now = new Set(mine.map(r => r.id))
    for (const [id, s] of slots) if (!now.has(id)) { slots.delete(id); free.push(s.index); reorder = true }
    for (const r of mine) {
      let s = slots.get(r.id)
      if (!s) {
        s = { index: free.pop() ?? next++, since: NaN, body: '', clip: '', speed: NaN, yaw: NaN, to: [], normal: [], normalTo: [], start: 0, holding: '', held: [] }
        slots.set(r.id, s)
        reorder = true
      }
      if (s.body !== r.data.body) reorder = true
      const p = piece(r, at)
      const differs = (a: number[], b: number[]) => a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]
      const ends = differs(s.to, p.to) || differs(s.normal, p.normal) || differs(s.normalTo, p.normalTo)
      if (s.since !== p.since || s.body !== r.data.body || s.clip !== r.data.clip || s.speed !== r.data.speed || s.yaw !== p.yaw || ends) write(s, r, p)
      const holding = JSON.stringify(r.data.holding ?? {})
      if (s.holding !== holding) {
        s.held = heldBy(r)
        s.holding = holding
        arming = true
      }
    }
    if (reorder) {
      reorder = false
      arming = true
      // The slots in the order of their bodies, each body's people one run.
      const o = order!.image.data as Float32Array
      let at = 0
      rowOf.clear()
      for (const [name, body] of bodies) {
        body.start.value = at
        for (const s of slots.values()) if (s.body === name) { rowOf.set(s.index, at); o[at++] = s.index }
        body.count = at - body.start.value
        for (const g of body.groups) g.mesh.geometry.instanceCount = body.count
      }
      used = at
      order!.needsUpdate = true
    }
    if (arming) {
      arming = false
      arm()
    }
  }

  // Every body baked, once every model has landed.
  const build = (render3d: any) => {
    const T = three!
    const n = numbers!
    const names = Object.keys(n.bodies)
    const rigs = names.map(name => {
      const model = landed.get(name)!
      const root = model.scene
      root.position.set(0, 0, 0)
      root.quaternion.identity()
      root.scale.set(1, 1, 1)
      root.updateMatrixWorld(true)
      const skinned: THREE.SkinnedMesh[] = []
      root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh) })
      if (!skinned.length) throw new Error(`crowd3d body ${name}: its model has no skinned mesh`)
      // Three draws a skinned vertex at `matrixWorld × bindMatrixInverse × Σ bone × bindMatrix`; the
      // shader leaves out the first two, which a glb's mesh bound where it stands makes the identity.
      for (const m of skinned) {
        const left = m.matrixWorld.clone().multiply(m.bindMatrixInverse).elements
        if (left.some((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) > 1e-5)) throw new Error(`crowd3d body ${name}: mesh ${m.name} is not bound where it stands`)
      }
      const skeleton = skinned[0].skeleton
      for (const m of skinned) {
        if (m.skeleton.bones.some((b, i) => b !== skeleton.bones[i]) || m.skeleton.bones.length !== skeleton.bones.length) throw new Error(`crowd3d body ${name}: mesh ${m.name} is skinned to other bones than ${skinned[0].name}`)
        if (m.skeleton.boneInverses.some((x, i) => !x.equals(skeleton.boneInverses[i]))) throw new Error(`crowd3d body ${name}: mesh ${m.name} is bound otherwise than ${skinned[0].name}`)
      }
      return { name, model, root, skinned, skeleton }
    })
    // The one skeleton, the first body's.
    const first = rigs[0]
    bones = first.skeleton.bones.map(b => b.name)
    for (const r of rigs) {
      const theirs = r.skeleton.bones.map(b => b.name)
      const k = Math.max(theirs.length, bones.length)
      for (let i = 0; i < k; i++) if (theirs[i] !== bones[i]) throw new Error(`crowd3d body ${r.name}: bone ${i} is ${theirs[i] ?? 'missing'} where ${first.name} has ${bones[i] ?? 'none'}`)
    }
    parents = first.skeleton.bones.map(b => first.skeleton.bones.indexOf(b.parent as THREE.Bone))
    if (parents[0] !== -1 || parents.slice(1).some(p => p < 0)) throw new Error(`crowd3d body ${first.name}: its first bone is not the one root of its skeleton`)
    const B = bones.length
    // Each body's rests and its armature.
    const rests = rigs.map(r => {
      const hips = r.skeleton.bones[0]
      return {
        q: r.skeleton.bones.map(b => b.quaternion.clone()),
        p: r.skeleton.bones.map(b => b.position.clone()),
        up: new T.Vector3(0, 1, 0).applyQuaternion(hips.parent!.getWorldQuaternion(new T.Quaternion()).invert()).normalize(),
        scale: hips.parent!.getWorldScale(new T.Vector3()).x,
        armature: hips.parent!.matrixWorld.clone(),
      }
    })
    inverses = rigs.map(r => r.skeleton.boneInverses.map(m => m.clone()))
    // The bone of each place the skeleton has, and each item's places, each a place whose bone it has.
    boneOf.clear()
    for (const [place, bone] of Object.entries(PLACES)) {
      const j = bones.findIndex(b => mixamo(b) === bone)
      if (j >= 0) boneOf.set(place, j)
    }
    for (const [name, item] of Object.entries(n.items ?? {})) {
      for (const place of Object.keys(item)) {
        if (place === 'model') continue
        if (!(place in PLACES)) throw new Error(`crowd3d item ${name}: ${place} is no place: ${Object.keys(PLACES).join(', ')}`)
        if (!boneOf.has(place)) throw new Error(`crowd3d item ${name}: its place ${place} is the bone ${PLACES[place]}, which ${first.name}'s skeleton has not got`)
      }
    }

    // The bake, on the first body.
    const ref = rests[0]
    const hips = first.skeleton.bones[0]
    const across = (v: THREE.Vector3) => v.clone().sub(ref.up.clone().multiplyScalar(v.dot(ref.up)))
    const mixer = new T.AnimationMixer(first.root)
    const actions = n.clips.map(c => {
      const clip = first.model.animations.find(a => a.name === c)
      if (!clip) throw new Error(`crowd3d body ${first.name} has no clip ${c}: its glb has ${first.model.animations.map(a => a.name).join(', ')}`)
      return clip
    })
    const frames = actions.map(c => Math.max(1, Math.round(c.duration * n.rate)))
    const height = frames.reduce((a, f) => a + f + 1, 0)
    const W = B + 1
    const bake = new Float32Array(W * height * 4)
    // The action evaluated at exactly `t`: a step of 0 takes its time as set, never wrapped.
    const at = (action: THREE.AnimationAction, t: number) => {
      action.time = t
      mixer.update(0)
      return hips.position.clone()
    }
    const inv = ref.q.map(q => q.clone().invert())
    const turn = new T.Quaternion()
    clips = new Map()
    travels = new Map()
    let row = 0
    actions.forEach((clip, ci) => {
      const action = mixer.clipAction(clip)
      action.play()
      const N = frames[ci], dur = clip.duration
      const p0 = at(action, 0), p1 = at(action, dur)
      travels.set(clip.name, across(p1.clone().sub(p0)).length() / dur)
      for (let f = 0; f <= N; f++) {
        const t = (f / N) * dur
        const p = at(action, t)
        const steady = p0.clone().add(p1.clone().sub(p0).multiplyScalar(t / dur))
        const flat = across(ref.p[0].clone().add(p.clone().sub(steady))).add(ref.up.clone().multiplyScalar(p.dot(ref.up)))
        const o = (row + f) * W * 4
        first.skeleton.bones.forEach((b, j) => turn.copy(inv[j]).multiply(b.quaternion).toArray(bake, o + j * 4))
        flat.sub(ref.p[0]).toArray(bake, o + B * 4)
      }
      clips.set(clip.name, { row, frames: N, dur })
      row += N + 1
      action.stop()
    })
    mixer.stopAllAction()
    mixer.uncacheRoot(first.root)
    for (let j = 0; j < B; j++) {
      first.skeleton.bones[j].quaternion.copy(ref.q[j])
      first.skeleton.bones[j].position.copy(ref.p[j])
    }
    clipsTexture = data(T, bake, W, height)

    // The bodies' texture.
    const BW = HEAD + B * BONE
    const table = new Float32Array(BW * rigs.length * 4)
    rigs.forEach((r, bi) => {
      const rest = rests[bi], o = bi * BW * 4
      table.set(rest.armature.elements, o)
      for (let j = 0; j < B; j++) {
        const at = o + (HEAD + j * BONE) * 4
        rest.q[j].toArray(table, at)
        rest.p[j].toArray(table, at + 4)
        table.set(r.skeleton.boneInverses[j].elements, at + 8)
      }
    })
    bodiesTexture = data(T, table, BW, rigs.length)

    // The pass.
    target = new T.WebGLRenderTarget(B * 4, size, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false })
    target.scissorTest = true
    pose.value = target.texture
    const triangle = new T.BufferGeometry()
    triangle.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const material = new T.ShaderMaterial({
      glslVersion: T.GLSL3,
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: posing(parents),
      uniforms: { crowdPeople: { value: people }, crowdOrder: { value: order }, crowdBodies: { value: bodiesTexture }, crowdClips: { value: clipsTexture }, crowdTime: time },
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new T.Mesh(triangle, material)
    mesh.frustumCulled = false
    const passScene = new T.Scene()
    passScene.add(mesh)
    pass = { scene: passScene, camera: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), mesh }

    // A mesh group: one mesh of `geometry`, its material a clone of `material`, it and its shadow's
    // dressed with `surface`, drawn as many times as its geometry's instance count.
    const group = (name: string, geometry: THREE.InstancedBufferGeometry, material: THREE.Material, surface: () => unknown): Group => {
      const mesh = new T.Mesh(geometry, render3d.dress(material.clone(), { surface: surface() }))
      mesh.name = name
      mesh.customDepthMaterial = render3d.dress(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), { surface: surface() })
      mesh.customDistanceMaterial = render3d.dress(new T.MeshDistanceMaterial(), { surface: surface() })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      scene!.add(mesh)
      return { mesh }
    }
    const keyOf = (m: THREE.Mesh) => `${(m.material as THREE.Material).uuid}|${Object.keys(m.geometry.attributes).sort().join(',')}`
    const sorted = <M extends THREE.Mesh>(meshes: M[]) => {
      const sets = new Map<string, M[]>()
      for (const m of meshes) sets.set(keyOf(m), [...(sets.get(keyOf(m)) ?? []), m])
      return [...sets.values()]
    }

    // The mesh groups: each mesh's vertices through its bind matrix, merged by material and attributes.
    rigs.forEach((r, bi) => {
      const body: Body = { index: bi, groups: [], start: { value: 0 }, count: 0, scale: rests[bi].scale }
      for (const meshes of sorted(r.skinned)) {
        body.groups.push(group(`crowd3d ${r.name} ${meshes[0].name}`, merged(T, meshes), meshes[0].material as THREE.Material, () => skinning(pose, body.start)))
      }
      bodies.set(r.name, body)
    })

    // The items: each mesh's vertices through where it stands in its glb, merged by material and
    // attributes, and a held texture with room for every place it lists on every person of the pool.
    for (const [name, item] of Object.entries(n.items ?? {})) {
      const root = stocked.get(name)!.scene
      root.updateMatrixWorld(true)
      const meshes: THREE.Mesh[] = []
      root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
      if (!meshes.length) throw new Error(`crowd3d item ${name}: its model has no mesh`)
      const room = size * Object.keys(item).filter(k => k !== 'model').length
      const held = { value: data(T, new Float32Array(Math.ceil((room * HELD) / WIDE) * WIDE * 4), WIDE, Math.ceil((room * HELD) / WIDE)) }
      const ware: Ware = { groups: [], held, count: 0, room }
      for (const set of sorted(meshes)) {
        ware.groups.push(group(`crowd3d item ${name} ${set[0].name}`, solid(T, root, set), set[0].material as THREE.Material, () => holding(pose, held)))
      }
      wares.set(name, ware)
    }
    reorder = true
  }

  const me = {
    tick(plugins: Plugins) {
      wire = plugins.wire
      const world = plugins.wire.scene.world
      numbers = world?.crowd3d as Numbers | undefined
      if (!numbers) throw new Error('the scene names crowd3d but its world has no crowd3d')
      if (!started) {
        const listing = listed(plugins.wire.scene)
        if (listing.indexOf('loader') < 0 || listing.indexOf('loader') > listing.indexOf('crowd3d')) throw new Error('crowd3d is listed before the loader, whose models it asks for in its tick')
        if (!plugins.render3d) throw new Error('crowd3d needs render3d, which this scene does not name')
        size = numbers.poolSize ?? POOL
        if (!Number.isInteger(size) || size < 1) throw new Error(`crowd3d's poolSize ${size} is not a whole number above 0`)
        started = true
        three = plugins.render3d.THREE
        scene = plugins.render3d.scene
        const T = three!
        // The pool and its order, before any body lands.
        const rows = Math.ceil((size * PER) / WIDE)
        people = data(T, new Float32Array(rows * WIDE * 4), WIDE, rows)
        slotted = new T.DataTexture(people.image.data, WIDE, rows, T.RGBAFormat, T.FloatType)
        order = new T.DataTexture(new Float32Array(Math.ceil(size / WIDE) * WIDE), WIDE, Math.ceil(size / WIDE), T.RedFormat, T.FloatType)
        order.needsUpdate = true
        const render3d = plugins.render3d
        const loader = plugins.loader
        // A start closed before its models landed builds nothing when they do. Every body and item
        // built once the last of their models lands.
        const mine = ++starts
        landed.clear()
        stocked.clear()
        const bodyNames = Object.entries(numbers.bodies), itemNames = Object.entries(numbers.items ?? {})
        const done = () => landed.size === bodyNames.length && stocked.size === itemNames.length
        for (const [name, model] of bodyNames) loader.on(model, () => {
          if (mine !== starts || !started) return
          landed.set(name, loader.model(model))
          if (done()) build(render3d)
        })
        for (const [name, item] of itemNames) loader.on(item.model, () => {
          if (mine !== starts || !started) return
          stocked.set(name, loader.model(item.model))
          if (done()) build(render3d)
        })
      }
      if (bodies.size) fill(plugins.wire.rows, clock(plugins.wire))
    },
    afterTick(plugins: Plugins) {
      const renderer: THREE.WebGLRenderer | undefined = plugins.render3d.renderer
      if (!renderer || !bodies.size || !wire) return
      if (size > renderer.capabilities.maxTextureSize) throw new Error(`crowd3d's pool of ${size} is more rows than this GPU's textures hold, ${renderer.capabilities.maxTextureSize}`)
      time.value = clock(wire)
      // Each slot written since the last frame, sent by itself: WIDE is a whole number of slots, so each
      // sits in one row.
      const T = three!
      const region = new T.Box2(), into = new T.Vector2()
      for (const s of sending) {
        const x = (s * PER) % WIDE, y = Math.floor((s * PER) / WIDE)
        region.min.set(x, y)
        region.max.set(x + PER, y + 1)
        into.set(x, y)
        renderer.copyTextureToTexture(slotted!, people!, region, into)
      }
      sending.clear()
      if (!used) return
      target!.viewport.set(0, 0, bones.length * 4, used)
      target!.scissor.set(0, 0, bones.length * 4, used)
      const was = renderer.getRenderTarget()
      renderer.setRenderTarget(target!)
      renderer.render(pass!.scene, pass!.camera)
      renderer.setRenderTarget(was)
    },
    ready() { return !!numbers && bodies.size === Object.keys(numbers.bodies).length && wares.size === Object.keys(numbers.items ?? {}).length },
    travel(body: string, clip: string) {
      const b = bodies.get(body)
      if (!b) throw new Error(`crowd3d has not baked ${body}`)
      const v = travels.get(clip)
      if (v === undefined) throw new Error(`crowd3d has no clip ${clip}`)
      return v * b.scale
    },
    counts() {
      return Object.fromEntries([...bodies].map(([name, b]) => [name, { copies: b.count, groups: b.groups.length }]))
    },
    items() {
      return Object.fromEntries([...wares].map(([name, w]) => [name, { copies: w.count, groups: w.groups.length }]))
    },
    pool() {
      return { size, used, writes: written }
    },
    pose(body: string, clip: string, t: number, from?: { clip: string; t: number; share: number }) {
      const b = bodies.get(body)
      if (!b) throw new Error(`crowd3d has not baked ${body}`)
      const T = three!
      const B = bones.length, W = B + 1
      const bake = clipsTexture!.image.data as Float32Array, table = bodiesTexture!.image.data as Float32Array
      // Where a clip or pose stands at `t`: its two baked rows either side, as texel offsets, and how far
      // between them.
      const placed = (name: string, t: number) => {
        const { clip: c, how, at } = playOf(name)
        const s = how === POSE ? at : how === HOLD ? Math.min(Math.max(t, 0), c.dur) : ((t % c.dur) + c.dur) % c.dur
        const u = (s / c.dur) * c.frames
        const f = Math.min(Math.floor(u), c.frames - 1)
        const r0 = (c.row + f) * W * 4
        return { r0, r1: r0 + W * 4, a: u - f }
      }
      const now = placed(clip, t), then = from ? placed(from.clip, from.t) : undefined
      const share = from ? 1 - from.share : 1
      const turnAt = (c: { r0: number; r1: number; a: number }, j: number) => {
        const q0 = new T.Quaternion().fromArray(bake, c.r0 + j * 4), q1 = new T.Quaternion().fromArray(bake, c.r1 + j * 4)
        if (q0.dot(q1) < 0) q1.set(-q1.x, -q1.y, -q1.z, -q1.w)
        return new T.Quaternion(q0.x + (q1.x - q0.x) * c.a, q0.y + (q1.y - q0.y) * c.a, q0.z + (q1.z - q0.z) * c.a, q0.w + (q1.w - q0.w) * c.a).normalize()
      }
      const offsetAt = (c: { r0: number; r1: number; a: number }) => [0, 1, 2].map(k => bake[c.r0 + B * 4 + k] + (bake[c.r1 + B * 4 + k] - bake[c.r0 + B * 4 + k]) * c.a)
      const o = b.index * (HEAD + B * BONE) * 4
      const own = (x: number, k: number) => table[o + x * 4 + k]
      const rest = new T.Quaternion(), p = new T.Vector3()
      const world: THREE.Matrix4[] = []
      const chain = (j: number): THREE.Matrix4 => {
        if (world[j]) return world[j]
        let q = turnAt(now, j)
        if (then && share < 1) {
          const qf = turnAt(then, j)
          if (qf.dot(q) < 0) qf.set(-qf.x, -qf.y, -qf.z, -qf.w)
          q = new T.Quaternion(qf.x + (q.x - qf.x) * share, qf.y + (q.y - qf.y) * share, qf.z + (q.z - qf.z) * share, qf.w + (q.w - qf.w) * share).normalize()
        }
        const x = HEAD + j * BONE
        rest.set(own(x, 0), own(x, 1), own(x, 2), own(x, 3))
        p.set(own(x + 1, 0), own(x + 1, 1), own(x + 1, 2))
        if (j === 0) {
          const hn = offsetAt(now), hf = then && share < 1 ? offsetAt(then) : hn
          for (let k = 0; k < 3; k++) p.setComponent(k, p.getComponent(k) + hf[k] + (hn[k] - hf[k]) * share)
        }
        const local = new T.Matrix4().compose(p, rest.clone().multiply(q), new T.Vector3(1, 1, 1))
        world[j] = parents[j] < 0 ? local : chain(parents[j]).clone().multiply(local)
        return world[j]
      }
      const armature = new T.Matrix4().fromArray(table, o)
      return {
        bones,
        matrices: bones.map((_, j) => {
          const inverse = new T.Matrix4().fromArray(table, o + (HEAD + j * BONE + 2) * 4)
          return armature.clone().multiply(chain(j)).multiply(inverse).toArray()
        }),
      }
    },
    holds(body: string, clip: string, t: number, item: string, place: string) {
      const b = bodies.get(body)
      if (!b) throw new Error(`crowd3d has not baked ${body}`)
      if (!numbers!.items?.[item]?.[place]) throw new Error(`crowd3d has no item ${item} on ${place}`)
      const T = three!
      const skin = new T.Matrix4().fromArray(me.pose(body, clip, t).matrices[boneOf.get(place)!])
      return skin.multiply(offsetOf(b, item, place)).toArray()
    },
    close() {
      for (const g of [...bodies.values(), ...wares.values()].flatMap(b => b.groups)) {
        scene?.remove(g.mesh)
        g.mesh.geometry.dispose()
        g.mesh.material.dispose()
        g.mesh.customDepthMaterial?.dispose()
        g.mesh.customDistanceMaterial?.dispose()
      }
      for (const w of wares.values()) w.held.value.dispose()
      bodies.clear()
      wares.clear()
      landed.clear()
      stocked.clear()
      offsets.clear()
      rowOf.clear()
      for (const t of [people, order, bodiesTexture, clipsTexture]) t?.dispose()
      target?.dispose()
      pass?.mesh.geometry.dispose()
      pass?.mesh.material.dispose()
      people = slotted = order = bodiesTexture = clipsTexture = undefined
      target = undefined
      pass = undefined
      slots.clear()
      free.length = 0
      next = 0
      used = 0
      sending.clear()
      scene = undefined
      // The next tick makes the pool and bakes everything again, from the scene's numbers as they then are.
      started = false
    },
  }
  return me
}

// A float texture of `data`, `width` by `height` texels, read texel by texel.
function data(T: Three, values: Float32Array, width: number, height: number) {
  const texture = new T.DataTexture(values, width, height, T.RGBAFormat, T.FloatType)
  texture.needsUpdate = true
  return texture
}

// An item's meshes' geometries as one: each vertex through where its mesh stands under `root`, its
// normal and tangent turned with it, its uv kept.
function solid(T: Three, root: THREE.Object3D, meshes: THREE.Mesh[]) {
  const total = meshes.reduce((a, m) => a + m.geometry.attributes.position.count, 0)
  const has = (k: string) => k in meshes[0].geometry.attributes
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3)
  const uv = has('uv') ? new Float32Array(total * 2) : undefined
  const tangent = has('tangent') ? new Float32Array(total * 4) : undefined
  const index: number[] = []
  const v = new T.Vector3(), nm = new T.Matrix3()
  const under = root.matrixWorld.clone().invert()
  let at = 0
  for (const m of meshes) {
    const g = m.geometry, a = g.attributes
    const stands = under.clone().multiply(m.matrixWorld)
    nm.getNormalMatrix(stands)
    for (let i = 0; i < a.position.count; i++) {
      v.fromBufferAttribute(a.position as THREE.BufferAttribute, i).applyMatrix4(stands).toArray(position, (at + i) * 3)
      v.fromBufferAttribute(a.normal as THREE.BufferAttribute, i).applyMatrix3(nm).normalize().toArray(normal, (at + i) * 3)
      if (uv) { uv[(at + i) * 2] = a.uv.getX(i); uv[(at + i) * 2 + 1] = a.uv.getY(i) }
      if (tangent) {
        v.set(a.tangent.getX(i), a.tangent.getY(i), a.tangent.getZ(i)).transformDirection(stands).toArray(tangent, (at + i) * 4)
        tangent[(at + i) * 4 + 3] = a.tangent.getW(i)
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(at + g.index.getX(i))
    else for (let i = 0; i < a.position.count; i++) index.push(at + i)
    at += a.position.count
  }
  const out = new T.InstancedBufferGeometry()
  out.instanceCount = 0
  out.setAttribute('position', new T.BufferAttribute(position, 3))
  out.setAttribute('normal', new T.BufferAttribute(normal, 3))
  if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2))
  if (tangent) out.setAttribute('tangent', new T.BufferAttribute(tangent, 4))
  out.setIndex(total > 65535 ? new T.BufferAttribute(new Uint32Array(index), 1) : new T.BufferAttribute(new Uint16Array(index), 1))
  out.computeBoundingSphere()
  return out
}

// The meshes' geometries as one: each vertex through its mesh's bind matrix, its normal and tangent
// turned with it, its uv kept, its four bones and weights as `crowdBones` and `crowdWeights`.
function merged(T: Three, meshes: THREE.SkinnedMesh[]) {
  const total = meshes.reduce((a, m) => a + m.geometry.attributes.position.count, 0)
  const has = (k: string) => k in meshes[0].geometry.attributes
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3)
  const uv = has('uv') ? new Float32Array(total * 2) : undefined
  const tangent = has('tangent') ? new Float32Array(total * 4) : undefined
  const bones = new Uint16Array(total * 4), weights = new Float32Array(total * 4)
  const index: number[] = []
  const v = new T.Vector3(), nm = new T.Matrix3()
  let at = 0
  for (const m of meshes) {
    const g = m.geometry, a = g.attributes
    const bind = m.bindMatrix
    nm.getNormalMatrix(bind)
    for (let i = 0; i < a.position.count; i++) {
      v.fromBufferAttribute(a.position as THREE.BufferAttribute, i).applyMatrix4(bind).toArray(position, (at + i) * 3)
      v.fromBufferAttribute(a.normal as THREE.BufferAttribute, i).applyMatrix3(nm).normalize().toArray(normal, (at + i) * 3)
      if (uv) { uv[(at + i) * 2] = a.uv.getX(i); uv[(at + i) * 2 + 1] = a.uv.getY(i) }
      if (tangent) {
        v.set(a.tangent.getX(i), a.tangent.getY(i), a.tangent.getZ(i)).transformDirection(bind).toArray(tangent, (at + i) * 4)
        tangent[(at + i) * 4 + 3] = a.tangent.getW(i)
      }
      for (let k = 0; k < 4; k++) {
        bones[(at + i) * 4 + k] = a.skinIndex.getComponent(i, k)
        weights[(at + i) * 4 + k] = a.skinWeight.getComponent(i, k)
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(at + g.index.getX(i))
    else for (let i = 0; i < a.position.count; i++) index.push(at + i)
    at += a.position.count
  }
  const out = new T.InstancedBufferGeometry()
  out.instanceCount = 0
  out.setAttribute('position', new T.BufferAttribute(position, 3))
  out.setAttribute('normal', new T.BufferAttribute(normal, 3))
  if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2))
  if (tangent) out.setAttribute('tangent', new T.BufferAttribute(tangent, 4))
  out.setAttribute('crowdBones', new T.BufferAttribute(bones, 4))
  out.setAttribute('crowdWeights', new T.BufferAttribute(weights, 4))
  out.setIndex(total > 65535 ? new T.BufferAttribute(new Uint32Array(index), 1) : new T.BufferAttribute(new Uint16Array(index), 1))
  out.computeBoundingSphere()
  return out
}
