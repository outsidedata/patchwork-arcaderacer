// shapes3d's mods for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { sources: ['shapes3d'], behaviors: ['shapes3d'] }` hangs fabrics from shapes3d's
// shapes and cuts a fabric as a plane. What a fabric drapes on is gpgpu3d's, which shapes3d hands its shapes
// (`shapes3d.gpgpu3d.ts`).
//
// `sources(plugins)` is asked once a frame: every box, plane, hyperplane and cylinder is a thing a fabric may
// be held to, its `key` the shape's id, its `of` its kind, and its one point `pos`: where the shape stands and
// how it is turned, as the page draws it this frame, between its last two steps (`shapes3d.drawn.ts`). A
// pin's `at` reaches the rest of it: the top of a pole 6 metres tall is `"at": [0, 6, 0]`.
//
// `behaviors()` delivers the cut `plane`, `{ size: [x, z] }`: a fabric `x` metres across its columns and `z`
// metres along its rows, lying flat in its own frame with its middle at the frame's middle, as a plane lies.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Thing } from '#plugins/fabric3d/fabric3d.plugin.ts'
import { STOOD, drawn, type Stood } from './shapes3d.drawn.ts'

export function sources(plugins: Plugins): Thing[] {
  return drawn(plugins).filter(p => STOOD.includes(p.word)).map(p => {
    const s = p.shape[p.word] as Stood
    const placed = { at: s.pos, rot: s.rot ?? [0, Math.sin((s.yaw ?? 0) / 2), 0, Math.cos((s.yaw ?? 0) / 2)] }
    return { key: `${p.id}`, of: p.kind, point: (on: string) => (on === 'pos' ? placed : undefined) }
  })
}

const plane: Behavior = {
  check(data, what) {
    const size = data?.size
    if (!Array.isArray(size) || size.length !== 2 || !size.every((n: unknown) => typeof n === 'number' && n > 0))
      throw new Error(`${what} has a size of ${JSON.stringify(size)}, and it is [x, z], metres across and along, each above 0`)
    for (const k of Object.keys(data)) if (k !== 'size') throw new Error(`${what} has ${k}, and a fabric cut as a plane is { size }`)
  },
  rest: (data, u, v) => [(u - 0.5) * data.size[0], 0, (v - 0.5) * data.size[1]],
}

export const behaviors = (): Record<string, Behavior> => ({ plane })
