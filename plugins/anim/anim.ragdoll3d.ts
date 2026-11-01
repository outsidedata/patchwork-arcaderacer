// anim's mod for ragdoll3d (`addons/scenemanager`'s mods). A scene with
// `world.ragdoll3d.mods: { model: 'anim', pose: 'anim' }` lays ragdoll3d's limp bodies on the models
// anim draws.
//
// `model(plugins, id)` is the row's model root as this page's anim holds it, or undefined before it
// is built. `pose(plugins, id, clip, t)` is anim's `pose`: the row's model drawn in `clip` alone at
// `t`, from its rest, at the row's position and facing, and handed back; it throws for a row with no
// model yet.
import type { Object3D } from 'three'
import type { Plugins } from '#engine/browser.ts'

export const model = (plugins: Plugins, id: number): Object3D | undefined => plugins.anim.model(id)

export const pose = (plugins: Plugins, id: number, clip: string, t: number): Object3D => plugins.anim.pose(id, clip, t)
