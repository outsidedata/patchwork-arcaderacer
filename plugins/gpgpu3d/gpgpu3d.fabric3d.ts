// gpgpu3d's mod for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { solids: 'gpgpu3d' }`, and gpgpu3d listed, has every fabric drape on the things
// gpgpu3d holds for it (`world.gpgpu3d.meets.fabric3d`, or every thing), on the GPU.
//
// `solids(plugins)` is asked once, when fabric3d makes its passes: gpgpu3d's shader, with the `meetCount`
// and `meetOf` fabric3d's MEETS pass asks, which are gpgpu3d's `gpCount` and, of its `i`-th thing,
// `gpPushOf` and `gpVel`; and `now`, which fills gpgpu3d again the moment the fabrics are moved, so a
// capsule stands where its bones are drawn.
import type { Plugins } from '#engine/browser.ts'
import type { Solids } from '#plugins/fabric3d/fabric3d.plugin.ts'

export const solids: Solids = (plugins: Plugins) => {
  const { glsl, uniforms } = plugins.gpgpu3d.shader(plugins, 'fabric3d')
  return {
    glsl: `${glsl}
int meetCount() { return gpCount; }
bool meetOf(int i, vec3 x, vec3 was, float clear, out vec3 normal, out float depth, out vec3 vel) {
  int s = gpThing(i);
  vel = gpVel(s);
  return gpPushOf(s, x, was, clear, normal, depth);
}
`,
    uniforms,
    now: () => plugins.gpgpu3d.fill(plugins),
  }
}
