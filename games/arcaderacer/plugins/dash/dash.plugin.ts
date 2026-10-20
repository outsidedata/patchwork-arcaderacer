// dash: arcaderacer's HUD, drawn over the race from the rows this seat is sent: the `race` row, the
// seat's own car, the `car` its `player` row holds (`holding`), and every racer for the order and the
// map. It shows things in its `tick`, so `shipped` is listed after `ui`. Its panels and
// styles are `world.ui`'s; every place, word and size inside a panel is the `race` definition's
// `hud`. Each text there is { at, anchor?, text, style }: `style` a `world.ui` style, and `anchor`
// the point of the text, as fractions of it across and down, that stands at `at` (its top left when
// left out).
//   place      { at, text, style }  where the seat's car stands: `text` with {place} and {of} filled.
//   lap        { at, text, style }  {lap} of {laps}, the lap it is on (its last while finished).
//   time       { at, text, style }  {time}, the race's clock; `lapTime` and `best` the same for the
//                                   lap it is on and its best, {time} a dash before there is one.
//   lapTime, best   as `time`.
//   speed      { at, text, style, per }  {speed}, its speed × `per` (km/h for 3.6), whole.
//   boost      { at, bar }          a bar of the boost it holds out of the drive's `most`, in
//                                   `world.ui`'s `bar` style's `fill`, `boosting` while it burns.
//   drift      { at, text, style }  shown while it drifts: {slide}, the seconds of it, to a tenth.
//   count      { at, style, go, goFor }  the countdown's whole seconds left, then `go` for `goFor`
//                                   seconds once the race has gone.
//   split      { at, text, style, for }  `text` with {n}, the checkpoint passed, for `for` seconds.
//   finish     { at, text, style }  shown once the car has finished. The race's results, which every
//                                   seat on the course sees once the leader has finished, are the
//                                   match plugin's.
//   map       { at, size, line, width, dot, you, them }  the circuit drawn to fit a box `size`
//                                   pixels square at `at`, `width` pixels thick in `line`; each racer
//                                   a dot `dot` pixels across, the seat's car in `you` and the rest in
//                                   `them`.
// Times are written m:ss.cc.
import type * as PIXI from 'pixi.js'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { trackOf } from '../track/track.sim.ts'
import { holding } from '#plugins/player/player.plugin.ts'
import { RACING } from '../drive/drive.sim.ts'

// Seconds as m:ss.cc.
export const clock = (t: number) => {
  const cs = Math.floor(t * 100 + 1e-6)
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

// `text` with each {key} of `fill` written in.
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`))

export function dash() {
  // the circuit's outline in the map box, once
  let outline: { points: number[]; scale: number; cx: number; cz: number } | undefined

  return {
    tick(p: Plugins) {
      const { ui, wire } = p
      const T = ui.PIXI as typeof PIXI
      const race = wire.rows.find(r => r.kind === 'race')
      const car = holding(wire.rows)
      if (!race || !car || car.data.seg < 0) return
      const H = def(wire, race.kind).hud
      const laps = def(wire, race.kind).laps
      const d = car.data
      const text = (key: string, spec: { at: number[]; style: string; anchor?: number[] }, value: string) => {
        const t = ui.show('hud', key, () => new T.Text({ text: '', style: ui.style(spec.style) })) as PIXI.Text
        t.position.set(spec.at[0], spec.at[1])
        if (spec.anchor) t.anchor.set(spec.anchor[0], spec.anchor[1])
        t.text = value
        return t
      }
      const order: number[] = race.data.order
      const place = order.indexOf(car.id) + 1 || order.length + 1
      const racers = wire.rows.filter(r => RACING.includes(r.kind) && r.data.seg >= 0)
      text('place', H.place, fill(H.place.text, { place, of: racers.length }))
      text('lap', H.lap, fill(H.lap.text, { lap: Math.min(laps, d.lap + 1), laps }))
      const going = race.data.phase === 'go' || race.data.phase === 'results'
      text('time', H.time, fill(H.time.text, { time: clock(race.data.clock) }))
      text('lapTime', H.lapTime, fill(H.lapTime.text, { time: going && d.done < 0 ? clock(race.data.clock - d.lapAt) : '-' }))
      text('best', H.best, fill(H.best.text, { time: d.best >= 0 ? clock(d.best) : '-' }))
      text('speed', H.speed, fill(H.speed.text, { speed: Math.round(d.speed * H.speed.per) }))
      const look = ui.style('bar')
      const most = def(wire, car.kind).drive.most
      const b = ui.show('hud', 'boost', () => ui.bar(look)) as PIXI.Container & { set(k: number, f: unknown): void }
      b.position.set(H.boost.at[0], H.boost.at[1])
      b.set(d.boost / most, d.boost > 0 ? look.boosting : look.fill)
      if (d.drift) text('drift', H.drift, fill(H.drift.text, { slide: d.slide.toFixed(1) }))
      if (race.data.phase === 'count') text('count', H.count, String(Math.ceil(race.data.count)))
      else if (going && race.data.clock < H.count.goFor) text('count', H.count, H.count.go)
      const cuts = trackOf(wire).checkpoints
      if (d.splitAt >= 0 && d.done < 0 && race.data.clock - d.splitAt < H.split.for && d.split % cuts !== 0) {
        text('split', H.split, fill(H.split.text, { n: d.split % cuts }))
      }
      if (d.done >= 0) text('finish', H.finish, H.finish.text)
      // the map
      const M = H.map
      if (!outline) {
        const t = trackOf(wire)
        const xs = Array.from(t.x), zs = Array.from(t.z)
        const lo = [Math.min(...xs), Math.min(...zs)], hi = [Math.max(...xs), Math.max(...zs)]
        const scale = M.size / Math.max(hi[0] - lo[0], hi[1] - lo[1])
        const cx = (lo[0] + hi[0]) / 2, cz = (lo[1] + hi[1]) / 2
        const points: number[] = []
        for (let i = 0; i <= t.n; i++) points.push(...at(xs[i % t.n], zs[i % t.n], { scale, cx, cz }, M))
        outline = { points, scale, cx, cz }
      }
      const o = outline
      ui.show('hud', 'map', () => new T.Graphics().poly(o.points, false).stroke({ width: M.width, color: M.line }))
      const dots = ui.show('hud', 'mapDots', () => new T.Graphics()) as PIXI.Graphics
      dots.clear()
      for (const r of racers) {
        const [x, y] = at(r.data.pos[0], r.data.pos[2], o, M)
        dots.circle(x, y, M.dot / 2).fill(r.id === car.id ? M.you : M.them)
      }
    },
  }
}

// A point of the ground as the map draws it: x across to the right as seen from above with +z up the
// map, so the map is the circuit as it lies, looked down on.
function at(x: number, z: number, o: { scale: number; cx: number; cz: number }, M: { at: number[]; size: number }): [number, number] {
  return [M.at[0] + M.size / 2 - (x - o.cx) * o.scale, M.at[1] + M.size / 2 - (z - o.cz) * o.scale]
}
