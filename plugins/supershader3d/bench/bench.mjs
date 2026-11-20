// What each material of a looks file costs the GPU: `node plugins/supershader3d/bench/bench.mjs
// <server base url> <looks file url> [--pictures <folder url>] [--each <s>] [--height <m>] [--pitch
// <deg>] [--dpr <n>] [--out <file>]`. It opens `bench.html` in a headless Chrome on the GPU (ANGLE
// Metal on a Mac), its own window and profile, 1280 by 800 at `--dpr` device pixels a pixel (1; 2 is
// a Retina screen, four times the pixels), nothing on the screen, where the floor, a swatch 400 m
// square, fills the view from a camera `--height` metres up (3) looking down by `--pitch` degrees
// (45), so the near ground is seen close and the far ground at a slant, as a game's is; then it has
// the swatch wear each material of the file in turn, waits until its program has compiled (three
// draws nothing with a program still compiling, so a frame counted before that counts an empty
// screen) and three frames have been drawn in it, and counts the frames drawn over `--each` seconds
// (3; a material at a frame a second gets at least three frames): the milliseconds a frame takes
// with the whole screen in that material. First the baseline, `none`, a plain unlit grey, so each
// material's own cost is its frame less the baseline's. A material with a setting named `<x>On`
// (the relief looks' `pomOn` and `shadowOn`) is measured again with each such setting at 0, so what
// the parallax and the shadow inside it cost is read apart. The page has to be held by the GPU to
// read anything: a material at the screen's rate costs less than it shows, and its row is marked
// so; `--dpr 2` draws four times the pixels and brings a cheap material under the rate. The frames
// are counted against the screen on purpose: a Chrome let run with no vsync counts frames its
// compositor drops while the GPU is behind, and a slow material's cost lands on the row after it.
// Prints the table, most costly first, and with `--out` writes it as JSON, with what the run was made
// on. The looks file and its pictures are served by the same server the page is (`yarn dev`): the
// file's url is the game's, `/games/<game>/assets/main.looks.json`, and its pictures are taken from
// `<its folder>/looks/` unless `--pictures` names another folder.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  return args.splice(i, 2)[1]
}
const pictures = flag('--pictures')
const each = Number(flag('--each') ?? 3)
const height = Number(flag('--height') ?? 3)
const pitch = Number(flag('--pitch') ?? 45)
const dpr = Number(flag('--dpr') ?? 1)
const out = flag('--out')
const [base, looksUrl] = args
if (!base || !looksUrl) {
  console.error('usage: node bench.mjs <server base url> <looks file url> [--pictures <folder url>] [--each <s>] [--height <m>] [--pitch <deg>] [--dpr <n>] [--out <file>]')
  process.exit(1)
}

const git = (dir, ...a) => { try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim() } catch { return '' } }
const root = path.resolve(import.meta.dirname, '../../..')

// A headless Chrome of its own, killed however this ends.
const PORT = 9340 + Math.floor(Math.random() * 600)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'bench-chrome-'))}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(1))
process.on('uncaughtException', e => { console.error(e); process.exit(1) })
process.on('unhandledRejection', e => { console.error(e); process.exit(1) })
const wait = ms => new Promise(r => setTimeout(r, ms))
let targets
for (let i = 0; i < 100 && !targets; i++) {
  try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json() } catch { await wait(200) }
}
if (!targets) { console.error('Chrome did not open its debugging port'); process.exit(1) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
let errors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
})
const send = (method, params = {}) => new Promise(r => { const k = ++id; pending.set(k, r); ws.send(JSON.stringify({ id: k, method, params })) })
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}
const done = code => { ws.close(); chrome.kill(); process.exit(code) }
const take = () => { const e = errors; errors = []; return e }

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: dpr, mobile: false })
const query = new URLSearchParams({ looks: looksUrl, height: String(height), pitch: String(pitch), dpr: String(dpr), ...(pictures ? { pictures } : {}) })
await send('Page.navigate', { url: `${base}/plugins/supershader3d/bench/bench.html?${query}` })
const opened = Date.now()

// Waits until `expr`, a page expression, is true; anything else it gives is what is still waited on.
const stage = async (name, expr) => {
  const t0 = Date.now()
  let last
  for (;;) {
    last = await evaluate(`(() => { try { return ${expr} } catch (e) { return 'threw: ' + String(e) } })()`).catch(e => 'threw: ' + e.message)
    if (last === true) break
    if (Date.now() - t0 > 120000) {
      console.log(`waited 120 s for the page to be ${name}, still waiting on: ${last}`)
      if (errors.length) console.log(`the page threw ${errors.length} times; the first: ${errors[0].split('\n')[0]}`)
      done(1)
    }
    await wait(250)
  }
  console.log(`${name} at ${((Date.now() - opened) / 1000).toFixed(1)} s`)
}
await stage('up', `!window.__page ? 'no window.__page' : !window.__page.client ? 'no client yet' : !window.__page.client.plugins.render3d.renderer ? 'no renderer yet' : true`)
await stage('ready', `(() => { const s = window.__page.client.plugins.supershader3d; return !s.looks() ? 'the looks file' : !s.ready() ? 'the pictures' : true })()`)
const before = take()
if (before.length) console.log(`the page threw ${before.length} times while it loaded; the first: ${before[0].split('\n')[0]}`)

const looks = await evaluate('window.__bench.looks')
const drawn = await evaluate(`(() => { const r = window.__page.client.plugins.render3d; const s = r.renderer.getDrawingBufferSize(new r.THREE.Vector2()); return 'drawn at pixel ratio ' + r.renderer.getPixelRatio() + ', ' + s.x + 'x' + s.y })()`)
console.log(`${looks.materials.length} materials, ${looks.pictures.length} pictures, ${['solid', 'relief', 'seeThrough'].filter(c => looks.calls[c]).length} draw calls; a floor ${height} m under the eye, looked down on by ${pitch}°, ${drawn}, each measured over ${each} s\n`)

// The swatch wears `name`, with its settings `off` set to 0 meanwhile and put back after; then the frames over `each`
// seconds, once the swatch has taken the material and been drawn with its program ready (three
// draws nothing with a program still compiling in parallel) and three frames have been drawn since.
async function measure(name, off = []) {
  const was = await evaluate(`(() => {
    const s = window.__page.client.plugins.supershader3d
    const was = ${JSON.stringify(off)}.map(k => s.setting(${JSON.stringify(name)}, k))
    for (const k of ${JSON.stringify(off)}) s.set(${JSON.stringify(name)}, k, 0)
    window.__scenes.get('floor').rows.find(r => r.kind === 'swatch').data.material = ${JSON.stringify(name)}
    return was
  })()`)
  const t0 = Date.now()
  let compiled
  for (;;) {
    compiled = await evaluate(`(() => {
      const r = window.__page.client.plugins.render3d
      const mesh = r.scene.getObjectByName('swatch')
      const want = ${JSON.stringify(name)} === 'none' ? mesh && mesh.material.isMeshBasicMaterial : mesh && mesh.material.name === 'supershader3d ' + window.__page.client.plugins.supershader3d.callOf(${JSON.stringify(name)})
      if (!want) return 'the swatch has not taken the material'
      const p = r.renderer.properties.get(mesh.material).currentProgram
      if (!p) return 'the swatch has not been drawn yet'
      return p.isReady() ? true : 'its program is still compiling'
    })()`)
    if (compiled === true) break
    if (Date.now() - t0 > 120000) { console.log(`waited 120 s on ${name}: ${compiled}`); done(1) }
    await wait(100)
  }
  const ready = Date.now() - t0
  // settled: three frames drawn since the change, so none counted was issued before it (a frame of
  // a second's cost settles in seconds, not in a wait of fixed length)
  await evaluate(`new Promise(done => {
    const g = window.__bench, from = g.frames
    const tick = () => g.frames - from < 3 ? requestAnimationFrame(tick) : done(true)
    requestAnimationFrame(tick)
  })`)
  take()
  const frames = await evaluate(`new Promise(done => {
    const g = window.__bench, from = g.frames, t0 = performance.now()
    const tick = () => performance.now() - t0 < ${each * 1000} || g.frames - from < 3 ? requestAnimationFrame(tick) : done({ n: g.frames - from, ms: performance.now() - t0 })
    requestAnimationFrame(tick)
  })`)
  const threw = take()
  await evaluate(`(() => { const s = window.__page.client.plugins.supershader3d; ${JSON.stringify(off)}.forEach((k, i) => s.set(${JSON.stringify(name)}, k, ${JSON.stringify(was)}[i])); return true })()`)
  const fps = frames.n / (frames.ms / 1000)
  return { fps, ms: frames.ms / frames.n, ready, threw: threw.length, first: threw[0]?.split('\n')[0] }
}

const rows = []
const baseline = await measure('none')
rows.push({ material: 'none', look: 'a plain unlit grey', call: '', ...baseline })
// the screen's rate: the baseline's, which nothing beats
const screen = baseline.fps
looks.materials.forEach((m, id) => {
  rows.push({ material: m.name, look: m.look, call: m.call, off: [] })
  for (const { name } of looks.settings.materials[id].filter(s => s.type === 'float' && s.name.endsWith('On'))) rows.push({ material: m.name, look: m.look, call: m.call, off: [name], offName: name.slice(0, -2) })
})
for (const r of rows.slice(1)) Object.assign(r, await measure(r.material, r.off))
for (const r of rows) r.over = r.ms - baseline.ms

const atRate = r => r.fps >= screen * 0.97
console.log(`${'material'.padEnd(28)} ${'call'.padEnd(10)} ${'fps'.padStart(7)} ${'ms/frame'.padStart(9)} ${'ms over none'.padStart(13)} ${'ready in ms'.padStart(12)}`)
const line = r => `${(r.material + (r.offName ? `, ${r.offName} off` : '')).padEnd(28)} ${r.call.padEnd(10)} ${r.fps.toFixed(1).padStart(7)} ${r.ms.toFixed(2).padStart(9)} ${(r.material === 'none' ? '' : r.over.toFixed(2)).padStart(13)} ${String(r.ready).padStart(12)}${atRate(r) && r.material !== 'none' ? '  at the screen\'s rate' : ''}${r.threw ? `  threw ${r.threw}: ${r.first}` : ''}`
console.log(line(rows[0]))
for (const r of rows.slice(1).sort((a, b) => b.ms - a.ms)) console.log(line(r))
if (rows.slice(1).every(atRate)) console.log('\nevery material is at the screen\'s rate: the page is not held by the GPU, so no cost shows. Raise the pitch toward the horizon, or lower the height.')

if (out) {
  const repo = dir => ({ commit: git(dir, 'rev-parse', '--short', 'HEAD'), branch: git(dir, 'branch', '--show-current'), dirty: git(dir, 'status', '--short') !== '' })
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({
    tool: 'supershader3d bench', at: new Date().toISOString(), core: repo(root),
    machine: `${os.cpus()[0]?.model ?? os.arch()}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`,
    settings: { looks: looksUrl, pictures, each, height, pitch, dpr }, drawn, screen, rows,
  }, null, 1))
  console.log(`\nthe data: ${out}`)
}
done(0)
