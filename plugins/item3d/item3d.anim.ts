// item3d's mod for anim (`addons/scenemanager`'s mods), the page's. A scene with `world.anim.mods: { props: 'item3d'
// }` hangs item3d's items on the bodies anim draws: a prop of a kind that names an `item` in place of a `model`,
// `world.anim.kinds.<kind>.props: [{ item, bone, at, turn }]`, is the item of that name of `world.item3d.items`, in
// supershader3d's looks. A prop that names a `model` is the loader's, as it always was.
//
// `props(plugins)` hands anim item3d's own `ready(item)` and `mesh(item)` as `make`: a new object of the item each
// time, which anim adds to the scene, hangs on its bone and takes away with the body. And `held(kind)`: the `holds`
// of the bodies sheet's body of that name (`item3d.bodies.ts`), as props, items and models both, [] for a kind the
// sheet has no body of; a hold on a place, which is crowd3d's, throws, naming the body.
//
// `capsules(plugins)`, named with `world.anim.mods: { capsules: 'item3d' }`, hands back the `capsules` of the
// sheet's body of a kind's name, [] for a kind it has none of.
import type { Plugins } from '#engine/browser.ts'
import type { Props } from '#plugins/anim/anim.plugin.ts'
import type { Capsules, Prop } from '#plugins/anim/anim.sim.ts'
import { heldName, type Body } from './item3d.bodies.ts'

const NONE: never[] = []

// A body's holds as the props of a plugin that hangs them on bones, `host`.
export function boned(bodies: Record<string, Body> | undefined, kind: string, host: string): Prop[] {
  const holds = bodies?.[kind]?.holds
  if (!holds) return NONE
  for (const h of holds) if ('place' in h) throw new Error(`item3d: the body ${kind} holds ${heldName(h)} on the place ${h.place}, and ${host} draws ${kind} and hangs a prop on a bone`)
  return holds as Prop[]
}

export const props: Props = (plugins: Plugins) => ({
  ready: item => plugins.item3d.ready(item),
  make: item => plugins.item3d.mesh(item),
  held: kind => boned(plugins.item3d.bodies(), kind, 'anim'),
})

export const capsules: Capsules = (plugins: Plugins) => kind => plugins.item3d.bodies()?.[kind]?.capsules ?? NONE
