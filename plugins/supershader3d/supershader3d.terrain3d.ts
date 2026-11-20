// supershader3d's mod for terrain3d (`addons/scenemanager`'s mods), the page's: the word `look` for a
// ground layer. A scene with `world.terrain3d.mods: { behaviors: ['supershader3d'] }` may give a
// ground layer `{ name, look: <material>, where?, noise?, edge?, warp? }` in place of a map: the
// layer is drawn by that material of the scene's one shader, worked out per pixel on the ground as
// it is on a tagged mesh. `behaviors(plugins)` is `{ look }`, a terrain3d LayerWord: handed the look
// layers of a material, it hands back the `all` shader's preamble with its varyings as plain globals
// (`supershader3d.plugin.ts`, `glsl`), each layer's read, the plugin's uniforms, whether the pictures
// have landed, and, where a layer's material is drawn by the relief call, a patch; or undefined while
// the looks file has not landed, so terrain3d makes its ground's material once it has.
//
// A layer's read sets what a look is handed: `uv` the ground point's x east and z north in metres
// (x and −z), at the warped point, and its screen derivatives the unwarped point's, as a map layer
// reads; `wp` the ground point and `wn` its geometric normal; the seed the layer's number, so two
// layers of one material differ; then `lookRun(id)`. Its colour is the layer's, its roughness and
// cavity too, and its normal the look's own in the view, or its height bent into the geometric normal
// by the pixel's neighbours and its tangent-space normal turned in, as the tagged materials bend
// theirs, taken back to the world for the ground's blend. The ground is a standard material: a look's
// clear coat, sheen, thin film and light-through are the physical material's and do not reach it.
//
// A material drawn by the relief call marches the sun's shadow inside its own relief: the patch
// multiplies the directional light by each such layer's `lookShadow`, by its weight, after
// `getDirectionalLightInfo` in three's `lights_fragment_begin`, which no splice reaches. A shadow
// reads the globals its look's body left (the place the parallax found), so two relief layers that
// both cover a pixel read the last one's; a ground gives one relief layer where it matters.
//
// A layer naming a material the file does not hold throws, naming the layer and the material.
// supershader3d is listed before terrain3d, which terrain3d checks with `ahead`.
import type { Plugins } from '#engine/browser.ts'
import type { Behaviors, LayerWord } from '#plugins/terrain3d/terrain3d.plugin.ts'
import { swapped } from './supershader3d.plugin.ts'

export function behaviors(plugins: Plugins): ReturnType<Behaviors> {
  const s = plugins.supershader3d
  const three = plugins.render3d.THREE as typeof import('three')
  const look: LayerWord = layers => {
    const pars = s.glsl()
    if (pars === undefined) return undefined
    const ids = layers.map(({ layer, k }) => {
      const name = layer.look as string
      const id = s.idOf(name)
      if (id === undefined) throw new Error(`terrain3d ground layer ${k} (${layer.name}) wears the look ${name}, which the looks file does not hold`)
      return { k, id, name, shadow: s.callOf(name) === 'relief' }
    })
    const shadowed = ids.filter(l => l.shadow)
    // the weight of each relief layer at the pixel, left by its read for the shadow
    const weights = shadowed.map(l => `float tdLw${l.k} = 0.0;`).join('\n')
    const shadow = shadowed.length
      ? `float tdLookShadow(vec3 L) {\n  float s = 1.0;\n${shadowed.map(l => `  s *= mix(1.0, lookShadow(${l.id}, L), tdLw${l.k});`).join('\n')}\n  return s;\n}\n`
      : ''
    return {
      pars: `${pars}\n${weights}\n${shadow}`,
      read(k) {
        const l = ids.find(x => x.k === k)!
        return [
          '  vec3 q = p + wv;',
          '  vLookUv = vec2(q.x, -q.z); lookGx = vec2(dpx.x, -dpx.z); lookGy = vec2(dpy.x, -dpy.z);',
          `  vLookWorld = p; vLookWN = n; vLookInfo = vec3(${l.id}.0, ${k}.0, 0.0); vLookId = ${l.id}.0;`,
          `  Look kk = lookRun(${l.id});`,
          '  alb = kk.colour; rough = kk.rough; ao = kk.ao;',
          '  vec3 nv = normalize(vNormal);',
          '  float fd = gl_FrontFacing ? 1.0 : -1.0;',
          '  vec3 bent = kitBump(-vViewPosition, lookPerturb(nv, kk.nts, fd), kk.height, fd);',
          '  nrm = inverseTransformDirection(kk.ownNormal ? kk.normal : bent, viewMatrix);',
          l.shadow ? `  tdLw${k} = wt;` : '',
        ].filter(Boolean).join('\n')
      },
      uniforms: s.uniforms,
      ready: () => s.ready(),
      ...(shadowed.length ? {
        // the chunk, checked against three's as the read is made, put in place of its include
        patch: ((lights: string) => (shader: { vertexShader: string; fragmentShader: string }) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lights)
        })(swapped(three, 'lights_fragment_begin', [[
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= tdLookShadow( directLight.direction );',
        ]])),
      } : {}),
    }
  }
  return { look }
}
