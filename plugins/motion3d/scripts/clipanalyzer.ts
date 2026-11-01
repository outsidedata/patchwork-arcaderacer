// The clip analyzer: a page of its own that plays one clip of a rig on its body as anim draws it, raw,
// held to nothing, with what the bake measured of it laid over it and along the bottom, so a clip that
// does something unaccounted for shows it (`clipanalyzer.html`, beside this).
//   node --experimental-strip-types plugins/motion3d/scripts/clipanalyzer.ts [port]
// serves the repo as `yarn dev` does (its `vite.config.ts`), and the page at
// `/plugins/motion3d/scripts/clipanalyzer.html`, whose address it prints. Beside the page it answers
//   GET  /@clipanalyzer/sources   `{ rigs, troupe }`: `rigs` every body a game's scene draws
//        (`world.motion3d.kinds`, and `world.anim.kinds`), `{ game, scene, kind, body, rig, baked?, motion?,
//        model, anim }`, `rig`, `baked` (what the bake measured), `motion` (motion3d's bake: each clip's
//        `held` and offsets) and `model` the urls its loader catalogue gives them and `anim` the
//        `{ moves, turns }` it is drawn by; `troupe`
//        every clip of `~/troupe-collection/packs/`, its path under `~/troupe-collection`, the way a rig
//        file names a clip's file.
//   POST /@clipanalyzer/bake      `{ rig, baked?, body, clip }`: the clip `clip` (a path under
//        ~/troupe-collection) baked onto the body `body` of the rig at the url `rig` (with what its bake
//        measured, at `baked`) by anim's export (`anim.export.py`, Blender found as `yarn bake` finds it),
//        its measures merged as a game's bake merges them, into a folder of the server's own, beside the
//        clip's sidecar (`<clip>.motion3d.json`) as motion3d's bake hands it on: `{ rig, model, motion,
//        clip }`, the urls of the rig file, the glb and the held written and the clip's name in them. A
//        failed bake is a 500 with what the export said.
//   GET  /@clipanalyzer/baked/<folder>/<file>   a file a bake wrote.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type Plugin } from 'vite'
import config from '../../../vite.config.ts'
import { tools } from '../../../scripts/bake.ts'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const TROUPE = (process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, os.homedir())
const BAKED = fs.mkdtempSync(path.join(os.tmpdir(), 'clipanalyzer-'))
const EXPORT = path.join(root, 'plugins', 'anim', 'anim.export.py')
const MERGE = path.join(root, '.claude', 'skills', 'using-mixamo-assets', 'scripts', 'merge-table.mjs')
const PAGE = '/plugins/motion3d/scripts/clipanalyzer.html'

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))

// Every body a game's scene draws, through motion3d (`world.motion3d.kinds`, its moves and turns its
// motion3d file's) or through anim (`world.anim.kinds`), with the urls its catalogue names its rig, what
// its bake measured, its motion3d bake and its model by.
function rigs() {
  const out: Record<string, unknown>[] = []
  const games = path.join(root, 'games')
  for (const game of fs.existsSync(games) ? fs.readdirSync(games) : []) {
    const dir = path.join(games, game)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.scene.json'))) {
      let scene: any
      try { scene = readJson(path.join(dir, file)) } catch { continue }
      const world = scene.world ?? {}, assets = world.loader?.assets ?? {}
      const url = (name: string | undefined) => (name === undefined ? undefined : assets[name]?.url)
      const name = file.replace(/\.scene\.json$/, '')
      for (const [kind, k] of Object.entries<any>(world.motion3d?.kinds ?? {})) {
        const rig = url(k.rig), model = url(k.model), motionFile = url(k.motion)
        if (!rig || !model || !motionFile) continue
        const { moves, turns } = readJson(path.join(root, motionFile.replace(/^\//, '')))
        const baked = url(k.measured), motion = url(k.baked)
        out.push({ game, scene: name, kind, body: k.model, rig, model, ...(baked && { baked }), ...(motion && { motion }), anim: { moves, turns } })
      }
      const anim = world.anim
      for (const [kind, k] of Object.entries<any>(anim?.kinds ?? {})) {
        const rig = url(k.rig), model = url(k.model)
        if (!rig || !model) continue
        const baked = url(k.baked)
        out.push({ game, scene: name, kind, body: k.model, rig, model, ...(baked && { baked }), anim: { moves: anim.moves, turns: anim.turns } })
      }
    }
  }
  return out
}

// Every clip of the troupe collection's packs, its path under the collection.
function troupe() {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (name.toLowerCase().endsWith('.fbx')) out.push(path.relative(TROUPE, p))
    }
  }
  const packs = path.join(TROUPE, 'packs')
  if (fs.existsSync(packs)) walk(packs)
  return out.sort()
}

const node = (args: string[]) =>
  new Promise<string>((done, fail) => execFile(process.execPath, args, { maxBuffer: 1 << 26 }, (e, stdout, stderr) =>
    e ? fail(new Error(`node ${args.join(' ')} failed:\n${stdout}${stderr}`)) : done(`${stdout}${stderr}`)))

// The clip baked onto the body of the rig at `rigUrl`: a rig file of that body and the one clip, its
// table, ends and touches merged in, and its glb, in a folder of its own.
async function bake(rigUrl: string, bakedUrl: string | undefined, body: string, clip: string) {
  const local = (url: string) => path.join(root, decodeURIComponent(url).replace(/^\//, ''))
  const source = { ...readJson(local(rigUrl)), ...(bakedUrl ? readJson(local(bakedUrl)) : {}) }
  if (!source.bodies?.[body]) throw new Error(`the rig ${rigUrl} has no body ${body}`)
  const file = path.join(TROUPE, clip)
  if (!clip.toLowerCase().endsWith('.fbx') || !file.startsWith(TROUPE + path.sep) || !fs.existsSync(file)) throw new Error(`no clip ${clip} in ~/troupe-collection`)
  const name = path.basename(clip, path.extname(clip)).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const folder = fs.mkdtempSync(path.join(BAKED, `${name}-`))
  const rig = path.join(folder, 'rig.json'), table = path.join(folder, 'table.json'), glb = path.join(folder, 'model.glb')
  const kept = Object.fromEntries(['spread', 'size'].filter(k => source[k] !== undefined).map(k => [k, source[k]]))
  fs.writeFileSync(rig, JSON.stringify({ bodies: { [body]: source.bodies[body] }, ...kept, clips: { [name]: clip }, roles: {}, table: {} }, null, 2))
  const work = fs.mkdtempSync(path.join(folder, 'work-'))
  const t = tools(root, process.env, work)
  await t.blender(['--factory-startup', '--python-exit-code', '1', '--python', EXPORT, '--', rig, table, `${body}=${glb}`])
  await node([MERGE, rig, table, rig])
  fs.rmSync(work, { recursive: true, force: true })
  // The clip's sidecar, `<clip>.motion3d.json` beside its FBX, as motion3d's bake hands it on.
  const sidecar = file.replace(/\.fbx$/i, '.motion3d.json')
  fs.writeFileSync(path.join(folder, 'motion3d.baked.json'), JSON.stringify({ held: fs.existsSync(sidecar) ? { [name]: readJson(sidecar) } : {}, offsets: {} }))
  const url = (f: string) => `/@clipanalyzer/baked/${path.basename(folder)}/${f}`
  return { rig: url('rig.json'), model: url('model.glb'), motion: url('motion3d.baked.json'), clip: name }
}

const answers: Plugin = {
  name: 'clipanalyzer',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      if (!pathname.startsWith('/@clipanalyzer/')) return next()
      const send = (status: number, body: unknown) => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      try {
        if (pathname === '/@clipanalyzer/sources') return send(200, { rigs: rigs(), troupe: troupe() })
        if (pathname === '/@clipanalyzer/bake' && req.method === 'POST') {
          let text = ''
          for await (const chunk of req) text += chunk
          const { rig, baked, body, clip } = JSON.parse(text)
          return send(200, await bake(rig, baked, body, clip))
        }
        if (pathname.startsWith('/@clipanalyzer/baked/')) {
          const file = path.join(BAKED, decodeURIComponent(pathname.slice('/@clipanalyzer/baked/'.length)))
          if (!file.startsWith(BAKED + path.sep) || !fs.existsSync(file)) return send(404, { error: 'no such file' })
          res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'model/gltf-binary')
          return void res.end(fs.readFileSync(file))
        }
        return send(404, { error: `no ${pathname}` })
      } catch (e) {
        return send(500, { error: (e as Error).message })
      }
    })
  },
}

const port = Number(process.argv[2] ?? 5199)
const vite = await createServer({ ...config, configFile: false, root, plugins: [...(config.plugins ?? []), answers], server: { ...config.server, port } })
await vite.listen()
const at = vite.resolvedUrls?.local[0] ?? `http://localhost:${port}/`
console.log(`the clip analyzer: ${new URL(PAGE.slice(1), at)}`)
const stop = async () => {
  await vite.close()
  fs.rmSync(BAKED, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
