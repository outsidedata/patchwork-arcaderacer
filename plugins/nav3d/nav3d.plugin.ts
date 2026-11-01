// nav3d, the browser half: a view of the scene's graphs on render3d's scene, on while its flag is true
// (a testbed turns it on; it starts off):
//   graphs  every graph `world.nav3d.graphs` names: its ways as lines, a line straight from its `from` to
//           its `to` and a spline along its curve as shapes3d draws it, LINK, and its places as points,
//           NODE, each LIFT metres off the place along its up (its point's `normal`, or [0, 1, 0]), each
//           way lifted with the place its end is nearer, and, in a graph whose places give a `normal`,
//           each such place a line TICK metres along it, UPS. A graph's drawing is made the first frame
//           it is drawn and made again when its file is written again; all of it is let go the first
//           frame the flag is down, and in `close`.
// It draws what never moves, so render3d never eases it between the steps (`userData.teleport`). The
// graph is read as a rule reads it, through the loader (`graph`'s file, `nav3d.sim.ts`). Listed before
// render3d.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { pointsOf, type Graph, type Way } from './nav3d.sim.ts'
import { drawn as pieced } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'

// How far the lines and points are drawn off the places, and a place's up, metres; their colours; a
// point's size, pixels.
const LIFT = 0.05
const TICK = 0.4
const LINK = '#4fe3c1', NODE = '#ffffff', UPS = '#ffb347'
const DOT = 6

type Drawn = { places: object; lines: THREE.LineSegments; points: THREE.Points; ups?: THREE.LineSegments }

export function nav3d() {
  const drawn = new Map<string, Drawn>()

  const gone = (plugins: Plugins, d: Drawn) => {
    for (const o of d.ups ? [d.lines, d.points, d.ups] : [d.lines, d.points]) {
      plugins.render3d.scene.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
  }
  const clear = (plugins: Plugins) => {
    for (const d of drawn.values()) gone(plugins, d)
    drawn.clear()
  }

  function draw(plugins: Plugins, g: Graph): Drawn {
    const T = plugins.render3d.THREE as typeof THREE
    const off = (p: number[], n: number[], k: number) => [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k]
    const far = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    // The up of the place nearest a point: a way's ends stand on places.
    const upAt = (p: number[]) => {
      let best = g.places[0]
      for (const q of g.places) if (far(p, q.point.at) < far(p, best.point.at)) best = q
      return best?.point.normal ?? [0, 1, 0]
    }
    // A way along its shape, a straight piece at a time as shapes3d draws a spline, each place lifted along
    // the up of the end it is nearer.
    const pieces = (wy: Way) => {
      const ends = pointsOf(wy)
      const ua = upAt(ends[0]), ub = upAt(ends[ends.length - 1])
      if ('line' in wy) return [...off(wy.line.from, ua, LIFT), ...off(wy.line.to, ub, LIFT)]
      const { pts, at: along } = pieced(wy.spline)
      const total = along[along.length - 1]
      const lift = (k: number) => off(pts[k], along[k] * 2 <= total ? ua : ub, LIFT)
      return pts.slice(1).flatMap((_, i) => [...lift(i), ...lift(i + 1)])
    }
    const ends = new T.BufferGeometry()
    ends.setAttribute('position', new T.Float32BufferAttribute(g.ways.flatMap(pieces), 3))
    const lines = new T.LineSegments(ends, new T.LineBasicMaterial({ color: LINK }))
    const spots = new T.BufferGeometry()
    spots.setAttribute('position', new T.Float32BufferAttribute(g.places.flatMap(p => off(p.point.at, p.point.normal ?? [0, 1, 0], LIFT)), 3))
    const points = new T.Points(spots, new T.PointsMaterial({ color: NODE, size: DOT, sizeAttenuation: false }))
    let ups: THREE.LineSegments | undefined
    if (g.places.some(p => p.point.normal)) {
      const sticks = new T.BufferGeometry()
      sticks.setAttribute('position', new T.Float32BufferAttribute(g.places.flatMap(p => {
        const n = p.point.normal
        return n ? [...off(p.point.at, n, LIFT), ...off(p.point.at, n, LIFT + TICK)] : []
      }), 3))
      ups = new T.LineSegments(sticks, new T.LineBasicMaterial({ color: UPS }))
    }
    for (const o of ups ? [lines, points, ups] : [lines, points]) {
      o.userData.teleport = true
      plugins.render3d.scene.add(o)
    }
    return { places: g.places, lines, points, ups }
  }

  const me = {
    graphs: false,
    tick(plugins: Plugins) {
      if (!me.graphs) return clear(plugins)
      const graphs = (plugins.wire.scene.world?.nav3d?.graphs ?? {}) as Record<string, { asset: string }>
      for (const [name, d] of drawn) if (!(name in graphs)) { gone(plugins, d); drawn.delete(name) }
      for (const [name, e] of Object.entries(graphs)) {
        const g = json(plugins.wire, e.asset) as Graph
        const had = drawn.get(name)
        if (had?.places === g.places) continue
        if (had) gone(plugins, had)
        drawn.set(name, draw(plugins, g))
      }
    },
    close(plugins: Plugins) { clear(plugins) },
  }
  return me
}
