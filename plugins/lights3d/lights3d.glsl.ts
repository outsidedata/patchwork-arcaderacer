// lights3d's shader code, every piece the plugin splices into the shaders that light and the layout of the
// textures it reads: the lights, a cell's lights and both atlases' tiles (`lights3d.plugin.ts` says the whole).
// Gathered here so every sampler a lit shader is handed by lights3d is seen in one place: the lights, the cells, the
// list, the still atlas and its tiles, the moving atlas and its tiles, and, with probes, the probes' array.

// The width of each texture, in texels: a run of lights, cells or entries wraps to the next row after
// this many. 1024 is under every WebGL2 renderer's least largest texture, 2048.
export const ROW = 1024
// The texels a light takes, one above the other: its place and reach; its colour and fall off; its
// cone's direction and outer cosine; its penumbra's cosine, first tile, tiles and shadow's far; its
// shadow's near, bias and normal bias, and its kind (0 a lamp, 1 a rectangle); and a sixth, a rectangle's half
// height. A rectangle's second texel is its light and its picture's first layer, its third its half width
// (`lights3d.lights.ts`, `writeLights`).
export const TEXELS = 6
// The texels a tile's matrix takes, one above the other, a column each.
export const MATRIX = 4

// The sizes of a probe's prefiltered picture, as three's PMREM lays one out for a cube of `size`: its
// height four faces, its width three of the larger of a face and 7 × 16, and the defines three's own
// `cube_uv_reflection_fragment` reads them by.
export function prefiltered(size: number) {
  const face = 2 ** Math.floor(Math.log2(size))
  const width = 3 * Math.max(face, 7 * 16), height = 4 * face
  return { width, height, maxMip: Math.log2(height) - 2 }
}

// A probe's reflection: three's own `cube_uv_reflection_fragment`, read from one layer of the array the
// probes are packed in, its names its own so it stands beside three's in a shader that has an envMap.
export const PROBE = (count: number, size: number) => {
  const { width, height, maxMip } = prefiltered(size)
  const n = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x))
  return `
    #define LIGHTS3D_PROBES ${count}
    #define L3_MAX_MIP ${n(maxMip)}
    #define L3_TEXEL_WIDTH ${n(1 / width)}
    #define L3_TEXEL_HEIGHT ${n(1 / height)}
    uniform highp sampler2DArray uLights3dProbes;
    uniform float uLights3dProbesOn; uniform float uLights3dProbeIntensity;
    uniform vec3 uLights3dProbeAt[ LIGHTS3D_PROBES ]; uniform vec3 uLights3dProbeLo[ LIGHTS3D_PROBES ]; uniform vec3 uLights3dProbeHi[ LIGHTS3D_PROBES ];
    float l3Face( vec3 direction ) {
      vec3 a = abs( direction );
      float face = - 1.0;
      if ( a.x > a.z ) {
        if ( a.x > a.y ) face = direction.x > 0.0 ? 0.0 : 3.0;
        else face = direction.y > 0.0 ? 1.0 : 4.0;
      } else {
        if ( a.z > a.y ) face = direction.z > 0.0 ? 2.0 : 5.0;
        else face = direction.y > 0.0 ? 1.0 : 4.0;
      }
      return face;
    }
    vec2 l3FaceUV( vec3 direction, float face ) {
      vec2 uv;
      if ( face == 0.0 ) uv = vec2( direction.z, direction.y ) / abs( direction.x );
      else if ( face == 1.0 ) uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
      else if ( face == 2.0 ) uv = vec2( - direction.x, direction.y ) / abs( direction.z );
      else if ( face == 3.0 ) uv = vec2( - direction.z, direction.y ) / abs( direction.x );
      else if ( face == 4.0 ) uv = vec2( - direction.x, direction.z ) / abs( direction.y );
      else uv = vec2( direction.x, direction.y ) / abs( direction.z );
      return 0.5 * ( uv + 1.0 );
    }
    vec3 l3Bilinear( float layer, vec3 direction, float mipInt ) {
      float face = l3Face( direction );
      float filterInt = max( 4.0 - mipInt, 0.0 );
      mipInt = max( mipInt, 4.0 );
      float faceSize = exp2( mipInt );
      highp vec2 uv = l3FaceUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
      if ( face > 2.0 ) { uv.y += faceSize; face -= 3.0; }
      uv.x += face * faceSize;
      uv.x += filterInt * 3.0 * 16.0;
      uv.y += 4.0 * ( exp2( L3_MAX_MIP ) - faceSize );
      uv.x *= L3_TEXEL_WIDTH;
      uv.y *= L3_TEXEL_HEIGHT;
      return textureLod( uLights3dProbes, vec3( uv, layer ), 0.0 ).rgb;
    }
    float l3Mip( float roughness ) {
      float mip = 0.0;
      if ( roughness >= 0.8 ) mip = ( 1.0 - roughness ) * ( - 1.0 + 2.0 ) / ( 1.0 - 0.8 ) - 2.0;
      else if ( roughness >= 0.4 ) mip = ( 0.8 - roughness ) * ( 2.0 + 1.0 ) / ( 0.8 - 0.4 ) - 1.0;
      else if ( roughness >= 0.305 ) mip = ( 0.4 - roughness ) * ( 3.0 - 2.0 ) / ( 0.4 - 0.305 ) + 2.0;
      else if ( roughness >= 0.21 ) mip = ( 0.305 - roughness ) * ( 4.0 - 3.0 ) / ( 0.305 - 0.21 ) + 3.0;
      else mip = - 2.0 * log2( 1.16 * roughness );
      return mip;
    }
    vec3 l3Probe( int i, vec3 direction, float roughness ) {
      float mip = clamp( l3Mip( roughness ), - 2.0, L3_MAX_MIP );
      float mipF = fract( mip ), mipInt = floor( mip );
      vec3 c0 = l3Bilinear( float( i ), direction, mipInt );
      if ( mipF == 0.0 ) return c0;
      return mix( c0, l3Bilinear( float( i ), direction, mipInt + 1.0 ), mipF );
    }
    // the probe a world point is lit by: of the probes whose box holds it, the smallest; else the one
    // whose box is nearest
    int l3Which( vec3 w ) {
      int best = 0;
      float least = 1e30;
      bool inside = false;
      for ( int i = 0; i < LIGHTS3D_PROBES; i ++ ) {
        vec3 lo = uLights3dProbeLo[ i ], hi = uLights3dProbeHi[ i ];
        vec3 off = max( max( lo - w, w - hi ), 0.0 );
        float away = dot( off, off );
        vec3 span = hi - lo;
        float volume = span.x * span.y * span.z;
        if ( away == 0.0 ) {
          if ( !inside || volume < least ) { best = i; least = volume; inside = true; }
        } else if ( !inside && away < least ) { best = i; least = away; }
      }
      return best;
    }
    // the way to look up the probe's picture for a ray from world point w along r: to where the ray
    // leaves the probe's box, from the point the probe saw from, so a reflection stands where its wall
    // does; the ray itself for a point outside the box
    vec3 l3Boxed( int i, vec3 w, vec3 r ) {
      vec3 lo = uLights3dProbeLo[ i ], hi = uLights3dProbeHi[ i ];
      if ( any( lessThan( w, lo ) ) || any( greaterThan( w, hi ) ) ) return r;
      vec3 far = max( ( hi - w ) / r, ( lo - w ) / r );
      float t = min( min( far.x, far.y ), far.z );
      return w + r * t - uLights3dProbeAt[ i ];
    }`
}

// The probes' light, where three's own envMap light goes, in the shaders that take light from round
// them (standard and physical): its reflection into `radiance`, and the light round a surface, the
// probe seen at full roughness along the normal, into `iblIrradiance`, as three's `getIBLRadiance` and
// `getIBLIrradiance` add an envMap's.
export const PROBE_MAPS = `
    #if defined( RE_IndirectSpecular ) && defined( LIGHTS3D_PROBES )
    if ( uLights3dProbesOn > 0.5 ) {
      int l3I = l3Which( vDressWorld );
      vec3 l3N = inverseTransformDirection( geometryNormal, viewMatrix );
      vec3 l3R = reflect( - geometryViewDir, geometryNormal );
      l3R = normalize( mix( l3R, geometryNormal, pow4( material.roughness ) ) );
      l3R = inverseTransformDirection( l3R, viewMatrix );
      radiance += l3Probe( l3I, l3Boxed( l3I, vDressWorld, l3R ), material.roughness ) * uLights3dProbeIntensity;
      iblIrradiance += PI * l3Probe( l3I, l3N, 1.0 ) * uLights3dProbeIntensity;
    }
    #endif`

import { AREA_CELLS, AREA_LIGHT, AREA_LOBE, GLSL_AREAS } from './lights3d.areas.ts'

// The light, after three's own point lights in `lights_fragment_begin`: every lamp, and with `levels` (the scene's
// `areas`) every rectangle of the pixel's cell and every cell of the glow the camera sees.
export function lit(levels?: number): Record<string, string> {
  const begin = GLSL['?lights_fragment_begin']
  if (levels === undefined) return { ...GLSL }
  const areas = GLSL_AREAS(levels)
  return {
    common: GLSL.common + areas.common,
    '?lights_physical_pars_fragment': areas['?lights_physical_pars_fragment'],
    '?lights_fragment_begin': begin
      .replace('      int l3End', `${AREA_LOBE}\n      int l3End`)
      .replace('        // the area lights, where the scene has them', AREA_LIGHT)
      .replace(/\n    }$/, `\n${AREA_CELLS}\n    }`),
  }
}

// Every lamp, after three's own point lights in `lights_fragment_begin`; a light of another kind is lit by `lit`.
export const GLSL = {
  common: `
    uniform float uLights3dOn;
    uniform highp sampler2D uLights3dLights; uniform highp sampler2D uLights3dCells; uniform highp sampler2D uLights3dIndex;
    uniform vec3 uLights3dGrid; uniform vec2 uLights3dScreen; uniform float uLights3dNear; uniform float uLights3dScale;
    uniform highp sampler2D uLights3dAtlas; uniform highp sampler2D uLights3dTiles; uniform float uLights3dAcross;
    uniform highp sampler2D uLights3dMoving; uniform highp sampler2D uLights3dMoved;
    #define LIGHTS3D_ROW ${ROW}
    #define LIGHTS3D_TEXELS ${TEXELS}
    #define LIGHTS3D_MATRIX ${MATRIX}
    // How much of a light reaches view-space point p, its distance from the light d, by one atlas and the
    // texture of its tiles' matrices, from (2 r + 1)² texels round its own in the tile that holds it (one
    // for r of 0, nine for 1): 1 where no tile of the light's holds it.
    float lights3dShadowIn( highp sampler2D atlas, highp sampler2D tiles, vec3 p, float d, vec4 l3D, vec4 l3E, int r ) {
      int first = int( l3D.y ), faces = int( l3D.z );
      float near = l3E.x, far = l3D.w;
      float mine = ( d - l3E.y - near ) / ( far - near );
      float across = uLights3dAcross;
      float texel = 1.0 / float( textureSize( atlas, 0 ).x );
      for ( int f = 0; f < 6; f ++ ) {
        if ( f >= faces ) break;
        int t = first + f;
        ivec2 m = ivec2( t % LIGHTS3D_ROW, ( t / LIGHTS3D_ROW ) * LIGHTS3D_MATRIX );
        mat4 M = mat4( texelFetch( tiles, m, 0 ), texelFetch( tiles, m + ivec2( 0, 1 ), 0 ), texelFetch( tiles, m + ivec2( 0, 2 ), 0 ), texelFetch( tiles, m + ivec2( 0, 3 ), 0 ) );
        vec4 clip = M * vec4( p, 1.0 );
        if ( clip.w <= 0.0 ) continue;
        vec2 ndc = clip.xy / clip.w;
        if ( abs( ndc.x ) > 1.0 || abs( ndc.y ) > 1.0 ) continue;
        vec2 corner = vec2( float( t % int( across ) ), float( t / int( across ) ) ) / across;
        vec2 uv = corner + ( ndc * 0.5 + 0.5 ) / across;
        vec2 lo = corner + 0.5 * texel, hi = corner + 1.0 / across - 0.5 * texel;
        float lit = 0.0;
        for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
          if ( abs( x ) > r || abs( y ) > r ) continue;
          float stored = texture( atlas, clamp( uv + vec2( x, y ) * texel, lo, hi ) ).r;
          lit += mine <= stored ? 1.0 : 0.0;
        }
        return lit / float( ( 2 * r + 1 ) * ( 2 * r + 1 ) );
      }
      return 1.0;
    }
    // The light that reaches p past both: what never moves, drawn once into the still atlas, and what
    // moves, drawn each frame into the moving one.
    float lights3dShadowOf( vec3 p, float d, vec4 l3D, vec4 l3E, int r ) {
      return lights3dShadowIn( uLights3dAtlas, uLights3dTiles, p, d, l3D, l3E, r ) * lights3dShadowIn( uLights3dMoving, uLights3dMoved, p, d, l3D, l3E, r );
    }
    // a surface's shadow, from nine texels, so its edge is soft
    float lights3dShadow( vec3 p, float d, vec4 l3D, vec4 l3E ) { return lights3dShadowOf( p, d, l3D, l3E, 1 ); }`,
  '?lights_fragment_begin': `
    if ( uLights3dOn > 0.5 ) {
      #if defined( STANDARD ) && !( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
      material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / ( material.dfg.x + material.dfg.y ) - 1.0 );
      #endif
      float l3Depth = max( - geometryPosition.z, uLights3dNear );
      vec3 l3At = vec3( gl_FragCoord.xy / uLights3dScreen * uLights3dGrid.xy, log( l3Depth / uLights3dNear ) * uLights3dScale );
      ivec3 l3Cell = ivec3( clamp( floor( l3At ), vec3( 0.0 ), uLights3dGrid - 1.0 ) );
      int l3C = l3Cell.x + int( uLights3dGrid.x ) * ( l3Cell.y + int( uLights3dGrid.y ) * l3Cell.z );
      vec2 l3Run = texelFetch( uLights3dCells, ivec2( l3C % LIGHTS3D_ROW, l3C / LIGHTS3D_ROW ), 0 ).xy;
      int l3End = int( l3Run.x + l3Run.y );
      for ( int l3E = int( l3Run.x ); l3E < l3End; l3E ++ ) {
        int l3K = int( texelFetch( uLights3dIndex, ivec2( l3E % LIGHTS3D_ROW, l3E / LIGHTS3D_ROW ), 0 ).r );
        ivec2 l3T = ivec2( l3K % LIGHTS3D_ROW, ( l3K / LIGHTS3D_ROW ) * LIGHTS3D_TEXELS );
        vec4 l3A = texelFetch( uLights3dLights, l3T, 0 );
        vec4 l3B = texelFetch( uLights3dLights, l3T + ivec2( 0, 1 ), 0 );
        vec4 l3S = texelFetch( uLights3dLights, l3T + ivec2( 0, 2 ), 0 );
        vec4 l3P = texelFetch( uLights3dLights, l3T + ivec2( 0, 3 ), 0 );
        vec4 l3Q = texelFetch( uLights3dLights, l3T + ivec2( 0, 4 ), 0 );
        if ( l3Q.w < 0.5 ) {
          vec3 l3V = l3A.xyz - geometryPosition;
          directLight.direction = normalize( l3V );
          float l3Cone = getSpotAttenuation( l3S.w, l3P.x, dot( directLight.direction, l3S.xyz ) );
          directLight.color = l3B.rgb * l3Cone * getDistanceAttenuation( length( l3V ), l3A.w, l3B.w );
          if ( l3P.z > 0.0 && l3Cone > 0.0 ) {
            vec3 l3Moved = geometryPosition + geometryNormal * l3Q.z;
            directLight.color *= lights3dShadow( l3Moved, length( l3A.xyz - l3Moved ), l3P, l3Q );
          }
          directLight.visible = true;
          RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
        }
        // the area lights, where the scene has them
      }
    }`,
}
