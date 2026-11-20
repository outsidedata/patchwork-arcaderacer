// puppet3d's feet, measured: a kind posed by puppet3d's own code from a stand up to a speed, held there,
// and back down to a stand, and what its feet and its body did on the way, in numbers, so a sheet's
// numbers can be changed and the change read. Run by hand:
//
//   node --experimental-strip-types plugins/puppet3d/puppet3d.feet.ts <scene.json> <kind> \
//       feet=<bone>,<bone>,… body=<bone>,<bone>,… speed=<metres a second> accel=<metres a second squared> \
//       stand=<seconds> hold=<seconds> steady=<seconds> down=<metres> mods=<a.puppet3d.ts>,<b.puppet3d.ts>,… \
//       [row=<field>:<number>,…] [try=<entry>:<path>:<number>,…] [out=<file.json>]
//
// `<scene.json>`, `<kind>` and `mods=` are `puppet3d.clips.ts`'s. `feet=` names the bones whose tails are
// the bottoms of the feet, `body=` the bones whose heads say how high the body rides (a pelvis, a chest).
// `row=` sets fields of the row its senses read (`upright:1`), over the scene's prefab of the kind.
// `try=` runs with a number of a file changed and the file left as it is: the loader entry, the number's
// place in it by its keys with dots between, and the number (`horse_1:walk.gait.hurry:3`).
//
// The body is posed by `stand`, `stepped`, `sensed` and `stood`, as the plugin poses it, every driver laid
// by its weight, on flat ground at height 0, a step of the scene's `dt` at a time, going straight ahead
// (+z). The run is six phases:
//   standing      `stand` seconds, still;
//   speeding up   the row's speed up by `accel` to `speed`;
//   settling      `hold` less `steady` seconds at `speed`;
//   steady        `steady` seconds more at `speed`, the stride every other phase is read against;
//   slowing down  the row's speed down by `accel` to 0;
//   stopped       `stand` seconds, still.
//
// Everything is read off the bones as they are drawn, never off a solver's own state, so it reads any
// solver. A foot is down while its bottom is within `down` metres of where it stood before the run began.
// For each phase, the worst of its feet:
//   slide    metres a foot moved over the ground while down, and its most in one step: a foot down holds
//            still, so any of it is a foot skating.
//   behind, ahead   how far behind and ahead of where it stands under a still body a foot got, metres
//            along the way the body faces: a foot left behind reads far behind.
//   held     the longest a foot stayed down without a break, seconds.
//   air      the longest a foot stayed up without a break, seconds.
//   steps    the feet put down in the phase, and the shortest and longest step, metres from where the
//            foot last stood.
//   fastest  a foot's top speed over the ground, metres a second.
//   snap     the most a foot's velocity changed from one step to the next, metres a second: a foot that
//            jumps reads high.
//   stretch  the most any bone of the layout was longer or shorter than it is at rest, metres, and the
//            bone: a leg that cannot reach its foot stretches a bone.
//   dip, rise   how far under and over its standing height a `body` bone's head got, metres.
//   sunk     how far under where it stood a foot's bottom got, metres.
// Then each foot's own numbers, then the start (how long after the body began to move each foot first
// left the ground, how far the body had gone, and how far behind the foot was by then) and the stop (how
// long after the body stopped each foot was last put down, and the feet put down after it stopped).
// Last, the start and the stop against the steady stride: how far each number went past the steady
// stride's own, 0 where it went no further. `out=` writes every number, every step's sample and every footfall as JSON.
import fs from 'node:fs'
import path from 'node:path'
import { sensed, sheetsOf, solvers, stand, stepped, stood, type Behaviors, type BoneCues, type Def, type Ridden, type Skeleton, type Solver, type V3 } from './puppet3d.plugin.ts'

const root = path.join(import.meta.dirname, '..', '..')
const args = process.argv.slice(2)
const named = Object.fromEntries(args.slice(2).map(a => a.split('=', 2) as [string, string]))
const NEED = ['feet', 'body', 'speed', 'accel', 'stand', 'hold', 'steady', 'down', 'mods']
if (args.length < 2 || NEED.some(k => !named[k])) {
  console.error('puppet3d feet: <scene.json> <kind> feet=<bone>,… body=<bone>,… speed=<m/s> accel=<m/s²> stand=<s> hold=<s> steady=<s> down=<m> mods=<a.puppet3d.ts>,… [row=<field>:<number>,…] [try=<entry>:<path>:<number>,…] [out=<file.json>]')
  process.exit(1)
}
const [sceneFile, kind] = args
const feet = named.feet.split(','), bodyBones = named.body.split(',')
const speed = Number(named.speed), accel = Number(named.accel), standFor = Number(named.stand), holdFor = Number(named.hold), steadyFor = Number(named.steady), downBy = Number(named.down)
if (!(steadyFor < holdFor)) throw new Error(`puppet3d feet: steady=${named.steady} is not less than hold=${named.hold}`)

const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'))
const world = scene.world, assets = world.loader.assets as Record<string, { url: string }>
const fileOf = (entry: string) => {
  const a = assets[entry]
  if (!a) throw new Error(`puppet3d feet: ${sceneFile}'s catalogue has no entry ${entry}`)
  return path.join(root, a.url.replace(/^\//, ''))
}
const tries = (named.try ? named.try.split(',') : []).map(t => { const [entry, at, value] = t.split(':'); return { entry, keys: at.split('.'), value: Number(value) } })
const read = (entry: string) => {
  const file = JSON.parse(fs.readFileSync(fileOf(entry), 'utf8'))
  for (const t of tries) {
    if (t.entry !== entry) continue
    let o = file
    for (const k of t.keys.slice(0, -1)) o = o?.[k]
    const last = t.keys[t.keys.length - 1]
    if (typeof o?.[last] !== 'number') throw new Error(`puppet3d feet: ${entry} has no number at ${t.keys.join('.')}`)
    o[last] = t.value
  }
  return file
}
const d = read(world.defs)[kind] as Def
if (!d?.layouts) throw new Error(`puppet3d feet: ${world.defs} has no puppet3d definition of ${kind}`)
const mods = await Promise.all(named.mods.split(',').map(f => import(path.resolve(f)) as Promise<{ behaviors: Behaviors }>))
const table: Record<string, Solver> = Object.assign({}, ...mods.map(m => m.behaviors()))
const { drivers, blocks } = solvers(d, table, read)
const sheets = Object.fromEntries(sheetsOf(d).map(e => [e, read(e) as BoneCues]))
const names = Object.keys(d.layouts), first = names.find(n => d.layouts[n].on === 'world')!
const sks = names.map(n => ({ ...read(d.layouts[n].skeleton), entry: d.layouts[n].skeleton }) as Skeleton)
const rest = sks[names.indexOf(first)].bones
const indexOf = (bone: string) => {
  const i = rest.findIndex(b => b.name === bone)
  if (i < 0) throw new Error(`puppet3d feet: ${kind}'s ${first} has no bone ${bone}`)
  return i
}
const footAt = feet.map(indexOf), bodyAt = bodyBones.map(indexOf)
const dt = scene.prefabs.engine.dt as number
const data = structuredClone(scene.prefabs[kind] ?? {}) as Record<string, any>
for (const pair of named.row ? named.row.split(',') : []) {
  const [field, value] = pair.split(':')
  if (!(field in data)) throw new Error(`puppet3d feet: ${kind}'s prefab has no field ${field}`)
  data[field] = Number(value)
}
const flat = () => 0
const length = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const restLength = rest.map(b => length(b.head, b.tail))

// The run: every step's sample, read off the layout on the world as it is drawn.
const PHASES = ['standing', 'speeding up', 'settling', 'steady', 'slowing down', 'stopped'] as const
type Phase = (typeof PHASES)[number]
type Sample = { t: number; phase: Phase; v: number; z: number; feet: V3[]; body: number[]; stretch: number; stretched: string }
const at: Ridden = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0] }
const s = stand(kind, d, table, blocks, sks, at, flat, data)
const samples: Sample[] = []
let clock = 0, v = 0
const take = (phase: Phase) => {
  const list = stood(kind, d, table, blocks, sheets, s, sensed(kind, d, table, drivers, s, data, at, clock), at)[first]
  let stretch = 0, stretched = ''
  list.forEach((b, i) => { const by = length(b.head, b.tail) - restLength[i]; if (Math.abs(by) > Math.abs(stretch)) { stretch = by; stretched = b.name } })
  samples.push({ t: clock, phase, v, z: at.pos[2], feet: footAt.map(i => [...list[i].tail] as V3), body: bodyAt.map(i => list[i].head[1]), stretch, stretched })
}
const go = (phase: Phase, want: number) => {
  v += Math.min(accel * dt, Math.max(-accel * dt, want - v))
  at.pos = [0, 0, at.pos[2] + v * dt]
  at.vel = [0, 0, v]
  stepped(table, drivers, blocks, s, data, at, dt, flat)
  clock += dt
  take(phase)
}
const steps = (seconds: number) => Math.round(seconds / dt)
take('standing')
for (let i = 0; i < steps(standFor); i++) go('standing', 0)
while (v < speed) go('speeding up', speed)
for (let i = 0; i < steps(holdFor - steadyFor); i++) go('settling', speed)
for (let i = 0; i < steps(steadyFor); i++) go('steady', speed)
while (v > 0) go('slowing down', 0)
for (let i = 0; i < steps(standFor); i++) go('stopped', 0)

// Each foot's samples read: whether it is down, and each time it is put down.
const home = samples[0]
const isDown = (k: number, i: number) => Math.abs(samples[i].feet[k][1] - home.feet[k][1]) <= downBy
const trail = (k: number, i: number) => (samples[i].feet[k][2] - samples[i].z) - (home.feet[k][2] - home.z)
type Fall = { foot: string; t: number; phase: Phase; step: number; held: number; air: number }
const falls: Fall[] = []
feet.forEach((foot, k) => {
  let stoodAt = home.feet[k], lifted = 0, landed = 0
  for (let i = 1; i < samples.length; i++) {
    const was = isDown(k, i - 1), now = isDown(k, i)
    if (was && !now) lifted = samples[i].t
    if (!was && now) {
      const p = samples[i].feet[k]
      falls.push({ foot, t: samples[i].t, phase: samples[i].phase, step: Math.hypot(p[0] - stoodAt[0], p[2] - stoodAt[2]), held: lifted - landed, air: samples[i].t - lifted })
      stoodAt = p
      landed = samples[i].t
    }
  }
})
falls.sort((a, b) => a.t - b.t)

// One foot's numbers over one phase.
type Numbers = {
  slide: number; slideStep: number; behind: number; ahead: number; held: number; air: number
  steps: number; shortest: number; longest: number; fastest: number; snap: number; sunk: number
}
function footIn(k: number, phase: Phase): Numbers {
  const n: Numbers = { slide: 0, slideStep: 0, behind: 0, ahead: 0, held: 0, air: 0, steps: 0, shortest: Infinity, longest: 0, fastest: 0, snap: 0, sunk: 0 }
  let downRun = 0, upRun = 0
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].phase !== phase) { downRun = 0; upRun = 0; continue }
    const p = samples[i].feet[k], off = trail(k, i)
    n.behind = Math.max(n.behind, -off)
    n.ahead = Math.max(n.ahead, off)
    n.sunk = Math.max(n.sunk, home.feet[k][1] - p[1])
    if (isDown(k, i)) { downRun += dt; upRun = 0 } else { upRun += dt; downRun = 0 }
    n.held = Math.max(n.held, downRun)
    n.air = Math.max(n.air, upRun)
    if (i === 0) continue
    const q = samples[i - 1].feet[k], move: V3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
    n.fastest = Math.max(n.fastest, Math.hypot(move[0], move[2]) / dt)
    if (isDown(k, i) && isDown(k, i - 1)) {
      const moved = Math.hypot(move[0], move[2])
      n.slide += moved
      n.slideStep = Math.max(n.slideStep, moved)
    }
    if (i > 1) {
      const r = samples[i - 2].feet[k]
      n.snap = Math.max(n.snap, Math.hypot(move[0] - (q[0] - r[0]), move[1] - (q[1] - r[1]), move[2] - (q[2] - r[2])) / dt)
    }
  }
  for (const f of falls) {
    if (f.foot !== feet[k] || f.phase !== phase) continue
    n.steps++
    n.shortest = Math.min(n.shortest, f.step)
    n.longest = Math.max(n.longest, f.step)
  }
  if (!n.steps) n.shortest = 0
  return n
}

// One phase's numbers: the worst of its feet, and the body's.
type PhaseNumbers = Numbers & { phase: Phase; from: number; to: number; stretch: number; stretched: string; dip: number; rise: number; feet: Record<string, Numbers> }
const phases: PhaseNumbers[] = PHASES.map(phase => {
  const each = feet.map((_, k) => footIn(k, phase)), mine = samples.filter(x => x.phase === phase)
  const most = (f: (n: Numbers) => number) => Math.max(...each.map(f))
  let stretch = 0, stretched = '', dip = 0, rise = 0
  for (const x of mine) {
    if (Math.abs(x.stretch) > Math.abs(stretch)) { stretch = x.stretch; stretched = x.stretched }
    x.body.forEach((y, b) => { dip = Math.max(dip, home.body[b] - y); rise = Math.max(rise, y - home.body[b]) })
  }
  const stepped = each.filter(n => n.steps)
  return {
    phase, from: mine[0].t, to: mine[mine.length - 1].t,
    slide: most(n => n.slide), slideStep: most(n => n.slideStep), behind: most(n => n.behind), ahead: most(n => n.ahead),
    held: most(n => n.held), air: most(n => n.air), steps: each.reduce((sum, n) => sum + n.steps, 0),
    shortest: stepped.length ? Math.min(...stepped.map(n => n.shortest)) : 0, longest: most(n => n.longest),
    fastest: most(n => n.fastest), snap: most(n => n.snap), sunk: most(n => n.sunk),
    stretch, stretched, dip, rise, feet: Object.fromEntries(feet.map((f, k) => [f, each[k]])),
  }
})

// The start and the stop.
const began = samples.find(x => x.phase === 'speeding up')!, ended = samples.find(x => x.phase === 'stopped')!
const start = feet.map((foot, k) => {
  const i = samples.findIndex((x, j) => x.t >= began.t && !isDown(k, j))
  return i < 0 ? { foot, after: null, gone: null, behind: null } : { foot, after: samples[i].t - began.t + dt, gone: samples[i].z - home.z, behind: -trail(k, i - 1) }
})
const stop = feet.map(foot => {
  const after = falls.filter(f => f.foot === foot && f.t >= ended.t)
  return { foot, falls: after.length, last: after.length ? after[after.length - 1].t - ended.t : 0 }
})
const end = samples[samples.length - 1]
const rested = feet.map((foot, k) => ({ foot, off: trail(k, samples.length - 1), down: isDown(k, samples.length - 1) }))

// The report.
const m = (x: number) => x.toFixed(3), sec = (x: number) => x.toFixed(2)
function print(head: string[], rows: string[][]) {
  const wide = head.map((h, c) => Math.max(h.length, ...rows.map(r => r[c].length)))
  const line = (r: string[]) => r.map((x, c) => (c === 0 ? x.padEnd(wide[c]) : x.padStart(wide[c]))).join('  ')
  console.log(line(head))
  for (const r of rows) console.log(line(r))
  console.log('')
}
const HEAD = ['slide', 'in a step', 'behind', 'ahead', 'held', 'air', 'steps', 'shortest', 'longest', 'fastest', 'snap', 'sunk']
const cells = (n: Numbers) => [m(n.slide), m(n.slideStep), m(n.behind), m(n.ahead), sec(n.held), sec(n.air), String(n.steps), m(n.shortest), m(n.longest), sec(n.fastest), sec(n.snap), m(n.sunk)]
console.log(`FEET ${kind}'s ${first}: 0 to ${speed} m/s at ${accel} m/s², held ${holdFor} s, and back; flat ground; a step ${dt.toFixed(5)} s; a foot down within ${downBy} m of where it stood`)
console.log('')
console.log('each phase, the worst of its feet (metres, seconds, metres a second):')
print(['phase', 'from', 'to', ...HEAD, 'stretch', 'bone', 'dip', 'rise'], phases.map(p => [p.phase, sec(p.from), sec(p.to), ...cells(p), m(p.stretch), p.stretched, m(p.dip), m(p.rise)]))
for (const foot of feet) {
  console.log(`${foot}:`)
  print(['phase', ...HEAD], phases.map(p => [p.phase, ...cells(p.feet[foot])]))
}
console.log('the start: when each foot first left the ground after the body began to move')
print(['foot', 'after (s)', 'body gone (m)', 'foot behind (m)'], start.map(x => [x.foot, x.after === null ? 'never' : sec(x.after), x.gone === null ? '' : m(x.gone), x.behind === null ? '' : m(x.behind)]))
console.log('the stop: the feet put down after the body stopped, and where each foot is at the end')
print(['foot', 'put down', 'last (s)', 'ahead of its place (m)', 'down'], stop.map((x, k) => [x.foot, String(x.falls), sec(x.last), m(rested[k].off), rested[k].down ? 'yes' : 'no']))

// The start and the stop against the steady stride: how far each number went past the steady stride's.
const steady = phases.find(p => p.phase === 'steady')!
const OVER: [string, (p: PhaseNumbers) => number][] = [
  ['behind', p => p.behind], ['ahead', p => p.ahead], ['longest', p => p.longest], ['fastest', p => p.fastest], ['snap', p => p.snap],
  ['stretch', p => Math.abs(p.stretch)], ['dip', p => p.dip], ['rise', p => p.rise], ['slide', p => p.slide], ['sunk', p => p.sunk],
]
const over = ([['the start', ['speeding up', 'settling']], ['the stop', ['slowing down', 'stopped']]] as [string, Phase[]][]).map(([name, of]) => {
  const mine = phases.filter(p => of.includes(p.phase))
  return { name, over: Object.fromEntries(OVER.map(([what, f]) => [what, Math.max(0, Math.max(...mine.map(f)) - f(steady))])) }
})
console.log('past the steady stride: how far the start (speeding up, settling) and the stop (slowing down, stopped) went past the steady stride; 0 is no further than a steady stride goes')
print(['', ...OVER.map(([what]) => what)], [
  ['steady', ...OVER.map(([what, f]) => (what === 'fastest' || what === 'snap' ? sec : m)(f(steady)))],
  ...over.map(o => [o.name, ...OVER.map(([what]) => (what === 'fastest' || what === 'snap' ? sec : m)(o.over[what]))]),
])

if (named.out) {
  fs.writeFileSync(named.out, JSON.stringify({ kind, layout: first, speed, accel, stand: standFor, hold: holdFor, steady: steadyFor, down: downBy, dt, row: data, feet, body: bodyBones, phases, over, start, stop, rested, end: end.t, falls, samples }, null, 1))
  console.log('wrote', named.out)
}
