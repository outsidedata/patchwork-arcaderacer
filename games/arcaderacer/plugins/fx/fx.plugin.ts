// fx: what the racers leave behind them and throw off, drawn in the page from the frame's rows of
// every racing kind (`RACING` in `drive.sim.ts`, the seats' `car` rows, and the CPU's
// rivals). Nothing here
// is read by a rule, so it has no server half and no row: each page draws it from the rows it is
// sent. Every effect it throws is particle3d's, by name from the effects file the scene's
// `world.particle3d` names, emitted from this page with `emit`; the tyre marks are its own mesh.
//
// A racing kind's definition holds `fx`, every number in metres and seconds, points in the car's
// own frame (x to its left, y up, z to its nose, as the model is drawn):
//   wheels     [[x, z], ...] the rear tyres' contact patches, where marks are laid and smoke rises.
//   exhausts   [[x, y, z], ...] the tail pipes, where the boost's flame comes out.
//   held       a brake counts as braking, for the marks and the smoke, once held this long.
//   marks      { width, slip, sideways, brake, least, gap, segments, life, fade, colour, opacity,
//              ink, roughness, edge, lift }: a tyre lays a mark `width` across while it slides,
//              faster than `least` m/s: drifting with more than `slip` radians of slip, gripping
//              with more than `sideways` m/s across its nose, or braking at more than `brake` m/s.
//              A mark is laid a piece each time the tyre has moved `gap` on, `lift` over the road,
//              of `colour` and `roughness`, at most `opacity` dark: `ink` of that and as much more
//              as it slides past its threshold, faded across its width by the `edge`th power of how
//              far off its middle; it holds `life` seconds and fades out over the last `fade` of
//              them. Each racing kind's marks are one mesh, `fx.marks.<kind>`, made the first frame
//              a racer of it is seen, which keeps the last `segments` pieces its racers laid, the
//              oldest given up first.
//   smoke      { effect, slip, sideways, brake, least, rise }: from each tyre sliding past those same
//              kinds of thresholds (each its own) faster than `least` m/s, `effect` pours out `rise`
//              over the road, coloured by the course file's `look.smoke`.
//   sparks     { effect, least, within, at, throw }: each frame a racer has touched a wall or
//              another racer in the last `within` seconds at more than `least` m/s, thrown from
//              `at` [aside, up, ahead] in its frame on the side it touched, along `throw` [along,
//              up]: that share of the way it goes and that much up.
//   flame      the effect pouring from each exhaust while it boosts, pointed back along the car.
//   pop        { effect, least, at }: thrown once from `at` in its frame the frame its boost grows by
//              more than `least` seconds: a drift has paid.
//   rush       { from, most, boosted, ease, samples, centre, inner, outer }: the seat's own car only, so
//              only a kind a seat drives has it. The frame's edges streak out from `centre` (a point
//              of the frame, 0 to 1 from its bottom left) as the world rushes past: a pass of
//              render3d's (`Rush`), handed over the first frame the seat's car is seen, whose
//              strength is `most` × the square of how far the car's speed has gone from `from` of its
//              top speed to all of it, `boosted` more while it boosts, eased out over its last `ease`
//              seconds, and 0 in a frame its car is not seen. Nothing streaks inside `inner` of the way
//              from the centre to the frame's corner, fully past `outer`, `samples` taken a pixel.
// `close` takes the marks out and ends every effect still pouring; the rush pass is render3d's,
// which disposes it as it closes.
import type * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { courseOf, locate, trackOf } from '../track/track.sim.ts'
import { RACING } from '../drive/drive.sim.ts'
import { holding } from '#plugins/player/player.plugin.ts'

type Effect = { at: number[]; dir?: number[]; life: number; age: number }

// A tyre's mark across the road where it last was: its two edges and its middle.
type Edges = { l: THREE.Vector3; r: THREE.Vector3; at: THREE.Vector3 }

// One kind's tyre marks: a ring of `size` pieces, `next` the one laid next, over the oldest.
type Marks = { mesh: THREE.Mesh; pos: Float32Array; born: Float32Array; ink: Float32Array; next: number; size: number }

// A racer as this page last saw it: what it is pouring and where its tyres last laid a mark.
type Seen = {
  smoke: (Effect | undefined)[]
  flame: (Effect | undefined)[]
  // the last edge pair laid per tyre, left and right, or undefined when it was not marking
  last: (Edges | undefined)[]
  boost: number
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

  // The marks mesh of a racing kind, made the first frame a racer of that kind is seen.
  function made(p: Plugins, kind: string, M: any): Marks {
    const had = marks.get(kind)
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
      color: M.colour, roughness: M.roughness, metalness: 0, transparent: true, opacity: M.opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), { surface: { uniforms: { uNow: now, uLife: { value: M.life }, uFade: { value: M.fade }, uEdge: { value: M.edge } }, ...MARKS } })
    const mesh = new T.Mesh(g, material)
    mesh.name = `fx.marks.${kind}`
    mesh.frustumCulled = false
    // a mark is dark rubber a hair over the road: the road under it already takes the shadow, and
    // taking it again on the mark only stripes it with the shadow map's acne
    mesh.receiveShadow = false
    p.render3d.scene.add(mesh)
    const it = { mesh, pos, born, ink, next: 0, size }
    marks.set(kind, it)
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

  const stop = (e: Effect | undefined) => { if (e) e.life = e.age }

  function forget(id: number) {
    const s = seen.get(id)
    if (!s) return
    for (const e of [...s.smoke, ...s.flame]) stop(e)
    seen.delete(id)
  }

  return {
    // the rush pass, once it has been handed to render3d
    get rush() { return rush },
    tick(p: Plugins) {
      const { wire, render3d, particle3d } = p
      if (!render3d?.camera) return
      const T = render3d.THREE as typeof THREE
      frame++
      // no rush unless the seat's own car is seen going fast this frame
      if (rush) rush.strength = 0
      const course = courseOf(wire)
      const track = trackOf(wire)
      const mine = holding(wire.rows)?.id
      const smokeTint = parseInt(String(course.look.smoke).slice(1), 16)
      for (const row of wire.rows as Row[]) {
        const d = row.data
        if (!RACING.includes(row.kind) || d.seg < 0) continue
        const F = def(wire, row.kind).fx
        const top = def(wire, row.kind).drive.top
        const s: Seen = seen.get(row.id) ?? { smoke: [], flame: [], last: [], boost: d.boost, frame }
        seen.set(row.id, s)
        s.frame = frame
        // the car's own frame, as drive draws it
        const body = new T.Matrix4().compose(
          new T.Vector3(d.pos[0], d.pos[1], d.pos[2]),
          new T.Quaternion().setFromEuler(new T.Euler(-d.pitch, d.yaw, d.roll, 'YXZ')),
          new T.Vector3(1, 1, 1),
        )
        const point = (x: number, y: number, z: number) => new T.Vector3(x, y, z).applyMatrix4(body)
        const speed = d.speed
        const fwd = [Math.sin(d.yaw), 0, Math.cos(d.yaw)]
        const sideways = Math.abs(d.vel[0] * -Math.cos(d.yaw) + d.vel[1] * Math.sin(d.yaw))
        const braking = d.brake > 0 && d.held > F.held
        // how hard it slides against each threshold, 0 for not at all
        const over = (at: { slip: number; sideways: number; brake: number }) => Math.max(
          d.drift ? Math.abs(d.slip) / at.slip - 1 : -1,
          sideways / at.sideways - 1,
          braking ? speed / at.brake - 1 : -1,
        )

        // tyre marks
        const M = F.marks
        const laid = made(p, row.kind, M)
        const marking = over(M)
        ;(F.wheels as number[][]).forEach(([x, z], w) => {
          const at = point(x, 0, z)
          const was = s.last[w]
          if (marking <= 0 || speed < M.least) {
            s.last[w] = undefined
            return
          }
          const across = point(x + M.width / 2, 0, z).sub(at)
          at.y += M.lift
          const edges = { l: at.clone().add(across), r: at.clone().sub(across), at }
          if (!was) {
            s.last[w] = edges
            return
          }
          if (was.at.distanceTo(at) < M.gap) return
          lay(laid, was, edges, Math.min(1, M.ink + marking))
          s.last[w] = edges
        })

        // smoke from the tyres
        const S = F.smoke
        const smoking = over(S) > 0 && speed > S.least
        ;(F.wheels as number[][]).forEach(([x, z], w) => {
          if (!smoking) {
            stop(s.smoke[w])
            s.smoke[w] = undefined
            return
          }
          const at = point(x, S.rise, z).toArray()
          if (!s.smoke[w] || s.smoke[w]!.life <= s.smoke[w]!.age) s.smoke[w] = particle3d.emit(S.effect, at, { life: 1e9, tint: smokeTint })
          else s.smoke[w]!.at = at
        })

        // sparks off a wall or a racer it is touching
        const K = F.sparks
        if (d.scrape < K.within && speed > K.least) {
          const where = locate(track, d.pos[0], d.pos[2], d.seg)
          const out = Math.sign(where.side) || 1
          // the side of the body toward what it touched: the wall it is nearer, the road's right is −x of the car
          const touch = point(-out * K.at[0], K.at[1], K.at[2]).toArray()
          const n = speed || 1
          particle3d.emit(K.effect, touch, { dir: [(d.vel[0] / n) * K.throw[0], K.throw[1], (d.vel[1] / n) * K.throw[0]] })
        }

        // the boost's flame, and the pop when it is paid
        ;(F.exhausts as number[][]).forEach(([x, y, z], k) => {
          if (d.boost <= 0) {
            stop(s.flame[k])
            s.flame[k] = undefined
            return
          }
          const at = point(x, y, z).toArray()
          const back = [-fwd[0], 0, -fwd[2]]
          if (!s.flame[k]) s.flame[k] = particle3d.emit(F.flame, at, { life: 1e9, dir: back })
          else {
            s.flame[k]!.at = at
            s.flame[k]!.dir = back
          }
        })
        if (d.boost > s.boost + F.pop.least) particle3d.emit(F.pop.effect, point(F.pop.at[0], F.pop.at[1], F.pop.at[2]).toArray())
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
      for (const [id, s] of [...seen]) if (s.frame !== frame) forget(id)
      now.value = (performance.now() - from) / 1000
    },
    close(p: Plugins) {
      for (const id of [...seen.keys()]) forget(id)
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
