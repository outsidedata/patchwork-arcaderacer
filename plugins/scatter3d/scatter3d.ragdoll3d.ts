// scatter3d's mod for ragdoll3d (`addons/scenemanager`'s mods). A scene with
// `world.ragdoll3d.mods: { solids: 'scatter3d' }` pushes ragdoll3d's limp bodies out of scatter3d's
// solid instances, the trunks a seat sees.
//
// `solids(plugins, x, z, r)` is scatter3d's browser half's `solids(x, z, r)`: the solid instances
// within r of (x, z), placed on this page's ground, or none before it has one.
import type { Plugins } from '#engine/browser.ts'
import type { Solid } from './scatter3d.sim.ts'

export const solids = (plugins: Plugins, x: number, z: number, r: number): Solid[] => plugins.scatter3d.solids(x, z, r)
