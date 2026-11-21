// The shaders of hair3d (`hair3d.plugin.ts`): what a lock and a strand are, as the keeper keeps them, the
// pass that moves every lock a frame on, and the strands drawn along them, spliced into a
// MeshStandardMaterial that render3d dresses, so the sky's fog, the weather, lights3d's lights and the
// shadows reach the hair as they reach everything else.
//
// The state. A hair on a skin keeps one float texture of its locks for every copy of the skin (`layout`
// of `hair3d.sim.ts`): the copies tiled `hCols` across, each `hWide` by `hHigh` texels; in a copy, lock s
// is at column s mod hWide, and its root and its LINKS links are one above the other from row
// (s / hWide)·(LINKS + 1). A texel is a point's place in the world. The root's fourth number is the
// skin's normal there, packed (`hPack`); a link's is 1, or 2 on the frame it was laid. A lock never moved
// is all 0.
//
// Kept. What a lock is that is the same every frame is a value of the spec hair3d hands the `keeper` mod
// (`lockSpec`; `plugins/gpgpu3d/gpgpu3d.keeper.ts`), worked out once for each lock and kept in a texture, a
// texel a lock, and so is what a strand is (`strandSpec`), a texel a strand. Each shader reads a value
// through the keeper's reading (`hValComb()`, `hsValTurn()`), whatever became of it. A lock's values
// (`LOCK`): what moves it (the group `move`, the pass's: whether it stands, its length, its comb, stiffness,
// gravity, damping and drag), what shapes its strands (`shape`, the shadows' too: the way of its own its
// strands are set off round, where its curl starts, its width, taper, clump, curl and raggedness) and its
// look (`look`: its own brightness, its colours, how far its strands' brightness strays, its shade at the
// root, its roughness, shine and translucency). Each is a number of the hairs file, a roll of the lock's
// own, and what the hair's program says at the lock's root on the skin as it was bound. With no program
// only the rolls are kept, and every number of the sheet is read as it is drawn. A strand's values
// (`STRAND`) are its own rolls: how far it falls short, where it sits in its clump, its width and its
// brightness.
//
// The hair's program of ops (`hair3d.sim.ts`, `program`) is compiled by the keeper, the still half into the
// keeping shader and the live into the pass and the strands. Each name it may give to `out` (`OUTS`,
// `hair3d.sim.ts`) has a function the keeper writes, `hOutLength()`, `hOutRootColour( base )`. The op `roll`
// reads the lock's own roll (`gpRollOf`); every shader sets `hLock` before the program is given the root.
//
// The pass (`moving`). Each texel works its lock out from the root to its own link, and writes its own
// point. The root is the skin as its bones hold it now: its place as the skin was bound through the four
// bones' matrices, then into the world. A bone's matrix is four texels of `boneTexture`: in three's own
// texture of one skeleton (`hFirst` −1) bone j's start at texel 4j counted along its rows; else at column
// 4j of the copy's row, `hFirst` plus the copy. A lock that does not stand is left unmoved. A lock is laid,
// every link put where it lies with nothing on it, when it was never moved or its root is more than `hJump`
// metres from where it was the frame before (a body put somewhere new, a copy handed to another body).
// Otherwise each link, in turn from the root: where it was, moved on by the speed it had (its place now less
// its place the frame before, none on the frame after it was laid), by gravity, by the wind as it gusts
// there, damped; pulled toward the way the lock lies with nothing on it (a link's length on from the link
// before, along the skin's normal with the comb added, turned by the bones; a comb that points into the skin
// is lifted to LIFT of its length out of it, so the lock lies along it); kept above the skin under its root
// (the first link only), and out of everything the `solids` mod holds (a body's capsules and balls, carried
// by its bones, among them); then put a link's length from the link before. So a lock keeps its length
// whatever pulls on it, and swings as its root is carried.
//
// The strands (`strand`). A strand is made whole in the vertex shader from its instance's number and
// nothing else: its copy (the number over the strands of a copy), its lock and its number in the lock. It
// runs along the Catmull-Rom curve through its lock's points, set off from it within the clump's radius,
// closing toward the tip, wound round it by the curl, falling short of the lock's length by its own share
// of `ragged`; it is a ribbon turned to face the eye, tapering to its tip, never thinner than `thin` of
// its distance. The geometry of a strand of S segments is 2S + 1 vertices, `position` (side, t, 0): side
// −1 or 1 across it and 0 at its tip, t from 0 at its root to 1 at its tip. A strand of a lock never
// moved is drawn as a point: every vertex at one place, so no triangle of it covers a pixel.
//
// The light. The strand's normal is the skin's under its lock, so the coat is lit as the body it grows
// on is, side by side. The standard material's direct light is taken over (`RE_Direct`): each light's own
// light, shadowed as the material shadows it, adds a highlight across the strands (Kajiya and Kay's, from
// the strand's tangent, the light and the eye) and the light that comes through hair lit from behind.
import type { Program } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Spec, Value } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'
import { OUTS } from './hair3d.sim.ts'

// The skin's normal as one number, and back: its octahedral map, each axis in 4096 steps.
const packing = /* glsl */ `
vec2 hSign( vec2 v ) { return vec2( v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0 ); }
float hPack( vec3 n ) {
  vec2 o = n.xy / ( abs( n.x ) + abs( n.y ) + abs( n.z ) );
  if ( n.z < 0.0 ) o = ( 1.0 - abs( o.yx ) ) * hSign( o );
  vec2 q = floor( ( o * 0.5 + 0.5 ) * 4095.0 + 0.5 );
  return q.x * 4096.0 + q.y + 1.0;
}
vec3 hUnpack( float w ) {
  float v = w - 1.0;
  float a = floor( v / 4096.0 );
  vec2 o = vec2( a, v - a * 4096.0 ) / 4095.0 * 2.0 - 1.0;
  vec3 n = vec3( o, 1.0 - abs( o.x ) - abs( o.y ) );
  if ( n.z < 0.0 ) n.xy = ( 1.0 - abs( n.yx ) ) * hSign( n.xy );
  return normalize( n );
}
`

// The `meet` of a scene that names no `solids` mod: a lock meets nothing.
export const NOTHING = /* glsl */ `
int hMeetCount() { return 0; }
bool hMeetOf( int i, vec3 x, vec3 was, out vec3 normal, out float depth ) { return false; }
`

// The numbers of a hair every shader reads: where its locks are rooted, a lock a texel, \`hWide\` across,
// and the hairs file's numbers of it.
const SHEET = /* glsl */ `
uniform highp sampler2D hAt;
uniform int hWide;
uniform int hSeed;
uniform int hStrands;
uniform vec3 hComb;
uniform vec2 hStiff;
uniform float hGravity;
uniform float hDamping;
uniform float hDrag;
uniform vec2 hWidth;
uniform float hTaper;
uniform vec2 hClump;
uniform vec2 hCurl;
uniform float hRagged;
uniform vec3 hRootColour;
uniform vec3 hTipColour;
uniform float hVary;
uniform float hAo;
uniform vec2 hShine;
uniform float hTranslucency;
`

// The rolls, and the lock and strand being made: the lock's number, the strand's number in it (−1 for the
// lock itself) and the lock's length; and the lock's own random number for a program's \`roll\`: a salt is
// added to 100, so none is one of the rolls a lock makes for itself.
const ROLLS = /* glsl */ `
uint hMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
// A roll from 0 to 1 of a lock, a strand's number in it and a salt.
float hRoll( int lock, int i, int salt ) {
  uint h = hMix( uint( lock ) * 0x9e3779b1u ^ hMix( uint( i ) * 0x85ebca77u ^ uint( salt + hSeed * 97 ) * 0x27d4eb2fu ) );
  return float( h >> 8u ) / 16777216.0;
}
int hLock;
int hNth;
float hLong;
float gpRollOf( int salt ) { return hRoll( hLock, -1, 100 + salt ); }
`

// What of a lock reads the outs' functions, for every shader.
const HELPERS = /* glsl */ `
// A way of the lock's own, which its strands are set off round.
vec3 hOwnOf() {
  float az = 6.2831853 * hRoll( hLock, -1, 2 ), el = 2.0 * hRoll( hLock, -1, 3 ) - 1.0;
  return vec3( sqrt( 1.0 - el * el ) * cos( az ), el, sqrt( 1.0 - el * el ) * sin( az ) );
}
// How far its brightness, and its strands', strays from 1.
float hVaryOf() { return clamp( hVary * hOutVary(), 0.0, 1.0 ); }
`

// The values of a lock (Kept), each read with `hLock` and `hLong` set.
const LOCK: Value[] = [
  { name: 'stand', size: 1, outs: ['cover'], own: false, group: 'move', gate: true, glsl: '( hRoll( hLock, -1, 12 ) < hOutCover() ? 1.0 : 0.0 )', plain: '1.0' },
  { name: 'long', size: 1, outs: ['length'], own: false, group: 'move', glsl: 'hLong * hOutLength()' },
  { name: 'comb', size: 3, outs: ['combX', 'combY', 'combZ'], own: false, group: 'move', glsl: 'hComb + vec3( hOutCombX(), hOutCombY(), hOutCombZ() )', plain: 'hComb' },
  { name: 'stiff', size: 2, outs: ['stiffnessRoot', 'stiffnessTip'], own: false, group: 'move', glsl: 'hStiff * vec2( hOutStiffnessRoot(), hOutStiffnessTip() )' },
  { name: 'gravity', size: 1, outs: ['gravity'], own: false, group: 'move', glsl: 'hGravity * hOutGravity()' },
  { name: 'damping', size: 1, outs: ['damping'], own: false, group: 'move', glsl: 'hDamping * hOutDamping()' },
  { name: 'drag', size: 1, outs: ['drag'], own: false, group: 'move', glsl: 'hDrag * hOutDrag()' },
  { name: 'own', size: 3, outs: [], own: true, half: true, group: 'shape', glsl: 'hOwnOf()' },
  { name: 'phase', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: 'hRoll( hLock, -1, 6 )' },
  { name: 'wide', size: 1, outs: ['width'], own: false, half: true, group: 'shape', glsl: 'hWidth.x * hOutWidth()' },
  { name: 'taper', size: 1, outs: ['taper'], own: false, half: true, group: 'shape', glsl: 'clamp( hTaper * hOutTaper(), 0.0, 1.0 )' },
  { name: 'clump', size: 2, outs: ['clumpRadius', 'clumpTight'], own: false, half: true, group: 'shape', glsl: 'vec2( hClump.x * hOutClumpRadius(), clamp( hClump.y * hOutClumpTight(), 0.0, 1.0 ) )' },
  { name: 'curl', size: 2, outs: ['curlRadius', 'curlTurns'], own: false, half: true, group: 'shape', glsl: 'hCurl * vec2( hOutCurlRadius(), hOutCurlTurns() )' },
  { name: 'ragged', size: 1, outs: ['ragged'], own: false, half: true, group: 'shape', glsl: 'clamp( hRagged * hOutRagged(), 0.0, 1.0 )' },
  { name: 'bright', size: 1, outs: ['vary'], own: true, half: true, group: 'look', glsl: '( 1.0 + hVaryOf() * ( 2.0 * hRoll( hLock, -1, 8 ) - 1.0 ) )' },
  { name: 'vary', size: 1, outs: ['vary'], own: false, half: true, group: 'look', glsl: 'hVaryOf()' },
  { name: 'rootC', size: 3, outs: ['rootColour'], own: false, half: true, group: 'look', glsl: 'hOutRootColour( hRootColour )' },
  { name: 'tipC', size: 3, outs: ['tipColour'], own: false, half: true, group: 'look', glsl: 'hOutTipColour( hTipColour )' },
  { name: 'shade', size: 1, outs: ['ao'], own: false, half: true, group: 'look', glsl: 'clamp( hAo * hOutAo(), 0.0, 1.0 )' },
  { name: 'rough', size: 1, outs: ['roughness'], own: false, half: true, group: 'look', glsl: 'hOutRoughness()' },
  { name: 'shine', size: 2, outs: ['shineStrength', 'shinePower'], own: false, half: true, group: 'look', glsl: 'hShine * vec2( hOutShineStrength(), hOutShinePower() )' },
  { name: 'trans', size: 1, outs: ['translucency'], own: false, half: true, group: 'look', glsl: 'hTranslucency * hOutTranslucency()' },
]
// The values of a strand, each read with `hLock` and `hNth` set: its own rolls.
const STRAND: Value[] = [
  { name: 'short', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: 'hRoll( hLock, hNth, 1 )' },
  { name: 'turn', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: '6.2831853 * hRoll( hLock, hNth, 4 )' },
  { name: 'spread', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: 'sqrt( hRoll( hLock, hNth, 5 ) )' },
  { name: 'wide', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: 'hRoll( hLock, hNth, 7 )' },
  { name: 'bright', size: 1, outs: [], own: true, half: true, group: 'look', glsl: '( 2.0 * hRoll( hLock, hNth, 9 ) - 1.0 )' },
]

// The names of `OUTS` that are added to their field, 0 where the program gives none, and those a number
// below 0 turns over.
const ADDED = ['combX', 'combY', 'combZ']
const SIGNED = ['gravity', 'curlTurns']

// The spec of one hair's locks for the keeper: `what` the hair as a sentence names it, `program` its
// program, if it has one. Its one slot holds every lock, lock i the texel the roots hold it in; a texel past
// the locks keeps nothing.
export const lockSpec = (what: string, program: Program | undefined): Spec => ({
  prefix: 'h', what, name: 'hair', program,
  outs: Object.fromEntries(Object.entries(OUTS).map(([out, kind]) => [out,
    kind === 'colour' ? { kind }
      : ADDED.includes(out) ? { kind, none: '0.0' }
        : SIGNED.includes(out) ? { kind }
          : out === 'cover' ? { kind, wrap: 'clamp( #, 0.0, 1.0 )' }
            : { kind, wrap: 'max( #, 0.0 )' }])),
  values: LOCK,
  helpers: HELPERS,
  keeping: {
    head: `${SHEET}\n${ROLLS}`,
    begin: /* glsl */ `
  vec4 at = texelFetch( hAt, ivec2( i - ( i / hWide ) * hWide, i / hWide ), 0 );
  if ( at.w <= 0.0 ) return;
  hLock = i;
  hNth = -1;
  hLong = at.w;
  point = at.xyz;`,
  },
})

// The spec of one hair's strands for the keeper: its one slot holds every strand of every lock, the strands
// of a lock one after the other.
export const strandSpec = (what: string): Spec => ({
  prefix: 'hs', what, name: 'hairstrand', outs: {}, values: STRAND,
  keeping: {
    head: `${SHEET}\n${ROLLS}`,
    begin: /* glsl */ `
  hLock = i / hStrands;
  hNth = i - hLock * hStrands;`,
  },
})

// The pass's fragment shader, for locks of `links` links. `meet` is the GLSL of what a lock is kept out
// of, the `solids` mod's or NOTHING: it defines
//   int hMeetCount()
// how many things there are, and
//   bool hMeetOf( int i, vec3 x, vec3 was, out vec3 normal, out float depth )
// whether the point `x`, which was at `was` a frame ago, is inside thing `i`: `normal` the way out and
// `depth` the metres along it `x` is to move to be out of it. `reading` is the keeper's reading of a lock's
// group `move`.
export const moving = (links: number, meet: string, reading: string, tied = false) => /* glsl */ `
precision highp float;
precision highp int;
#define LINKS ${links}
#define LIFT 0.15
${tied ? '#define TIED' : ''}
${SHEET}
uniform highp sampler2D hTies;
uniform highp sampler2D hTied;
uniform highp sampler2D hNormal;
uniform highp sampler2D hBones;
uniform highp sampler2D hWeights;
uniform highp sampler2D hNow;
uniform highp sampler2D hWas;
uniform highp sampler2D boneTexture;
uniform mat4 hBind;
uniform float hUnit;
uniform int hFirst;
uniform int hCopies;
uniform int hCols;
uniform int hHigh;
uniform float hJump;
uniform float hDt;
uniform float hDtWas;
uniform vec2 hWind;
uniform vec2 hDrift;
uniform vec3 hGust;
uniform float hTime;
layout( location = 0 ) out highp vec4 hMoved;
${meet}
${packing}
${ROLLS}
${reading}
mat4 hBone( float i, int row ) {
  int j = int( i ) * 4;
  ivec2 at = ivec2( j, row );
  if ( row < 0 ) {
    int size = textureSize( boneTexture, 0 ).x;
    at = ivec2( j % size, j / size );
  }
  return mat4( texelFetch( boneTexture, at, 0 ), texelFetch( boneTexture, at + ivec2( 1, 0 ), 0 ), texelFetch( boneTexture, at + ivec2( 2, 0 ), 0 ), texelFetch( boneTexture, at + ivec2( 3, 0 ), 0 ) );
}
#ifdef TIED
// The tie a lock is gathered to, as the lock reads it: the way across the hair and the way through it, the
// plait's strand, its swing and its pitch, and the bundle's own angle and radius, spread and flare, and how
// long the hanging part is.
vec3 hAcross, hDepth;
float hBraid, hPitch, hSlot, hAng, hRad, hSpread, hFlare, hFan, hBand;
// Where a lock is off the way the hair hangs, \`u\` metres past the tie: the bundle \`spread\` wide down to the
// band and opening out to \`flare\` from there to the end, and, with a plait, its strand's swing across and its
// turn over and under the others, let go past the band. A plait's three strands are one sway, a third of a
// turn apart: across, sin( t - 120° ), and over and under, sin( 2t - 60° ).
vec3 hOff( float u ) {
  vec3 o = ( hAcross * cos( hAng ) + hDepth * sin( hAng ) ) * hRad * mix( hSpread, hFlare, clamp( ( u - hBand ) / max( hFan - hBand, 1e-3 ), 0.0, 1.0 ) );
  if ( hBraid > 0.0 ) {
    float t = 6.2831853 * u / hPitch + 2.0943951 * hSlot;
    float held = hBand > 0.0 ? 1.0 - smoothstep( hBand, hBand + 0.03, u ) : 1.0;
    o += ( hAcross * ( hBraid * sin( t - 2.0943951 ) ) + hDepth * ( hBraid * 0.9 * sin( 2.0 * t - 1.0471976 ) ) ) * held;
  }
  return o;
}
#endif
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  ivec2 tile = ivec2( px.x / hWide, px.y / hHigh );
  int copy = tile.x + tile.y * hCols;
  if ( tile.x >= hCols || copy >= hCopies ) { hMoved = vec4( 0.0 ); return; }
  ivec2 origin = tile * ivec2( hWide, hHigh );
  ivec2 here = px - origin;
  int band = here.y / ( LINKS + 1 );
  int mine = here.y - band * ( LINKS + 1 );
  ivec2 lock = ivec2( here.x, band );
  vec4 at = texelFetch( hAt, lock, 0 );
  if ( at.w <= 0.0 ) { hMoved = vec4( 0.0 ); return; }

  // What was kept of the lock, and what its program says of it now.
  hLock = lock.y * hWide + lock.x;
  hNth = -1;
  hLong = at.w;
  hValOf( ivec2( 0 ), hLock );
  hValPoint( at.xyz );
  if ( hValStand() <= 0.0 ) { hMoved = vec4( 0.0 ); return; }

  int row = hFirst < 0 ? -1 : hFirst + copy;
  vec4 nr = texelFetch( hNormal, lock, 0 );
  vec4 bi = texelFetch( hBones, lock, 0 ), bw = texelFetch( hWeights, lock, 0 );
  mat4 skin = bw.x * hBone( bi.x, row ) + bw.y * hBone( bi.y, row ) + bw.z * hBone( bi.z, row ) + bw.w * hBone( bi.w, row );
  vec3 root = ( hBind * skin * vec4( at.xyz * hUnit, 1.0 ) ).xyz;
  mat3 turn = mat3( hBind ) * mat3( skin );
  vec3 n = normalize( turn * nr.xyz );
  ivec2 base = origin + ivec2( here.x, band * ( LINKS + 1 ) );
  vec4 rootWas = texelFetch( hNow, base, 0 );
  bool lay = rootWas.w <= 0.0 || distance( rootWas.xyz, root ) > hJump;
  if ( mine == 0 ) { hMoved = vec4( root, hPack( n ) ); return; }

  // The way it lies: the normal with the comb added, and where that points into the skin, lifted to
  // LIFT of its length out of it, so a lock combed across the skin lies along it.
  vec3 combed = nr.xyz + hValComb();
  float out_ = dot( combed, nr.xyz ), least = LIFT * length( combed );
  if ( out_ < least ) combed += nr.xyz * ( least - out_ );
  vec3 lies = normalize( turn * combed );
  float l = hValLong() / float( LINKS );
  vec2 stiff = hValStiff();
  float gravity = hValGravity(), damping = hValDamping(), drag = hValDrag();

#ifdef TIED
  // A lock gathered to a tie: the ties texture's row of its tie, whose bone carries the tie, the arc the
  // lock is laid along from its root to the tie round the centre the tie names, and how long each of its
  // links is, those before the tie and those after.
  vec4 tie = texelFetch( hTied, lock, 0 );
  bool gathered = tie.x > 0.5;
  int kk = 1;
  float la = 0.0, lb = 0.0, lifted = 0.0, rFrom = 0.0, rTo = 0.0, sweep = 0.0, gatherPull = 0.0, tailPull = 0.0;
  vec3 pin = root, centre = root, from = vec3( 1.0, 0.0, 0.0 ), spin = vec3( 0.0, 1.0, 0.0 ), tailDir = vec3( 0.0, -1.0, 0.0 );
  if ( gathered ) {
    int ti = int( tie.x + 0.5 ) - 1;
    vec4 t0 = texelFetch( hTies, ivec2( 0, ti ), 0 ), t1 = texelFetch( hTies, ivec2( 1, ti ), 0 );
    vec4 t2 = texelFetch( hTies, ivec2( 2, ti ), 0 ), t3 = texelFetch( hTies, ivec2( 3, ti ), 0 );
    vec4 t4 = texelFetch( hTies, ivec2( 4, ti ), 0 ), t5 = texelFetch( hTies, ivec2( 5, ti ), 0 );
    mat4 bone = hBone( t0.w, row );
    mat4 into = hBind * bone;
    mat3 rot = mat3( hBind ) * mat3( bone );
    vec3 tieAt = ( into * vec4( t0.xyz * hUnit, 1.0 ) ).xyz;
    centre = ( into * vec4( t1.xyz * hUnit, 1.0 ) ).xyz;
    lifted = t1.w;
    gatherPull = t4.z;
    tailPull = t4.w;
    vec3 outFrom = root - centre, outTo = tieAt - centre;
    rFrom = length( outFrom );
    rTo = length( outTo );
    from = outFrom / max( rFrom, 1e-5 );
    vec3 to = outTo / max( rTo, 1e-5 );
    sweep = acos( clamp( dot( from, to ), -1.0, 1.0 ) );
    spin = cross( from, to );
    if ( length( spin ) < 1e-3 ) spin = cross( from, rot * vec3( 0.0, 1.0, 0.0 ) );
    if ( length( spin ) < 1e-3 ) spin = cross( from, vec3( 1.0, 0.0, 0.0 ) );
    spin = normalize( spin );
    float arc = max( length( vec2( sweep * 0.5 * ( rFrom + rTo ), rTo - rFrom ) ), 1e-3 );
    float whole = max( hValLong(), 1e-3 );
    kk = clamp( int( float( LINKS ) * arc / whole + 0.5 ), 1, LINKS - 1 );
    la = arc / float( kk );
    lb = max( whole - arc, 0.04 ) / float( LINKS - kk );
    tailDir = normalize( mix( normalize( rot * t2.xyz ), vec3( 0.0, -1.0, 0.0 ), t2.w ) );
    vec3 side = rot * t3.xyz;
    hAcross = normalize( side - tailDir * dot( side, tailDir ) + vec3( 0.0, 0.0, 1e-6 ) );
    hDepth = cross( hAcross, tailDir );
    hPitch = t3.w;
    hSpread = t4.x;
    hFlare = t4.y;
    hBraid = t5.x;
    hBand = t5.y;
    hSlot = tie.y;
    hAng = 6.2831853 * tie.z;
    hRad = sqrt( tie.w );
    hFan = max( lb * float( LINKS - kk ), 1e-3 );
    pin = tieAt + hOff( 0.0 );
  }
#endif

  // The wind as it gusts at this lock.
  vec2 gp = ( root.xz - hDrift ) / hGust.x;
  float a = gp.x + 1.3 * gp.y + hTime * hGust.z;
  float g = 0.5 + 0.3 * sin( a ) + 0.2 * sin( 2.3 * a + 1.7 + 6.2831853 * nr.w );
  vec3 wind = vec3( hWind.x, 0.0, hWind.y ) * ( 1.0 - hGust.y + 2.0 * hGust.y * g );

  vec3 held = root;
  for ( int i = 1; i <= LINKS; i++ ) {
    if ( i > mine ) break;
    // Where this link lies with nothing on it, how long it is and how hard it is pulled there: along the
    // way the lock lies; or, in a lock gathered to a tie, along the arc to the tie, at the tie, and past it.
    vec3 goal = held + lies * l;
    float link = l, pull = mix( stiff.x, stiff.y, float( i ) / float( LINKS ) );
    bool pinned = false;
    vec3 way0 = lies;
#ifdef TIED
    if ( gathered ) {
      if ( i < kk ) {
        float s = float( i ) / float( kk );
        float th = sweep * s;
        vec3 dir = from * cos( th ) + cross( spin, from ) * sin( th );
        goal = centre + dir * ( mix( rFrom, rTo, s ) + lifted * sin( 3.14159265 * s ) );
        link = la;
        pull = gatherPull;
      } else if ( i == kk ) {
        goal = pin;
        pinned = true;
      } else {
        float u = float( i - kk ) * lb;
        goal = held + tailDir * lb + hOff( u ) - hOff( u - lb );
        link = lb;
        pull = tailPull;
      }
      way0 = tailDir;
    }
#endif
    vec3 next = goal;
    if ( !lay && !pinned ) {
      ivec2 p = base + ivec2( 0, i );
      vec4 now = texelFetch( hNow, p, 0 );
      vec3 x = now.xyz, was = now.w > 1.5 ? now.xyz : texelFetch( hWas, p, 0 ).xyz;
      vec3 v = ( x - was ) / hDtWas;
      v += ( vec3( 0.0, - gravity, 0.0 ) + drag * ( wind - v ) ) * hDt;
      v *= exp( - damping * hDt );
      next = x + v * hDt;
      next = mix( next, goal, 1.0 - exp( - pull * hDt ) );
      if ( i == 1 ) {
        float under = dot( next - root, n );
        if ( under < 0.0 ) next -= n * under;
      }
      int met = hMeetCount();
      for ( int k = 0; k < met; k++ ) {
        vec3 way;
        float depth;
        if ( hMeetOf( k, next, x, way, depth ) ) next += way * depth;
      }
      vec3 d = next - held;
      float far = length( d );
      next = held + ( far > 1e-6 ? d / far : way0 ) * link;
    }
    held = next;
  }
  hMoved = vec4( held, lay ? 2.0 : 1.0 );
}
`

// Declarations and the strand, for the main material and for the shadows' materials alike. `locks` and
// `strands` are the keeper's readings of a lock and of a strand for this shader (the groups `shape` and
// `look` for the main material, `shape` for a shadow's), and `shadow` whether this is a shadow's shader,
// which makes no colour.
export const strand = (links: number, locks: string, strands: string, shadow: boolean) => /* glsl */ `
#define LINKS ${links}
${SHEET}
uniform highp sampler2D hState;
uniform int hHigh;
uniform int hCols;
uniform int hLocks;
uniform float hThin;
varying vec3 vHairColour;
varying float vHairT;
varying vec3 vHairTangent;
varying float vHairRough;
varying vec2 vHairShine;
varying float vHairTrans;
${packing}
${ROLLS}
${locks}
${strands}
vec4 hPoint( ivec2 base, int k ) {
  return texelFetch( hState, base + ivec2( 0, clamp( k, 0, LINKS ) ), 0 );
}

vec3 hPos;
vec3 hNrm;
bool hMade = false;

void hStrand() {
  if ( hMade ) return;
  hMade = true;
  float side = position.x;
  vHairT = position.y;
  vHairColour = vec3( 0.0 );
  vHairTangent = vec3( 0.0, 1.0, 0.0 );
  vHairRough = 1.0;
  vHairShine = vec2( 0.0, 1.0 );
  vHairTrans = 0.0;
  hNrm = vec3( 0.0, 1.0, 0.0 );
  hPos = vec3( cameraPosition.x, -1e6, cameraPosition.z );
  int per = hLocks * hStrands;
  int copy = gl_InstanceID / per;
  int id = gl_InstanceID - copy * per;
  int s = id / hStrands;
  int c = id - s * hStrands;
  ivec2 lock = ivec2( s - ( s / hWide ) * hWide, s / hWide );
  ivec2 base = ivec2( copy - ( copy / hCols ) * hCols, copy / hCols ) * ivec2( hWide, hHigh ) + ivec2( lock.x, lock.y * ( LINKS + 1 ) );
  vec4 root = hPoint( base, 0 );
  vec4 at = texelFetch( hAt, lock, 0 );
  if ( root.w <= 0.0 || at.w <= 0.0 ) return;

  // What was kept of the lock and of the strand.
  hLock = s;
  hNth = c;
  hLong = at.w;
  hValOf( ivec2( 0 ), s );
  hValPoint( at.xyz );
  hsValOf( ivec2( 0 ), id );

  // Along the curve through the lock's points, this strand falling short by its own share.
  float t = position.y * ( 1.0 - hValRagged() * hsValShort() );
  float f = t * float( LINKS );
  int k = min( int( floor( f ) ), LINKS - 1 );
  float u = f - float( k );
  vec3 p0 = hPoint( base, k - 1 ).xyz, p1 = hPoint( base, k ).xyz, p2 = hPoint( base, k + 1 ).xyz, p3 = hPoint( base, k + 2 ).xyz;
  vec3 a1 = p2 - p0, a2 = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3, a3 = 3.0 * ( p1 - p2 ) + p3 - p0;
  vec3 on = 0.5 * ( 2.0 * p1 + a1 * u + a2 * u * u + a3 * u * u * u );
  vec3 along = 0.5 * ( a1 + 2.0 * a2 * u + 3.0 * a3 * u * u );
  vec3 tangent = normalize( along + ( p2 - p1 ) * 1e-4 + vec3( 0.0, 1e-7, 0.0 ) );

  // A frame across the lock, from a way of the lock's own: set off within the clump, wound by the curl.
  vec3 ax = normalize( cross( tangent, hValOwn() ) + vec3( 1e-6, 0.0, 0.0 ) );
  vec3 ay = cross( tangent, ax );
  float turn = hsValTurn();
  vec2 clump = hValClump(), curl = hValCurl();
  float out_ = clump.x * hsValSpread() * mix( 1.0, 1.0 - clump.y, t );
  float wound = 6.2831853 * ( curl.y * t + hValPhase() );
  on += ( ax * cos( turn ) + ay * sin( turn ) ) * out_ + ( ax * cos( wound ) + ay * sin( wound ) ) * curl.x * smoothstep( 0.0, 0.25, t );

  // A ribbon facing the eye.
  vec3 eye = cameraPosition - on;
  float far = length( eye );
  vec3 across = normalize( cross( tangent, eye / max( far, 1e-6 ) ) + vec3( 0.0, 1e-6, 0.0 ) );
  float w = hValWide() * ( 1.0 - 0.5 * hWidth.y + hWidth.y * hsValWide() ) * mix( 1.0, hValTaper(), t );
  w = max( w, far * hThin );
  hPos = on + across * side * w * 0.5;
  hNrm = hUnpack( root.w );
  vHairTangent = normalize( mat3( viewMatrix ) * tangent );
${shadow ? '' : `
  // Its colour, root to tip, its lock's own brightness and its own in the lock, darker at its root.
  vec3 colour = mix( hValRootC(), hValTipC(), t );
  colour *= hValBright() * ( 1.0 + 0.5 * hValVary() * hsValBright() );
  vHairColour = colour * mix( 1.0 - hValShade(), 1.0, t );
  vHairRough = hValRough();
  vHairShine = hValShine();
  vHairTrans = hValTrans();`}
}
`

// The main material's splice: the strand made where three makes the normal and the place.
export const surface = (links: number, locks: string, strands: string) => ({
  vertex: {
    common: strand(links, locks, strands, false),
    beginnormal_vertex: 'hStrand();\nobjectNormal = hNrm;',
    begin_vertex: 'hStrand();\ntransformed = hPos;',
  },
  fragment: {
    common: 'varying vec3 vHairColour;\nvarying float vHairT;\nvarying vec3 vHairTangent;\nvarying float vHairRough;\nvarying vec2 vHairShine;\nvarying float vHairTrans;',
    color_fragment: 'diffuseColor.rgb *= vHairColour;',
    roughnessmap_fragment: 'roughnessFactor = min( roughnessFactor * vHairRough, 1.0 );',
    lights_physical_pars_fragment: /* glsl */ `
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  vec3 tangent = normalize( vHairTangent );
  float tl = dot( tangent, directLight.direction ), tv = dot( tangent, geometryViewDir );
  float across = sqrt( max( 1.0 - tl * tl, 0.0 ) ) * sqrt( max( 1.0 - tv * tv, 0.0 ) ) - tl * tv;
  float lit = saturate( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5 );
  reflectedLight.directSpecular += directLight.color * vHairShine.x * pow( saturate( across ), max( vHairShine.y, 1e-3 ) ) * lit * ( 0.3 + 0.7 * vHairT );
  float behind = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vHairTrans * behind * ( 0.3 + 0.7 * vHairT );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
`,
  },
})

// The shadows' materials' own: the strand made where three makes the place.
export const shadowed = (links: number, locks: string, strands: string) => ({
  common: strand(links, locks, strands, true),
  begin_vertex: 'hStrand();\ntransformed = hPos;',
})
