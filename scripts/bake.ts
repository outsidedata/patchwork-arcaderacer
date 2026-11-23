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
// when any fails: a bake file needs Blender, the library, a gltfpack that packs WebP, an ImageMagick
// that writes it and a basisu that writes KTX2; a cc0-textures.json alone needs only the library and ImageMagick. Each is found the
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
//   ktx2(srcs, out, size, space)  the pictures `srcs`, each cut to `size` pixels square, written by Basis
//                          Universal's basisu as one GPU-compressed KTX2 (an array of them, a layer each,
//                          in order; one alone a plain texture): ETC1S at basisu's own settings. `space`
//                          is `linear` when left out: the file says linear and is mipmapped in linear, the
//                          bytes kept as they are, for a picture of numbers (a normal, a roughness map) or
//                          a shader that decodes each layer itself. `srgb` is a picture of colours: the file
//                          says sRGB, so the GPU decodes it to linear light as it samples, and it is
//                          mipmapped in linear light. ETC1S, so the file is about as small as the WebPs it
//                          stands for and still uploads compressed; UASTC's quality is many times the
//                          download. The loader reads a `.ktx2` texture entry (its KTX2), in the colour
//                          space its file says.
//   mean(src, size)        a picture cut to `size` square, its mean of 0.2126 r + 0.7152 g + 0.0722 b with
//                          each channel taken from sRGB to linear: supershader3d's `lookMeans` of it
//   stack(looks, folder, out)  a looks file (`Looks`) with its `stack`: every picture it lists, read from
//                          `folder` where they were cut, in its order, as one KTX2 array
//                          (`<scene>.pictures.ktx2` in `folder`, `<scene>` the name of `out` less
//                          `.looks.json`) with each colour picture's mean, the catalogue's entry
//                          `<scene>_pictures` naming it; the file as it was when it lists no picture. A
//                          picture not in `folder` throws. The looks tool runs it; a bake whose looks file
//                          another tool writes (pro-ng's `look_bake.mjs`, a world3d place's) runs it on that
//                          file once its pictures are copied, writes the file again, and lists the stack in
//                          its catalogue, so supershader3d binds the one array and never draws the pictures
//   flipbooks(file)        every flipbook the effects file `file` lists under `flipbooks`, rendered by
//                          Blender from its node tree into the pictures and sheets its particles play,
//                          written beside the file (`tools/workshop/flipbooks.py` says what an entry holds)
//   scratch(name)          a path in a folder of the bake's own, removed when it ends
//   library                the library's folder, `PATCHWORK_LIBRARY`
//   texture(zip)           a cc0-textures set's maps in the library, `{ color, normal, roughness }` of
//                          those it has, downloaded first when it is not there (`cc0.ts`), for a script
//                          that draws with them
//   looks(spec)            a scene's shader, put together from the library's pro-ng looks
//                          (`pro-ng/material/LOOKS.md`, `pro-ng/material/compose.js`), for the
//                          supershader3d plugin: `spec` is `{ materials, out, pictures }`, `materials`
//                          `{ <name>: { look, settings?, colour? } }` in the order their numbers count
//                          (a vertex's `lookId`), each a look of `pro-ng/material/looks/<look>.js`, the
//                          settings it gives over the look's own, and its flat colour (`#rrggbb`, the
//                          debug view's; mid grey when left out). It writes `out`, the JSON the plugin
//                          reads (`plugins/supershader3d/supershader3d.plugin.ts` says what it holds),
//                          every material's settings moved out of uniforms into one table a texel a
//                          setting (`pack-looks.ts`), so the shader declares one sampler however many settings
//                          the scene has, and cuts every picture the looks read to PICTURE pixels square as WebP into
//                          the folder `pictures`, each named after its file (`Rock013_4K_Color.webp`),
//                          the set downloaded into the library first; the JSON names each by that stem,
//                          which the game's catalogue lists as a `texture` entry; and writes their
//                          `stack` (`stack` above), which the catalogue lists as a `.ktx2` texture entry
//                          `<scene>_pictures`, url `<pictures>/<scene>.pictures.ktx2`. A look that is not in
//                          the library, a setting that is neither a number nor a colour, and a picture
//                          the set does not hold each throw, naming it.
//   garment(spec)          a garment of the library's garment shop draped on a body the game draws, for
//                          fabric3d's `garment` cut (`garment.ts` says the whole of it): `spec` is `{ body,
//                          figure, kit, config, garment, out }`, `body` the game's baked body (a glb of one
//                          skin, at rest in its T-pose), `figure` the name the shop keeps it under, `kit`
//                          and `config` a kit of the shop and one of its configs, `garment` the name of the
//                          one of its garments to write, and `out` the glb. The shop drapes it on the body
//                          (by the draper `GARMENT_DRAPER` names, else here), and it is written as `out`, a
//                          mesh a pattern piece, packed, and its sidecar `<out less .glb>.garment.json`
//                          beside it, which the catalogue lists as a `model` and a `json` entry.
//   items(spec)            kit items of the library's pro-ng, for the item3d plugin (`items.ts` says the whole
//                          of it): `spec` is `{ sheet, out }`, `sheet` an items sheet (`{ items: { <item>: {
//                          kind, keys } } }`, each a kit kind and its keys), `out` the folder each is written
//                          into as `<item>.glb` and its sidecar `<item>.item.json`, which the catalogue lists as
//                          a `binary` and a `json` entry. It hands back `{ items, materials }`, the materials
//                          the items are drawn in, for the `looks` tool to compose with the scene's own into
//                          its one looks file.
// Each throws with the tool's output when it fails, so a bake stops at its first failure.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config, cut, texture, type Map } from './cc0.ts'
import { checks, resolve } from './health.ts'
import type { Looks, Shader } from '#plugins/supershader3d/supershader3d.plugin.ts'
import type { Garment } from '#plugins/loader/loader.fabric3d.ts'
import { packLooks } from './pack-looks.ts'
import { garment, type GarmentSpec } from './garment.ts'
import { items, type Items, type ItemsSpec } from './items.ts'

export type Tools = {
  library: string
  blender: (args: string[]) => Promise<string>
  pack: (raw: string, out: string) => Promise<string>
  webp: (src: string, out: string, size: number) => Promise<string>
  ktx2: (srcs: string[], out: string, size: number, space?: 'linear' | 'srgb') => Promise<string>
  mean: (src: string, size: number) => Promise<number>
  stack: (looks: Looks, folder: string, out: string) => Promise<Looks>
  flipbooks: (file: string) => Promise<string>
  scratch: (name: string) => string
  texture: (zip: string) => Promise<Partial<Record<Map, string>>>
  looks: (spec: LooksSpec) => Promise<Looks>
  garment: (spec: GarmentSpec) => Promise<Garment>
  items: (spec: ItemsSpec) => Promise<Items>
}

// A material of a looks bake: its look, the settings it gives over the look's own, its flat colour.
export type Material = { look: string; settings?: Record<string, number | number[]>; colour?: string }
export type LooksSpec = { materials: Record<string, Material>; out: string; pictures: string }
// What a looks bake writes is the plugin's file (`plugins/supershader3d/supershader3d.plugin.ts`, The file).
export type { Looks }
type Call = Shader

// A `#rrggbb` colour as three's Color makes it: sRGB taken to linear.
const linear = (hex: string) => [1, 3, 5].map(i => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

// The shared GLSL chunks every scene's shader may read (`pro-ng/material/looks/shared/`); a look that names
// another (its `shared`: `ruin`, `heat`) has that one read too.
const SHARED = ['noise', 'layout', 'random']
// the picture sets the library grows itself (pro-ng/pictures.mjs) rather than cuts from cc0-textures
const GROWN = ['feathers', 'feather-atlas']

// The looks tool: the library's pro-ng composes the materials' looks, the pictures are cut, the JSON
// written. `texture` and `webp` are the bake's own tools.
async function composeLooks(library: string, t: Pick<Tools, 'texture' | 'webp' | 'stack'>, { materials, out, pictures }: LooksSpec): Promise<Looks> {
  const prong = path.join(library, 'pro-ng', 'material')
  const composeFile = path.join(prong, 'compose.js')
  if (!fs.existsSync(composeFile)) throw new Error(`the library at ${library} has no pro-ng/material/compose.js`)
  const { composeScene, PICTURE } = await import(pathToFileURL(composeFile).href) as { composeScene: (m: unknown[], shared: Record<string, string>) => any; PICTURE: number }
  const looks: Record<string, any> = {}
  for (const [name, m] of Object.entries(materials)) {
    if (looks[m.look]) continue
    const file = path.join(prong, 'looks', `${m.look}.js`)
    if (!fs.existsSync(file)) throw new Error(`material ${name}: no look ${m.look} (pro-ng/material/looks/${m.look}.js)`)
    looks[m.look] = (await import(pathToFileURL(file).href)).default
  }
  const shared: Record<string, string> = {}
  for (const s of new Set([...SHARED, ...Object.values(looks).flatMap(l => (l.shared ?? []) as string[])])) shared[s] = (await import(pathToFileURL(path.join(prong, 'looks', 'shared', `${s}.js`)).href)).default
  const names = Object.keys(materials)
  const list = names.map(name => {
    const m = materials[name]
    return { name, lookName: m.look, look: looks[m.look], settings: m.settings ?? {}, colour: linear(m.colour ?? '#808080') }
  })
  const scene = composeScene(list, shared)
  // every material in one shader, for a program that draws any look (the ground's)
  const allCall: Call | null = list.length ? { ids: list.map((_, i) => i), fragmentPars: allOf(list, shared, scene, composeScene), features: featuresOf([scene.solid, scene.relief, scene.seeThrough]) } : null
  const cut: Looks['pictures'] = []
  const dirs = new Map<string, string>()
  for (const p of scene.pictures as { set: string; file: string; colour: boolean }[]) {
    // a feather's picture (`feathers`, `feather-atlas`) is grown by the library's pro-ng/pictures.mjs, not cut from a
    // cc0-textures set: copied as it is grown (a normal atlas kept lossless, a colour stored times its alpha)
    if (GROWN.includes(p.set)) {
      const { picture } = await import(pathToFileURL(path.join(library, 'pro-ng', 'pictures.mjs')).href) as { picture: (p: string) => string | null }
      const grown = picture(`${p.set}/${p.file}`)
      if (!grown) throw new Error(`the looks read ${p.set}/${p.file}, which the library's pro-ng/feathers/ has no file to grow it from`)
      fs.mkdirSync(pictures, { recursive: true })
      fs.copyFileSync(grown, path.join(pictures, p.file))
      cut.push({ asset: p.file.replace(/\.[^.]+$/, ''), file: p.file, set: p.set, source: p.file, colour: p.colour })
      continue
    }
    if (!dirs.has(p.set)) {
      const maps = await t.texture(p.set)
      const first = Object.values(maps)[0]
      if (!first) throw new Error(`the looks read ${p.set}/${p.file}, and the set ${p.set} has no maps in the library`)
      dirs.set(p.set, path.dirname(first))
    }
    const source = path.join(dirs.get(p.set)!, p.file)
    if (!fs.existsSync(source)) throw new Error(`the looks read ${p.set}/${p.file}, which the set in the library does not hold (${source})`)
    const stem = p.file.replace(/\.[^.]+$/, '')
    const file = `${stem}.webp`
    await t.webp(source, path.join(pictures, file), PICTURE)
    cut.push({ asset: stem, file, set: p.set, source: p.file, colour: p.colour })
  }
  const packed = packLooks({
    about: `the shader of ${path.basename(out)}, put together from its materials' looks by the library's pro-ng/material/compose.js`,
    picture: PICTURE,
    materials: names.map((name, id) => ({ name, look: materials[name].look, call: scene.callOf(id), colour: list[id].colour })),
    vertexPars: scene.vertexPars,
    vertexMain: scene.vertexMain,
    calls: { solid: scene.solid, relief: scene.relief, seeThrough: scene.seeThrough, all: allCall },
    uniforms: scene.uniforms,
    needs: scene.needs,
    pictures: cut,
  })
  const made = await t.stack(packed, pictures, out)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(made, null, 1) + '\n')
  return made
}

// The one shader of every material: compose.js groups materials by draw call, so every material is
// composed once more as if each were solid and cast no shadow of its own, which puts all of them
// behind one switch, and then the relief call's own shadow functions and its `lookShadow` are put
// back in place of the empty `lookShadow` the flattening left. A look's shadow is wrapped as
// `float lookShadow_<id>(vec3 Lview) {` to a `}` at the line's start (compose.js), so each one is cut
// out whole.
function allOf(list: any[], shared: Record<string, string>, scene: any, composeScene: (m: unknown[], shared: Record<string, string>) => any): string {
  const flat = list.map(m => ({ ...m, look: { ...m.look, seeThrough: false, shadow: undefined } }))
  const whole: string = composeScene(flat, shared).solid.fragmentPars
  const relief = scene.relief as Call | null
  if (!relief) return whole
  const shadows = relief.fragmentPars.match(/^float lookShadow_\d+\(vec3 Lview\) \{\n[\s\S]*?\n\}\n/gm) ?? []
  const dispatch = relief.fragmentPars.match(/^float lookShadow\(int id, vec3 Lview\) \{\n[\s\S]*?\n\}\n/m)
  const empty = 'float lookShadow(int id, vec3 Lview) {\n  \n  return 1.0;\n}\n'
  if (!dispatch || !whole.includes(empty)) throw new Error('the library\'s pro-ng/material/compose.js no longer writes lookShadow as the looks tool reads it')
  return whole.replace(empty, `${shadows.join('')}${dispatch[0]}`)
}

const featuresOf = (calls: (Call | null)[]) => {
  const out: Record<string, boolean> = {}
  for (const c of calls) for (const [f, on] of Object.entries(c?.features ?? {})) out[f] = !!out[f] || on
  return out
}

const run = (file: string, args: string[], env: Record<string, string | undefined>) =>
  new Promise<string>((done, fail) => execFile(file, args, { env, maxBuffer: 1 << 26 }, (e, stdout, stderr) =>
    e ? fail(new Error(`${path.basename(file)} ${args.join(' ')} failed:\n${stdout}${stderr}`)) : done(`${stdout}${stderr}`)))

// The script Blender runs to render an effects file's flipbooks.
const FLIPBOOKS = fileURLToPath(new URL('../tools/workshop/flipbooks.py', import.meta.url))

// The tools a bake is handed; `bake` runs health's checks first, so each one found here works.
export const tools = (root: string, shell: Record<string, string | undefined>, work: string): Tools => {
  const { env, blender, library, gltfpack = 'gltfpack', magick = 'magick', basisu = 'basisu' } = resolve(root, shell)
  const carried = { ...env, PATCHWORK_LIBRARY: library }
  const into = (out: string) => fs.mkdirSync(path.dirname(out), { recursive: true })
  const t: Tools = {
    library,
    blender: args => run(blender, ['--background', ...args], carried),
    pack: (raw, out) => (into(out), run(gltfpack, ['-i', raw, '-o', out, '-cc', '-kn', '-km', '-ke', '-vpf', '-tw'], carried)),
    webp: (src, out, size) => (into(out), run(magick, [src, '-resize', `${size}x${size}!`, '-quality', '80', out], carried)),
    ktx2: async (srcs, out, size, space = 'linear') => {
      into(out)
      const layers = srcs.map((_, i) => path.join(work, `${path.basename(out)}.${i}.png`))
      for (const [i, src] of srcs.entries()) await run(magick, [src, '-resize', `${size}x${size}!`, `PNG32:${layers[i]}`], carried)
      const colours = space === 'srgb' ? ['-srgb', '-mipmap', '-mip_srgb'] : ['-linear', '-mipmap', '-mip_linear']
      return run(basisu, ['-etc1s', ...colours,'-tex_type', layers.length > 1 ? '2darray' : '2d', '-ktx2', '-output_file', out, ...layers], carried)
    },
    // the mean of 0.2126 r + 0.7152 g + 0.0722 b over a picture cut to `size` square, each channel taken
    // from sRGB to linear first, as supershader3d's `lookMeans` holds it
    mean: async (src, size) => Number((await run(magick, [src, '-resize', `${size}x${size}!`, '-colorspace', 'RGB', '-grayscale', 'Rec709Luminance', '-format', '%[fx:mean]', 'info:'], carried)).trim()),
    stack: async (looks, folder, out) => {
      if (!looks.pictures.length) return looks
      const scene = path.basename(out).replace(/\.looks\.json$/, '').replace(/\.json$/, '')
      const file = `${scene}.pictures.ktx2`
      const sources = looks.pictures.map(p => path.join(folder, p.file))
      for (const s of sources) if (!fs.existsSync(s)) throw new Error(`the looks' picture ${path.basename(s)} is not in ${folder}, which the stack is made from`)
      await t.ktx2(sources, path.join(folder, file), looks.picture)
      const means = await Promise.all(looks.pictures.map((p, i) => (p.colour ? t.mean(sources[i], looks.picture) : Promise.resolve(0.2))))
      return { ...looks, stack: { asset: `${scene}_pictures`, file, means } }
    },
    flipbooks: file => run(blender, ['--background', '--python', FLIPBOOKS, '--', file], carried),
    scratch: name => path.join(work, name),
    texture: zip => texture(library, zip),
    looks: spec => composeLooks(library, t, spec),
    // a garment's pieces have no material, and gltfpack drops the uv of a mesh with none: `-kv` keeps every
    // attribute. It rounds each mesh's points to a grid of that mesh's own, which parts two pieces at the
    // seam they share: `-noq` leaves every number as it was written
    garment: spec => garment(spec, {
      library, scratch: t.scratch,
      pack: (raw, out) => (into(out), run(gltfpack, ['-i', raw, '-o', out, '-cc', '-kn', '-km', '-ke', '-kv', '-noq'], carried)),
      node: args => run(process.execPath, args, carried),
    }),
    items: spec => items(spec, { library, scratch: t.scratch, blender: t.blender }),
  }
  return t
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
