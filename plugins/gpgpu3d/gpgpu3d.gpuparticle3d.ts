// gpgpu3d's mod for gpuparticle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.gpuparticle3d.mods: { solids: 'gpgpu3d' }`, and gpgpu3d listed before gpuparticle3d, has every
// particle of a layer with a `bounce` bounce off the things gpgpu3d holds, on the GPU.
//
// `solids(plugins)` is asked once, when gpuparticle3d makes its passes: gpgpu3d's shader, with the `meet`
// gpuparticle3d's step asks, which is gpgpu3d's `gpLine`.
import type { Plugins } from '#engine/browser.ts'
import type { Solids } from '#plugins/gpuparticle3d/gpuparticle3d.plugin.ts'

export const solids: Solids = (plugins: Plugins) => {
  const { glsl, uniforms } = plugins.gpgpu3d.shader(plugins, 'gpuparticle3d')
  return {
    glsl: `${glsl}
bool meet(vec3 from, vec3 dir, float far, out float t, out vec3 normal) { return gpLine(from, dir, far, t, normal); }
`,
    uniforms,
  }
}
