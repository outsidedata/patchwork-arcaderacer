// The browser half of air: the sky and the air between the camera and everything it sees, one model
// for both, so the land far off melts into the sky behind it. It builds once, the first frame the page
// holds a `scenery` row and render3d has a camera, from the scene's course file (`courseOf`), and then
// keeps itself round the camera as each frame is drawn. Everything it made goes in `close`; the
// shafts' pass is render3d's once handed over, and render3d disposes it.
//
// The air's colour looking along a direction d is `away` mixed toward `toward` by
// max(d·sun, 0)^`spread`, plus the `halo` round the sun, `halo.colour` × `halo.strength` ×
// max(d·sun, 0)^`halo.sharp`. The sun is the course's `light.sun.dir`, the one the land's key light
// shines from. Every dressed material (a splice keyed `air`, after three's fog) is mixed toward that
// colour by 1 − e^(−τ), τ the optical depth from the camera to the fragment through the air's
// `layers`, each a density falling off exponentially with height. The sky dome is that same colour
// at the horizon and below, blended up to `dome.top` overhead, so a mountain whose τ has grown large
// is the colour of the sky beside it.
//
// The course file's `light`:
//   sun        { dir }: the sun's direction (the land reads the rest of it).
//   air        the air:
//     away     the air's colour looking away from the sun.
//     toward   its colour looking at the sun.
//     spread   how tightly `toward` gathers round the sun: the power of max(d·sun, 0).
//     halo     { colour, strength, sharp }: the forward scatter round the sun, in the air and the sky.
//     layers   [{ density, height, base }]: each a density of `density` per metre at the height
//              `base`, falling by e every `height` metres up (and rising below), summed: a thin haze
//              hundreds of metres deep and a mist a few metres deep lying in the valleys.
//     tunnel   { colour, density, reach, fade }: inside a bore (a `tunnel` or an `underground`) the
//              air is `colour` with `density` per metre over at most `reach` metres of each ray, full
//              `fade` metres in from either portal and falling to none at the portal. A camera off the
//              road's width or over the bore's ceiling (`look.tunnel.height`) is outside.
//     disc     { size, edge, colour, strength }, optional: the sun's disc in the sky, `size` degrees
//              across its radius, its rim soft over the outer `edge` of that radius, `colour` ×
//              `strength`.
//     shafts   { strength, colour, samples, length, decay, sharp, facing, scale }, optional: light
//              shafts from the sun, a pass drawn at `scale` of the frame's size. Each pixel steps
//              `samples` times `length` of the way toward the sun's place on the screen, summing the
//              sky's light where nothing stands in front of it (the depth the scene drew is the far
//              plane), weighted max(d·sun, 0)^`sharp` and falling by `decay` a step, and the frame
//              takes `colour` × `strength` of the sum. Full while the camera faces the sun by a
//              cosine of `facing[1]` or more, none at `facing[0]` or less. None given: no shafts.
//     haze     { strength, lights, spots, steps }, optional: the light of the scene's lamps scattered
//              in the air: the `lights` point lights and `spots` spot lights nearest the camera, lit
//              and visible, each glowing along every ray that passes it by its colour × intensity ×
//              `strength` (a point's in closed form, a spot's inside its cone summed over `steps`
//              steps of the ray up to its `distance` past it). None given: no glow.
//   dome       { top, curve, radius, stars?, moon?, glow? }: the sky drawn round the camera, `radius`
//              metres out, the air's colour at the horizon rising to `top` overhead by up^`curve`.
//              stars  { count, size, bright, colours, twinkle, low }: `count` stars, each a soft round
//                     point of light; its brightness rolled to the power `bright`, so most are faint and
//                     a few blaze; `size` [least, most] pixels across from faintest to brightest; tinted
//                     one of `colours`; flickering by up to `twinkle` of its light; fading out below
//                     `low` of the way up from the horizon.
//              moon   { dir, colour, size, halo { colour, strength, sharp } }: a disc toward `dir`, `size`
//                     of the dome's radius across, in a halo of `colour` × `strength` falling off by the
//                     power `sharp` of how near a ray points at it.
//              glow   { colour, strength, height }: a city's lights on the air at the horizon, falling
//                     off over `height` of the way up.
// It adds `air.sky` to the scene, the splice `air` to render3d and, with `shafts`, the pass `air`. It
// hands out `uniforms`, the values the splice and the sky read each frame, and `shafts`, the pass.
// It is listed in `world.shipped.plugins` after `land`, whose materials it reaches through the splice.
import type * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { Plugins } from '#engine/browser.ts'
import { seeded } from '#engine/engine.ts'
import { courseOf, inside, locate, trackOf, type Track } from '../track/track.sim.ts'

type Air = {
  away: string; toward: string; spread: number
  halo: { colour: string; strength: number; sharp: number }
  layers: { density: number; height: number; base: number }[]
  tunnel: { colour: string; density: number; reach: number; fade: number }
  disc?: { size: number; edge: number; colour: string; strength: number }
  shafts?: { strength: number; colour: string; samples: number; length: number; decay: number; sharp: number; facing: [number, number]; scale: number }
  haze?: { strength: number; lights: number; spots: number; steps: number }
}
type Dome = {
  top: string; curve: number; radius: number
  stars?: { count: number; size: [number, number]; bright: number; colours: string[]; twinkle: number; low: number }
  moon?: { dir: number[]; colour: string; size: number; halo: { colour: string; strength: number; sharp: number } }
  glow?: { colour: string; strength: number; height: number }
}

// The air's glsl, for the splice and the sky alike: its uniforms and the colour and depth of a ray.
const glsl = (air: Air) => {
  const L = air.layers.length, P = air.haze?.lights ?? 0, S = air.haze?.spots ?? 0
  return `
    uniform vec3 uAirAway; uniform vec3 uAirToward; uniform float uAirSpread; uniform vec3 uAirSun;
    uniform vec3 uAirHalo; uniform float uAirHaloSharp;
    uniform vec3 uAirLayers[${L}];
    uniform vec3 uAirTunnel; uniform float uAirTunnelDensity; uniform float uAirTunnelReach; uniform float uAirInside;
    vec3 airColour(vec3 d) {
      float c = max(dot(d, uAirSun), 0.0);
      return mix(uAirAway, uAirToward, pow(c, uAirSpread)) + uAirHalo * pow(c, uAirHaloSharp);
    }
    // e^(-(y - base)/height), held under e^40 so a point far below a thin layer does not overflow
    float airFall(float y, vec3 layer) { return exp(min(-(y - layer.z) / layer.y, 40.0)); }
    // the optical depth of the air from o, len metres along d
    float airDepth(vec3 o, vec3 d, float len) {
      float tau = 0.0, dy = d.y * len;
      for (int k = 0; k < ${L}; k++) {
        vec3 layer = uAirLayers[k];
        if (abs(dy) < 1e-3 * len) tau += layer.x * len * airFall(o.y + dy * 0.5, layer);
        else tau += layer.x * layer.y * len * (airFall(o.y, layer) - airFall(o.y + dy, layer)) / dy;
      }
      return tau;
    }
    // what the air between o and len metres along d does to the light c coming back along it
    vec3 airThrough(vec3 c, vec3 o, vec3 d, float len) {
      c = mix(c, airColour(d), 1.0 - exp(-airDepth(o, d, len)));
      return mix(c, uAirTunnel, uAirInside * (1.0 - exp(-uAirTunnelDensity * min(len, uAirTunnelReach))));
    }
    #define AIR_POINTS ${P}
    #define AIR_SPOTS ${S}
    #define AIR_STEPS ${air.haze?.steps ?? 0}
    #if AIR_POINTS > 0 || AIR_SPOTS > 0
    uniform float uAirHaze;
    #endif
    #if AIR_POINTS > 0
    uniform int uAirPointCount; uniform vec3 uAirPointAt[AIR_POINTS]; uniform vec3 uAirPointColour[AIR_POINTS];
    #endif
    #if AIR_SPOTS > 0
    uniform int uAirSpotCount; uniform vec3 uAirSpotAt[AIR_SPOTS]; uniform vec3 uAirSpotColour[AIR_SPOTS];
    uniform vec3 uAirSpotDir[AIR_SPOTS]; uniform vec3 uAirSpotCone[AIR_SPOTS];
    #endif
    // the lamps' light scattered toward the eye along len metres of the ray from o along d
    vec3 airGlow(vec3 o, vec3 d, float len) {
      vec3 sum = vec3(0.0);
      #if AIR_POINTS > 0
      for (int k = 0; k < AIR_POINTS; k++) {
        if (k >= uAirPointCount) break;
        vec3 to = uAirPointAt[k] - o;
        float t0 = dot(to, d);
        float h = max(length(to - d * t0), 0.25);
        sum += uAirPointColour[k] * (atan((len - t0) / h) - atan(-t0 / h)) / h;
      }
      #endif
      #if AIR_SPOTS > 0
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      for (int k = 0; k < AIR_SPOTS; k++) {
        if (k >= uAirSpotCount) break;
        vec3 cone = uAirSpotCone[k];
        float end = min(len, length(uAirSpotAt[k] - o) + cone.z);
        float dt = end / float(AIR_STEPS);
        for (int j = 0; j < AIR_STEPS; j++) {
          vec3 v = o + d * ((float(j) + jitter) * dt) - uAirSpotAt[k];
          float r2 = dot(v, v);
          float inBeam = smoothstep(cone.x, cone.y, dot(v, uAirSpotDir[k]) * inversesqrt(max(r2, 1e-4)));
          sum += uAirSpotColour[k] * inBeam / (r2 + 1.0) * dt;
        }
      }
      #endif
      #if AIR_POINTS > 0 || AIR_SPOTS > 0
      return sum * uAirHaze;
      #else
      return sum;
      #endif
    }
  `
}

// The light shafts: the sky's light near the sun smeared toward it at a fraction of the frame's
// size wherever nothing stands in front of the sky, then added to the frame.
class Shafts extends Pass {
  depth: THREE.DepthTexture | null = null
  rays: FullScreenQuad
  blend: FullScreenQuad
  half: THREE.WebGLRenderTarget
  private s: NonNullable<Air['shafts']>
  camera: () => THREE.PerspectiveCamera | undefined
  constructor(T: typeof THREE, s: NonNullable<Air['shafts']>, camera: () => THREE.PerspectiveCamera | undefined, sun: THREE.Vector3) {
    super()
    this.s = s
    this.camera = camera
    this.half = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false })
    const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
    this.rays = new FullScreenQuad(new T.ShaderMaterial({
      defines: { SAMPLES: s.samples },
      uniforms: {
        tDepth: { value: null }, uSunUV: { value: new T.Vector2() }, uSun: { value: sun.clone() },
        uProjInv: { value: new T.Matrix4() }, uCamRot: { value: new T.Matrix4() },
        uLength: { value: s.length }, uDecay: { value: s.decay }, uSharp: { value: s.sharp },
      },
      vertexShader,
      fragmentShader: `
        uniform sampler2D tDepth; uniform vec2 uSunUV; uniform vec3 uSun; uniform mat4 uProjInv; uniform mat4 uCamRot;
        uniform float uLength; uniform float uDecay; uniform float uSharp;
        varying vec2 vUv;
        float sky(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          #ifdef USE_REVERSED_DEPTH_BUFFER
          return z <= 0.0 ? 1.0 : 0.0;
          #else
          return z >= 1.0 ? 1.0 : 0.0;
          #endif
        }
        vec3 dirAt(vec2 uv) {
          vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 0.5, 1.0);
          return normalize((uCamRot * vec4(v.xyz / v.w, 0.0)).xyz);
        }
        void main() {
          vec2 step = (uSunUV - vUv) * uLength / float(SAMPLES);
          vec2 uv = vUv + step * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float sum = 0.0, w = 1.0;
          for (int k = 0; k < SAMPLES; k++) {
            if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) sum += sky(uv) * pow(max(dot(dirAt(uv), uSun), 0.0), uSharp) * w;
            w *= uDecay;
            uv += step;
          }
          gl_FragColor = vec4(vec3(sum / float(SAMPLES)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }))
    this.blend = new FullScreenQuad(new T.ShaderMaterial({
      uniforms: { tColour: { value: null }, tRays: { value: this.half.texture }, uColour: { value: new T.Color(s.colour).multiplyScalar(s.strength) }, uFade: { value: 0 } },
      vertexShader,
      fragmentShader: `
        uniform sampler2D tColour; uniform sampler2D tRays; uniform vec3 uColour; uniform float uFade;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tColour, vUv);
          gl_FragColor = vec4(c.rgb + texture2D(tRays, vUv).r * uColour * uFade, c.a);
        }`,
      depthTest: false, depthWrite: false,
    }))
  }
  get uniforms() { return (this.rays.material as THREE.ShaderMaterial).uniforms }
  // How much the shafts show for a camera: full facing the sun by `facing[1]`, none by `facing[0]`.
  fade(camera: THREE.PerspectiveCamera) {
    const sun = this.uniforms.uSun.value as THREE.Vector3
    const forward = camera.getWorldDirection(sun.clone())
    const [a, b] = this.s.facing
    const k = Math.min(1, Math.max(0, (forward.dot(sun) - a) / (b - a)))
    return k * k * (3 - 2 * k)
  }
  setSize(width: number, height: number) {
    this.half.setSize(Math.max(1, Math.ceil(width * this.s.scale)), Math.max(1, Math.ceil(height * this.s.scale)))
  }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const camera = this.camera()
    const fade = camera ? this.fade(camera) : 0
    const blend = (this.blend.material as THREE.ShaderMaterial).uniforms
    blend.tColour.value = read.texture
    blend.uFade.value = fade
    if (camera && fade > 0) {
      const u = this.uniforms
      camera.updateMatrixWorld()
      const sun = (u.uSun.value as THREE.Vector3).clone().multiplyScalar(1000).add(camera.position).project(camera)
      ;(u.uSunUV.value as THREE.Vector2).set((sun.x + 1) / 2, (sun.y + 1) / 2)
      ;(u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse)
      ;(u.uCamRot.value as THREE.Matrix4).copy(camera.matrixWorld)
      u.tDepth.value = this.depth
      renderer.setRenderTarget(this.half)
      this.rays.render(renderer)
    }
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.blend.render(renderer)
  }
  dispose() {
    this.half.dispose()
    this.rays.material.dispose()
    this.blend.material.dispose()
    this.rays.dispose()
    this.blend.dispose()
  }
}

export function air() {
  let built: {
    sky: THREE.Object3D
    materials: THREE.Material[]
    geometries: THREE.BufferGeometry[]
  } | undefined
  const me = {
    uniforms: undefined as Record<string, THREE.IUniform> | undefined,
    shafts: undefined as Shafts | undefined,
    tick(p: Plugins) { if (!built && p.render3d.camera && p.wire.rows.some(r => r.kind === 'scenery')) build(p) },
    close(p: Plugins) {
      if (!built) return
      p.render3d.scene.remove(built.sky)
      for (const m of built.materials) m.dispose()
      for (const g of built.geometries) g.dispose()
      built = undefined
      me.uniforms = undefined
      me.shafts = undefined
    },
  }

  function build(p: Plugins) {
    const { render3d, wire } = p
    const T = render3d.THREE as typeof THREE
    const course = courseOf(wire)
    const light = course.light
    // the height of a bore's ceiling over the road, the land's `look.tunnel.height`
    const ceiling: number = course.look.tunnel?.height ?? 0
    const A: Air = light.air, D: Dome = light.dome
    const track: Track = trackOf(wire)
    const sun = new T.Vector3().fromArray(light.sun.dir).normalize()
    const bores = track.features.filter(f => f.kind === 'tunnel' || f.kind === 'underground')
    const haze = A.haze
    const uniforms: Record<string, THREE.IUniform> = {
      uAirAway: { value: new T.Color(A.away) },
      uAirToward: { value: new T.Color(A.toward) },
      uAirSpread: { value: A.spread },
      uAirSun: { value: sun },
      uAirHalo: { value: new T.Color(A.halo.colour).multiplyScalar(A.halo.strength) },
      uAirHaloSharp: { value: A.halo.sharp },
      uAirLayers: { value: A.layers.map(l => new T.Vector3(l.density, l.height, l.base)) },
      uAirTunnel: { value: new T.Color(A.tunnel.colour) },
      uAirTunnelDensity: { value: A.tunnel.density },
      uAirTunnelReach: { value: A.tunnel.reach },
      uAirInside: { value: 0 },
    }
    if (haze) {
      uniforms.uAirHaze = { value: haze.strength }
      if (haze.lights) {
        uniforms.uAirPointCount = { value: 0 }
        uniforms.uAirPointAt = { value: Array.from({ length: haze.lights }, () => new T.Vector3()) }
        uniforms.uAirPointColour = { value: Array.from({ length: haze.lights }, () => new T.Vector3()) }
      }
      if (haze.spots) {
        uniforms.uAirSpotCount = { value: 0 }
        for (const name of ['uAirSpotAt', 'uAirSpotColour', 'uAirSpotDir', 'uAirSpotCone']) uniforms[name] = { value: Array.from({ length: haze.spots }, () => new T.Vector3()) }
      }
    }
    const code = glsl(A)
    render3d.splice('air', {
      uniforms,
      fragment: {
        common: code,
        fog_fragment: `{
          vec3 airRay = vDressWorld - cameraPosition;
          float airLen = length(airRay);
          vec3 airD = airRay / max(airLen, 1e-4);
          gl_FragColor.rgb = airThrough(gl_FragColor.rgb, cameraPosition, airD, airLen) + airGlow(cameraPosition, airD, airLen);
        }`,
      },
    })

    // the sky: the air's colour at the horizon rising to `top`, the sun's disc, the lamps' glow
    const disc = A.disc
    const skyMaterial = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        ...uniforms,
        uTop: { value: new T.Color(D.top) }, uCurve: { value: D.curve }, uRadius: { value: D.radius },
        uDisc: { value: new T.Vector2(Math.cos(((disc?.size ?? 0) * Math.PI) / 180), Math.cos(((disc?.size ?? 0) * (1 - (disc?.edge ?? 0)) * Math.PI) / 180)) },
        uDiscColour: { value: new T.Color(disc?.colour ?? '#000000').multiplyScalar(disc?.strength ?? 0) },
        uMoonDir: { value: new T.Vector3().fromArray(D.moon?.dir ?? [0, 1, 0]).normalize() },
        uMoonHalo: { value: new T.Color(D.moon?.halo.colour ?? '#000000').multiplyScalar(D.moon?.halo.strength ?? 0) },
        uMoonSharp: { value: D.moon?.halo.sharp ?? 1 },
        uGlow: { value: new T.Color(D.glow?.colour ?? '#000000').multiplyScalar(D.glow?.strength ?? 0) },
        uGlowHeight: { value: D.glow?.height ?? 1 },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${code}
        uniform vec3 uTop; uniform float uCurve; uniform float uRadius; uniform vec2 uDisc; uniform vec3 uDiscColour;
        uniform vec3 uMoonDir; uniform vec3 uMoonHalo; uniform float uMoonSharp; uniform vec3 uGlow; uniform float uGlowHeight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = mix(airColour(d), uTop, pow(max(d.y, 0.0), uCurve));
          c += uGlow * exp(-max(d.y, 0.0) / uGlowHeight);
          c += uMoonHalo * pow(max(dot(d, uMoonDir), 0.0), uMoonSharp);
          ${disc ? 'c += uDiscColour * smoothstep(uDisc.x, uDisc.y, dot(d, uAirSun));' : ''}
          c = mix(c, uAirTunnel, uAirInside * (1.0 - exp(-uAirTunnelDensity * uAirTunnelReach)));
          gl_FragColor = vec4(c + airGlow(cameraPosition, d, uRadius), 1.0);
        }`,
    })
    const sky = new T.Group()
    sky.name = 'air.sky'
    const materials: THREE.Material[] = [skyMaterial], geometries: THREE.BufferGeometry[] = []
    const dome = new T.Mesh(new T.SphereGeometry(D.radius, 48, 24), skyMaterial)
    geometries.push(dome.geometry)
    dome.frustumCulled = false
    sky.add(dome)
    // the stars' flicker, by the page's clock, and the renderer's pixel ratio their size is given in
    const twinkle = { value: 0 }, ratio = { value: 1 }
    if (D.stars) {
      // the stars are placed and rolled by the scene's seed, so they stand the same on every page
      const S = D.stars
      const die = seeded((wire.scene.world!.seed as number) ^ 0x5ca7)
      const at: number[] = [], light: number[] = [], tint: number[] = [], phase: number[] = []
      const colours = S.colours.map(c => new T.Color(c))
      for (let k = 0; k < S.count; k++) {
        // evenly over the upper half of the sphere
        const a = die() * Math.PI * 2, up = die(), r = D.radius * 0.95, out = Math.sqrt(1 - up * up)
        at.push(Math.cos(a) * out * r, up * r, Math.sin(a) * out * r)
        light.push(Math.pow(die(), S.bright))
        const c = colours[Math.floor(die() * colours.length) % colours.length]
        tint.push(c.r, c.g, c.b)
        phase.push(die() * 100)
      }
      const g = new T.BufferGeometry()
      g.setAttribute('position', new T.Float32BufferAttribute(at, 3))
      g.setAttribute('aLight', new T.Float32BufferAttribute(light, 1))
      g.setAttribute('aTint', new T.Float32BufferAttribute(tint, 3))
      g.setAttribute('aPhase', new T.Float32BufferAttribute(phase, 1))
      const m = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
        uniforms: {
          uSize: { value: new T.Vector2(S.size[0], S.size[1]) }, uTwinkle: { value: S.twinkle }, uLow: { value: S.low }, uTime: twinkle,
          uRatio: ratio,
        },
        vertexShader: `
          attribute float aLight; attribute vec3 aTint; attribute float aPhase;
          uniform vec2 uSize; uniform float uTwinkle; uniform float uLow; uniform float uTime; uniform float uRatio;
          varying vec3 vLight;
          void main() {
            float up = normalize(position).y;
            float flicker = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (2.0 + fract(aPhase) * 5.0) + aPhase));
            vLight = aTint * aLight * flicker * smoothstep(0.0, uLow, up);
            gl_PointSize = mix(uSize.x, uSize.y, aLight) * uRatio;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vLight;
          void main() {
            vec2 q = gl_PointCoord * 2.0 - 1.0;
            float r = dot(q, q);
            if (r > 1.0) discard;
            gl_FragColor = vec4(vLight * exp(-r * 4.0), 1.0);
          }`,
      })
      geometries.push(g)
      materials.push(m)
      const points = new T.Points(g, m)
      points.frustumCulled = false
      sky.add(points)
    }
    if (D.moon) {
      const M = D.moon
      const g = new T.SphereGeometry(D.radius * M.size * 0.5, 32, 16), m = new T.MeshBasicMaterial({ color: M.colour, fog: false, depthWrite: false })
      geometries.push(g)
      materials.push(m)
      const moon = new T.Mesh(g, m)
      moon.position.fromArray(M.dir).normalize().multiplyScalar(D.radius * 0.9)
      sky.add(moon)
    }
    sky.renderOrder = -1
    sky.traverse(o => { o.renderOrder = -1 })

    // As the frame is drawn, the sky first: it stands round the camera, and the air learns whether the
    // camera is in a bore and where the lamps are.
    let hint = -1
    const at = new T.Vector3(), dir = new T.Vector3()
    dome.onBeforeRender = (_r, scene, camera) => {
      twinkle.value = performance.now() / 1000
      ratio.value = p.render3d.renderer?.getPixelRatio() ?? 1
      sky.position.copy(camera.position)
      sky.updateMatrixWorld()
      const c = camera.position
      const where = locate(track, c.x, c.z, hint)
      hint = where.i
      let into = 0
      if (Math.abs(where.side) < track.walls && c.y < where.height + ceiling) {
        for (const f of bores) {
          if (inside(f, where.s, track.length) < 1) continue
          const from = (((where.s - f.s0) % track.length) + track.length) % track.length
          into = Math.max(into, Math.min(1, Math.min(from, f.s1 - f.s0 - from) / A.tunnel.fade))
        }
      }
      uniforms.uAirInside.value = into
      if (!haze) return
      const points: THREE.PointLight[] = [], spots: THREE.SpotLight[] = []
      scene.traverseVisible(o => {
        const l = o as THREE.Light
        if (!l.isLight || l.intensity <= 0) return
        if ((l as THREE.SpotLight).isSpotLight) spots.push(l as THREE.SpotLight)
        else if ((l as THREE.PointLight).isPointLight) points.push(l as THREE.PointLight)
      })
      const near = <L extends THREE.Light>(list: L[], n: number) => list
        .map(l => ({ l, d: l.getWorldPosition(at).distanceToSquared(c) }))
        .sort((a, b) => a.d - b.d).slice(0, n).map(x => x.l)
      if (haze.lights) {
        const lit = near(points, haze.lights)
        uniforms.uAirPointCount.value = lit.length
        lit.forEach((l, k) => {
          l.getWorldPosition(uniforms.uAirPointAt.value[k])
          const col = uniforms.uAirPointColour.value[k] as THREE.Vector3
          col.set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity)
        })
      }
      if (haze.spots) {
        const lit = near(spots, haze.spots)
        uniforms.uAirSpotCount.value = lit.length
        lit.forEach((l, k) => {
          l.getWorldPosition(uniforms.uAirSpotAt.value[k])
          l.target.getWorldPosition(dir)
          ;(uniforms.uAirSpotDir.value[k] as THREE.Vector3).copy(dir.sub(uniforms.uAirSpotAt.value[k]).normalize())
          ;(uniforms.uAirSpotColour.value[k] as THREE.Vector3).set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity)
          ;(uniforms.uAirSpotCone.value[k] as THREE.Vector3).set(Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra)), l.distance)
        })
      }
    }
    render3d.scene.add(sky)
    me.uniforms = uniforms
    if (A.shafts) {
      const shafts = new Shafts(T, A.shafts, () => render3d.camera, sun)
      render3d.pass('air', shafts)
      me.shafts = shafts
    }
    built = { sky, materials, geometries }
  }
  return me
}
