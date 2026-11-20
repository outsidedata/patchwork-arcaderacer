// gpgpu3d's mod for grass3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.grass3d.mods: { keeper: 'gpgpu3d', pressed: 'gpgpu3d' }`, and gpgpu3d listed before grass3d, has every
// blade worked out once and kept by gpgpu3d's keeper, a grass's `program` compiled by gpgpu3d's ops with it,
// and the grass pressed by the things gpgpu3d holds for it (`world.gpgpu3d.meets.grass3d`, or every thing),
// each as grass3d's behavior of its word says.
//
// `keeper(plugins)` hands back the function that makes the keeper of one grass's blades from its spec
// (`gpgpu3d.keeper.ts`; `gpgpu3d.plugin.ts`, `keeper`).
//
// `pressed(plugins)` is asked once: gpgpu3d's shader for grass3d, its GLSL, its uniforms, its words and
// its things.
import type { Plugins } from '#engine/browser.ts'
import type { Keeper, Pressed } from '#plugins/grass3d/grass3d.sim.ts'

export const keeper: Keeper = (plugins: Plugins) => spec => plugins.gpgpu3d.keeper(plugins, spec)

export const pressed: Pressed = (plugins: Plugins) => plugins.gpgpu3d.shader(plugins, 'grass3d')
