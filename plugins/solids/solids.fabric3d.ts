// solids' mod for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { behaviors: ['solids'] }` draws a fabric in a paint, as solids draws a model's part.
//
// `behaviors()` delivers the drawing `paint`, a colour paint of solids' Paints (`solids.plugin.ts`): `{ colour,
// roughness?, metalness?, glow?, opacity?, map?, scale? }`, a lit material of that colour, with three's own
// roughness and metalness where it gives none; `glow` the emissive strength in its own colour; `opacity` below
// 1 see-through; `map` a `texture` entry of the loader's catalogue laid on the fabric and tinted by the colour,
// `scale` metres of the fabric to one span of it, or with no `scale` once over the whole fabric. The fabric is
// drawn once the loader holds the picture. A look paint, `{ look }`, and a paint that blinks are not a
// fabric's: each throws, as does a paint with no colour and a `map` that is no texture entry.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior } from '#plugins/fabric3d/fabric3d.plugin.ts'
import type { Paint } from './solids.plugin.ts'

const PAINT = ['colour', 'roughness', 'metalness', 'glow', 'opacity', 'map', 'scale']

const paint: Behavior = {
  check(data: Paint, what, world) {
    if (!data || typeof data !== 'object') throw new Error(`${what} is ${JSON.stringify(data)}, and a paint is { ${PAINT.join(', ')} }`)
    for (const k of Object.keys(data)) if (!PAINT.includes(k)) throw new Error(`${what} has ${k}, and a fabric's paint is { ${PAINT.join(', ')} }`)
    if (typeof data.colour !== 'string') throw new Error(`${what} has a colour of ${JSON.stringify(data.colour)}, and a fabric's paint has a colour`)
    if (data.scale !== undefined && !(data.map !== undefined && Number.isFinite(data.scale) && data.scale > 0))
      throw new Error(`${what} has a scale of ${JSON.stringify(data.scale)}, and it is the metres above 0 one span of its map is laid over`)
    if (data.map !== undefined && world.loader?.assets?.[data.map]?.type !== 'texture')
      throw new Error(`${what} lays ${data.map}, which is no texture entry of the loader's catalogue`)
  },
  material(data: Paint, { plugins }: { plugins: Plugins }) {
    const T = plugins.render3d.THREE
    if (data.map !== undefined && !plugins.loader.ready(data.map)) {
      plugins.loader.load(data.map).catch(() => {})
      return undefined
    }
    const colour = new T.Color(data.colour)
    const material = new T.MeshStandardMaterial({
      color: colour,
      ...(data.map === undefined ? {} : { map: plugins.loader.get(data.map) }),
      ...(data.roughness === undefined ? {} : { roughness: data.roughness }),
      ...(data.metalness === undefined ? {} : { metalness: data.metalness }),
      ...(data.glow === undefined ? {} : { emissive: colour, emissiveIntensity: data.glow }),
      ...(data.opacity === undefined || data.opacity >= 1 ? {} : { transparent: true, opacity: data.opacity, depthWrite: false }),
    })
    return { material, ...(data.scale === undefined ? {} : { span: data.scale }) }
  },
}

export const behaviors = (): Record<string, Behavior> => ({ paint })
