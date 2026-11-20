// gpgpu3d's mod for hair3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.hair3d.mods: { keeper: 'gpgpu3d', solids: 'gpgpu3d' }`, and gpgpu3d listed, has every lock and every
// strand worked out once and kept by gpgpu3d's keeper, a hair's `program` compiled by gpgpu3d's ops with it,
// and every lock kept out of the things gpgpu3d holds for it (`world.gpgpu3d.meets.hair3d`, or every thing),
// on the GPU.
//
// `keeper(plugins)` hands back the function that makes a keeper from a spec (`gpgpu3d.keeper.ts`;
// `gpgpu3d.plugin.ts`, `keeper`).
//
// `solids(plugins)` is asked once: gpgpu3d's shader, with the `hMeetCount` and `hMeetOf` hair3d's pass
// asks, which are gpgpu3d's `gpCount` and, of its `i`-th thing, `gpPushOf` with nothing to stand clear by;
// and `now`, which fills gpgpu3d again the moment the locks are moved, so a capsule stands where its bones
// are drawn.
import type { Plugins } from '#engine/browser.ts'
import type { Keeper, Solids } from '#plugins/hair3d/hair3d.sim.ts'

export const keeper: Keeper = (plugins: Plugins) => spec => plugins.gpgpu3d.keeper(plugins, spec)

export const solids: Solids = (plugins: Plugins) => {
  const { glsl, uniforms } = plugins.gpgpu3d.shader(plugins, 'hair3d')
  return {
    glsl: `${glsl}
int hMeetCount() { return gpCount; }
bool hMeetOf( int i, vec3 x, vec3 was, out vec3 normal, out float depth ) { return gpPushOf( gpThing( i ), x, was, 0.0, normal, depth ); }
`,
    uniforms,
    now: () => plugins.gpgpu3d.fill(plugins),
  }
}
