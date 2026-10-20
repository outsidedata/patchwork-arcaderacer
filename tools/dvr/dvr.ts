// The dvr: a game played once by hand, then filmed frame by frame at any size and any frame rate,
// with no screen recording. Run from the repo:
//
//   node --experimental-strip-types tools/dvr/dvr.ts serve [--port 5180]
//     The repo served as `yarn editor` serves it (Vite, no reloads), with the take routes. Open
//     http://localhost:5180/tools/dvr/dvr.html?game=<g>&record=<name> in Chrome and play: the
//     take is kept in tools/dvr/takes/<g>/<name>.json every five seconds and as the tab goes.
//
//   node --experimental-strip-types tools/dvr/dvr.ts render <g> [options]
//     The game booted in a headless Chrome of its own on the film's clock (`dvr.page.ts`), each frame
//     drawn and photographed, and the photographs handed to ffmpeg as they come, so no frame is kept
//     on disk unless asked.
//       --take <name>       the take played back; the film is as long as the take unless told
//       --script <path>     a module exporting `think(rows)` and/or `direct(film)` (dvr.page.ts)
//       --scale <s>         pixels per canvas pixel (1): a 1280×720 game at 3 is 3840×2160
//       --ss <k>            drawn k times larger again and shrunk back with lanczos, to smooth edges (1)
//       --fps <f>           frames a second (60)
//       --from <s>          seconds of the game run and not filmed first (0)
//       --seconds <s>       seconds filmed, or --frames <n>; with no take, one of them is required
//       --format <f>        mp4 (H.264, crf 14), hevc (H.265, crf 16), prores (ProRes 422 HQ .mov),
//                           or png (the frames alone) (mp4)
//       --frames-too        keep every frame as a PNG beside the film
//       --out <path>        the film's path, or the frames' folder (tools/dvr/out/…)
//       --look <l>          dither3d's look: keep (the game's own blocks), sharp (dithered at the
//                           film's full size), clean (no dither) (keep)
//       --hud <on|off>      the ui plugin's canvas shown or hidden (on)
//       --show              a visible Chrome window instead of a headless one
//
//   node --experimental-strip-types tools/dvr/dvr.ts record <g> <name> --seconds <s> [--keys "<s> <key> [down|up]; …"] [--show]
//     A playtester: the game played live in a Chrome of the dvr's own for that long, each key struck
//     through Chrome's own input at its second (with neither down nor up, tapped for 0.1 s), and the
//     take kept as a take played by hand is.
//
//   node --experimental-strip-types tools/dvr/dvr.ts cook <frames folder> [--fps 60] [--format mp4] [--out path]
//     A folder of frames, 000000.png on, made into a film.
//
// Every render prints, at its end, whether the truth it played matched the take's every 60 steps:
// a take played back on a game whose rules changed since it was played plays out otherwise.
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import WebSocket from 'ws'
import config from '../../vite.config.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const TAKES = join(here, 'takes')
const OUT = join(here, 'out')
const NAME = /^[\w.-]+$/
const GAME = /^[\w-]+$/

// ------------------------------------------------------------------ the server

// The repo through Vite, as the editor's server serves it, with no socket and no reloads, and
// `/dvr/take/<game>/<name>` to keep and hand back a take.
async function serve(port: number): Promise<{ port: number; close(): Promise<void> }> {
  const vite: ViteDevServer = await createServer({
    ...config,
    configFile: false,
    root,
    appType: 'mpa',
    logLevel: 'warn',
    server: { ...config.server, middlewareMode: true, hmr: false, ws: false, allowedHosts: true },
  })
  const server = http.createServer(async (req, res) => {
    // A game's index.html as written, which the page reads its seat wrapper off: Vite serves a page
    // with its inline script taken out.
    const p = /^\/dvr\/page\/([^/?]+)$/.exec(req.url ?? '')
    if (p) {
      if (!GAME.test(p[1])) { res.writeHead(400).end('a game is named by letters, digits, _ and -'); return }
      try { res.writeHead(200, { 'content-type': 'text/plain' }).end(await readFile(join(root, 'games', p[1], 'index.html'))) } catch (e) { res.writeHead(404).end(String(e)) }
      return
    }
    const m =/^\/dvr\/take\/([^/]+)\/([^/?]+)$/.exec(req.url ?? '')
    if (!m) return vite.middlewares(req, res)
    const [, game, name] = m
    if (!GAME.test(game) || !NAME.test(name)) { res.writeHead(400).end('a take is named by letters, digits, _, . and -'); return }
    const path = join(TAKES, game, `${name}.json`)
    try {
      if (req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const text = Buffer.concat(chunks).toString('utf8')
        JSON.parse(text)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, text)
        res.writeHead(204).end()
      } else {
        res.writeHead(200, { 'content-type': 'application/json' }).end(await readFile(path))
      }
    } catch (e) {
      res.writeHead(req.method === 'POST' ? 400 : 404).end(String(e))
    }
  })
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok) })
  const at = (server.address() as { port: number }).port
  return {
    port: at,
    async close() {
      await new Promise<void>(ok => server.close(() => ok()))
      await vite.close()
    },
  }
}

// ------------------------------------------------------------------ Chrome over its debugging port

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

type Cdp = { send(method: string, params?: object): Promise<any>; on(method: string, f: (params: any) => void): void; close(): void }

function cdp(url: string): Promise<Cdp> {
  const ws = new WebSocket(url, { maxPayload: 2 ** 30 })
  let id = 0
  const waiting = new Map<number, { ok(v: unknown): void; fail(e: Error): void; method: string }>()
  const listeners = new Map<string, ((p: any) => void)[]>()
  ws.on('message', data => {
    const msg = JSON.parse(data.toString())
    if (msg.id !== undefined) {
      const w = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (msg.error) w?.fail(new Error(`${w.method}: ${msg.error.message}`))
      else w?.ok(msg.result)
    } else for (const f of listeners.get(msg.method) ?? []) f(msg.params)
  })
  ws.on('close', () => { for (const w of waiting.values()) w.fail(new Error(`Chrome closed the connection during ${w.method}`)) })
  return new Promise((ok, fail) => {
    ws.once('error', fail)
    ws.once('open', () => ok({
      send: (method, params = {}) => new Promise((ok, fail) => { const k = ++id; waiting.set(k, { ok, fail, method }); ws.send(JSON.stringify({ id: k, method, params })) }),
      on: (method, f) => { const l = listeners.get(method) ?? []; l.push(f); listeners.set(method, l) },
      close: () => ws.close(),
    }))
  })
}

// A Chrome of the dvr's own, in a profile made for it and taken away after, and its one page.
async function chrome(show: boolean): Promise<{ page: Cdp; close(): Promise<void> }> {
  const bin = process.env.DVR_CHROME ?? CHROMES.find(existsSync)
  if (!bin) throw new Error(`no Chrome at ${CHROMES.join(', ')}: set DVR_CHROME`)
  const profile = await mkdtemp(join(tmpdir(), 'dvr-chrome-'))
  const args = [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    ...(show ? [] : ['--headless=new']), 'about:blank',
  ]
  const proc: ChildProcess = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const browser = await new Promise<string>((ok, fail) => {
    let err = ''
    const timer = setTimeout(() => fail(new Error(`Chrome did not open its debugging port in 30 s:\n${err}`)), 30000)
    proc.stderr!.on('data', (d: Buffer) => {
      err += d.toString()
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
      if (m) { clearTimeout(timer); ok(m[1]) }
    })
    proc.once('exit', code => { clearTimeout(timer); fail(new Error(`Chrome exited with ${code}:\n${err}`)) })
  })
  const http = browser.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '')
  const targets = await (await fetch(`${http}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
  const target = targets.find(t => t.type === 'page')
  if (!target) throw new Error('Chrome opened no page')
  const page = await cdp(target.webSocketDebuggerUrl)
  return {
    page,
    async close() {
      page.close()
      const gone = new Promise(ok => proc.once('exit', ok))
      proc.kill()
      await gone
      await rm(profile, { recursive: true, force: true })
    },
  }
}

// ------------------------------------------------------------------ ffmpeg

const FORMATS = {
  mp4: { ext: 'mp4', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
  hevc: { ext: 'mp4', args: ['-c:v', 'libx265', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart'] },
  prores: { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'] },
} as const
type Format = keyof typeof FORMATS | 'png'

// ffmpeg taking PNGs on its input, one after another, and writing the film; `size` shrinks each
// to that size with lanczos first.
function encoder(fps: number, format: keyof typeof FORMATS, out: string, size?: [number, number]) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
    ...(size ? ['-vf', `scale=${size[0]}:${size[1]}:flags=lanczos`] : []),
    ...FORMATS[format].args, '-r', String(fps), out,
  ]
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise<void>((ok, fail) => ff.once('exit', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))))
  return {
    async write(png: Buffer) {
      if (!ff.stdin!.write(png)) await new Promise(ok => ff.stdin!.once('drain', ok))
    },
    async end() { ff.stdin!.end(); await done },
  }
}

async function cook(folder: string, fps: number, format: keyof typeof FORMATS, out: string) {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(folder, '%06d.png'), ...FORMATS[format].args, '-r', String(fps), out], { stdio: 'inherit' })
  await new Promise<void>((ok, fail) => ff.once('exit', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))))
}

// ------------------------------------------------------------------ render

type Options = {
  take?: string; script?: string; scale: number; ss: number; fps: number; from: number
  seconds?: number; frames?: number; format: Format; framesToo: boolean; out?: string; show: boolean
  look: 'keep' | 'sharp' | 'clean'; hud: boolean
}

async function render(game: string, o: Options) {
  if (!GAME.test(game) || !existsSync(join(root, 'games', game, `${game}.scene.json`))) throw new Error(`there is no game ${game} in games/`)
  if (o.take && !existsSync(join(TAKES, game, `${o.take}.json`))) throw new Error(`there is no take ${o.take} of ${game} in ${join(TAKES, game)}`)
  const server = await serve(0)
  const browser = await chrome(o.show)
  const { page } = browser
  const started = Date.now()
  try {
    const errors: string[] = []
    page.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text))
    page.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map((a: any) => a.value ?? a.description).join(' ')) })
    // Requests in flight: a frame is photographed only once every file the page asked for is in.
    const flying = new Map<string, string>()
    // A worker's own script is told finished to the worker's session, never this one, and a blob's or
    // a data url's is never told finished at all: neither is waited on.
    page.on('Network.requestWillBeSent', p => { if (!/[?&]worker_file\b/.test(p.request.url) && !/^(blob|data):/.test(p.request.url)) flying.set(p.requestId, p.request.url) })
    page.on('Network.loadingFinished', p => flying.delete(p.requestId))
    page.on('Network.loadingFailed', p => flying.delete(p.requestId))
    await page.send('Runtime.enable')
    await page.send('Network.enable')
    await page.send('Page.enable')

    const q = new URLSearchParams({ game, fps: String(o.fps), scale: String(o.scale * o.ss) })
    if (o.take) q.set('take', o.take)
    q.set('look', o.look)
    q.set('hud', o.hud ? 'on' : 'off')
    if (o.script) q.set('script', '/' + resolve(o.script).slice(root.length + 1))
    const url = `http://127.0.0.1:${server.port}/tools/dvr/dvr.html?${q}`
    // The page laid out at the game's size before it is known, and again once the page says.
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: o.scale * o.ss, mobile: false })
    await page.send('Page.navigate', { url })
    const evaluate = async (expression: string) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`the page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    }
    const deadline = Date.now() + 120000
    while (!(await evaluate('window.dvrReady === true'))) {
      if (errors.length) throw new Error(`the page failed as it booted:\n${errors.join('\n')}`)
      if (Date.now() > deadline) throw new Error('the page did not boot in 120 s')
      await new Promise(r => setTimeout(r, 100))
    }
    const info = await evaluate('({ width: dvr.width, height: dvr.height, frames: dvr.frames, dt: dvr.dt })') as { width: number; height: number; frames: number | null; dt: number }
    await page.send('Emulation.setDeviceMetricsOverride', { width: info.width, height: info.height, deviceScaleFactor: o.scale * o.ss, mobile: false })

    const first = Math.round(o.from * o.fps)
    const count = o.frames ?? (o.seconds !== undefined ? Math.round(o.seconds * o.fps) : info.frames !== null ? info.frames - first : undefined)
    if (count === undefined) throw new Error('with no take, the film needs --seconds or --frames')
    if (!(count > 0)) throw new Error(`the film has ${count} frames to film`)
    const W = Math.round(info.width * o.scale), H = Math.round(info.height * o.scale)
    const label = `${game}-${o.take ?? (o.script ? 'script' : 'idle')}-${W}x${H}-${o.fps}`
    const format = o.format
    const out = resolve(o.out ?? join(OUT, format === 'png' ? label : `${label}.${FORMATS[format].ext}`))
    const folder = format === 'png' ? out : o.framesToo ? out.replace(/\.\w+$/, '') + '-frames' : undefined
    if (folder) await mkdir(folder, { recursive: true })
    else await mkdir(dirname(out), { recursive: true })
    const ff = format === 'png' ? undefined : encoder(o.fps, format, out, o.ss > 1 ? [W, H] : undefined)

    console.log(`${label}: ${count} frames from ${(first / o.fps).toFixed(2)} s, drawn at ${info.width * o.scale * o.ss}×${info.height * o.scale * o.ss}${o.ss > 1 ? `, shrunk to ${W}×${H}` : ''}`)
    let differed = 0
    // Where a filmed frame's time goes: stepping and drawing, waiting on files, the photograph, and
    // handing it on; counted from the second filmed frame, past the first one's compiling and loading.
    const spent = { draw: 0, files: 0, shot: 0, out: 0 }
    let filming = 0
    for (let i = 0; i < first + count; i++) {
      const t0 = Date.now()
      const r = await evaluate(`dvr.frame(${i})`) as { n: number; scene: string | null; differed: number }
      differed = r.differed
      if (errors.length) throw new Error(`the page threw on frame ${i}:\n${errors.join('\n')}`)
      if (i < first) continue
      const k = i - first
      const t1 = Date.now()
      const wait = Date.now() + 60000
      while (flying.size) {
        if (Date.now() > wait) throw new Error(`frame ${i}: ${flying.size} requests still in flight after 60 s:\n${[...flying.values()].join('\n')}`)
        await new Promise(r => setTimeout(r, 20))
      }
      const t2 = Date.now()
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: info.width, height: info.height, scale: 1 }, fromSurface: true, optimizeForSpeed: true })
      const png = Buffer.from(shot.data, 'base64')
      const t3 = Date.now()
      if (folder) await writeFile(join(folder, `${String(k).padStart(6, '0')}.png`), png)
      if (ff) await ff.write(png)
      const t4 = Date.now()
      if (k === 1) filming = t0
      if (k >= 1) { spent.draw += t1 - t0; spent.files += t2 - t1; spent.shot += t3 - t2; spent.out += t4 - t3 }
      if (k % 30 === 0 || k === count - 1) {
        const rate = k >= 1 ? `${(k / ((t4 - filming) / 1000)).toFixed(2)} frames/s` : 'warming'
        process.stdout.write(`\r  frame ${k + 1}/${count}  step ${r.n}  ${r.scene ?? '-'}  ${((t4 - started) / 1000).toFixed(0)} s  ${rate}   `)
      }
    }
    process.stdout.write('\n')
    await ff?.end()
    if (count > 1) {
      const per = (ms: number) => `${(ms / (count - 1)).toFixed(0)} ms`
      console.log(`a frame, after the first: draw ${per(spent.draw)}, files ${per(spent.files)}, photograph ${per(spent.shot)}, out ${per(spent.out)}`)
    }
    console.log(`wrote ${out}${folder && folder !== out ? ` and its frames in ${folder}` : ''}`)
    if (o.take) {
      const s = await evaluate('dvr.said()') as { take: number; page: number; same: number; first: unknown }
      console.log(`the page made ${s.page} messages from the take's events, the take holds ${s.take} up to here; the first ${s.same} were the same act on the same step${s.first ? `, then ${JSON.stringify(s.first)}` : ''}`)
      if (differed) {
        const d = await evaluate('dvr.differed()') as { n: number }[]
        console.log(`the take played out otherwise than it was played: its rows differed first at step ${d[0].n}, ${differed} checks in all`)
      } else console.log('the take played out as it was played: every check of its rows matched')
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

// ------------------------------------------------------------------ record, by a playtester's keys

// A key as Chrome's input takes it: what `key` and `code` the page reads, and the virtual key code.
function keyOf(name: string): { key: string; code: string; windowsVirtualKeyCode: number; text?: string } {
  if (/^[a-z]$/i.test(name)) { const c = name.toLowerCase(); return { key: c, code: `Key${c.toUpperCase()}`, windowsVirtualKeyCode: c.toUpperCase().charCodeAt(0), text: c } }
  if (/^[0-9]$/.test(name)) return { key: name, code: `Digit${name}`, windowsVirtualKeyCode: name.charCodeAt(0), text: name }
  const named: Record<string, [string, string, number, string?]> = {
    Enter: ['Enter', 'Enter', 13, '\r'], Space: [' ', 'Space', 32, ' '], Escape: ['Escape', 'Escape', 27], Tab: ['Tab', 'Tab', 9],
    ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowRight: ['ArrowRight', 'ArrowRight', 39], ArrowDown: ['ArrowDown', 'ArrowDown', 40],
    Shift: ['Shift', 'ShiftLeft', 16], Control: ['Control', 'ControlLeft', 17], Alt: ['Alt', 'AltLeft', 18],
  }
  const k = named[name]
  if (!k) throw new Error(`the key ${name} is none this dvr knows: a letter, a digit, or ${Object.keys(named).join(', ')}`)
  return { key: k[0], code: k[1], windowsVirtualKeyCode: k[2], ...(k[3] ? { text: k[3] } : {}) }
}

// `<seconds> <key> [down|up]`, split by `;`: a key going down, up, or with neither, tapped for 0.1 s.
type Stroke = { at: number; key: string; up: boolean }
function strokes(text: string): Stroke[] {
  const out: Stroke[] = []
  for (const part of text.split(';').map(s => s.trim()).filter(Boolean)) {
    const [at, key, way] = part.split(/\s+/)
    const t = Number(at)
    if (!Number.isFinite(t) || !key) throw new Error(`the stroke "${part}" is not <seconds> <key> [down|up]`)
    keyOf(key)
    if (way === 'down' || way === 'up') out.push({ at: t, key, up: way === 'up' })
    else if (way === undefined) out.push({ at: t, key, up: false }, { at: t + 0.1, key, up: true })
    else throw new Error(`the stroke "${part}" says ${way}, which is neither down nor up`)
  }
  return out.sort((a, b) => a.at - b.at)
}

// The game played live in a Chrome of the dvr's own for `seconds`, its keys struck through Chrome's
// own input, as a hand strikes them, and the take kept as a take played by hand is.
async function record(game: string, name: string, seconds: number, keys: Stroke[], show: boolean) {
  if (!GAME.test(game) || !existsSync(join(root, 'games', game, `${game}.scene.json`))) throw new Error(`there is no game ${game} in games/`)
  if (!NAME.test(name)) throw new Error(`the take is named ${name}: letters, digits, _, . and - only`)
  const server = await serve(0)
  const browser = await chrome(show)
  const { page } = browser
  try {
    const errors: string[] = []
    page.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text))
    await page.send('Runtime.enable')
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
    await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/tools/dvr/dvr.html?game=${game}&record=${name}` })
    const evaluate = async (expression: string) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`the page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    }
    const deadline = Date.now() + 120000
    while (!(await evaluate('window.dvrReady === true'))) {
      if (errors.length) throw new Error(`the page failed as it booted:\n${errors.join('\n')}`)
      if (Date.now() > deadline) throw new Error('the page did not boot in 120 s')
      await new Promise(r => setTimeout(r, 50))
    }
    const start = Date.now()
    for (const s of keys) {
      if (s.at > seconds) break
      const wait = start + s.at * 1000 - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      const k = keyOf(s.key)
      await page.send('Input.dispatchKeyEvent', { type: s.up ? 'keyUp' : k.text ? 'keyDown' : 'rawKeyDown', ...k, ...(s.up ? { text: undefined } : {}) })
      console.log(`  ${((Date.now() - start) / 1000).toFixed(2)} s  ${s.key} ${s.up ? 'up' : 'down'}`)
    }
    const left = start + seconds * 1000 - Date.now()
    if (left > 0) await new Promise(r => setTimeout(r, left))
    if (errors.length) throw new Error(`the page threw while it was played:\n${errors.join('\n')}`)
    await evaluate(`(async () => { document.querySelector('#rec button').click(); for (let i = 0; i < 100 && !/saved at/.test(document.querySelector('#rec').textContent); i++) await new Promise(r => setTimeout(r, 50)); return document.querySelector('#rec').textContent })()`)
    const take = JSON.parse(await readFile(join(TAKES, game, `${name}.json`), 'utf8'))
    console.log(`kept ${join(TAKES, game, `${name}.json`)}: ${take.steps} steps, ${(take.steps * take.dt).toFixed(2)} s, ${take.entries.length} entries, ${take.checks.length} checks`)
  } finally {
    await browser.close()
    await server.close()
  }
}

// ------------------------------------------------------------------ the command line

function options(args: string[]): { rest: string[]; o: Record<string, string | true> } {
  const rest: string[] = [], o: Record<string, string | true> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) { rest.push(a); continue }
    const key = a.slice(2)
    if (key === 'show' || key === 'frames-too') o[key] = true
    else {
      const v = args[++i]
      if (v === undefined) throw new Error(`--${key} wants a value`)
      o[key] = v
    }
  }
  return { rest, o }
}
const num = (o: Record<string, string | true>, key: string, fallback?: number) => {
  if (o[key] === undefined) return fallback
  const v = Number(o[key])
  if (!Number.isFinite(v)) throw new Error(`--${key} ${o[key]} is not a number`)
  return v
}
const formatOf = (v: string | true | undefined): Format => {
  const f = (v ?? 'mp4') as string
  if (f !== 'png' && !(f in FORMATS)) throw new Error(`--format ${f} is none of mp4, hevc, prores, png`)
  return f as Format
}

const lookOf = (v: string | true | undefined): Options['look'] => {
  const l = (v ?? 'keep') as string
  if (l !== 'keep' && l !== 'sharp' && l !== 'clean') throw new Error(`--look ${l} is none of keep, sharp, clean`)
  return l
}

const [what, ...args] = process.argv.slice(2)
const { rest, o } = options(args)
if (what === 'serve') {
  const s = await serve(num(o, 'port', 5180)!)
  console.log(`dvr serving the repo at http://localhost:${s.port}/`)
  console.log(`record: http://localhost:${s.port}/tools/dvr/dvr.html?game=<game>&record=<name>`)
} else if (what === 'render' && rest[0]) {
  const scale = num(o, 'scale', 1)!, ss = num(o, 'ss', 1)!, fps = num(o, 'fps', 60)!
  if (!(scale > 0) || !(ss >= 1) || !(fps > 0)) throw new Error('--scale above 0, --ss 1 or more, --fps above 0')
  await render(rest[0], {
    take: o.take as string | undefined, script: o.script as string | undefined, scale, ss, fps,
    from: num(o, 'from', 0)!, seconds: num(o, 'seconds'), frames: num(o, 'frames'),
    format: formatOf(o.format), framesToo: o['frames-too'] === true, out: o.out as string | undefined, show: o.show === true,
    look: lookOf(o.look),
    hud: o.hud === undefined || o.hud === 'on' ? true : o.hud === 'off' ? false : (() => { throw new Error(`--hud ${o.hud} is neither on nor off`) })(),
  })
  process.exit(0)
} else if (what === 'record' && rest[0] && rest[1]) {
  const seconds = num(o, 'seconds')
  if (!(seconds! > 0)) throw new Error('record wants --seconds above 0')
  await record(rest[0], rest[1], seconds!, strokes((o.keys as string | undefined) ?? ''), o.show === true)
  process.exit(0)
} else if (what === 'cook' && rest[0]) {
  const format = formatOf(o.format)
  if (format === 'png') throw new Error('cook makes a film: --format mp4, hevc or prores')
  const fps = num(o, 'fps', 60)!
  const out = resolve((o.out as string | undefined) ?? `${resolve(rest[0])}.${FORMATS[format].ext}`)
  await cook(resolve(rest[0]), fps, format, out)
  console.log(`wrote ${out}`)
} else {
  console.error('usage: dvr.ts serve [--port n] | render <game> [--take name] [--script path] [--scale s] [--ss k] [--fps f] [--from s] [--seconds s | --frames n] [--format mp4|hevc|prores|png] [--frames-too] [--out path] [--look keep|sharp|clean] [--hud on|off] [--show] | record <game> <name> --seconds s [--keys "<s> <key> [down|up]; …"] [--show] | cook <folder> [--fps f] [--format f] [--out path]')
  process.exit(1)
}
