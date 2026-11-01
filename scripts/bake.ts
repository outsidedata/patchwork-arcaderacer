// Bakes a game's art: `node --experimental-strip-types scripts/bake.ts <game>` (`yarn bake <game>`)
// makes every built file the game draws from the library and the scripts beside its art, and writes it
// into `games/<game>/assets/`. A game has either or both of:
//   assets/cc0-textures.json   the cc0-textures.com sets it draws, cut into its maps (`cc0.ts`)
//   assets/<game>.bake.ts      every other built file: glbs Blender exports and gltfpack packs, pictures
//                              cut to size
// The game commits what both write, so it boots with no bake, and the scripts that write it; the raw
// parts stay in the library.
//
// First it runs `yarn health`'s checks (`health.ts`) that the game needs and stops, writing nothing,
// when any fails: a bake file needs Blender, the library, a gltfpack that packs WebP and an ImageMagick
// that writes it; a cc0-textures.json alone needs only the library and ImageMagick. Each is found the
// way health finds it: the shell's variables over the root's `.env`, else the defaults. Then it cuts the
// maps not already there, then runs the bake file.
//
// A game's bake file exports a default `(tools: Tools) => Promise<void>`. What the tools make is the
// form every game ships its art in:
//   blender(args)          Blender in the background on `args`, its environment carrying the library
//   pack(raw, out)         a glb packed by gltfpack: meshopt geometry, WebP textures, every named node
//                          and material kept (a glTF mesh's own name is not, so a mesh a look finds by
//                          name is a node of one primitive), and every node's extras, which three hands a look as
//                          its `userData`; positions stay floats, since gltfpack's integer positions put
//                          their scale on the mesh's node and a look that draws a mesh's geometry on
//                          matrices of its own (instancing) would draw it at that scale's inverse
//                          (`-cc -kn -km -ke -vpf -tw`)
//   webp(src, out, size)   a picture cut to `size` pixels square and written as WebP at quality 80
//   scratch(name)          a path in a folder of the bake's own, removed when it ends
//   library                the library's folder, `PATCHWORK_LIBRARY`
//   texture(zip)           a cc0-textures set's maps in the library, `{ color, normal, roughness }` of
//                          those it has, downloaded first when it is not there (`cc0.ts`), for a script
//                          that draws with them
// Each throws with the tool's output when it fails, so a bake stops at its first failure.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config, cut, texture, type Map } from './cc0.ts'
import { checks, resolve } from './health.ts'

export type Tools = {
  library: string
  blender: (args: string[]) => Promise<string>
  pack: (raw: string, out: string) => Promise<string>
  webp: (src: string, out: string, size: number) => Promise<string>
  scratch: (name: string) => string
  texture: (zip: string) => Promise<Partial<Record<Map, string>>>
}

const run = (file: string, args: string[], env: Record<string, string | undefined>) =>
  new Promise<string>((done, fail) => execFile(file, args, { env, maxBuffer: 1 << 26 }, (e, stdout, stderr) =>
    e ? fail(new Error(`${path.basename(file)} ${args.join(' ')} failed:\n${stdout}${stderr}`)) : done(`${stdout}${stderr}`)))

// The tools a bake is handed; `bake` runs health's checks first, so each one found here works.
export const tools = (root: string, shell: Record<string, string | undefined>, work: string): Tools => {
  const { env, blender, library, gltfpack = 'gltfpack', magick = 'magick' } = resolve(root, shell)
  const carried = { ...env, PATCHWORK_LIBRARY: library }
  const into = (out: string) => fs.mkdirSync(path.dirname(out), { recursive: true })
  return {
    library,
    blender: args => run(blender, ['--background', ...args], carried),
    pack: (raw, out) => (into(out), run(gltfpack, ['-i', raw, '-o', out, '-cc', '-kn', '-km', '-ke', '-vpf', '-tw'], carried)),
    webp: (src, out, size) => (into(out), run(magick, [src, '-resize', `${size}x${size}!`, '-quality', '80', out], carried)),
    scratch: name => path.join(work, name),
    texture: zip => texture(library, zip),
  }
}

export const bake = async (game: string, root: string, shell: Record<string, string | undefined>) => {
  const file = path.join(root, 'games', game, 'assets', `${game}.bake.ts`)
  const hasFile = fs.existsSync(file)
  const cc0 = config(root, game)
  if (!hasFile && !cc0) throw new Error(`${game} has no bake: no ${path.relative(root, file)} or cc0-textures.json`)
  const needed = checks(root, shell).filter(c => c.for === 'bake' && (hasFile || c.name === 'library' || c.name === 'imagemagick'))
  const failed = (await Promise.all(needed.map(async c => ({ name: c.name, ...await c.run() })))).filter(r => !r.ok)
  if (failed.length) throw new Error(failed.map(r => `${r.name}: ${r.detail}${r.fix ? `\n  fix: ${r.fix}` : ''}`).join('\n'))
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `bake-${game}-`))
  try {
    const t = tools(root, shell, work)
    for (const out of await cut(root, game, t)) console.log('wrote', path.relative(root, out))
    if (hasFile) {
      const { default: make } = await import(pathToFileURL(file).href) as { default: (t: Tools) => Promise<void> }
      await make(t)
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await bake(process.argv[2] ?? '', process.cwd(), process.env)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
