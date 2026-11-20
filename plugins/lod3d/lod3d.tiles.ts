// What a worker of lod3d's (`lod3d.worker.ts`) holds and works, apart from the worker itself, so node runs
// the same code in place of one.
//
// What the page sends, in order (`serve`):
//   { type: 'hold', held }          from now on: `held` is `{ layers, surfaces, plugins }`, the layers as
//                                   `layersOf` opens them, every surface, and each `seen` plugin's `worker`
//                                   by its name, `{ url, held? }`. Each module is loaded, its `behaviors()`
//                                   joined, and its `worker(held)`, where it gives one, made once.
//   { type: 'tiles', id, name, tiles }  lod3d's `tiles` of layer `name`, `[i, j]` each, on what the last
//                                   `hold` before it handed
// What it sends back: `{ type: 'tiles', id, out }`, `out` each tile's things in the order asked.
import { tiles, type Ask, type Behaviors, type Layer, type Surface, type Thing } from './lod3d.sim.ts'

export type Hold = { layers: Record<string, Layer>; surfaces: Surface[]; plugins: Record<string, { url: string; held?: unknown }> }
export type Asked = { type: 'hold'; held: Hold } | { type: 'tiles'; id: number; name: string; tiles: [number, number][] }
export type Answer = { type: 'tiles'; id: number; out: Thing[][] }

type On = { layers: Record<string, Layer>; surfaces: Surface[]; behaviors: Behaviors; ask: Ask }

export function holder(load: (url: string) => Promise<Record<string, any>> = url => import(/* @vite-ignore */ url)) {
  let on: Promise<On> | undefined
  return {
    hold(h: Hold) {
      on = (async () => {
        const mods = await Promise.all(Object.entries(h.plugins).map(async ([name, p]) => ({ name, p, m: await load(p.url) })))
        const behaviors: Behaviors = Object.assign({}, ...mods.map(x => x.m.behaviors()))
        const worker = Object.fromEntries(mods.filter(x => x.m.worker).map(x => [x.name, x.m.worker(x.p.held)]))
        return { layers: h.layers, surfaces: h.surfaces, behaviors, ask: { worker } }
      })()
    },
    // Each batch is worked on what the last `hold` before it handed, however long its loading takes.
    async work(name: string, asked: [number, number][]): Promise<Thing[][]> {
      if (!on) throw new Error(`lod3d's worker was asked for tiles of ${name} before it was handed what they stand on`)
      const o = await on
      return tiles({ name, layers: o.layers, tiles: asked, surfaces: o.surfaces }, o.behaviors, o.ask)
    },
  }
}

// One message from the page handled, the answer sent back through `send`.
export function serve(h: ReturnType<typeof holder>, a: Asked, send: (answer: Answer) => void) {
  if (a.type === 'hold') h.hold(a.held)
  else h.work(a.name, a.tiles).then(out => send({ type: 'tiles', id: a.id, out }))
}
