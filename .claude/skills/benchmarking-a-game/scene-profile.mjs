// Profiles a whole scene of a game as it plays: games/<game>/dev.html?scene=<scene>, opened, waited on
// until it is up and loaded, clicked, pressed and settled by testbed.mjs (`--loading`, `--ready`,
// `--after`, `--press`, `--settle`), and then every system of the scene is timed where it is called,
// every frame, for `seconds`:
//   rules  each kind's `before`, `tick` and `after` and each of its acts, in every truth the page holds
//          (`window.__scenes`, the testbed's), a plugin's rules among them; and each truth's step whole,
//          so what is left of it is the engine's own (messages, seats, packets);
//   page   each plugin's page half, its `input`, `tick` and `afterTick` (render3d's draw is its
//          `afterTick`);
//   looks  each kind's look, `<kind>.client.ts`'s `tick`, every row's added up under its kind, with the
//          rows of the kind the page drew that frame, so a kind's cost a row is read off it too;
//   frame  each animation frame's callbacks whole (the testbed's loop: its steps and its frame); what is
//          left after the rules, the page plugins and the looks is the engine's own page work.
// Chrome's CPU profiler samples the same seconds, and every sampled millisecond is given to the file that
// was running (owners.mjs): each kind (its rules and its look), each plugin (its rules and its page half),
// each addon, the engine, the browser's own; a library's time (three) to whoever of ours called it. That
// is the whole frame laid out by who owns it, with each one's costliest functions, and nothing left over.
// It prints the frames counted and their rate, the mean milliseconds of a frame's work, each system's
// mean milliseconds a frame and share of that work, the owners, and the slowest frames with their biggest
// systems. It writes all of it to `<out>/<scene>.cpu.json`, with Chrome's profile beside it as
// `<out>/<scene>.cpu.cpuprofile` (for cpu-hot.mjs), for benchmarkPage.ts to lay out and compare.
// A frame's work well under the frame's time (16.67 ms at 60 a second) while the rate is under 60 means
// the page is waiting on something none of the scene's code is: the GPU, most often.
// Every exception and console.error while it is timed is counted and the first printed above the
// numbers: a frame that throws stops part way, so its work reads less than it is.
//   node scene-profile.mjs <server base url> <game> <scene> <seconds> [--press <key>]… [--settle <s>]
//        [--loading] [--ready <page expression>] [--after <steps>] [--still] [--out <folder>]
import fs from 'node:fs'
import path from 'node:path'
import { owned, sources } from './owners.mjs'
import { made, open, runFolder, testbedFlags, usage, write } from './testbed.mjs'

const args = process.argv.slice(2)
const testbed = testbedFlags(args, 'scene-profile')
const [base, game, sceneName, seconds = '20'] = args
if (!base || !game || !sceneName) {
  console.error(`usage: node scene-profile.mjs <server base url> <game> <scene> <seconds> ${usage}`)
  process.exit(1)
}
testbed.out ??= runFolder(game, 'cpu', testbed.playtest && 'played')
// every animation frame's callbacks timed, each into a table the systems add to while it runs
const { send, evaluate, wait, done, take, others, drawn } = await open({ ...testbed, base, game, scene: sceneName, scenes: true, init: `
  window.__frames = []; window.__cur = null; window.__on = false
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb => raf(ts => {
    if (!window.__on) return cb(ts)
    const m = new Map(); window.__cur = m
    window.__beforeFrame(m)
    const t = performance.now()
    const r = cb(ts)
    Promise.resolve(r).then(() => { m.set('frame', performance.now() - t); window.__frames.push(m) })
    return r
  })
` })

// every system wrapped in a timer that adds to the frame's table
await evaluate(`(() => {
  const add = (k, ms) => { const m = window.__cur; if (m) m.set(k, (m.get(k) || 0) + ms) }
  const timed = (k, f) => function (...a) {
    const t = performance.now()
    const r = f.apply(this, a)
    if (r && typeof r.then === 'function') return r.then(v => { add(k, performance.now() - t); return v })
    add(k, performance.now() - t)
    return r
  }
  const P = window.__page.client.plugins
  for (const name of Object.keys(P)) {
    if (name === 'wire') continue
    for (const m of ['input', 'tick', 'afterTick']) if (typeof P[name][m] === 'function') P[name][m] = timed('page ' + name + '.' + m, P[name][m])
  }
  for (const [name, t] of window.__scenes.entries()) {
    for (const kind of Object.keys(t.sim)) {
      const k = t.sim[kind]
      for (const pass of ['before', 'tick', 'after']) if (typeof k[pass] === 'function') k[pass] = timed('rules ' + kind + '.' + pass, k[pass])
      for (const a of Object.keys(k.acts || {})) k.acts[a] = timed('rules ' + kind + ' act ' + a, k.acts[a])
    }
    t.step = timed('truth ' + name + ' step', t.step)
  }
  // Each row's look timed under its kind, wrapped the first frame its actor is there, and the rows of
  // each kind with a look counted. An actor's \`tick\` is a getter of the copy instance() handed out,
  // which defineProperty puts the timed one in place of.
  const wrapped = new WeakSet()
  window.__beforeFrame = m => {
    const c = window.__page.client
    for (const r of c.rows) {
      const a = c.actor(r.id)
      if (!a) continue
      m.set('rows ' + r.kind, (m.get('rows ' + r.kind) || 0) + 1)
      if (wrapped.has(a)) continue
      wrapped.add(a)
      Object.defineProperty(a, 'tick', { value: timed('look ' + r.kind + '.tick', a.tick), configurable: true })
    }
  }
  window.__on = true
})()`)
await send('Profiler.enable')
await send('Profiler.setSamplingInterval', { interval: 250 })
await send('Profiler.start')
take()
const t0 = Date.now()
await wait(Number(seconds) * 1000)
const report = await evaluate(`(() => {
  window.__on = false
  const frames = window.__frames.filter(m => [...m.keys()].some(k => k.startsWith('page ')))
  const totals = new Map(), rows = new Map()
  let work = 0
  for (const m of frames) {
    work += m.get('frame')
    let rules = 0, page = 0, steps = 0, looks = 0
    for (const [k, v] of m) {
      if (k === 'frame') continue
      if (k.startsWith('rows ')) { rows.set(k.slice(5), (rows.get(k.slice(5)) || 0) + v); continue }
      totals.set(k, (totals.get(k) || 0) + v)
      if (k.startsWith('rules ')) rules += v
      if (k.startsWith('page ')) page += v
      if (k.startsWith('truth ')) steps += v
      if (k.startsWith('look ')) looks += v
    }
    const left = (k, v) => totals.set(k, (totals.get(k) || 0) + Math.max(0, v))
    left('engine: truth steps past their rules', steps - rules)
    left('engine: the page past its plugins and looks', m.get('frame') - steps - page - looks)
  }
  const n = frames.length
  const systems = [...totals].filter(([k]) => !k.startsWith('truth ')).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const kind = k.match(/^look ([^.]+)\\./)?.[1]
    return { name: k, ms: v / n, share: (100 * v) / work, ...(kind ? { rows: rows.get(kind) / n } : {}) }
  })
  const slow = [...frames].sort((a, b) => b.get('frame') - a.get('frame')).slice(0, 5).map(m => ({
    frame: m.get('frame'),
    top: [...m].filter(([k]) => k !== 'frame' && !k.startsWith('truth ') && !k.startsWith('rows ')).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, ms]) => ({ name, ms })),
  }))
  const times = frames.map(m => m.get('frame'))
  return { n, work: work / n, systems, slow, times }
})()`)
const secs = (Date.now() - t0) / 1000
const { profile } = (await send('Profiler.stop')).result
const threw = take()
const own = owned(profile, await sources(profile))

if (threw.length) console.log(`the page threw ${threw.length} times while it was timed, so its frames stopped part way and read less work than they are; the first: ${threw[0].split('\n')[0]}\n`)
const rate = report.n / secs
console.log(`${game} ${sceneName}: ${report.n} frames in ${secs.toFixed(1)} s, ${rate.toFixed(1)} a second; a frame's work ${report.work.toFixed(2)} ms on average (a frame at 60 a second is 16.67 ms)\n`)
console.log('ms a frame  share  system')
for (const r of report.systems) if (r.ms >= 0.001) console.log(r.ms.toFixed(3).padStart(9), (r.share.toFixed(1) + '%').padStart(6), ' ', r.name + (r.rows ? `  (${r.rows.toFixed(1)} rows, ${(r.ms / r.rows * 1000).toFixed(1)} µs a row)` : ''))
console.log(`\nwho owns the CPU, by Chrome's profiler: ${own.ms.toFixed(0)} ms busy, ${own.idle.toFixed(0)} ms idle over ${secs.toFixed(1)} s`)
console.log('ms a frame  share  owner')
for (const o of own.owners) {
  const via = Object.entries(o.via).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v / report.n).toFixed(2)}`).join(', ')
  if (o.ms / report.n >= 0.001) console.log((o.ms / report.n).toFixed(3).padStart(9), ((100 * o.ms) / own.ms).toFixed(1).padStart(5) + '%', ' ', o.who + (via ? `  (in ${via})` : ''))
}
console.log('\nthe slowest frames')
for (const s of report.slow) console.log(s.frame.toFixed(1).padStart(7), 'ms:', s.top.map(t => t.name + ' ' + t.ms.toFixed(2)).join(' | '))

fs.mkdirSync(testbed.out, { recursive: true })
fs.writeFileSync(path.join(testbed.out, `${sceneName}.cpu.cpuprofile`), JSON.stringify(profile))
write(testbed.out, `${sceneName}.cpu.json`, {
  ...made('cpu', { seconds: Number(seconds), presses: testbed.presses, settle: testbed.settle, ready: testbed.ready, after: testbed.after, dpr: testbed.dpr, loading: testbed.loading, still: testbed.still, playtest: testbed.playtest }),
  game, scene: sceneName, drawn, others, threw: { count: threw.length, first: threw[0]?.split('\n')[0] },
  frames: report.n, seconds: secs, rate, work: report.work, times: report.times,
  systems: report.systems, slow: report.slow,
  owners: { busy: own.ms / report.n, idle: own.idle / report.n, list: own.owners.map(o => ({ ...o, ms: o.ms / report.n, via: Object.fromEntries(Object.entries(o.via).map(([k, v]) => [k, v / report.n])), functions: o.functions.map(f => ({ ...f, ms: f.ms / report.n })) })) },
})
done(threw.length ? 1 : 0)
