// The browser half of volley3d: every launched round the page draws, drawn through particle3d. The
// server half (`volley3d.sim.ts`) says what a pattern holds, what every field of `world.volley3d`
// means, how a round flies and what an entry of the ledger row carries.
//
// A round is drawn with the effects its pattern's `look` names, each the page's own (particle3d's
// `emit`): `body` carried with it, turned along the way it goes, from the frame it is first drawn
// until it ends; `trail` thrown from where it is as it goes, stopped when it ends; and `burst` thrown
// where it met something, back the way it came. A round that ends at the end of its life, meeting
// nothing, stops its body and its trail and bursts nowhere. So this plugin is listed before
// particle3d, which is listed before render3d: an effect it emits or moves in its `afterTick` is then
// drawn that same frame, where listed after particle3d every round would be drawn a frame late, and
// that throws, as a scene that names no particle3d does.
//
// The rounds drawn are of two sorts:
//   - The server's, every entry of the ledger row the last packet carried, keyed `[from, n]` as the
//     sim half's `fire` names it, and drawn from its age: where `flight` puts it at the entry's age,
//     or, for a guided one, which no closed form flies, at the entry's `pos`. Where it met something
//     is the entry's `hit`, which the round takes the frame a packet brings it, stopping where it met
//     and bursting there. Such a round is drawn for as long as the row holds its entry.
//   - The page's alone, which the server has no entry of, what an editor previews a pattern with:
//     `fire(pattern, at, dir)` draws a round at once, from `at` along `dir`, and hands back its key,
//     `[0, k]`, since no row is row 0. Its age is 0 the frame it is fired and a step of the scene's
//     `dt` more each frame after, and it is where `flight` puts it at that age. It meets nothing, and
//     is drawn to the end of its flight and for `world.volley3d.hold` seconds after, as an entry is
//     kept.
//
// `volleys()` is every round the page has, `{ key, pos, hit? }`: its key, where it is drawn, and the
// entry's `hit` once a packet has brought it. A round leaves it the frame its entry leaves the row,
// or, for one of the page's alone, `hold` seconds after it ended.
//
// One of these per client: its rounds are its scene's, and `close` forgets them, the effects being
// particle3d's.
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import type { Effect } from '#plugins/particle3d/particle3d.plugin.ts'
import { check, flight, guided, patternOf, velocity, type Entry, type Numbers, type Hit, type Pattern, type Patterns } from './volley3d.sim.ts'

export type Key = [number, number]
export type Volley = { key: Key; pos: number[]; hit?: Hit }

type Round = {
  key: Key; pattern: string; at: number[]; dir: number[]
  age: number // the page's own clock for one of its alone, the entry's age for the server's
  fresh: boolean // fired since the last frame: its age is where it starts
  entry?: Entry // the server's entry it is drawn from; none for one of the page's alone
  pos: number[]; vel: number[]
  drawn: boolean // drawn on a frame before this one
  hit?: Hit
  over?: number // for one of the page's alone, its age when it ended
  body?: Effect; trail?: Effect
}

const unit = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2])
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : undefined
}

export function volley3d() {
  let rounds: Round[] = []
  let previews = 0
  let checked = false

  // Its effects stopped where it is.
  const stop = (r: Round) => {
    for (const fx of [r.body, r.trail]) {
      if (!fx) continue
      fx.at = r.pos.slice()
      fx.life = fx.age
    }
    r.body = r.trail = undefined
  }

  const burst = (plugins: Plugins, p: Pattern, r: Round, at: number[]) => {
    const back = unit(r.vel)
    if (p.look.burst) plugins.particle3d.emit(p.look.burst, at, back ? { dir: back.map(c => -c) } : {})
  }

  // Where a round is this frame, and how fast it goes: a guided entry's own `pos` and `vel`, which no
  // closed form gives, else where `flight` puts it at its age.
  const place = (p: Pattern, r: Round) => {
    const e = r.entry
    if (e && guided(p, e)) {
      r.pos = e.pos.slice()
      r.vel = e.vel.slice()
      return
    }
    const t = Math.min(r.age, p.life)
    r.pos = flight(p, r.at, r.dir, t)
    r.vel = velocity(p, r.dir, t)
  }

  return {
    // A round of the page's alone, drawn from this frame on. Its key.
    fire(pattern: string, at: number[], dir: number[]): Key {
      const key: Key = [0, ++previews]
      rounds.push({ key, pattern, at: at.slice(), dir: dir.slice(), age: 0, fresh: true, pos: at.slice(), vel: [0, 0, 0], drawn: false })
      return key
    },
    // Every round drawn.
    volleys(): Volley[] {
      return rounds.map(r => ({ key: [r.key[0], r.key[1]] as Key, pos: r.pos.slice(), ...(r.hit ? { hit: structuredClone(r.hit) } : {}) }))
    },
    afterTick(plugins: Plugins) {
      const { wire } = plugins
      const { scene } = wire
      const own = scene.world?.volley3d as Numbers | undefined
      if (!own) throw new Error('the scene names volley3d but gives no world.volley3d')
      if (!checked) {
        checked = true
        const order = scene.plugins!
        if (!order.includes('particle3d')) throw new Error('volley3d draws its rounds through particle3d, which this scene does not name')
        if (order.indexOf('particle3d') < order.indexOf('volley3d'))
          throw new Error('volley3d is listed after particle3d, which would draw every round a frame late')
      }
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      const file: Patterns = json(wire, own.patterns)
      check(file, own)

      // The ledger the last packet carried: each entry the round drawn from it, by the entry's id, or
      // a round drawn anew.
      const live: Entry[] = wire.rows.find(r => r.kind === 'volley3d')?.data.live ?? []
      const held = new Set<Round>()
      for (const e of live) {
        let r = rounds.find(r => r.entry?.id === e.id)
        if (!r) {
          r = { key: [e.from, e.n], pattern: e.pattern, at: e.at.slice(), dir: e.dir.slice(), age: e.age, fresh: true, pos: e.pos.slice(), vel: e.vel.slice(), drawn: false }
          rounds.push(r)
        }
        r.entry = e
        held.add(r)
      }

      const kept: Round[] = []
      for (const r of rounds) {
        // A round whose entry has gone from the row, and one of the page's alone whose pattern the file
        // no longer has, as a file the editor has written may say: drawn no more.
        if (r.entry ? !held.has(r) : !(r.pattern in file.patterns)) {
          stop(r)
          continue
        }
        if (r.entry) r.age = r.entry.age
        else if (!r.fresh) r.age += dt
        r.fresh = false
        const p = patternOf(file, r.pattern)
        if (!r.hit) place(p, r)
        // What the server says it met.
        const said = r.entry?.hit
        if (said && !r.hit) {
          r.hit = said
          r.pos = said.point.slice()
          burst(plugins, p, r, r.pos)
        }
        // Its effects: put on the first frame it is drawn flying, carried with it, and stopped once it
        // has ended.
        const flying = !r.hit && r.age < p.life - 1e-9
        const way = unit(r.vel)
        if (flying && !r.drawn) {
          const spawn = { life: Infinity, ...(way ? { dir: way } : {}) }
          if (p.look.body) r.body = plugins.particle3d.emit(p.look.body, r.pos, spawn)
          if (p.look.trail) r.trail = plugins.particle3d.emit(p.look.trail, r.pos, spawn)
        }
        if (!flying) stop(r)
        for (const fx of [r.body, r.trail]) {
          if (!fx) continue
          fx.at = r.pos.slice()
          if (way) fx.dir = way
        }
        r.drawn = true
        // One of the page's alone is kept `hold` seconds after it ends, as an entry is.
        if (!r.entry && !flying) {
          r.over ??= r.age
          if (r.age >= r.over + own.hold - 1e-9) continue
        }
        kept.push(r)
      }
      rounds = kept
    },
    close() {
      rounds = []
    },
  }
}
