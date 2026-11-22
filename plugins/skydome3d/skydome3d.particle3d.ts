// skydome3d's mod for particle3d and gpuparticle3d, given to either by one key of a scene:
// `world.particle3d.mods.light` (or `world.gpuparticle3d.mods.light`) is 'skydome3d'. A particle is drawn
// unlit, its colour its own, so at night it would stand out as bright as at noon; with this mod the
// plugin takes each particle's colour times the sky's light, and a particle dims as the sky does.
//
// `light(plugins)` is how much light the sky gives a particle this frame, each channel of it a share of
// what the sky gives at its brightest, a clear noon (1 at noon on a clear day, as the particle's own
// colour is drawn there; under 1 as the sun sets, the weather closes in, or night comes; over 1 in a
// flash of lightning). A particle is a square facing the camera and has no side toward the sun, so the
// light it takes is the hemisphere light's two colours' mean plus the whole of the key light, the
// sun's or the moon's, as skydome3d's `light()` has them this frame: `sky` and `ground` and `keyColor`,
// each already times its intensity and the weather's gloom. The brightest is the same sum with the
// day's horizon colour over `look.ground` at `hemiNight + hemiDay`, and the key the sun at its highest
// colour and `0.5 + sunIntensity`, all from `world.skydome3d.look`: no number is written here.
//
// Undefined before the sky has drawn its first frame; the plugin draws a particle in its own colour
// until then. A browser mod: it takes `plugins`, and it is asked once a frame, after skydome3d has
// drawn, so the scene lists skydome3d before the plugin that asks (`ahead`).
import type { Plugins } from '#engine/browser.ts'
import type { Look } from './skydome3d.plugin.ts'

export const light = (plugins: Plugins): [number, number, number] | undefined => {
  const now = plugins.skydome3d.light()
  if (!now) return undefined
  const { THREE } = plugins.render3d
  const look = plugins.wire.scene.world!.skydome3d.look as Look
  const horizon = new THREE.Color(look.dayHorizon).toArray(), ground = new THREE.Color(look.ground).toArray(), sun = new THREE.Color(look.sunHigh).toArray()
  const sky = now.sky.toArray(), under = now.ground.toArray(), key = now.keyColor.toArray()
  const share = (i: number) => {
    const best = ((horizon[i] + ground[i]) / 2) * (look.hemiNight + look.hemiDay) + sun[i] * (0.5 + look.sunIntensity)
    return ((sky[i] + under[i]) / 2 + key[i]) / best
  }
  return [share(0), share(1), share(2)]
}
