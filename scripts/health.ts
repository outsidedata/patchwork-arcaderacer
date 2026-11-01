// Checks this machine has what core needs: `node --experimental-strip-types scripts/health.ts`
// (`yarn health`) prints one line a check, `ok` or `FAIL` with what is wrong and how to fix it, and
// exits 1 when any fails. Nothing is changed or installed.
//
// Playing and testing need node at the version `engines` names and every package of package.json
// installed. Baking art needs four more, each found the way the bakes find it: `BLENDER`,
// `PATCHWORK_LIBRARY`, `GLTFPACK` and `MAGICK` from the shell, else from the root's `.env`
// (`.env.example` lists them), else their defaults: the macOS application's Blender,
// ~/patchwork-library, and `gltfpack` and `magick` on the PATH.
//
// A tool is run, not looked for. Blender must answer `--version`. gltfpack must pack a glTF with a
// texture under `-tw` into a glb whose texture is WebP (`EXT_texture_webp`): the npm build in
// node_modules cannot (its node.js build has no WebP), nor can 0.17, which has no `-tw`. ImageMagick
// must write a WebP file, which a build without libwebp cannot.
//
// Each game in `games/` that draws cc0-textures sets (`assets/cc0-textures.json`, `cc0.ts`) is one more
// check, named the game: its maps are made by `yarn bake <game>` and committed with it, and the check
// counts those not on disk and names the bake that makes them.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { config, outputs } from './cc0.ts'

export type Result = { ok: boolean, detail: string, fix?: string }
export type Check = { name: string, for: 'play' | 'bake' | 'game', run: () => Promise<Result> }

// One check per game with a cc0-textures.json: are all its maps baked?
const games = (root: string): Check[] => {
  const dir = path.join(root, 'games')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'assets', 'cc0-textures.json')))
    .map(d => ({
      name: d.name, for: 'game' as const, run: async (): Promise<Result> => {
        let made: string[]
        try { made = outputs(config(root, d.name)!) } catch (e) { return { ok: false, detail: (e as Error).message } }
        const missing = made.filter(o => !fs.existsSync(path.join(dir, d.name, 'assets', o))).length
        return missing
          ? { ok: false, detail: `${missing} of ${made.length} cc0 textures not baked`, fix: `yarn bake ${d.name}` }
          : { ok: true, detail: `${made.length} cc0 textures baked` }
      },
    }))
}

type Ran = { code: number, out: string }

const run = (file: string, args: string[], env: Record<string, string | undefined>) =>
  new Promise<Ran>(done => execFile(file, args, { env, timeout: 60_000, maxBuffer: 1 << 24 }, (e, stdout, stderr) =>
    done({ code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, out: `${stdout}${stderr}` || (e?.message ?? '') })))

const first = (s: string) => s.trim().split('\n')[0] ?? ''

// A bare name's binary on the PATH, past the root's `node_modules` (yarn puts its `.bin` first, and the
// npm gltfpack there is the node.js build); a path is itself. Undefined when none is there.
export const which = (name: string, root: string, env: Record<string, string | undefined>) => {
  if (name.includes(path.sep)) return name
  const skip = path.join(root, 'node_modules') + path.sep
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir || path.resolve(dir).startsWith(skip)) continue
    for (const ext of exts) {
      const file = path.join(dir, name + ext)
      if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return file
    }
  }
}

// The shell's variables over the root's `.env`, as the bakes read them.
export const settings = (root: string, shell: Record<string, string | undefined>) => {
  const file = path.join(root, '.env')
  return { ...(fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {}), ...shell }
}

// `a.b.c` at least `min`, numerically part by part.
export const atLeast = (version: string, min: string) => {
  const a = version.split('.').map(Number), b = min.split('.').map(Number)
  for (let i = 0; i < b.length; i++) if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i]
  return true
}

// A glTF of one triangle whose material's colour is a 1×1 PNG, all inline.
const probeGltf = () => {
  const data = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]).buffer)
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ uri: `data:image/png;base64,${png}` }],
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    ],
  })
}

// The settings and the four bake tools, as the bakes take them (`bake.ts`); gltfpack and magick are
// undefined when neither the setting nor the PATH has one.
export const resolve = (root: string, shell: Record<string, string | undefined>) => {
  const env = settings(root, shell)
  return {
    env,
    blender: env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender',
    library: (env.PATCHWORK_LIBRARY || '~/patchwork-library').replace(/^~(?=$|\/)/, os.homedir()),
    gltfpack: which(env.GLTFPACK || 'gltfpack', root, env),
    magick: which(env.MAGICK || 'magick', root, env),
  }
}

export const checks = (root: string, shell: Record<string, string | undefined>): Check[] => {
  const { env, blender, library, gltfpack, magick } = resolve(root, shell)
  const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'core-health-'))
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const absent = (name: string, fix: string): Result => ({ ok: false, detail: `no ${name} on the PATH`, fix })
  const gltfpackFix = 'download the native gltfpack 1.3 or later for this platform from https://github.com/zeux/meshoptimizer/releases, and put it on the PATH or set GLTFPACK in .env to it'
  const magickFix = 'install ImageMagick 7 built with libwebp (brew install imagemagick), and put magick on the PATH or set MAGICK in .env to it'
  return [
    {
      name: 'node', for: 'play', run: async () => {
        const min = String(pkg.engines?.node ?? '').replace(/^>=/, '')
        const ok = atLeast(process.versions.node, min)
        return { ok, detail: `${process.versions.node}, needs ${min}`, fix: ok ? undefined : `install node ${min} or later` }
      },
    },
    {
      name: 'packages', for: 'play', run: async () => {
        const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
        const missing = names.filter(n => !fs.existsSync(path.join(root, 'node_modules', n, 'package.json')))
        return missing.length
          ? { ok: false, detail: `missing ${missing.join(', ')}`, fix: 'yarn install' }
          : { ok: true, detail: `${names.length} installed` }
      },
    },
    {
      name: 'blender', for: 'bake', run: async () => {
        const r = await run(blender, ['--version'], env)
        const v = /Blender (\d+\.\d+(\.\d+)?)/.exec(r.out)?.[1]
        return r.code === 0 && v
          ? { ok: true, detail: `${v} at ${blender}` }
          : { ok: false, detail: `${blender} does not run: ${first(r.out)}`, fix: 'install Blender, or set BLENDER in .env to its binary' }
      },
    },
    {
      name: 'library', for: 'bake', run: async () => fs.statSync(library, { throwIfNoEntry: false })?.isDirectory()
        ? { ok: true, detail: library }
        : { ok: false, detail: `${library} is not a folder`, fix: 'clone patchwork-library there, or set PATCHWORK_LIBRARY in .env to where it is' },
    },
    {
      name: 'gltfpack', for: 'bake', run: async () => {
        if (!gltfpack) return absent('gltfpack', gltfpackFix)
        const dir = scratch()
        try {
          fs.writeFileSync(path.join(dir, 'probe.gltf'), probeGltf())
          const out = path.join(dir, 'probe.glb')
          const r = await run(gltfpack, ['-i', path.join(dir, 'probe.gltf'), '-o', out, '-cc', '-tw'], env)
          const version = /gltfpack (\d[\d.]*)/.exec(r.out)?.[1]
          const webp = fs.existsSync(out) && fs.readFileSync(out).includes('EXT_texture_webp')
          return r.code === 0 && webp
            ? { ok: true, detail: `${gltfpack} packs WebP textures` }
            : {
              ok: false,
              detail: `${gltfpack}${version ? ` (${version})` : ''} cannot pack WebP textures: ${first(r.out) || 'no WebP texture in its glb'}`,
              fix: gltfpackFix,
            }
        } finally { fs.rmSync(dir, { recursive: true, force: true }) }
      },
    },
    {
      name: 'imagemagick', for: 'bake', run: async () => {
        if (!magick) return absent('magick', magickFix)
        const dir = scratch()
        try {
          const out = path.join(dir, 'probe.webp')
          const r = await run(magick, ['-size', '4x4', 'xc:red', out], env)
          const head = fs.existsSync(out) ? fs.readFileSync(out).subarray(0, 12).toString('latin1') : ''
          const webp = head.startsWith('RIFF') && head.endsWith('WEBP')
          return r.code === 0 && webp
            ? { ok: true, detail: `${magick} writes WebP` }
            : {
              ok: false,
              detail: `${magick} cannot write WebP: ${first(r.out) || 'its file is not WebP'}`,
              fix: magickFix,
            }
        } finally { fs.rmSync(dir, { recursive: true, force: true }) }
      },
    },
    ...games(root),
  ]
}

export const health = async (root: string, shell: Record<string, string | undefined>) =>
  Promise.all(checks(root, shell).map(async c => ({ name: c.name, for: c.for, ...await c.run() })))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await health(process.cwd(), process.env)
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(12)} ${r.for.padEnd(5)} ${r.detail}`)
    if (!r.ok && r.fix) console.log(`${' '.repeat(25)}fix: ${r.fix}`)
  }
  if (results.some(r => !r.ok)) process.exit(1)
}
