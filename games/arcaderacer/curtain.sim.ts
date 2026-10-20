// The curtain: the title's intro, held until a page can show it, and the title's race flagged off with
// it. The intro (core's `plugins/cutscene`, the scene's `world.cutscene.script`) is not `auto`: a page
// that has just arrived is still fetching the car and the course's textures, and an intro played to an
// empty set is wasted. One row. Its act `ready`, which is open, is sent by a page once every model and
// texture the title's catalogue holds is in (`curtain.client.ts`). Then, in one step, it starts the
// cutscene (its closed act `start`) and flags the race off the grid (the race's closed act `flag`),
// each called with seat −1, so the cue clock and the race's clock run together from that step and the
// cars are where the cue file was written for them (`assets/intro.ts`). So that no page can hold it for
// ever, the row does the same itself once it has waited its definition's `wait` seconds. `t` is the
// seconds the row has waited, and `started` that it has started both; a second `ready`, or one after
// the wait, does nothing, and the intro plays once for the life of the truth: a seat that comes later
// finds it done, and the race already running behind the title.
import type { Kind, Row, W } from '#engine/engine.ts'
import { def } from '#plugins/loader/loader.sim.ts'

function raise(me: Row, w: W) {
  if (me.data.started) return
  me.data.started = true
  w.call(w.find('cutscene'), 'start', -1)
  w.call(w.find('race'), 'flag', -1)
}

export const curtain: Kind = {
  before(me, dt, w) {
    if (me.data.started) return
    me.data.t += dt
    if (me.data.t >= def(w, me.kind).wait - 1e-9) raise(me, w)
  },
  acts: {
    ready(me, w) { raise(me, w) },
  },
  open: ['ready'],
}
