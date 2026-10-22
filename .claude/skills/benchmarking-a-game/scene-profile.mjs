// Profiles a whole scene of a game as it plays: games/<game>/dev.html?scene=<scene>, opened, waited on
// until it is up and loaded, clicked, pressed and settled by testbed.mjs (`--loading`, `--ready`,
// `--after`, `--press`, `--settle`), and then every system of the scene is timed where it is called,
// every frame, for `seconds`:
//   rules  each kind's `before`, `tick` and `after` and each of its acts, in every truth the page holds
//          (`window.__scenes`, the testbed's), a plugin's rules among them; and each truth's step whole,
//          so what is left of it is the engine's own (messages, seats, packets);
//   page   each plugin's page half, its `input`, `tick` and `afterTick` (render3d's draw is its
//          `afterTick`);
//   frame  each animation frame's callbacks whole (the testbed's loop: its steps and its frame); what is
//          left after the rules and the page plugins is the rows' looks (`<kind>.client.ts`) and the
//          engine's own page work.
// It prints the frames counted and their rate, the mean milliseconds of a frame's work, each system's
// mean milliseconds a frame and share of that work, and the slowest frames with their biggest systems.
// A frame's work well under the frame's time (16.67 ms at 60 a second) while the rate is under 60 means
// the page is waiting on something none of the scene's code is: the GPU, most often.
// Every exception and console.error while it is timed is counted and the first printed above the
// numbers: a frame that throws stops part way, so its work reads less than it is.
//   node scene-profile.mjs <server base url> <game> <scene> <seconds> [--press <key>]… [--settle <s>]
//        [--loading] [--ready <page expression>] [--after <steps>] [--still] [--out <folder>]
import { open, testbedFlags, usage } from './testbed.mjs'

const args = process.argv.slice(2)
const testbed = testbedFlags(args, 'scene-profile')
const [base, game, sceneName, seconds = '20'] = args
if (!base || !game || !sceneName) {
  console.error(`usage: node scene-profile.mjs <server base url> <game> <scene> <seconds> ${usage}`)
  process.exit(1)
}
// every animation frame's callbacks timed, each into a table the systems add to while it runs
const { evaluate, wait, done, take } = await open({ ...testbed, base, game, scene: sceneName, scenes: true, init: `
  window.__frames = []; window.__cur = null; window.__on = false
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb => raf(ts => {
    if (!window.__on) return cb(ts)
    const m = new Map(); window.__cur = m
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
  window.__on = true
})()`)
take()
const t0 = Date.now()
await wait(Number(seconds) * 1000)
const report = await evaluate(`(() => {
  window.__on = false
  const frames = window.__frames.filter(m => [...m.keys()].some(k => k.startsWith('page ')))
  const totals = new Map()
  let work = 0
  for (const m of frames) {
    work += m.get('frame')
    let rules = 0, page = 0, steps = 0
    for (const [k, v] of m) {
      if (k === 'frame') continue
      totals.set(k, (totals.get(k) || 0) + v)
      if (k.startsWith('rules ')) rules += v
      if (k.startsWith('page ')) page += v
      if (k.startsWith('truth ')) steps += v
    }
    const left = (k, v) => totals.set(k, (totals.get(k) || 0) + Math.max(0, v))
    left('engine: truth steps past their rules', steps - rules)
    left('looks and the page engine (the rest of the frame)', m.get('frame') - steps - page)
  }
  const n = frames.length
  const rows = [...totals].filter(([k]) => !k.startsWith('truth ')).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, ms: v / n, share: (100 * v) / work }))
  const slow = [...frames].sort((a, b) => b.get('frame') - a.get('frame')).slice(0, 5).map(m => ({
    frame: m.get('frame'),
    top: [...m].filter(([k]) => k !== 'frame' && !k.startsWith('truth ')).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v.toFixed(2)),
  }))
  return { n, work: work / n, rows, slow }
})()`)
const secs = (Date.now() - t0) / 1000
const threw = take()
if (threw.length) console.log(`the page threw ${threw.length} times while it was timed, so its frames stopped part way and read less work than they are; the first: ${threw[0].split('\n')[0]}\n`)
console.log(`${game} ${sceneName}: ${report.n} frames in ${secs.toFixed(1)} s, ${(report.n / secs).toFixed(1)} a second; a frame's work ${report.work.toFixed(2)} ms on average (a frame at 60 a second is 16.67 ms)\n`)
console.log('ms a frame  share  system')
for (const r of report.rows) if (r.ms >= 0.001) console.log(r.ms.toFixed(3).padStart(9), (r.share.toFixed(1) + '%').padStart(6), ' ', r.k)
console.log('\nthe slowest frames')
for (const s of report.slow) console.log(s.frame.toFixed(1).padStart(7), 'ms:', s.top.join(' | '))
done(threw.length ? 1 : 0)
