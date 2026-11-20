// item3d's mod for crowd3d (`addons/scenemanager`'s mods), the page's. A scene with `world.crowd3d.mods: { items:
// 'item3d' }` puts item3d's items in the hands of crowd3d's people: an item of `world.crowd3d.items` that names an
// `item` in place of a `model`, `{ item, <place>: { at, turn, scale } }`, is the item of that name of
// `world.item3d.items`, in supershader3d's looks, one draw call for each of supershader3d's calls that draws any of
// it however many people hold it. An item that names a `model` is the loader's, as it always was.
//
// `items(plugins)` hands crowd3d item3d's `ready(item)`; its `parts(item)`, the item's geometry cut by call, every
// attribute the looks read kept; and `material(call, surface)`, a new material of that call from supershader3d dressed
// with crowd3d's surface (`surfaced`), which poses each copy by its holder's bone. An item that moves throws, in
// item3d's words: a copy posed by one bone has no bones of its own. And `carries(item)`, whether the item has
// effects of its own (its sidecar's `spawns`), and `carried(copies)`, which hands item3d where crowd3d holds each
// copy of such an item this frame, for item3d's sources of particle3d (`item3d.particle3d.ts`).
//
// And `held(bodies)`: the `holds` of the bodies sheet's bodies of those names (`item3d.bodies.ts`) as crowd3d's
// table of items, undefined until the sheet has landed, each hold `{ item | model, place, at, turn, scale? }` an item of its item's or its model's name
// that lists that place. A row's `holding` names it by that name. A hold on a bone, which is anim's and motion3d's,
// throws, naming the body. crowd3d holds an item one way on a place whoever holds it, so two bodies that hold one
// item on one place otherwise throw, naming both; and so does a name that is an item on one body and a model on
// another.
import type { Plugins } from '#engine/browser.ts'
import type { Item, Items, Sit } from '#plugins/crowd3d/crowd3d.plugin.ts'
import type { Call } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { heldName, type Body } from './item3d.bodies.ts'

// The holds of `bodies` as crowd3d's table of items.
export function placed(sheet: Record<string, Body>, bodies: string[]): Record<string, Item> {
  const table: Record<string, Item> = {}
  const by = new Map<string, string>()
  for (const body of bodies) {
    for (const h of sheet[body]?.holds ?? []) {
      const name = heldName(h)
      if ('bone' in h) throw new Error(`item3d: the body ${body} holds ${name} on the bone ${h.bone}, and crowd3d draws ${body} and holds an item on a place`)
      const what = 'item' in h ? `item ${h.item}` : `model ${h.model}`
      const had = table[name]
      if (had && ('item' in had ? `item ${had.item}` : `model ${had.model}`) !== what) throw new Error(`item3d: ${name} is an item on one body and a model on another, and crowd3d's people hold it by that one name`)
      const item: Item = had ?? ('item' in h ? { item: h.item } : { model: h.model })
      const sit: Sit = { at: h.at as Sit['at'], turn: h.turn as Sit['turn'], ...(h.scale !== undefined ? { scale: h.scale as Sit['scale'] } : {}) }
      const was = item[h.place]
      if (was !== undefined && JSON.stringify(was) !== JSON.stringify(sit)) throw new Error(`item3d: the bodies ${by.get(`${name} ${h.place}`)} and ${body} hold ${name} on ${h.place} two ways, and crowd3d holds an item one way on a place whoever holds it`)
      item[h.place] = sit
      by.set(`${name} ${h.place}`, body)
      table[name] = item
    }
  }
  return table
}

export const items: Items = (plugins: Plugins) => ({
  held(bodies) {
    const sheet = plugins.item3d.bodies()
    return sheet && placed(sheet, bodies)
  },
  ready: item => plugins.item3d.ready(item),
  parts: item => plugins.item3d.parts(item),
  material(call, surface) {
    const material = plugins.supershader3d.surfaced(call as Call, surface)
    if (!material) throw new Error(`item3d: an item crowd3d holds draws ${call} triangles, and supershader3d has no ${call} material`)
    return material
  },
  carries: item => {
    const side = plugins.item3d.sidecar(item)
    return side.spawns.length > 0 || side.grows.length > 0 || side.wears.length > 0
  },
  carried: copies => plugins.item3d.carried('crowd3d', copies),
})
