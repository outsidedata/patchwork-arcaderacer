// The testbed both profilers open, games/<game>/dev.html?scene=<scene>, in a headless Chrome on the GPU
// (ANGLE Metal on a Mac), its own window and profile, nothing on the screen, and waits on until it is
// the scene as it plays, in stages, each printed with the seconds since the page was opened and the
// client's step:
//   up       the testbed keeps its page on `window.__page`, the page has a client and the client has
//            taken a packet (and the testbed keeps the truths `load` hands back on `window.__scenes`,
//            where the profiler times the rules; render3d's renderer is made, where it draws);
//   loaded   every plugin of the client that says it is still loading is done: terrain3d's rings are on
//            the scene (with `preload`, that is the land prepared whole where the camera stands, its maps
//            landed and scatter3d's share placed), no rebuild is in hand and every bake has nothing
//            left; scatter3d's share of the prepared place is placed. A scene whose land is built in
//            workers draws at its full rate until it is, and is measured only once it is.
//            `--loading` waits on none of it, to measure the loading itself;
//   ready    `--ready`, a page expression, is true, when given;
//   after    the client has taken `--after` steps, when given. The testbed steps by the clock, so the
//            step goes up 60 a second however slow the frame is.
// A stage still waited on after three minutes stops the profiler and names what it was waiting on (no
// `window.__page`, the bakes left, ...) and the first error the page threw. Then the page is clicked in its
// middle, each `--press` key is pressed for real, and it settles `--settle` seconds.
// `--playtest` has the game's playtester play the seat from then on, so a scene is measured as it is
// played and not only as it sits: `games/<game>/<game>.playtest.ts` exports `playtest`, a think for each
// scene by its name (the playtester plugin's `Think`: the rows the page holds in, a press or nothing out),
// and each frame its press goes through the player plugin as a key's would. It plays a further `--settle`
// seconds before anything is measured.
// Time stops with `stop()` and goes again with `go()`, both handed back by `open`, and `--still` stops it
// once the page has settled, before anything is measured. Stopped, the client the page holds now drops
// every packet it is handed, so its rows stay as the last one left them, and the page draws every frame
// at the newest step (`between` 1), so nothing is drawn between two steps that no longer move. The sea,
// the clouds and the sky are moved by the rows' clock, so they stand still with the rows; the truth in
// the tab goes on stepping, and only the page stops taking its steps. Two screenshots of a stopped page
// differ only by what was changed between them.
// The page is a 1280 by 800 screen of `--dpr` device pixels a pixel (1 when left out). render3d's
// `pixelRatio` is a cap on the screen's, so a scene asking for 2 draws at 1 unless `--dpr 2` makes the
// screen a Retina one: the line the measuring starts on prints the ratio drawn at and the buffer.
// Every exception the page throws and every console.error it logs is kept from the moment it is opened;
// those up to the measuring are counted and the first printed, and `take()` hands back those since.
// Any other Chrome on the machine driven over a debugging port (another profiler's, another session's)
// draws on the same GPU: each is named, by its profile
// folder, before the page is opened and again once it is measured. On 2026-10-21 two of another
// session's took demo_terrain3d's HD tier from 16.7 frames a second to 11.0.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const usage = '[--dpr <n>] [--press <key>]… [--settle <s>] [--loading] [--ready <page expression>] [--after <steps>] [--still] [--playtest] [--out <folder>]'

const root = path.resolve(import.meta.dirname, '../../..')
const git = (dir, ...a) => { try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim() } catch { return '' } }

// What a run was made on, written at the top of every profiler's data file so two runs can be told
// apart and compared: when, which commit of core and of games/ (and whether either had changes not
// committed), the machine, and the profiler's own settings.
export function made(tool, settings) {
  const repo = dir => ({ commit: git(dir, 'rev-parse', '--short', 'HEAD'), branch: git(dir, 'branch', '--show-current'), dirty: git(dir, 'status', '--short') !== '' })
  return {
    tool, at: new Date().toISOString(),
    core: repo(root), games: repo(path.join(root, 'games')),
    machine: `${os.cpus()[0]?.model ?? os.arch()}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`,
    settings,
  }
}

// Where a run is kept when no `--out` names a folder: `benchmarks/<game>/<when>` at the repo's root, the
// folder benchmarkPage.ts lists, `<when>` the minute it started (`2026-10-28-1302`) and then what it
// was, `-played`, `-deep` or the profiler that ran alone (`-cpu`).
export function runFolder(game, ...tags) {
  const d = new Date(), p = n => String(n).padStart(2, '0')
  const when = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  return path.join(root, 'benchmarks', game, [when, ...tags.filter(Boolean)].join('-'))
}

// Writes a profiler's data file, `<out>/<name>`, and says where.
export function write(out, name, data) {
  fs.mkdirSync(out, { recursive: true })
  const file = path.join(out, name)
  fs.writeFileSync(file, JSON.stringify(data, null, 1))
  console.log(`\nthe data: ${file}`)
}

// What a run was made on, and its data file: `made` and `write`, above, which every profiler uses.
// Takes the testbed's flags out of `args`, leaving the rest.
export function testbedFlags(args, name) {
  const flag = (f, many = false) => {
    const got = []
    for (let i = 0; i < args.length; i++) if (args[i] === f) { got.push(args[i + 1]); args.splice(i, 2); i-- }
    return many ? got : got[0]
  }
  const loading = args.includes('--loading')
  if (loading) args.splice(args.indexOf('--loading'), 1)
  const still = args.includes('--still')
  if (still) args.splice(args.indexOf('--still'), 1)
  const after = flag('--after')
  const playtest = args.includes('--playtest')
  if (playtest) args.splice(args.indexOf('--playtest'), 1)
  return {
    playtest,
    presses: flag('--press', true),
    settle: Number(flag('--settle') ?? 4),
    ready: flag('--ready'),
    after: after === undefined ? undefined : Number(after),
    dpr: Number(flag('--dpr') ?? 1),
    loading,
    still,
    // the run's folder, `runFolder` once the game is known when none is named
    out: flag('--out'),
    name,
  }
}

// The profile folders of the Chromes driven over a debugging port other than `port`.
function others(port) {
  let ps = ''
  try { ps = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }) } catch { return [] }
  const folders = new Set()
  for (const line of ps.split('\n')) {
    if (!line.includes('--remote-debugging-port=') || line.includes('--type=') || line.includes(`--remote-debugging-port=${port} `)) continue
    folders.add(line.match(/--user-data-dir=(\S+)/)?.[1] ?? line.slice(0, 120))
  }
  return [...folders]
}
const warn = (port, when) => {
  const o = others(port)
  if (o.length) console.log(`${o.length} other Chrome${o.length > 1 ? 's' : ''} driven over a debugging port ${when}; each shares this GPU with the page measured:\n${o.map(f => '  ' + f).join('\n')}`)
}

export async function open({ base, game, scene, presses, settle, ready, after, dpr, loading, still = false, playtest = false, out, scenes = false, render = false, init }) {
  const PORT = 9340 + Math.floor(Math.random() * 600)
  warn(PORT, 'before the page was opened')
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'bench-chrome-'))}`,
    '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' })
  // A Chrome outlives the node that spawned it, and goes on drawing its scene on the GPU: two another
  // session's profilers left open did for an hour and a half. It is killed however the profiler ends:
  // done, a throw, a timeout's or Control-C's signal.
  process.on('exit', () => chrome.kill())
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(1))
  process.on('uncaughtException', e => { console.error(e); process.exit(1) })
  process.on('unhandledRejection', e => { console.error(e); process.exit(1) })
  const wait = ms => new Promise(r => setTimeout(r, ms))
  let targets
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json() } catch { await wait(200) }
  }
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
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init })
  await send('Page.navigate', { url: `${base}/games/${game}/dev.html?scene=${scene}` })
  const opened = Date.now()
  const step = () => evaluate('window.__page && window.__page.client ? window.__page.client.n : 0').catch(() => 0)

  // Waits until `expr`, a page expression, is true; anything else it gives is what is still waited on.
  const stage = async (name, expr) => {
    const t0 = Date.now()
    let last
    for (;;) {
      last = await evaluate(`(() => { try { return ${expr} } catch (e) { return 'threw: ' + String(e) } })()`).catch(e => 'threw: ' + e.message)
      if (last === true) break
      if (Date.now() - t0 > 180000) {
        console.log(`waited 180 s for the page to be ${name}, still waiting on: ${last}`)
        if (errors.length) console.log(`the page threw ${errors.length} times; the first: ${errors[0].split('\n')[0]}`)
        done(1)
      }
      await wait(250)
    }
    console.log(`${name} at ${((Date.now() - opened) / 1000).toFixed(1)} s, step ${await step()}`)
  }

  await stage('up', `!window.__page ? 'no window.__page: dev.html needs window.__page = page (SKILL.md, What the game\\'s dev.html has to add first)'
    : !window.__page.client ? 'window.__page has no client yet'
    : !(window.__page.client.n > 0) ? 'the client has taken no packet'
    : ${scenes} && !window.__scenes ? 'no window.__scenes: dev.html needs window.__scenes = await load(truth, import.meta.url) (SKILL.md, What the game\\'s dev.html has to add first)'
    : ${render} && !window.__page.client.plugins.render3d && !window.__page.client.plugins.render2d ? 'the scene has neither render3d nor render2d to measure the drawing of'
    : ${render} && window.__page.client.plugins.render3d && !window.__page.client.plugins.render3d.renderer ? 'render3d has no renderer yet'
    : ${render} && !window.__page.client.plugins.render3d && !window.__page.client.plugins.render2d.canvas ? 'render2d has no canvas yet'
    : true`)
  if (!loading) {
    await stage('loaded', `(() => {
      const P = window.__page.client.plugins, still = []
      const t = P.terrain3d
      if (t) {
        if (!t.shown()) still.push('terrain3d: its rings are not on the scene')
        const b = t.building()
        if (b) still.push('terrain3d: a rebuild, ' + b.done + ' of ' + b.total)
        const k = t.baked()
        if (k && k.some(x => x.left > 0)) still.push('terrain3d: bakes, ' + k.map(x => x.left).join(', ') + ' left')
      }
      if (P.scatter3d && !P.scatter3d.ready()) still.push('scatter3d: its share of the prepared place')
      return still.length ? still.join('; ') : true
    })()`)
  }
  if (ready) await stage('ready', ready)
  if (after !== undefined) await stage(`past step ${after}`,`window.__page.client.n >= ${after} || 'step ' + window.__page.client.n`)

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 })
  for (const key of presses) {
    const code = key.length === 1 ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key === ' ' ? 'Space' : key) : key
    const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0
    await wait(150)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, ...(key.length === 1 ? { text: key } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
  await wait(settle * 1000)

  // Time stopped and started again (above): the client's packets dropped, and the page drawn at the newest step.
  const stop = async () => {
    await evaluate(`(() => {
      const page = window.__page, sm = page.client.plugins.scenemanager
      const t = window.__still ??= { frame: page.frame, client: undefined, hand: undefined }
      if (t.client) return true
      t.client = page.client
      t.hand = sm.hand
      sm.hand = () => {}
      page.frame = () => t.frame.call(page, 1)
      return true
    })()`)
    // a frame drawn at the newest step before anything is measured or shot
    await wait(500)
    console.log(`time stopped at step ${await step()}`)
  }
  const go = async () => {
    await evaluate(`(() => {
      const t = window.__still
      if (!t || !t.client) return true
      t.client.plugins.scenemanager.hand = t.hand
      window.__page.frame = t.frame
      t.client = undefined
      return true
    })()`)
    console.log(`time going again from step ${await step()}`)
  }
  if (still) await stop()

  // The game's playtester playing the seat, every frame from here on: the think the game's
  // `<game>.playtest.ts` hands out for this scene reads the rows the page holds and names a press or
  // nothing, and the press goes through the player plugin as a key's would, as the playtester plugin's.
  if (playtest) {
    const got = await evaluate(`(async () => {
      const m = await import('/games/${game}/${game}.playtest.ts')
      const think = m.playtest && m.playtest[${JSON.stringify(scene)}]
      if (!think) return 'games/${game}/${game}.playtest.ts hands out no think for ${scene}: its playtest has ' + Object.keys(m.playtest || {}).join(', ')
      const play = () => {
        const c = window.__page.client
        if (c && c.plugins.player) { const press = think(c.rows); if (press) c.plugins.player[press[0]](...press.slice(1)) }
        requestAnimationFrame(play)
      }
      requestAnimationFrame(play)
      return true
    })()`)
    if (got !== true) { console.log(got); done(1) }
    console.log(`played by games/${game}/${game}.playtest.ts from step ${await step()}`)
    await wait(settle * 1000)
  }

  warn(PORT, 'as the page is measured')
  const before = take()
  if (before.length) console.log(`the page threw ${before.length} times while it loaded and settled; the first: ${before[0].split('\n')[0]}`)
  const drawn = await evaluate(`(() => { const r = window.__page.client.plugins.render3d; if (!r || !r.renderer) return ''; const s = r.renderer.getDrawingBufferSize(new r.THREE.Vector2()); return ', drawn at pixel ratio ' + r.renderer.getPixelRatio() + ', ' + s.x + 'x' + s.y })()`)
  console.log(`measured from ${((Date.now() - opened) / 1000).toFixed(1)} s, step ${await step()}, the screen's devicePixelRatio ${dpr}${drawn}\n`)
  return { send, evaluate, wait, done, take, stop, go, others: others(PORT), drawn: drawn.replace(/^, /, '') }
}
