// arcaderacer's bake, `yarn bake arcaderacer` (core's `scripts/bake.ts`): every glb the scene's
// catalogue names that a Blender script beside it makes, written where the catalogue reads it. Each glb
// is exported plain by its script and packed by gltfpack (meshopt geometry, WebP textures).
//   trees/trees.glb                    grown by the library's `trees/trees.py` (Blender's Sapling Tree
//                                      Gen) from `trees/trees.trees.json`: the forest's fir and cedar
//                                      (the library's spruce and spruce-mid) and Tokyo's zelkova, near,
//                                      mid and far, each a metre tall, their leaves and bark the species'
//                                      leaf and bark sets
//   paris/haussmann.glb                haussmann.py, high, its limestone and zinc the cc0-textures sets
//                                      limestone_1-4K and metal_roof-4K, through `texture`
//   paris/haussmann_medium.glb         haussmann.py, medium
//   paris/eiffel.glb, paris/lamp.glb   eiffel.py and lamp.py, from nothing
//   title/title.glb                    title.py, the title's words in 3D, from the Orbitron font beside it
//   supercar/supercar.glb              supercar.py builds the car and saves its scene; export_glb.py
//                                      exports the car from it, in a Blender of its own
// The courses' ground and road, `surfaces/<set>-<map>-1024.webp`, are cut by the bake itself from the
// cc0-textures sets `cc0-textures.json` names, before this runs, and committed with the game. The effects'
// sheet (`fx/fx.mjs`) and the songs (`music/jungle.song.ts`) read nothing from the library and are
// written by their own scripts.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Tools } from '#scripts/bake.ts'

const here = import.meta.dirname
const script = (file: string) => path.join(here, file)

export default async ({ blender, pack, scratch, texture, library }: Tools) => {
  const made = (file: string) => console.log('wrote', path.relative(path.join(here, '..', '..', '..'), file))

  const glb = async (out: string, make: (raw: string) => Promise<unknown>) => {
    const raw = scratch(out.replace(/\//g, '_'))
    await make(raw)
    await pack(raw, path.join(here, out))
    made(path.join(here, out))
  }
  const python = (file: string, ...args: string[]) => (raw: string) =>
    blender(['--factory-startup', '--python-exit-code', '1', '--python', script(file), '--', ...args, raw])

  const [limestone, zinc] = await Promise.all([texture('limestone_1-4K'), texture('metal_roof-4K')])
  const sets = [limestone.color!, limestone.roughness!, zinc.color!, zinc.normal!, zinc.roughness!]
  const haussmann = (quality: string) => (raw: string) =>
    blender(['--factory-startup', '--python-exit-code', '1', '--python', script('paris/haussmann.py'), '--', quality, raw, ...sets])

  await Promise.all([
    glb('trees/trees.glb', async raw => {
      // the spec's leaf and bark sets downloaded into the library first, then the trees grown from it
      const { leafSets, barkSets } = await import(pathToFileURL(path.join(library, 'trees', 'trees.mjs')).href)
      for (const zip of [...leafSets(script('trees/trees.trees.json')), ...barkSets(script('trees/trees.trees.json'))] as string[]) await texture(zip)
      await blender(['--factory-startup', '--python-exit-code', '1', '--python', path.join(library, 'trees', 'trees.py'), '--', script('trees/trees.trees.json'), raw])
    }),
    glb('paris/haussmann.glb', haussmann('high')),
    glb('paris/haussmann_medium.glb', haussmann('medium')),
    glb('paris/eiffel.glb', python('paris/eiffel.py')),
    glb('paris/lamp.glb', python('paris/lamp.py')),
    glb('title/title.glb', python('title/title.py')),
    glb('supercar/supercar.glb', async raw => {
      const scene = scratch('supercar.blend')
      await blender(['--factory-startup', '--python-exit-code', '1', '--python', script('supercar/supercar.py'), '--', scene])
      await blender([scene, '--python-exit-code', '1', '--python', script('supercar/export_glb.py'), '--', raw])
    }),
  ])
}
