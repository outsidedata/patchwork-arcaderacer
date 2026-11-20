// The items tool of a bake (`bake.ts`, `Tools.items`): kit items of the library's pro-ng, each made into the files
// the item3d plugin draws it from (`plugins/item3d/item3d.plugin.ts`).
//
// `items(spec, with)` is the tool. `spec` is
//   sheet     an items sheet, pro-ng's own (`pro-ng/build_item.mjs`): `{ "items": { "<item>": { "kind": "<kit kind>",
//             "keys": { "<Key>": <value> } } } }`, each item a kit kind (`yarn pro-ng:kit_list` in the library lists
//             them) and the keys it is built with, laid over the kind's own defaults
//   out       the folder the items are written into
// Every item of the sheet is built by pro-ng's item build (`buildItems`, run on the bake's own Blender) and written as
//   <out>/<item>.glb        the item alone at its kind's zero, y up, each vertex its material's number in the order
//                           the sidecar's `materials` lists them, with its bones and animations when it moves
//   <out>/<item>.item.json  `{ item, kind, keys, materials, clips, spawns }` (`Sidecar`,
//                           `plugins/item3d/item3d.plugin.ts`): the kind and every key it was built with, the names
//                           of its materials in the order its vertices count them, its clips as pro-ng wrote them
//                           (`<item>.clips.json`), and its spawns, `[{ effect, at, dir }]`, each an effect that burns
//                           on it, its point in metres and its way in the item's own frame
//   <out>/<item>.effects.json  for an item that has effects: `{ effects }`, its particle3d effects and lamps as
//                           pro-ng wrote them, a file the scene's particle3d effects file lists under `files`. An
//                           item with none has no such file, and one an earlier bake wrote is taken away.
// It hands back `{ items, materials, effects }`: each item's sidecar by its name; every material the items are drawn
// in, `{ <name>: { look, settings, colour } }` as the library's material sheets give them, in the order first met, for
// the bake to hand its `looks` tool with the scene's own materials, so the scene's one looks file holds them all; and
// the effects files written, each its name in `out`, for the bake to list in the scene's effects file; and `hairs`,
// `{ kinds, hairs }` for the bake to lay into the scene's hairs file (hair3d's): each hair an item grows as its kit
// kind wrote it, its `on` the item's parts that grow it (`item3d.hair3d.ts`), and each such item's wearers' kind to
// the hairs it grows. The sidecar's `grows`, `[{ row, number, part, hair }]`, says which parts those are. And
// `fabrics`, for the bake to lay into the scene's fabrics file (fabric3d's): each fabric an item hangs as its kit
// kind wrote it, with its `pins`, each on the item (`item`) or the bone of it that carries the pin, its `at` in the
// item's own frame and its `turn` laying the columns along the kit's `across` and the rows along its `down`
// (`item3d.fabric3d.ts`). The sidecar's `wears` names them.
// An item's vertices count its own materials from 0; item3d renumbers them by name into the scene's looks file.
//
// A material the library's sheets do not hold throws, naming the item and the material.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Material } from './bake.ts'
import type { Clips, Spawn } from '#plugins/world3d/world3d.place.ts'
import * as THREE from 'three'
import { STIFF, skinName, wornAs, type Grow } from '#plugins/item3d/item3d.plugin.ts'

export type ItemsSpec = { sheet: string; out: string }
// An item's sidecar, `<item>.item.json`.
export type Sidecar = { item: string; kind: string; keys: Record<string, unknown>; materials: string[]; clips: Clips; spawns: Spawn[]; grows: Grow[]; wears: string[] }
export type Items = {
  items: Record<string, Sidecar>; materials: Record<string, Material>; effects: string[]
  hairs: { kinds: Record<string, { hairs: string[] }>; hairs: Record<string, Record<string, unknown>> }
  fabrics: Record<string, Record<string, unknown>>
}
// What the tool is handed of the bake: the library, a scratch path and Blender.
export type ItemsWith = {
  library: string
  scratch: (name: string) => string
  blender: (args: string[]) => Promise<string>
}

type Sheet = { items: Record<string, { kind: string; keys?: Record<string, unknown> }> }
type Table = Record<string, { look: string; settings?: Record<string, number | number[]>; colour?: string }>

export async function items({ sheet, out }: ItemsSpec, { library, scratch, blender }: ItemsWith): Promise<Items> {
  const pro = path.join(library, 'pro-ng')
  const { buildItems } = await import(pathToFileURL(path.join(pro, 'build_item.mjs')).href) as { buildItems: (sheet: string, out: string, names: string[], blender: (args: string[]) => Promise<string>) => Promise<unknown> }
  const { loadMaterials } = await import(pathToFileURL(path.join(pro, 'materials.mjs')).href) as { loadMaterials: () => Table }
  const names = Object.keys((JSON.parse(fs.readFileSync(sheet, 'utf8')) as Sheet).items)
  const table = loadMaterials()
  const materials: Record<string, Material> = {}
  const made: Record<string, Sidecar> = {}
  const effects: string[] = []
  const hairs: Items['hairs'] = { kinds: {}, hairs: {} }
  const fabrics: Items['fabrics'] = {}
  const work = scratch('items')
  await buildItems(sheet, work, names, blender)
  fs.mkdirSync(out, { recursive: true })
  for (const name of names) {
    const from = path.join(work, name)
    const read = (suffix: string) => JSON.parse(fs.readFileSync(path.join(from, `${name}${suffix}`), 'utf8'))
    const built = read('.item.json') as { kind: string; keys: Record<string, unknown> }
    const grown = read('.hairs.json') as { hairs: Record<string, Record<string, unknown>>; grows: Grow[] }
    const hung = read('.fabrics.json') as { fabrics: Record<string, Record<string, unknown>>; hangs: { fabric: string; pins: { from: number[]; to: number[]; at: number[]; across: [number, number, number]; down: [number, number, number]; bone?: string }[] }[] }
    const burnt = read('.effects.json') as { effects: Record<string, unknown>; spawns: { effect: string; at: number[]; dir: number[] }[] }
    const side: Sidecar = {
      item: name, kind: built.kind, keys: built.keys, materials: (read('.looks.json').materials as { name: string }[]).map(m => m.name), clips: read('.clips.json'),
      spawns: burnt.spawns.map(s => ({ effect: s.effect, at: s.at, dir: s.dir })),
      grows: grown.grows.map(g => ({ row: g.row, number: g.number, part: g.part, hair: g.hair })),
      wears: [...new Set(hung.hangs.map(h => h.fabric))],
    }
    // the item's fabrics for the scene's fabrics file: each as the kit wrote it, with its pins. A pin sits at its
    // `at` in the item's own frame as it was built, on the item (`item`) or on the bone that carries it, turned so
    // the fabric's columns run along `across` and its rows along `down`.
    for (const h of hung.hangs) {
      const pins = h.pins.map(p => {
        const x = new THREE.Vector3(...p.across).normalize(), z = new THREE.Vector3(...p.down).normalize()
        const y = new THREE.Vector3().crossVectors(z, x)
        const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ')
        const deg = (a: number) => Math.round((a * 180) / Math.PI * 1000) / 1000 + 0
        return { on: p.bone ?? STIFF, from: p.from, to: p.to, at: p.at, turn: [deg(e.x), deg(e.y), deg(e.z)] }
      })
      const made = { ...hung.fabrics[h.fabric], pins }
      const had = fabrics[h.fabric]
      if (had && JSON.stringify(had) !== JSON.stringify(made)) throw new Error(`items: ${name} hangs the fabric ${h.fabric} by other pins than an item before it of the same kind does; the scene's fabrics file holds a fabric once`)
      fabrics[h.fabric] = made
    }
    // the item's hairs for the scene's hairs file: each as the kit wrote it, growing on the item's parts that grow it
    if (side.grows.length) {
      hairs.kinds[wornAs(name)] = { hairs: [...new Set(side.grows.map(g => g.hair))] }
      for (const hair of hairs.kinds[wornAs(name)].hairs) {
        const on = { meshes: `^(${side.grows.filter(g => g.hair === hair).map(g => skinName(g.row, g.part)).join('|')})$`, bones: [], weight: 0, cuts: [], planes: [], faces: [] }
        const made = { on, ...grown.hairs[hair] }
        const had = hairs.hairs[hair]
        if (had && JSON.stringify(had) !== JSON.stringify(made)) throw new Error(`items: ${name} grows the hair ${hair} on other parts than an item before it of the same kind does; the scene's hairs file holds a hair once`)
        hairs.hairs[hair] = made
      }
    }
    const effectsFile = path.join(out, `${name}.effects.json`)
    fs.rmSync(effectsFile, { force: true })
    if (Object.keys(burnt.effects).length) {
      fs.writeFileSync(effectsFile, JSON.stringify({ effects: burnt.effects }, null, 1) + '\n')
      effects.push(`${name}.effects.json`)
    }
    // every material the item is drawn in, and each its hairs and fabrics are drawn in (a hair's `look`, a
    // fabric's `look.material`)
    const looked = [
      ...Object.values(grown.hairs).map(h => h.look),
      ...Object.values(hung.fabrics).map(f => (f.look as { material?: unknown } | undefined)?.material),
    ].filter((m): m is string => typeof m === 'string')
    for (const m of [...side.materials, ...looked]) {
      const it = table[m]
      if (!it) throw new Error(`items: ${name} is drawn in the material ${m}, which no sheet of the library's pro-ng/materials holds`)
      materials[m] ??= { look: it.look, settings: it.settings, colour: it.colour }
    }
    fs.copyFileSync(path.join(from, `${name}.glb`), path.join(out, `${name}.glb`))
    fs.writeFileSync(path.join(out, `${name}.item.json`), JSON.stringify(side, null, 1) + '\n')
    made[name] = side
  }
  return { items: made, materials, effects, hairs, fabrics }
}
