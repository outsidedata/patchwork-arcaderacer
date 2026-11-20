// The shaders of grass3d's blades (`grass3d.plugin.ts`): what a blade is, as the keeper keeps it, and the
// shader spliced into a MeshStandardMaterial that render3d dresses, which draws it each frame, so the sky's
// fog, the weather's wet and snow, lights3d's lights and the shadows reach the grass as they reach everything
// else.
//
// A blade is the i-th of its tile, and everything about it that is the same every frame is a value of the spec
// grass3d hands the `keeper` mod (`specOf`; `plugins/gpgpu3d/gpgpu3d.keeper.ts`), worked out once, when its
// tile comes into its level's square round the camera or the ground under it changes, and kept in the level's
// textures, a texel a blade: where it stands and the ground there, the share of it this grass covers against
// the blade's own roll, its height, width, facing, lean, the phase and rate of its flutter, and its colour at
// its root and at its tip. Each is a roll of an integer hash of the tile, the blade's number and the grass's
// seed, the ground of the window (`gField`), read through the same triangles the land's finest ring is drawn
// with, and the grass's program. The blade's shader (`blade`) reads each value through the keeper's reading
// (`gValTall()`), whatever became of it, and works out only what moves: how thin the grass is at its distance
// from the camera, the wind and the gusts the wind's drift carries, the things that press it and what trampled
// it (`gField`'s other three channels). It is a quadratic Bézier from its root through a control point over it
// to its tip, kept its own length however far it is bent. A blade its level, the ground or the density leaves
// out is drawn as a point: every vertex at one place, so no triangle of it covers a pixel.
//
// The geometry of a blade of S segments is 2S + 1 vertices, `position` (side, t, 0): side −1 or 1 across
// it and 0 at its tip, t from 0 at its root to 1 at its tip.
//
// A blade lit from behind lets `gTranslucency` of the light through it: the standard material's direct
// light is taken over (`RE_Direct`), each light's own light, shadowed as the material shadows it, added
// again to the diffuse where the eye looks toward it through the blade.
//
// The values (`VALUES`). `foot` is the blade's place and the ground under it, `stand` the share of the ground
// covered against the blade's roll, and with them `tall`, `wide`, `face`, `phase`, `lean`, `rate` and `bend`
// shape a blade (the group `shape`, all a shadow's shader reads); `rootC`, `tipC`, `shade`, `rough` and `trans`
// are its look. A grass with no program, or one whose program reads no clock and no distance, keeps every one
// that has a roll or a name of the program in it, and its blades' shader works out nothing of a blade's own.
// A value that reads a name that moves is worked out each frame; `stand` then keeps the ground's share and
// rolls against the cover each frame.
//
// The grass's program of ops (`grass3d.sim.ts`, `program`) is compiled by the keeper, the still half into the
// keeping shader and the live into the blade's. Each name it may give to `out` (`OUTS`, `grass3d.sim.ts`) has
// a function the keeper writes, `gOutHeight`, `gOutWidth`, `gOutLean`, `gOutCover`, `gOutBright`, `gOutVary`,
// `gOutAo`, `gOutTranslucency`, `gOutRoughness`, `gOutBend`, `gOutDryAmount` and `gOutDry`, and `gOutRootColour`,
// `gOutTipColour` and `gOutDryColour`, which are given the grass's own colour: the program's where it gives the
// name, and where it does not, 1, the grass's own colour, and its own noise for the dry patches. The op `roll`
// reads the blade's own roll (`gpRollOf`) and grass3d's `dist` reads `gD`; both shaders set `gTile`, `gI` and
// `gD` before the program is given the foot.
import type { Program } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Spec, Value } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'
import { OUTS } from './grass3d.sim.ts'

// What presses the grass, as GLSL: the `pressed` mod's GLSL, which reads the things, each word's `Press`
// that the things' words have and the scene's `behaviors` deliver, and `gPressOf`, the `Press` of thing `s`
// whatever its word, false for a word nothing delivers. Empty with no `pressed` mod.
export const pressing = (pressed: { glsl: string; words: string[] } | undefined, presses: Record<string, { glsl: string }>) => {
  if (!pressed) return ''
  const words = pressed.words.map((w, i) => ({ w, i })).filter(({ w }) => presses[w])
  return /* glsl */ `
#define G_PRESSED
${pressed.glsl}
${words.map(({ w }) => presses[w].glsl).join('\n')}
bool gPressOf( int s, vec3 root, float tall, out float out_, out vec2 middle ) {
  int word = gpWord( s );
${words.map(({ w, i }) => `  if ( word == ${i} ) return ${w}Press( s, root, tall, out_, middle );`).join('\n')}
  return false;
}
`
}

// The values of a blade (The values): each read with `gTile`, `gI` and `gFoot` set, and in the keeping shader
// `gXz` and `gUnder`, the blade's place and the ground and share under it.
const COLOURS = ['dry', 'dryAmount', 'bright', 'vary', 'rootColour', 'tipColour', 'dryColour']
const VALUES: Value[] = [
  { name: 'foot', size: 3, outs: [], own: true, group: 'shape', glsl: 'vec3( gXz, gUnder.x )' },
  { name: 'stand', size: 1, outs: ['cover'], own: true, group: 'shape', gate: true, glsl: 'gStandOf( gUnder.y )', live: { keeps: 'gUnder.y', glsl: 'gStandOf( # )' } },
  { name: 'tall', size: 1, outs: ['height'], own: true, half: true, group: 'shape', glsl: 'gHeight.x * ( 1.0 - 0.5 * gHeight.y + gHeight.y * gRoll( gTile, gI, 4 ) ) * gOutHeight()' },
  { name: 'wide', size: 1, outs: ['width'], own: true, half: true, group: 'shape', glsl: 'gWidth.x * ( 1.0 - 0.5 * gWidth.y + gWidth.y * gRoll( gTile, gI, 5 ) ) * gOutWidth()' },
  { name: 'face', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: '6.2831853 * gRoll( gTile, gI, 6 )' },
  { name: 'phase', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: '6.2831853 * gRoll( gTile, gI, 9 )' },
  { name: 'lean', size: 2, outs: ['lean'], own: true, half: true, group: 'shape', glsl: 'gLeanOf()' },
  { name: 'rate', size: 1, outs: [], own: true, half: true, group: 'shape', glsl: 'gGust.w * ( 0.8 + 0.4 * gRoll( gTile, gI, 10 ) )' },
  { name: 'bend', size: 1, outs: ['bend'], own: false, half: true, group: 'shape', glsl: 'gBend * gOutBend()' },
  { name: 'rootC', size: 3, outs: COLOURS, own: true, half: true, group: 'look', needs: ['colours'], glsl: 'gcRoot' },
  { name: 'tipC', size: 3, outs: COLOURS, own: true, half: true, group: 'look', needs: ['colours'], glsl: 'gcTip' },
  { name: 'shade', size: 1, outs: ['ao'], own: false, half: true, group: 'look', glsl: 'clamp( gAo * gOutAo(), 0.0, 1.0 )' },
  { name: 'rough', size: 1, outs: ['roughness'], own: false, half: true, group: 'look', glsl: 'gOutRoughness()' },
  { name: 'trans', size: 1, outs: ['translucency'], own: false, half: true, group: 'look', glsl: 'gOutTranslucency()' },
]

// The uniforms both shaders read.
const UNIFORMS = /* glsl */ `
uniform vec3 gCam;
uniform float gTime;
uniform vec2 gWind;
uniform vec2 gDrift;
uniform vec4 gGust;
uniform float gBend;
uniform vec2 gTrample;
uniform highp sampler2D gField;
uniform highp sampler2D gKeeps;
uniform vec4 gKeepMask;
uniform ivec2 gFieldO;
uniform int gFieldN;
uniform float gCell;
uniform float gDensity;
uniform float gFull;
uniform float gReach;
uniform float gFade;
uniform float gTileSize;
uniform vec2 gHeight;
uniform vec2 gWidth;
uniform float gWiden;
uniform float gWidest;
uniform float gLean;
uniform int gSeed;
uniform vec3 gRootColour;
uniform vec3 gTipColour;
uniform vec3 gDryColour;
uniform vec2 gDry;
uniform float gVary;
uniform float gAo;
uniform float gFrom;
uniform float gTo;
uniform int gBlades;
uniform int gChunkTiles;
`

// The rolls and the window, for both shaders, and the blade being made: its tile, its number in it, its metres
// from the camera and its foot, and in the keeping shader its place and the ground and share under it.
const MATHS = /* glsl */ `
// An integer hash, and rolls from 0 to 1 of a tile, a blade's number and a salt, and of a lattice point.
// Every index is lifted by 2^30 before it is a uint, so a negative tile is a bit pattern of its own.
uint gMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
uint gU( int v ) { return uint( v + 1073741824 ); }
float gRoll( ivec2 t, int i, int salt ) {
  uint h = gMix( gU( t.x ) * 0x9e3779b1u ^ gMix( gU( t.y ) * 0x85ebca77u ^ gMix( gU( i ) * 0xc2b2ae3du ^ gU( salt + gSeed * 97 ) * 0x27d4eb2fu ) ) );
  return float( h >> 8u ) / 16777216.0;
}
float gLattice( ivec2 p, int salt ) {
  return float( gMix( gU( p.x ) * 0x9e3779b1u ^ gMix( gU( p.y ) * 0x85ebca77u ^ gU( salt + gSeed * 97 ) * 0x27d4eb2fu ) ) >> 8u ) / 16777216.0;
}
// Value noise from 0 to 1, a cell a unit.
float gNoise( vec2 p, int salt ) {
  vec2 i = floor( p ), f = p - i;
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  ivec2 c = ivec2( i );
  float a = gLattice( c, salt ), b = gLattice( c + ivec2( 1, 0 ), salt );
  float d = gLattice( c + ivec2( 0, 1 ), salt ), e = gLattice( c + ivec2( 1, 1 ), salt );
  return mix( mix( a, b, u.x ), mix( d, e, u.x ), u.y );
}

// The window: whether lattice point p is in it, and the texel it is held in.
bool gIn( ivec2 p ) {
  ivec2 r = p - gFieldO;
  return r.x >= 0 && r.y >= 0 && r.x < gFieldN && r.y < gFieldN;
}
ivec2 gSlot( ivec2 p ) {
  return p - gFieldN * ivec2( floor( vec2( p ) / float( gFieldN ) ) );
}
vec4 gAt( ivec2 p ) { return texelFetch( gField, gSlot( p ), 0 ); }

// The blade being made, and its own random number for a program's \`roll\`: a salt is added to 100, so none
// is one of the rolls the blade makes for itself.
ivec2 gTile;
int gI;
float gD;
vec3 gFoot;
vec2 gXz;
vec2 gUnder;
float gpRollOf( int salt ) { return gRoll( gTile, gI, 100 + salt ); }
`

// The ground under a blade, for the keeping shader.
const GROUND = /* glsl */ `
float gKeepAt( ivec2 p ) { return gIn( p ) ? dot( texelFetch( gKeeps, gSlot( p ), 0 ), gKeepMask ) : 0.0; }

// The ground at xz on the triangles of the finest ring, and the share of it this grass covers there,
// bilinear; -1 where any corner is out of the window or has no ground.
vec2 gGround( vec2 xz ) {
  vec2 q = xz / gCell;
  ivec2 L = ivec2( floor( q ) );
  vec2 f = q - vec2( L );
  if ( !gIn( L ) || !gIn( L + ivec2( 1, 1 ) ) ) return vec2( 0.0, -1.0 );
  float h00 = gAt( L ).r, h10 = gAt( L + ivec2( 1, 0 ) ).r, h01 = gAt( L + ivec2( 0, 1 ) ).r, h11 = gAt( L + ivec2( 1, 1 ) ).r;
  if ( min( min( h00, h10 ), min( h01, h11 ) ) <= -1e8 ) return vec2( 0.0, -1.0 );
  float h = f.x >= f.y ? h00 + f.x * ( h10 - h00 ) + f.y * ( h11 - h10 ) : h00 + f.y * ( h01 - h00 ) + f.x * ( h11 - h01 );
  float k = mix( mix( gKeepAt( L ), gKeepAt( L + ivec2( 1, 0 ) ), f.x ), mix( gKeepAt( L + ivec2( 0, 1 ) ), gKeepAt( L + ivec2( 1, 1 ) ), f.x ), f.y );
  return vec2( h, k );
}
`

// What of a blade reads the outs' functions, for either shader.
const HELPERS = /* glsl */ `
// The share of the ground the blade's roll leaves it, of the share \`keep\` this grass covers there.
float gStandOf( float keep ) {
  return clamp( ( keep * gOutCover() - gRoll( gTile, gI, 3 ) ) / 0.15, 0.0, 1.0 );
}
// Its bend with no wind, as a share of its height.
vec2 gLeanOf() {
  float way = 6.2831853 * gRoll( gTile, gI, 7 );
  return vec2( cos( way ), sin( way ) ) * gLean * gOutLean() * ( 0.5 + gRoll( gTile, gI, 8 ) );
}
// Its colour at its root and at its tip: toward the dry where the dry patches lie, and its own brightness.
void gColoursOf( out vec3 root, out vec3 tip ) {
  float dryness = gOutDry() * clamp( gDry.x * gOutDryAmount(), 0.0, 1.0 );
  float bright = ( 1.0 + gVary * gOutVary() * ( 2.0 * gRoll( gTile, gI, 11 ) - 1.0 ) ) * gOutBright();
  vec3 dry = gOutDryColour( gDryColour );
  root = mix( gOutRootColour( gRootColour ), dry * 0.6, dryness ) * bright;
  tip = mix( gOutTipColour( gTipColour ), dry, dryness ) * bright;
}
`

// The spec of one grass's blades for the keeper: `name` the program's own word in its GLSL, `what` the grass
// as a sentence names it, `program` its program, if it has one. A slot is a tile, its tag the tile; a blade
// with no ground under it keeps nothing.
export const specOf = (name: string, what: string, program: Program | undefined): Spec => ({
  prefix: 'g', what, name, program,
  outs: Object.fromEntries(Object.entries(OUTS).map(([out, kind]) => [out,
    kind === 'colour' ? { kind }
      : out === 'dry' ? { kind, none: 'smoothstep( 0.35, 0.75, gNoise( gFoot.xz / gDry.y, 21 ) )', wrap: 'clamp( #, 0.0, 1.0 )' }
        : { kind, wrap: 'max( #, 0.0 )' }])),
  values: VALUES,
  setups: { colours: { declare: 'vec3 gcRoot, gcTip;', run: 'gColoursOf( gcRoot, gcTip );' } },
  helpers: HELPERS,
  keeping: {
    head: `${UNIFORMS}\n${MATHS}\n${GROUND}`,
    begin: /* glsl */ `
  gTile = ivec2( tag );
  gI = i;
  gD = 0.0;
  gXz = vec2( gTile ) * gTileSize + vec2( gRoll( gTile, i, 1 ), gRoll( gTile, i, 2 ) ) * gTileSize;
  gUnder = gGround( gXz );
  if ( gUnder.y < 0.0 ) return;
  point = vec3( gXz.x, gUnder.x, gXz.y );
  gFoot = point;`,
  },
})

// Declarations and the blade, for the main material and for the shadows' materials alike. `press` is
// `pressing`'s GLSL, `reading` the keeper's reading for this shader (every value for the main material, the
// group `shape` for a shadow's), and `shadow` whether this is a shadow's shader, which makes no colour.
export const blade = (press: string, reading: string, shadow: boolean) => /* glsl */ `
${UNIFORMS}
attribute vec2 gChunk;
varying vec3 vGrassColour;
varying float vGrassT;
varying float vGrassRough;
varying float vGrassTrans;
${press}
${MATHS}
${reading}

vec3 gPos;
vec3 gNrm;
bool gMade = false;

void gBlade() {
  if ( gMade ) return;
  gMade = true;
  float t = position.y, side = position.x;
  vGrassT = t;
  vGrassRough = 1.0;
  vGrassTrans = 1.0;
  vGrassColour = vec3( 0.0 );
  gNrm = vec3( 0.0, 1.0, 0.0 );
  gPos = vec3( gCam.x, -1e6, gCam.z );
  int id = gl_InstanceID;
  int local = id / gBlades;
  int i = id - local * gBlades;
  ivec2 tile = ivec2( gChunk ) + ivec2( local - ( local / gChunkTiles ) * gChunkTiles, local / gChunkTiles );
  vec2 t0 = vec2( tile ) * gTileSize;
  float near = distance( clamp( gCam.xz, t0, t0 + gTileSize ), gCam.xz );
  if ( near < gFrom || near >= gTo ) return;

  // What was kept of the blade: where it stands, the ground there, and the share of it left to it.
  gValOf( tile, i );
  vec3 foot = gValFoot();
  vec2 xz = foot.xy;
  float d = distance( xz, gCam.xz );
  gTile = tile;
  gI = i;
  gD = d;
  float density = gDensity * min( 1.0, ( gFull * gFull ) / max( d * d, 1e-6 ) );
  float grow = clamp( density * gTileSize * gTileSize - float( i ), 0.0, 1.0 );
  grow *= smoothstep( 0.0, 1.0, clamp( ( gReach - d ) / max( gFade, 1e-3 ), 0.0, 1.0 ) );
  vec3 root = vec3( xz.x, foot.z, xz.y );
  gFoot = root;
  gValPoint( root );
  grow *= gValStand();
  if ( grow <= 1e-3 ) return;

  float h = gValTall() * grow;
  float w = gValWide() * grow * min( gWidest, pow( max( d / gFull, 1.0 ), 2.0 * gWiden ) );
  float face = gValFace();
  vec3 across = vec3( cos( face ), 0.0, sin( face ) );
  vec2 b = gValLean() * h;

  // The wind, its gusts carried by its drift, and the flutter.
  float speed = length( gWind );
  vec2 way = speed > 1e-4 ? gWind / speed : vec2( 0.0 );
  vec2 gp = ( xz - gDrift ) / gGust.x;
  float g = 0.65 * gNoise( gp, 11 ) + 0.35 * gNoise( gp * 2.3 + 17.0, 12 );
  float blown = clamp( gValBend() * speed * ( 1.0 - gGust.y + 2.0 * gGust.y * g ), 0.0, 0.85 );
  float phase = gValPhase();
  float rate = gValRate();
  float flutter = gGust.z * ( 0.35 + 0.65 * min( speed / 6.0, 1.0 ) ) * sin( gTime * rate + phase + dot( xz, way ) * 0.7 );
  vec2 shake = speed > 1e-4 ? way : vec2( cos( phase ), sin( phase ) );
  b += ( way * blown + shake * flutter ) * h;

  // Pushed away from the things that press it, and lying where it was trampled.
  float pushed = 0.0;
  vec2 away = vec2( 0.0 );
  float reach = max( gTrample.y, 1e-3 );
#ifdef G_PRESSED
  for ( int k = 0; k < gpCount; k++ ) {
    float out_;
    vec2 middle;
    if ( !gPressOf( gpThing( k ), root, h, out_, middle ) ) continue;
    float s = 1.0 - smoothstep( 0.0, reach, out_ );
    vec2 dir = xz - middle;
    if ( s > pushed && dot( dir, dir ) > 1e-8 ) { pushed = s; away = normalize( dir ); }
  }
#endif
  ivec2 at = ivec2( floor( xz / gCell + 0.5 ) );
  if ( gIn( at ) ) {
    vec4 f = gAt( at );
    float lying = length( f.ba ) * exp( -max( gTime - f.g, 0.0 ) / gTrample.x );
    if ( lying > pushed && dot( f.ba, f.ba ) > 1e-8 ) { pushed = lying; away = normalize( f.ba ); }
  }
  b = mix( b, away * 0.92 * h, pushed );
  float bl = length( b );
  if ( bl > 0.95 * h ) b *= 0.95 * h / bl;

  // The Bézier, kept its own length.
  float rise = sqrt( max( h * h - dot( b, b ), 0.0025 * h * h ) );
  vec3 p1 = vec3( 0.0, rise, 0.0 );
  vec3 p2 = vec3( b.x, rise, b.y );
  float len = ( 2.0 * length( p2 ) + length( p1 ) + length( p2 - p1 ) ) / 3.0;
  float fit = h / max( len, 1e-5 );
  p1 *= fit;
  p2 *= fit;
  vec3 on = 2.0 * ( 1.0 - t ) * t * p1 + t * t * p2;
  vec3 tangent = normalize( 2.0 * ( 1.0 - t ) * p1 + 2.0 * t * ( p2 - p1 ) + vec3( 0.0, 1e-5, 0.0 ) );
  vec3 crossway = normalize( across - dot( across, tangent ) * tangent + vec3( 1e-5, 0.0, 0.0 ) );
  float wide = w * ( 1.0 - pow( t, 1.4 ) );
  gPos = root + on + crossway * side * wide * 0.5;
  gNrm = normalize( normalize( cross( crossway, tangent ) ) + crossway * side * 0.35 );
${shadow ? '' : `
  // Its colour, root to tip, darker at its root. The root's shade is the near grass's: from full metres out
  // to four times that it goes, so a far blade, seen whole from above, is not a dark speck.
  float shade = gValShade() * ( 1.0 - smoothstep( gFull, 4.0 * gFull, d ) );
  vGrassColour = mix( gValRootC(), gValTipC(), t ) * mix( 1.0 - shade, 1.0, t );
  vGrassRough = gValRough();
  vGrassTrans = gValTrans();`}
}
`

// The main material's splice: the blade made where three makes the normal and the place.
export const surface = (press: string, reading: string) => ({
  vertex: {
    common: blade(press, reading, false),
    beginnormal_vertex: 'gBlade();\nobjectNormal = gNrm;',
    begin_vertex: 'gBlade();\ntransformed = gPos;',
  },
  fragment: {
    common: 'varying vec3 vGrassColour;\nvarying float vGrassT;\nvarying float vGrassRough;\nvarying float vGrassTrans;\nuniform float gTranslucency;',
    color_fragment: 'diffuseColor.rgb *= vGrassColour;',
    roughnessmap_fragment: 'roughnessFactor = min( roughnessFactor * vGrassRough, 1.0 );',
    lights_physical_pars_fragment: /* glsl */ `
void RE_Direct_Grass( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float behind = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 );
  float through = saturate( dot( - geometryNormal, directLight.direction ) );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * gTranslucency * vGrassTrans * ( 0.35 * through + behind ) * ( 0.4 + 0.6 * vGrassT );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Grass
`,
  },
})

// The shadows' materials' own: the blade made where three makes the place.
export const shadowed = (press: string, reading: string) => ({
  common: blade(press, reading, true),
  begin_vertex: 'gBlade();\ntransformed = gPos;',
})
