// Takes pictures of particle effects, each from a camera, at a moment, with any of its layers off:
//
//   yarn particle-views <views.json> <out folder>
//
// Each effect is played by core's own particle3d on the particle workshop's stage (`tools/workshop/stage.ts`,
// the page `tools/workshop/views.ts`), with no game running, in a headless Chrome on the GPU, and stepped
// by the scene's `dt` from the moment it is thrown, so a view is the same picture every time it is taken.
// `<views.json>` is a list of views, each one picture, `<out folder>/<name>.png`:
//
//   file     the effects file, a path from the views file's folder. Needed.
//   effect   the effect of it thrown. Left out, the view is one picture of every effect of the file.
//   camera   [x, y, z] where the camera stands, in metres, y up; the stage's ground is y 0. Needed.
//   target   [x, y, z] the point the camera looks at. Needed.
//   preroll  the seconds the effect has run when the picture is taken; 0 is the step it is thrown on. Needed.
//   off      the layers not played: a list of layers of `effect`, each its place in the effect's list
//            from 0, or `{ <effect>: [layer, ...] }` for layers of any effects of the file, which reaches
//            the effects `effect` names and the ones its particles carry.
//   only     the layers played, as `off` is written: every other layer of each effect it names is off.
//   name     the picture's name: `<the file's name>-<effect>` when left out; for a view of every effect,
//            `<name>-<effect>` each.
//   fov      the camera's vertical field of view in degrees, 45 when left out.
//   size     [width, height] of the picture in pixels, [1280, 720] when left out.
//   at       [x, y, z] the point the effect is thrown from, [0, 1.2, 0] when left out.
//   dir, to, scale, seed   the spawn's (particle3d's header): the way a layer with no `dir` throws,
//            [0, 1, 0]; where a beam ends, [6, 1.2, 0]; its size, 1; what its rolls come from, 1.
//   from     `still`, thrown from `at`, when left out; `thrown`, riding the bomb box3d throws across
//            the stage, thrown again with it as the workshop's page throws it.
//   stage    false leaves out the grid of 1 m squares and the 1.8 m stick, drawn when left out.
//   sky      an sRGB number, the colour behind the effect in place of the stage's own background.
//   drawer   `particle3d`, every particle on the CPU, when left out; `gpuparticle3d`, every particle on the GPU.
//   sheets   `{ <key>: <path from the views file's folder> }`, each a sheet the file draws from that no
//            game's scene catalogues for it, as the workshop's `--sheet`.
//
// A file a game's scene names is seen on that game's stage (its tone, exposure and bloom), any other on
// the workshop's own (`tools/workshop/particles.stage.json`). Every view is checked before Chrome is
// opened: a field it does not know, a number missing, an effect or a layer the file has not, two
// pictures of one name each throw, naming the view. Chrome is `CHROME`, else the macOS application's.
// It prints each picture as it is written, with the particles and effects in the air in it, and ends 1
// when the page threw or logged an error while a picture was taken.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start } from '../tools/workshop/workshop.server.ts'

type Json = any
// One picture: the file it is of, its name and size, and the view as the views page plays it.
export type Shot = {
  name: string; file: string; sheets: Record<string, string>; size: [number, number]
  view: {
    effect: string; camera: number[]; target: number[]; fov: number; preroll: number
    off: Record<string, number[]>; only: Record<string, number[]>
    at: number[]; dir: number[]; to: number[]; scale: number; seed: number; from: 'still' | 'thrown'; stage: boolean; sky?: number
    drawer: 'particle3d' | 'gpuparticle3d'
  }
}

const FIELDS = ['file', 'effect', 'camera', 'target', 'preroll', 'off', 'only', 'name', 'fov', 'size', 'at', 'dir', 'to', 'scale', 'seed', 'from', 'stage', 'sky', 'drawer', 'sheets']
const numbers = (v: unknown, count: number) => Array.isArray(v) && v.length === count && v.every(n => typeof n === 'number' && Number.isFinite(n))

// Every picture a views file asks for, in its order. `views` is the file parsed and `dir` its folder;
// `read` hands back an effects file's text by its whole path.
export function plan(views: Json, dir: string, read: (file: string) => string = f => fs.readFileSync(f, 'utf8')): Shot[] {
  if (!Array.isArray(views) || !views.length) throw new Error('a views file is a list of views, at least one')
  // each effects file's effects, by name, those of the files it lists laid over its own
  const files = new Map<string, Record<string, Json[]>>()
  const effectsOf = (file: string, what: string) => {
    if (!files.has(file)) {
      let it: Json
      try { it = JSON.parse(read(file)) } catch (e) { throw new Error(`${what}: its file ${file} does not read: ${(e as Error).message}`) }
      const all = { ...it.effects }
      for (const rel of (it.files ?? []) as string[]) Object.assign(all, JSON.parse(read(path.resolve(path.dirname(file), rel))).effects)
      files.set(file, all)
    }
    return files.get(file)!
  }
  const shots: Shot[] = []
  views.forEach((v: Json, i: number) => {
    const what = `view ${i}${typeof v?.name === 'string' ? ` (${v.name})` : ''}`
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what} is not an object`)
    for (const k of Object.keys(v)) if (!FIELDS.includes(k)) throw new Error(`${what} has ${k}, which a view does not: ${FIELDS.join(', ')}`)
    if (typeof v.file !== 'string') throw new Error(`${what} names no file, the effects file it is of`)
    for (const k of ['camera', 'target']) if (!numbers(v[k], 3)) throw new Error(`${what} has a ${k} of ${JSON.stringify(v[k])}, and it is [x, y, z]`)
    for (const k of ['at', 'dir', 'to']) if (v[k] !== undefined && !numbers(v[k], 3)) throw new Error(`${what} has a ${k} of ${JSON.stringify(v[k])}, and it is [x, y, z]`)
    if (!(typeof v.preroll === 'number' && v.preroll >= 0 && Number.isFinite(v.preroll))) throw new Error(`${what} has a preroll of ${JSON.stringify(v.preroll)}, and it is the seconds the effect has run, 0 or more`)
    if (v.fov !== undefined && !(typeof v.fov === 'number' && v.fov > 0 && v.fov < 180)) throw new Error(`${what} has a fov of ${JSON.stringify(v.fov)}, and it is degrees between 0 and 180`)
    if (v.size !== undefined && !(numbers(v.size, 2) && v.size.every((n: number) => Number.isInteger(n) && n > 0))) throw new Error(`${what} has a size of ${JSON.stringify(v.size)}, and it is [width, height] in whole pixels`)
    if (v.scale !== undefined && !(typeof v.scale === 'number' && v.scale > 0 && Number.isFinite(v.scale))) throw new Error(`${what} has a scale of ${JSON.stringify(v.scale)}, and it is a number above 0`)
    if (v.seed !== undefined && !(Number.isInteger(v.seed) && v.seed >= 0)) throw new Error(`${what} has a seed of ${JSON.stringify(v.seed)}, and it is a whole number, 0 or more`)
    if (v.from !== undefined && v.from !== 'still' && v.from !== 'thrown') throw new Error(`${what} is from ${JSON.stringify(v.from)}, and it is from still or thrown`)
    if (v.drawer !== undefined && v.drawer !== 'particle3d' && v.drawer !== 'gpuparticle3d') throw new Error(`${what} is drawn by ${JSON.stringify(v.drawer)}, and it is drawn by particle3d or gpuparticle3d`)
    if (v.stage !== undefined && typeof v.stage !== 'boolean') throw new Error(`${what} has a stage of ${JSON.stringify(v.stage)}, and it is true or false`)
    if (v.sky !== undefined && !(Number.isInteger(v.sky) && v.sky >= 0 && v.sky <= 0xffffff)) throw new Error(`${what} has a sky of ${JSON.stringify(v.sky)}, and it is an sRGB number, 0 to 16777215`)
    if (v.name !== undefined && !(typeof v.name === 'string' && /^[\w.-]+$/.test(v.name))) throw new Error(`${what} has a name of ${JSON.stringify(v.name)}, and a picture's name is letters, digits, _, - and .`)
    if (v.effect !== undefined && typeof v.effect !== 'string') throw new Error(`${what} has an effect of ${JSON.stringify(v.effect)}, and it is an effect's name`)
    if (v.sheets !== undefined && !(v.sheets && typeof v.sheets === 'object' && !Array.isArray(v.sheets) && Object.values(v.sheets).every(s => typeof s === 'string')))
      throw new Error(`${what} has sheets of ${JSON.stringify(v.sheets)}, and they are { <key>: <path> }`)
    const file = path.resolve(dir, v.file)
    const effects = effectsOf(file, what)
    if (v.effect !== undefined && !effects[v.effect]) throw new Error(`${what} is of the effect ${v.effect}, which ${v.file} has not: it has ${Object.keys(effects).join(', ')}`)
    // `off` and `only`, each a list of layers of the view's effect or the layers of any effects by name
    const layers = (k: 'off' | 'only'): Record<string, number[]> => {
      const given = v[k]
      if (given === undefined) return {}
      if (Array.isArray(given) && v.effect === undefined) throw new Error(`${what} is of every effect and has ${k} as a list, which is the layers of one effect: write { <effect>: [layer, ...] }`)
      const by: Record<string, unknown> = Array.isArray(given) ? { [v.effect]: given } : given
      if (!by || typeof by !== 'object') throw new Error(`${what} has ${k} of ${JSON.stringify(given)}, and it is a list of layers or { <effect>: [layer, ...] }`)
      for (const [name, list] of Object.entries(by)) {
        if (!effects[name]) throw new Error(`${what} turns ${k} layers of ${name}, which ${v.file} has not: it has ${Object.keys(effects).join(', ')}`)
        if (!Array.isArray(list) || !list.every(n => Number.isInteger(n) && n >= 0 && n < effects[name].length))
          throw new Error(`${what} turns ${k} the layers ${JSON.stringify(list)} of ${name}, which has layers 0 to ${effects[name].length - 1}`)
      }
      return by as Record<string, number[]>
    }
    const off = layers('off'), only = layers('only')
    const stem = path.basename(v.file).replace(/\.json$/, '')
    for (const effect of v.effect === undefined ? Object.keys(effects) : [v.effect]) {
      shots.push({
        name: v.effect === undefined ? `${v.name ?? stem}-${effect}` : v.name ?? `${stem}-${effect}`,
        file,
        sheets: Object.fromEntries(Object.entries((v.sheets ?? {}) as Record<string, string>).map(([k, f]) => [k, path.resolve(dir, f)])),
        size: v.size ?? [1280, 720],
        view: {
          effect, camera: v.camera, target: v.target, fov: v.fov ?? 45, preroll: v.preroll, off, only,
          at: v.at ?? [0, 1.2, 0], dir: v.dir ?? [0, 1, 0], to: v.to ?? [6, 1.2, 0], scale: v.scale ?? 1, seed: v.seed ?? 1,
          from: v.from ?? 'still', stage: v.stage ?? true, drawer: v.drawer ?? 'particle3d', ...(v.sky !== undefined ? { sky: v.sky } : {}),
        },
      })
    }
  })
  const names = shots.map(s => s.name)
  const twice = names.find((n, i) => names.indexOf(n) !== i)
  if (twice) throw new Error(`two pictures are named ${twice}: give each view a name of its own`)
  return shots
}

// A headless Chrome on the GPU, its own profile, and its one page driven over the DevTools protocol.
export async function chrome() {
  const port = 9340 + Math.floor(Math.random() * 600)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'particle-views-'))
  const child = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--hide-scrollbars', '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' })
  // killed however this ends, so no Chrome is left drawing on the GPU
  process.on('exit', () => child.kill())
  const gone = new Promise<void>(r => child.on('exit', () => r()))
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => process.exit(1))
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  let targets: Json[] | undefined
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://localhost:${port}/json`)).json() } catch { await wait(200) }
  }
  if (!targets) throw new Error('Chrome did not open its debugging port: set CHROME to its binary')
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map<number, (m: Json) => void>()
  let errors: string[] = []
  ws.addEventListener('message', e => {
    const m = JSON.parse(String(e.data))
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: Json) => a.value ?? a.description).join(' '))
  })
  const send = (method: string, params: Json = {}) => new Promise<Json>(r => { const k = ++id; pending.set(k, r); ws.send(JSON.stringify({ id: k, method, params })) })
  const evaluate = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails))
    return r.result.result.value
  }
  await send('Runtime.enable')
  await send('Page.enable')
  // Chrome asked to close, and its profile taken away once it has gone and writes there no more.
  const close = async () => {
    void send('Browser.close')
    await gone
    fs.rmSync(profile, { recursive: true, force: true })
  }
  return { send, evaluate, wait, take: () => { const e = errors; errors = []; return e }, close }
}

// The views page opened on a workshop server's stage at `size`, waited on until `window.__views` is up;
// throws naming `file` when the page fails or is not up in 60 s.
export async function open(page: Awaited<ReturnType<typeof chrome>>, url: string, file: string, size: [number, number]) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: `${url}/views` })
  for (let waited = 0; ; waited += 100) {
    const up = await page.evaluate('window.__failed ? { failed: window.__failed } : !!window.__views').catch(() => false)
    if (up === true) return
    if (up && up.failed) throw new Error(`${file} does not come up on the stage: ${up.failed}`)
    if (waited > 60000) throw new Error(`${file} did not come up on the stage in 60 s${page.take().map(e => `\n${e}`).join('')}`)
    await page.wait(100)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [viewsFile, out] = process.argv.slice(2)
  if (!viewsFile || !out) {
    console.error('usage: yarn particle-views <views.json> <out folder>')
    process.exit(1)
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const shots = plan(JSON.parse(fs.readFileSync(viewsFile, 'utf8')), path.dirname(path.resolve(viewsFile)))
  fs.mkdirSync(out, { recursive: true })
  const page = await chrome()
  let threw = 0
  // one server for each effects file and its sheets, in the order the views first name them
  const groups = new Map<string, Shot[]>()
  for (const s of shots) {
    const key = JSON.stringify([s.file, s.sheets])
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  for (const group of groups.values()) {
    const server = await start({ port: 0, root, effects: group[0].file, sheets: group[0].sheets })
    const size = (w: number, h: number) => page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await open(page, server.url, group[0].file, group[0].size)
    for (const s of group) {
      await size(...s.size)
      const t0 = Date.now()
      const got = await page.evaluate(`window.__views.shoot(${JSON.stringify(s.view)})`)
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: s.size[0], height: s.size[1], scale: 1 } })
      const file = path.join(out, `${s.name}.png`)
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
      console.log(`${file}  ${s.view.effect} at ${s.view.preroll} s: ${got.particles} particles, ${got.effects} effects, ${((Date.now() - t0) / 1000).toFixed(1)} s to take`)
      const errors = page.take()
      threw += errors.length
      for (const e of errors) console.log(`  the page said: ${e.split('\n')[0]}`)
    }
    await server.close()
  }
  await page.close()
  process.exit(threw ? 1 : 0)
}
