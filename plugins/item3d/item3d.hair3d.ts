// item3d's mod for hair3d (`addons/scenemanager`'s mods), the page's. A scene with `world.hair3d.mods: { skins:
// [..., 'item3d'], behaviors: [..., 'item3d'] }` grows each item's own hair on it, the hair its kit kind says
// (`<kind>.hairs.json` in the library, and the part each grows on), on every copy of the item drawn: lying loose,
// hung on a bone by anim or motion3d, or held by one of crowd3d's people.
//
// `skins(plugins)` is item3d's wearers. Every copy of an item that stands stiff (no bones of its own) is one wearer
// of all of them, `item3d <item>`, drawn in one draw however many there are; a copy with bones of its own is a
// wearer by itself. A wearer's kind is `item3d/<item>` (`wornAs`), and its skins are the item's parts that grow
// hair, each `{ item: { item, row, number, object? } }`.
//
// `behaviors()` delivers the word `item`: the skin of such a part, the part's triangles alone as the glb has them, in
// metres, named `<row> <part>` (`skinName`), which a hair's `on.meshes` matches. A stiff copy is carried whole by
// one bone, the copy's own place; a copy with bones is carried by the item's skin's bones, so hair on a part a bone
// of the item moves goes with it.
//
// The hairs file. The bake's items tool hands back each item's hairs and kinds ready for the scene's hairs file
// (`scripts/items.ts`, `hairs`): each hair as the kit wrote it with its `on` the item's parts, and `kinds` the
// item's wearers' kind to the hairs it grows. The game's bake lays them into its hairs file.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Wearer } from '#plugins/hair3d/hair3d.sim.ts'
import type { Grown } from './item3d.plugin.ts'

export const skins = (plugins: Plugins): Wearer[] => plugins.item3d.wearers()

const item: Behavior = (plugins: Plugins, thing: Grown) => plugins.item3d.skin(thing)

export const behaviors = (): Record<string, Behavior> => ({ item })
