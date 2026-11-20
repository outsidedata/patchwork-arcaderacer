// fx's mod for particle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.particle3d.mods: { sources: ['fx'] }` throws effects from every racer of every racing kind
// (`RACING` in `drive.sim.ts`) as its `world.particle3d.attach` says (particle3d's header, Attachments).
//
// `sources(plugins)` is asked once a frame, in particle3d's `afterTick`, after fx's browser half ticks: it reads every racer off
// the rows this page holds, and hands back for each, its sources each `of` the racer's kind:
//
//   wheel   one at each tyre of its car file's `tracks` (the car its row's `car` names), keyed by the racer's row and the tyre's place in
//           the list: `fx.smoke.rise` over the road at the tyre, its `floor` the road there, thrown back
//           along the racer's tail and up by half as much.
//   side    one while it has touched a wall or another racer in the last `fx.sparks.within` seconds at more
//           than `fx.sparks.least` m/s: at `fx.sparks.at` [aside, up, ahead] in its frame on the side of
//           whichever its body is nearer, another racer (`drive.radius` round each) or the wall, thrown
//           along `fx.sparks.throw` [along, up], that share of the way it goes and that much up.
//   tail    one at `fx.pop.at` in its frame.
//
// and their drivers, each a number every frame, each a driver the scene's effects file has:
//
//   speed      m/s it goes, for every source.
//   skid       a wheel's: how far it slides past `fx.smoke`'s thresholds (`over`), while it goes faster than
//              `fx.smoke.least` m/s; 0 for not at all.
//   burnout    a wheel's: the throttle held × how far under `fx.burnout.launch` m/s it goes, 0 to 1, so a
//              racer held on the throttle on the grid, or pulling away slowly, looks as if it spins its tyres.
//   smokeTint  a wheel's: the course file's `look.smoke`, the colour its tyre smoke is.
//   racer      a side's: 1 while what it touches is another racer, 0 a wall.
//   paid       a tail's: 1 the frame its boost grows by more than `fx.pop.least` seconds, a drift paid, else 0.
//
// What a racer slides by, for its smoke and fx's marks alike (`measure`, `over`), in the definition's
// `fx`: `held`, a brake counts as braking once held this long. A threshold block's
//   slip      radians of drift slip past which it slides,
//   sideways  m/s across its nose,
//   brake     m/s while braking,
//   turn      m/s² it turns at while it grips (speed × its rate of turn, not drifting),
//   burnout   the `burnout` above,
// each left out of a block that does not slide by it.
//
// `paid` reads the boost each racer had the frame before off fx's browser half (`boosts`), which fx keeps
// as it ticks.
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import type { Source } from '#plugins/particle3d/particle3d.plugin.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import { courseOf, locate, trackOf } from '../track/track.sim.ts'
import { RACING } from '../drive/drive.sim.ts'

// A point [x, y, z] in a racer's own frame (x to its left, y up, z to its nose) turned and moved into the
// world's, as drive draws it: turned by its roll about z, then -pitch about x, then yaw about y.
export function point(d: Row['data'], x: number, y: number, z: number): number[] {
  const cr = Math.cos(d.roll), sr = Math.sin(d.roll)
  const x1 = x * cr - y * sr, y1 = x * sr + y * cr
  const ca = Math.cos(-d.pitch), sa = Math.sin(-d.pitch)
  const y2 = y1 * ca - z * sa, z2 = y1 * sa + z * ca
  const cy = Math.cos(d.yaw), sy = Math.sin(d.yaw)
  return [d.pos[0] + x1 * cy + z2 * sy, d.pos[1] + y2, d.pos[2] - x1 * sy + z2 * cy]
}

// What a racer slides by this frame (the header), off its row and its definition.
export type Measure = { speed: number; slip: number; sideways: number; braking: boolean; turn: number; burnout: number }
export function measure(d: Row['data'], F: any): Measure {
  const speed = d.speed
  return {
    speed,
    slip: d.drift ? Math.abs(d.slip) : 0,
    sideways: Math.abs(d.vel[0] * -Math.cos(d.yaw) + d.vel[1] * Math.sin(d.yaw)),
    braking: d.brake > 0 && d.held > F.held,
    turn: d.drift ? 0 : Math.abs(speed * d.spin),
    burnout: d.throttle * Math.max(0, Math.min(1, 1 - Math.max(0, speed) / F.burnout.launch)),
  }
}

// How far past the thresholds of `at` a racer slides, the most of them, each how many times its threshold
// less 1; below 0 for not at all.
export function over(m: Measure, at: { slip?: number; sideways?: number; brake?: number; turn?: number; burnout?: number }): number {
  return Math.max(
    at.slip !== undefined && m.slip > 0 ? m.slip / at.slip - 1 : -1,
    at.sideways !== undefined ? m.sideways / at.sideways - 1 : -1,
    at.brake !== undefined && m.braking ? m.speed / at.brake - 1 : -1,
    at.turn !== undefined && m.turn > 0 ? m.turn / at.turn - 1 : -1,
    at.burnout !== undefined && m.burnout > 0 ? m.burnout / at.burnout - 1 : -1,
  )
}

export function sources(plugins: Plugins): Source[] {
  const { wire } = plugins
  const rows = wire.rows as Row[]
  const racers = rows.filter(r => RACING.includes(r.kind) && r.data.seg >= 0)
  if (!racers.length) return []
  const course = courseOf(wire), track = trackOf(wire)
  const smokeTint = parseInt(String(course.look.smoke).slice(1), 16)
  const last: (id: number) => number | undefined = plugins.fx.boosts
  const out: Source[] = []
  for (const row of racers) {
    const d = row.data, D = def(wire, row.kind), F = D.fx, of = row.kind
    const m = measure(d, F)
    const S = F.smoke
    const skid = m.speed > S.least ? Math.max(0, over(m, S)) : 0
    // back along its tail, and up by half as much
    const nose = point({ ...d, pos: [0, 0, 0] }, 0, 0, 1), back = [-nose[0], 0.5, -nose[2]]
    ;(json(wire, d.car).tracks as number[][]).forEach(([x, z], w) => {
      const road = point(d, x, 0, z)
      out.push({
        key: `${row.id}:${w}`, on: 'wheel', of, at: point(d, x, S.rise, z), dir: back, floor: road[1],
        drivers: { speed: m.speed, skid, burnout: m.burnout, smokeTint },
      })
    })

    const K = F.sparks
    if (d.scrape < K.within && m.speed > K.least) {
      const radius = D.drive.radius
      const where = locate(track, d.pos[0], d.pos[2], d.seg)
      const wall = track.walls - radius * 0.5 - Math.abs(where.side)
      // the nearest other racer, and how far its body is from this one's
      let near: Row | undefined, apart = Infinity
      for (const o of racers) {
        if (o === row) continue
        const gap = Math.hypot(o.data.pos[0] - d.pos[0], o.data.pos[2] - d.pos[2]) - 2 * radius
        if (gap < apart) { apart = gap; near = o }
      }
      // the side of the body toward what it touched, +x its left: the other racer's middle in its own
      // frame, or the wall it is nearer, the road's right being −x of the racer
      const racer = near !== undefined && apart < wall
      const aside = racer
        ? Math.sign((near!.data.pos[0] - d.pos[0]) * Math.cos(d.yaw) - (near!.data.pos[2] - d.pos[2]) * Math.sin(d.yaw)) || 1
        : -(Math.sign(where.side) || 1)
      const n = m.speed || 1
      out.push({
        key: `${row.id}:side`, on: 'side', of, at: point(d, aside * K.at[0], K.at[1], K.at[2]),
        dir: [(d.vel[0] / n) * K.throw[0], K.throw[1], (d.vel[1] / n) * K.throw[0]],
        drivers: { speed: m.speed, racer: racer ? 1 : 0 },
      })
    }

    const P = F.pop, was = last(row.id)
    out.push({
      key: `${row.id}:tail`, on: 'tail', of, at: point(d, P.at[0], P.at[1], P.at[2]),
      drivers: { speed: m.speed, paid: was !== undefined && d.boost > was + P.least ? 1 : 0 },
    })
  }
  return out
}
