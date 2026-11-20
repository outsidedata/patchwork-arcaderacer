// item3d's mod for fabric3d (`addons/scenemanager`'s mods), the page's.
//
// `attach(plugins)`, named with `world.fabric3d.mods: { attach: 'item3d' }`, hands back two things. For each body of
// the bodies sheet and each fabric it wears (`item3d.bodies.ts`, `wears`), `{ fabric, of }`: the fabric of that name
// of fabric3d's fabrics file, held to every thing fabric3d's sources hand whose `of` is the body's name (the kind
// anim or motion3d draws it as). And for each item and each fabric it hangs (its sidecar's `wears`, the cloth its
// kit kind says), `{ fabric, of }`, `of` the item's own (`item3d/<item>`, `wornAs`). fabric3d checks each as it
// checks the scene's own `attach`: a fabric its file has not, or one with no pins, throws there.
//
// `sources(plugins)`, named with `world.fabric3d.mods: { sources: [..., 'item3d'] }`, hands every copy of an item
// that hangs cloth as a thing of that `of`: an object of the item in a scene and shown (lying loose, on a bone of
// anim's or motion3d's), or a copy another plugin carries (crowd3d's people's). Its points are `item`, the copy's
// own frame, and for a copy with bones of its own each bone by the end of its name, as the skin carries the item's
// own frame there, so a pin's `at` is always in the item's frame as it was built.
//
// The fabrics file. The bake's items tool hands back each item's fabrics with their pins ready for the scene's
// fabrics file (`scripts/items.ts`, `fabrics`), and the game's bake lays them into it.
import type { Plugins } from '#engine/browser.ts'
import type { Attaching, Things } from '#plugins/fabric3d/fabric3d.plugin.ts'

export const attach: Attaching = (plugins: Plugins) => [
  ...Object.entries((plugins.item3d.bodies() ?? {}) as Record<string, { wears?: string[] }>).flatMap(([of, body]) => (body.wears ?? []).map(fabric => ({ fabric, of }))),
  ...plugins.item3d.hung(),
]

export const sources: Things = (plugins: Plugins) => plugins.item3d.things()
