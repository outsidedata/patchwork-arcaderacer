// particle2d's mod for light2d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.light2d.mods: { lights: ['particle2d'] }` has light2d draw every lamp of particle2d's effects.
//
// `lights(plugins)` is asked once a frame, after particle2d's `afterTick`, which light2d checks: it hands
// back `plugins.particle2d.lamps`, each lamp shining that frame, its key the effect's and the lamp
// layer's, its point on the stage, its colour, its radius along the ground and its flickered intensity
// (`particle2d.plugin.ts`, the lamp layer).
import type { Plugins } from '#engine/browser.ts'
import type { Handed } from '#plugins/light2d/light2d.plugin.ts'

export const lights = (plugins: Plugins): readonly Handed[] => plugins.particle2d.lamps
