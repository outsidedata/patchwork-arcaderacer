// item3d's mod for motion3d (`addons/scenemanager`'s mods), the page's. A scene with `world.motion3d.mods: { props:
// 'item3d' }` hangs item3d's items on the bodies motion3d draws: a prop of a kind that names an `item` in place of a
// `model`, `world.motion3d.kinds.<kind>.props: [{ item, bone, at, turn }]`, is the item of that name of
// `world.item3d.items`, in supershader3d's looks, and a carry of the kind's motion file names it by that name. A prop
// that names a `model` is the loader's, as it always was.
//
// `props(plugins)` hands motion3d item3d's own `ready(item)` and `mesh(item)` as `make`: a new object of the item each
// time, which motion3d adds to the scene, hangs on its bone and takes away with the body. And `held(kind)`: the
// `holds` of the bodies sheet's body of that name (`item3d.bodies.ts`), as props, items and models both, [] for a
// kind the sheet has no body of; a hold on a place, which is crowd3d's, throws, naming the body.
//
// `capsules(plugins)`, named with `world.motion3d.mods: { capsules: 'item3d' }`, hands back the `capsules` of the
// sheet's body of a kind's name, [] for a kind it has none of.
import type { Plugins } from '#engine/browser.ts'
import type { Props } from '#plugins/motion3d/motion3d.plugin.ts'
import type { Capsules } from '#plugins/motion3d/motion3d.play.ts'
import { boned } from './item3d.anim.ts'

const NONE: never[] = []

export const props: Props = (plugins: Plugins) => ({
  ready: item => plugins.item3d.ready(item),
  make: item => plugins.item3d.mesh(item),
  held: kind => boned(plugins.item3d.bodies(), kind, 'motion3d'),
})

export const capsules: Capsules = (plugins: Plugins) => kind => plugins.item3d.bodies()?.[kind]?.capsules ?? NONE
