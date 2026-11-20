// fx: what the racers leave behind them, drawn in the page from the frame's rows of every racing kind
// (`RACING` in `drive.sim.ts`, the seats' `car` rows, and the CPU's rivals). Nothing here is read by a
// rule, so it has no server half and no row: each page draws it from the rows it is sent. Its tyre marks
// and boost trail are its own meshes; every particle effect the racers throw (their tyre smoke and
// burnout, their sparks, the pop of a boost paid) is particle3d's, attached to the sources fx's mod
// hands particle3d (`fx.particle3d.ts`) by the scene's `world.particle3d.attach`, its numbers the
// effects file's and its drivers the sources'.
//
// Where a racer's tyres touch the road is its car's: the `tracks` of the car file its row's `car` names
// (`drive.plugin.ts`), [[x, z], ...] the rear tyres' contact patches in the car's own frame (x to its
// left, z to its nose, as the model is drawn), where marks are laid and smoke rises.
// A racing kind's definition holds `fx`, every number in metres and seconds, points in the car's
// own frame (x to its left, y up, z to its nose, as the model is drawn):
//   held      a brake counts as braking, for the marks and the smoke, once held this long.
//   burnout    { launch }: the throttle held under `launch` m/s looks as if it spins the tyres
//              (`fx.particle3d.ts`'s `burnout`).
//   marks      { width, gap, segments, life, fade, colour, opacity, roughness, edge, lift, lays }: a tyre
//              lays a mark `width` across while any of `lays` holds, each a threshold block of
//              `fx.particle3d.ts` (`slip`, `sideways`, `brake`, `turn`, `burnout`, any of them) with
//              `least`, `ink` and `most`: it holds while the racer slides past one of its thresholds
//              faster than `least` m/s, and its mark is `ink` and as much more as it slides past it, at
//              most `most`, of `opacity` dark; the darkest that holds is laid. A mark is laid a piece each
//              time the tyre has moved `gap` on, `lift` over the road, of `colour` and `roughness`,
//              faded across its width by the `edge`th power of how far off its middle; it holds `life`
//              seconds and fades out over the last `fade` of them. Each racing kind's marks are one
//              mesh, `fx.marks.<kind>`, made the first frame a racer of it is seen, which keeps the last
//              `segments` pieces its racers laid, the oldest given up first.
//   trail      { width, least, gap, segments, life, fade, colour, gain, opacity, edge, lift }: while a
//              racer boosts faster than `least` m/s, each tyre lays a line of light on the road as
//              it lays a mark, `colour` × `gain`, adding to the road under it, `opacity` at most, faded
//              out as a mark is. Each racing kind's trail is one mesh, `fx.trail.<kind>`.
//   smoke      { slip, sideways, brake, least, rise }: a tyre's `skid` (`fx.particle3d.ts`), and how high
//              over the road its sources stand.
//   sparks     { least, within, at, throw }: a racer's `side` source (`fx.particle3d.ts`).
//   pop        { least, at }: a racer's `tail` source and its `paid` (`fx.particle3d.ts`).
//   rush       { from, most, boosted, ease, samples, centre, inner, outer }: the seat's own car only, so
//              only a kind a seat drives has it. The frame's edges streak out from `centre` (a point
//              of the frame, 0 to 1 from its bottom left) as the world rushes past: a pass of
//              render3d's (`Rush`), handed over the first frame the seat's car is seen, whose
//              strength is `most` × the square of how far the car's speed has gone from `from` of its
//              top speed to all of it, `boosted` more while it boosts, eased out over its last `ease`
//              seconds, and 0 in a frame its car is not seen. Nothing streaks inside `inner` of the way
//              from the centre to the frame's corner, fully past `outer`, `samples` taken a pixel.
// `boosts(id)` is the boost the racer of row `id` had the frame before the last fx drew it, undefined for
// one it has not drawn twice: fx's mod is asked in particle3d's `afterTick`, after fx has ticked, so it
// reads its `paid` from that and the row's boost now.
// `close` takes the marks out; the rush pass is render3d's, which disposes it as it closes.
import type * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import { RACING } from '../drive/drive.sim.ts'
import { holding } from '#plugins/player/player.plugin.ts'
import { measure, over } from './fx.particle3d.ts'

// A tyre's mark across the road where it last was: its two edges and its middle.
type Edges = { l: THREE.Vector3; r: THREE.Vector3; at: THREE.Vector3 }

// One kind's tyre marks: a ring of `size` pieces, `next` the one laid next, over the oldest.
type Marks = { mesh: THREE.Mesh; pos: Float32Array; born: Float32Array; ink: Float32Array; next: number; size: number }

// A racer as this page last saw it: where its tyres last laid a mark, and its boost.
type Seen = {
  // the last edge pair laid per tyre, left and right, or undefined when it was not marking; and the
  // same for the boost's trail
  last: (Edges | undefined)[]
  trail: (Edges | undefined)[]
  boost: number
  was?: number
  frame: number
}

// The tyre marks drawn on the road: a surface on a dressed material, each piece fading by its age, and
// across its width by how far a fragment is off its middle. The width fade is worked out per fragment:
// `aAcross` is 0 or 1 at every corner, so worked out per corner it would be 0 everywhere.
const MARKS = {
  vertex: {
    common: 'attribute float aBorn; attribute float aInk; attribute float aAcross; uniform float uNow; uniform float uLife; uniform float uFade; varying float vMark; varying float vAcross;',
    begin_vertex: 'vMark = aInk * clamp((uLife - (uNow - aBorn)) / uFade, 0.0, 1.0); vAcross = aAcross;',
  },
  fragment: {
    common: 'uniform float uEdge; varying float vMark; varying float vAcross;',
    color_fragment: 'diffuseColor.a *= vMark * (1.0 - pow(abs(vAcross * 2.0 - 1.0), uEdge));',
  },
}

// The rush: each pixel drawn as the mean of `samples` taken along the line from it toward
// `centre`, over `strength` of the way there, as far as it stands between `inner` and `outer` of
// the way from the centre to the frame's corner, so the middle stays sharp and the edges stream.
class Rush extends Pass {
  quad: FullScreenQuad
  constructor(T: typeof THREE, R: { samples: number; centre: number[]; inner: number; outer: number }) {
    super()
    this.quad = new FullScreenQuad(new T.ShaderMaterial({
      defines: { SAMPLES: R.samples },
      uniforms: { tColour: { value: null }, uStrength: { value: 0 }, uCentre: { value: new T.Vector2(R.centre[0], R.centre[1]) }, uInner: { value: R.inner }, uOuter: { value: R.outer } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColour; uniform float uStrength; uniform vec2 uCentre; uniform float uInner; uniform float uOuter;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - uCentre;
          float reach = uStrength * smoothstep(uInner, uOuter, length(d) / length(max(uCentre, 1.0 - uCentre)));
          vec4 sum = vec4(0.0);
          for (int k = 0; k < SAMPLES; k++) sum += texture2D(tColour, vUv - d * reach * (float(k) / float(SAMPLES)));
          gl_FragColor = sum / float(SAMPLES);
        }`,
      depthTest: false, depthWrite: false,
    }))
  }
  get strength() { return (this.quad.material as THREE.ShaderMaterial).uniforms.uStrength.value }
  set strength(v: number) { (this.quad.material as THREE.ShaderMaterial).uniforms.uStrength.value = v }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    ;(this.quad.material as THREE.ShaderMaterial).uniforms.tColour.value = read.texture
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }
  dispose() {
    this.quad.material.dispose()
    this.quad.dispose()
  }
}

export function fx() {
  let rush: Rush | undefined
  const seen = new Map<number, Seen>()
  // each racing kind's marks, by its name, laid by the page's own clock in seconds
  const marks = new Map<string, Marks>()
  const now = { value: 0 }
  const from = performance.now()
  let frame = 0

  // A marks mesh `name`, made the first time it is asked for: dark rubber, or with `glow` light laid on
  // the road, `M.colour` × `M.gain`, adding to what is under it.
  function made(p: Plugins, name: string, M: any, glow = false): Marks {
    const had = marks.get(name)
    if (had) return had
    const T = p.render3d.THREE as typeof THREE
    const size = M.segments
    const g = new T.BufferGeometry()
    const pos = new Float32Array(size * 4 * 3), born = new Float32Array(size * 4).fill(-1e9), ink = new Float32Array(size * 4)
    const across = new Float32Array(size * 4)
    const index: number[] = []
    for (let k = 0; k < size; k++) {
      // corners: 0 old left, 1 old right, 2 new left, 3 new right; wound counter-clockwise seen from
      // above (old left, old right, new left: right then ahead is up), so the face looks up off the road
      across.set([0, 1, 0, 1], k * 4)
      const b = k * 4
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage))
    g.setAttribute('aBorn', new T.BufferAttribute(born, 1).setUsage(T.DynamicDrawUsage))
    g.setAttribute('aInk', new T.BufferAttribute(ink, 1).setUsage(T.DynamicDrawUsage))
    g.setAttribute('aAcross', new T.BufferAttribute(across, 1))
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(size * 4 * 3).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
    g.setIndex(index)
    const material = p.render3d.dress(new T.MeshStandardMaterial({
      ...(glow
        ? { color: 0, emissive: M.colour, emissiveIntensity: M.gain, blending: T.AdditiveBlending }
        : { color: M.colour, roughness: M.roughness }),
      metalness: 0, transparent: true, opacity: M.opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), { surface: { uniforms: { uNow: now, uLife: { value: M.life }, uFade: { value: M.fade }, uEdge: { value: M.edge } }, ...MARKS } })
    const mesh = new T.Mesh(g, material)
    mesh.name = name
    mesh.frustumCulled = false
    // a mark is dark rubber a hair over the road: the road under it already takes the shadow, and
    // taking it again on the mark only stripes it with the shadow map's acne
    mesh.receiveShadow = false
    p.render3d.scene.add(mesh)
    const it = { mesh, pos, born, ink, next: 0, size }
    marks.set(name, it)
    return it
  }

  // One piece of mark on `m` from the edges `a` (old) to `b` (new), `strength` dark.
  function lay(m: Marks, a: Edges, b: Edges, strength: number) {
    const k = m.next
    m.next = (m.next + 1) % m.size
    const at = now.value
    ;[a.l, a.r, b.l, b.r].forEach((v, c) => m.pos.set([v.x, v.y, v.z], (k * 4 + c) * 3))
    m.born.fill(at, k * 4, k * 4 + 4)
    m.ink.fill(strength, k * 4, k * 4 + 4)
    const g = m.mesh.geometry
    for (const name of ['position', 'aBorn', 'aInk']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute
      attr.addUpdateRange(k * 4 * attr.itemSize, 4 * attr.itemSize)
      attr.needsUpdate = true
    }
  }

  return {
    // the rush pass, once it has been handed to render3d
    get rush() { return rush },
    boosts: (id: number): number | undefined => seen.get(id)?.was,
    tick(p: Plugins) {
      const { wire, render3d } = p
      if (!render3d?.camera) return
      const T = render3d.THREE as typeof THREE
      frame++
      // no rush unless the seat's own car is seen going fast this frame
      if (rush) rush.strength = 0
      const mine = holding(wire.rows)?.id
      for (const row of wire.rows as Row[]) {
        const d = row.data
        if (!RACING.includes(row.kind) || d.seg < 0) continue
        const F = def(wire, row.kind).fx
        const top = def(wire, row.kind).drive.top
        const tracks: number[][] = json(wire, d.car).tracks
        const s: Seen = seen.get(row.id) ?? { last: [], trail: [], boost: d.boost, frame }
        seen.set(row.id, s)
        s.frame = frame
        // the car's own frame, as drive draws it
        const body = new T.Matrix4().compose(
          new T.Vector3(d.pos[0], d.pos[1], d.pos[2]),
          new T.Quaternion().setFromEuler(new T.Euler(-d.pitch, d.yaw, d.roll, 'YXZ')),
          new T.Vector3(1, 1, 1),
        )
        const point = (x: number, y: number, z: number) => new T.Vector3(x, y, z).applyMatrix4(body)
        const m = measure(d, F), speed = m.speed

        // tyre marks
        // a line on the road behind each tyre while `on`, `strength` of `M.opacity`, its last edges in `last`
        const lane = (m: Marks, M: any, last: (Edges | undefined)[], on: boolean, strength: number) => {
          tracks.forEach(([x, z], w) => {
            const at = point(x, 0, z)
            const was = last[w]
            if (!on) {
              last[w] = undefined
              return
            }
            const across = point(x + M.width / 2, 0, z).sub(at)
            at.y += M.lift
            const edges = { l: at.clone().add(across), r: at.clone().sub(across), at }
            if (!was) {
              last[w] = edges
              return
            }
            if (was.at.distanceTo(at) < M.gap) return
            lay(m, was, edges, strength)
            last[w] = edges
          })
        }
        // the darkest of the marks' lays that holds, or none
        const M = F.marks
        let ink = -1
        for (const L of M.lays) {
          const past = over(m, L)
          if (past > 0 && speed >= L.least) ink = Math.max(ink, Math.min(L.most, L.ink + past))
        }
        lane(made(p, `fx.marks.${row.kind}`, M), M, s.last, ink > 0, ink)

        // the boost's trail: light laid on the road behind each tyre while it boosts
        const B = F.trail
        lane(made(p, `fx.trail.${row.kind}`, B, true), B, s.trail, d.boost > 0 && speed >= B.least, 1)

        // the boost last frame and this, which fx's mod reads after this tick for the pop of a boost paid
        s.was = s.boost
        s.boost = d.boost

        // the world rushing past the seat's own car: the edges of the frame smeared out from its middle
        if (row.id === mine) {
          const R = F.rush
          if (!rush) {
            rush = new Rush(T, R)
            render3d.pass('fx', rush)
          }
          const fast = Math.max(0, Math.min(1, (speed / top - R.from) / (1 - R.from)))
          rush.strength = R.most * fast * fast + R.boosted * Math.min(1, d.boost / R.ease)
        }
      }
      // a racer this frame did not hold has left
      for (const [id, s] of [...seen]) if (s.frame !== frame) seen.delete(id)
      now.value = (performance.now() - from) / 1000
    },
    close(p: Plugins) {
      seen.clear()
      for (const m of marks.values()) {
        p.render3d.scene.remove(m.mesh)
        m.mesh.geometry.dispose()
        ;(m.mesh.material as THREE.Material).dispose()
      }
      marks.clear()
      rush = undefined
    },
  }
}
