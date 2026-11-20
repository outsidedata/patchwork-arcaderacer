// The race: one row, which runs the start, the clock, the order and the end. Its `phase`:
//   staging  a match's race, from the course's `reset` until every racer the match started is on the
//            course with its art in (`staged` in the match plugin), or the definition's `wait` seconds have
//            passed: the cars stand and no clock runs, so no seat is looking at a loading screen while the
//            others set off. A race of the title's rivals alone starts on `grid`.
//   grid     the cars stand on the grid; once a seat's `car` is there and `hold`
//            seconds have passed, the countdown starts.
//   count    `count` seconds tick down from the definition's `countdown`; at 0 the race goes.
//   go       `clock` runs from 0; every racer drives.
//   results  every car a seat holds has finished, or `grace` seconds have passed since the first did (the
//            match plugin's `humans`); every seat on the course sees the results, and the clock and the order
//            run on for the racers behind. `over` counts the seconds since, and `ended` is set once it
//            reaches the definition's `results`: the match addon sends every seat back to the lobby.
//   After every step's racing (`after`), in every phase, `order` is every placed racer's id, the
//   finished first in the order they finished, then the rest by how far they have come, so the grid
//   is in order before the race goes.
// Racers drive only in `go` and `results` (`racing` in the drive plugin). Its definition: `laps`, the
// race's length; `countdown`, the seconds counted down; `hold`, the seconds on the grid before the
// count; `wait`, the most seconds staging waits; `grace`, the seconds the others are given once the first
// seat has finished; `results`, the seconds the results are shown; and `hud`, where its readouts stand
// (the dash plugin). The match plugin starts the course over for each race, this row with it.
//
// Its act `flag`, which is closed so only a rule calls it, starts the count at once from the grid, with
// no seat's car there: the title's race of rivals alone, which its `curtain` flags off on the step the
// intro starts, so the intro's cue clock and the race's run together. It does nothing once the race has
// left the grid.
import type { Kind, W } from '#engine/engine.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { racers } from './plugins/drive/drive.sim.ts'
import { humans, staged } from './plugins/match/match.sim.ts'

// Where each racer stands: finished first, by when, then by how far it has come.
const ordered = (w: W) => racers(w)
  .filter(r => r.data.seg >= 0)
  .sort((a, b) => {
    const da = a.data.done, db = b.data.done
    if (da >= 0 || db >= 0) return da < 0 ? 1 : db < 0 ? -1 : da - db
    return b.data.far - a.data.far || a.id - b.id
  })
  .map(r => r.id)

export const race: Kind = {
  tick(me, dt, w) {
    const R = def(w, me.kind)
    const d = me.data
    if (d.phase === 'staging') {
      d.staged += dt
      if (staged(w) || d.staged >= R.wait) d.phase = 'grid'
      return
    }
    if (d.phase === 'grid') {
      if (!w.all('car').some(c => c.data.seg >= 0)) return
      d.waited += dt
      if (d.waited < R.hold) return
      d.phase = 'count'
      d.count = R.countdown
      return
    }
    if (d.phase === 'count') {
      d.count = Math.max(0, d.count - dt)
      if (d.count === 0) d.phase = 'go'
      return
    }
    d.clock += dt
    if (d.phase === 'results') {
      d.over += dt
      if (d.over >= R.results) d.ended = true
    }
  },
  // once every racer has moved this step
  after(me, _dt, w) {
    const d = me.data
    d.order = ordered(w)
    if (d.phase !== 'go') return
    const cars = humans(w)
    const done = cars.map(c => c.data.done).filter(t => t >= 0)
    if (done.length && (done.length === cars.length || d.clock - Math.min(...done) >= def(w, me.kind).grace)) d.phase = 'results'
  },
  acts: {
    flag(me, w) {
      if (me.data.phase !== 'grid') return
      me.data.phase = 'count'
      me.data.count = def(w, me.kind).countdown
    },
  },
}
