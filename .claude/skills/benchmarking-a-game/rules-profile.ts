// A scene's ticks, timed: the scene booted alone on node as `load` boots each child (`child`, `boot`,
// `prepare`, `door`), with no manager, no prediction and no rewind, one seat joined as a connection
// joins one (its entry act sent when the manager's table names one), each `--act` sent on the seat's
// `player` row once it stands (in the order given, no arguments: the press that starts the game, the
// autopilot), and stepped for `seconds` of game time, as fast as node goes. Every kind's `before`,
// `tick`, `after` and each of its acts is timed for its own time (an act a tick calls through `w.call`
// is the act's, taken out of the tick's), each kind name apart (two names of one kind, `xbot` and
// `ybot` both `raider`, are two rows), so the rows add up to the step; what is left of the step is the
// engine's own. Prints the steps' mean, 95% and most milliseconds, and each kind's pass's milliseconds a
// step and share, most first. Node's CPU profiler samples the steps too, and each millisecond is given to
// the file that ran it (owners.mjs): each kind's rules, each plugin's, each addon's, the engine's. All of
// it goes to `<out>/<scene>.ticks.json`, the profile beside it as `<out>/<scene>.ticks.cpuprofile`, for
// benchmarkPage.ts; `<out>` is `--out`, else `benchmarks/<game>/<when>-ticks` at the repo's root. Run under `--cpu-prof` for the whole run's profile,
// the boot with it:
//   node --experimental-strip-types [--cpu-prof --cpu-prof-dir=<folder>] rules-profile.ts <game> <scene>
//        <seconds> [--act <act>]… [--out <folder>]
// then `node cpu-hot.mjs <folder>/<the .cpuprofile>`. Run from the repo's root, or anywhere: it finds the
// repo two folders above its own.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { owned } from './owners.mjs'
import { made, runFolder, write } from './testbed.mjs'

const args = process.argv.slice(2)
const acts: string[] = []
for (let i = 0; i < args.length; i++) if (args[i] === '--act') { acts.push(args[i + 1]); args.splice(i, 2); i-- }
const o = args.indexOf('--out')
const named = o >= 0 ? args.splice(o, 2)[1] : undefined
const [game, name, seconds = '60'] = args
if (!game || !name) {
  console.error('usage: node --experimental-strip-types [--cpu-prof --cpu-prof-dir=<folder>] rules-profile.ts <game> <scene> <seconds> [--act <act>]…')
  process.exit(1)
}
const out = named ?? runFolder(game, 'ticks')
const root = path.resolve(import.meta.dirname, '../../..')
const at = (p: string) => pathToFileURL(path.join(root, p)).href
const { boot } = await import(at('engine/engine.ts'))
const { child, door, prepare, seat } = await import(at('addons/scenemanager/scenemanager.addon.ts'))
const { default: file } = await import(at(`games/${game}/${game}.scene.json`), { with: { type: 'json' } })

const entry = file.prefabs.scenemanager.scenes[name]
if (!entry) throw new Error(`${game}.scene.json names no scene ${name}`)
const { scene, sim } = await child(file, name, entry, at(`games/${game}/${game}.server.ts`))

// Each kind name's rules a timed copy of its own, each adding its own time to the step's table.
type Pass = (...a: unknown[]) => unknown
let table = new Map<string, number>()
const open: { inner: number }[] = []
const timed = (k: string, f: Pass): Pass => function (this: unknown, ...a: unknown[]) {
  const t = performance.now()
  const me = { inner: 0 }
  open.push(me)
  try { return f.apply(this, a) } finally {
    open.pop()
    const ms = performance.now() - t
    table.set(k, (table.get(k) ?? 0) + ms - me.inner)
    if (open.length) open[open.length - 1].inner += ms
  }
}
const kinds: Record<string, any> = {}
for (const [kind, k] of Object.entries(sim as Record<string, any>)) {
  const copy = { ...k }
  for (const pass of ['before', 'tick', 'after']) if (typeof copy[pass] === 'function') copy[pass] = timed(`${kind}.${pass}`, copy[pass])
  if (copy.acts) {
    copy.acts = { ...copy.acts }
    for (const a of Object.keys(copy.acts)) copy.acts[a] = timed(`${kind} act ${a}`, copy.acts[a])
  }
  kinds[kind] = copy
}

const truth = boot(scene, kinds)
await prepare(kinds, truth.rows, truth.world)
door(truth)
const me = seat(truth, { join: true })
let seq = 0
if (entry.enter) {
  const it = truth.rows.find((r: { kind: string }) => r.kind === entry.enter.kind)
  if (!it) throw new Error(`no ${entry.enter.kind} row in ${name}`)
  truth.inbox(me, { seq: seq++, n: truth.n, id: it.id, action: entry.enter.act, args: [] })
}
const dt = scene.prefabs.engine.dt as number
truth.step(dt)
const mine = truth.rows.find((r: { kind: string; data: { seat: number } }) => r.kind === 'player' && r.data.seat === me)
if (!mine && acts.length) throw new Error(`no player row in ${name} to send ${acts.join(', ')} to`)
for (const action of acts) truth.inbox(me, { seq: ++seq, n: truth.n, id: mine.id, action, args: [] })

const took: number[] = []
const totals = new Map<string, number>()
const steps = Math.round(Number(seconds) / dt)
// node's own CPU profiler over the steps, laid out by who owns each millisecond (owners.mjs)
const inspector = new (await import('node:inspector')).Session()
inspector.connect()
const post = (method: string, params = {}) => new Promise<any>((ok, no) => inspector.post(method, params, (e, r) => e ? no(e) : ok(r)))
await post('Profiler.enable')
await post('Profiler.setSamplingInterval', { interval: 100 })
await post('Profiler.start')
const t0 = performance.now()
for (let i = 0; i < steps; i++) {
  table = new Map()
  const a = performance.now()
  truth.step(dt)
  const ms = performance.now() - a
  took.push(ms)
  let rules = 0
  for (const [k, v] of table) { totals.set(k, (totals.get(k) ?? 0) + v); rules += v }
  totals.set('engine (the step past the rules)', (totals.get('engine (the step past the rules)') ?? 0) + Math.max(0, ms - rules))
}
const all = performance.now() - t0
const { profile } = await post('Profiler.stop')
inspector.disconnect()
const sorted = [...took].sort((a, b) => a - b)
console.log(`${game} ${name}: ${truth.rows.length} rows, ${steps} steps (${seconds} s of game) in ${(all / 1000).toFixed(2)} s; a step mean ${(all / steps).toFixed(3)} ms, 95% ${sorted[Math.floor(0.95 * (steps - 1))].toFixed(3)} ms, most ${sorted[steps - 1].toFixed(3)} ms (a step at 60 a second has 16.67 ms)\n`)
console.log('ms a step  share  rule')
const whole = took.reduce((a, b) => a + b, 0)
for (const [k, v] of [...totals].sort((a, b) => b[1] - a[1])) if (v / steps >= 0.001) console.log((v / steps).toFixed(3).padStart(8), ((100 * v) / whole).toFixed(1).padStart(5) + '%', ' ', k)
const own = owned(profile)
console.log(`\nwho owns the CPU, by node's profiler`)
console.log('ms a step  share  owner')
for (const o of own.owners) if (o.ms / steps >= 0.001) console.log((o.ms / steps).toFixed(3).padStart(8), ((100 * o.ms) / own.ms).toFixed(1).padStart(5) + '%', ' ', o.who)
{
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, `${name}.ticks.cpuprofile`), JSON.stringify(profile))
  write(out, `${name}.ticks.json`, {
    ...made('ticks', { seconds: Number(seconds), acts }),
    game, scene: name, rows: truth.rows.length, steps, seconds: Number(seconds), wall: all / 1000,
    step: { mean: all / steps, p95: sorted[Math.floor(0.95 * (steps - 1))], most: sorted[steps - 1] },
    systems: [...totals].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, ms: v / steps, share: (100 * v) / whole })),
    owners: { busy: own.ms / steps, list: own.owners.map(o => ({ ...o, ms: o.ms / steps, via: Object.fromEntries(Object.entries(o.via).map(([k, v]) => [k, (v as number) / steps])), functions: o.functions.map((f: { name: string; ms: number }) => ({ ...f, ms: f.ms / steps })) })) },
  })
}
